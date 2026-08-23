import { timingSafeEqual } from "node:crypto";
import { handleMessage } from "./agent";
import {
  claimUpdate,
  isBankConnected,
  isConfigured,
  listTgMessages,
  rememberTgMessage,
  resetAll,
  saveLocale,
  saveMessage,
} from "./db";
import { env } from "./env";
import { authLink, disconnectBank } from "./bank";
import { cityOf, guessFromLang, isYes, parsePlace, type Locale } from "./money";

const UPDATES = ["message", "callback_query"];

type SetupReply = { text: string; connect?: boolean };

function confirmPlace(loc: Locale): SetupReply {
  return { text: `${loc.currency} · ${loc.tz}.`, connect: !isBankConnected() };
}

function askPlaceGuess(guess?: Locale): SetupReply {
  if (guess) {
    return { text: `§ Census. Guessing ${guess.currency}, ${cityOf(guess.tz)}. Yes, or send e.g. GBP London.` };
  }
  return { text: "§ Census. Currency and city. e.g. GBP London, EUR Berlin, USD New York." };
}

function askPlace(languageCode?: string): SetupReply {
  return askPlaceGuess(guessFromLang(languageCode));
}

function setupMessage(text: string, languageCode?: string): SetupReply | null {
  if (isConfigured()) return null;
  if (text.startsWith("/") && text !== "/start") return null;

  const guess = guessFromLang(languageCode);
  if (text === "/start") return askPlaceGuess(guess);

  if (isYes(text) && guess) {
    saveLocale(guess);
    return confirmPlace(guess);
  }

  const place = parsePlace(text);
  if (place) {
    saveLocale(place);
    return confirmPlace(place);
  }

  return { text: "Couldn't read that. Try GBP London or USD New York." };
}

function placeChange(text: string): SetupReply | null {
  if (!isConfigured() || text.startsWith("/")) return null;
  const place = parsePlace(text);
  if (!place) return null;
  const asked = /currency|timezone|time zone|switch|change|move to|use |i(?:'| a)?m in/i.test(text);
  const bare = text.split(/\s+/).length <= 4 && !/spend|spent|how|sub|pay|paid|charge/i.test(text);
  if (!asked && !bare) return null;
  saveLocale(place);
  return confirmPlace(place);
}

type Update = {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; language_code?: string };
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; language_code?: string };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};

type TgOk<T> = { ok: true; result: T };
type TgErr = { ok: false; description?: string };

let tail: Promise<void> = Promise.resolve();

function enqueue(job: () => Promise<void>): void {
  tail = tail.then(job, job);
}

function secretOk(got: string | null): boolean {
  if (!got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(env.TELEGRAM_WEBHOOK_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

let username = "";

export async function botUsername(): Promise<string> {
  if (username) return username;
  const me = await tg<{ username?: string }>("getMe");
  username = me.username?.replace(/^@/, "") || "";
  return username;
}

export async function telegramRedirect(): Promise<Response> {
  try {
    const name = await botUsername();
    if (name) {
      return new Response(null, { status: 303, headers: { location: `https://t.me/${name}` } });
    }
  } catch (err) {
    console.error("getMe", err instanceof Error ? err.message : err);
  }
  return new Response(null, { status: 303, headers: { location: "https://t.me" } });
}

async function tg<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let data: TgOk<T> | TgErr;
  try {
    data = JSON.parse(raw) as TgOk<T> | TgErr;
  } catch {
    throw new Error(`${method} ${res.status}`);
  }
  if (!data.ok) throw new Error(data.description || method);
  return data.result;
}

function connectExtra(chatId: number): Record<string, unknown> {
  return {
    reply_markup: {
      inline_keyboard: [[{ text: "Connect", url: authLink(chatId) }]],
    },
  };
}

function commandEntities(text: string): Array<{ type: "bot_command"; offset: number; length: number }> | undefined {
  const hit = text.match(/\/(?:connect|disconnect|reset)\b/);
  if (!hit || hit.index == null) return undefined;
  return [{ type: "bot_command", offset: hit.index, length: hit[0].length }];
}

export async function send(
  chatId: number,
  text: string,
  extra?: Record<string, unknown>,
): Promise<{ message_id: number }> {
  const { html, entities, ...rest } = extra ?? {};
  const asHtml = html === true;
  const result = await tg<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: asHtml ? "HTML" : undefined,
    entities: asHtml ? undefined : Array.isArray(entities) ? entities : commandEntities(text),
    link_preview_options: text.includes("truelayer.com") ? { is_disabled: true } : undefined,
    ...rest,
  });
  rememberTgMessage(result.message_id);
  return result;
}

function command(text: string): string {
  return text.split(/\s+/, 1)[0]?.replace(/@[\w_]+$/, "") ?? text;
}

function allowed(id: number | undefined): boolean {
  return id != null && env.ALLOWED_TELEGRAM_USER_IDS.includes(String(id));
}

export async function syncCommands(): Promise<void> {
  const commands = [
    isBankConnected()
      ? { command: "disconnect", description: "Drop the bank link" }
      : { command: "connect", description: "Link your bank" },
    { command: "reset", description: "Wipe everything" },
  ];
  try {
    await tg("setMyCommands", { commands });
    for (const id of env.ALLOWED_TELEGRAM_USER_IDS) {
      await tg("setMyCommands", { commands, scope: { type: "chat", chat_id: Number(id) } });
    }
  } catch (err) {
    console.error("setMyCommands", err instanceof Error ? err.message : err);
  }
}

async function deleteTracked(chatId: number): Promise<void> {
  const ids = listTgMessages();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    try {
      await tg("deleteMessages", { chat_id: chatId, message_ids: chunk });
    } catch {
      for (const message_id of chunk) {
        try {
          await tg("deleteMessage", { chat_id: chatId, message_id });
        } catch {
          /* already gone */
        }
      }
    }
  }
}

function typing(chatId: number): Promise<boolean> {
  return tg("sendChatAction", { chat_id: chatId, action: "typing" });
}

async function processCallback(update: Update): Promise<void> {
  const cb = update.callback_query;
  if (!cb || !allowed(cb.from.id) || !claimUpdate(update.update_id)) return;
  await tg("answerCallbackQuery", { callback_query_id: cb.id });
  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  if (cb.data === "reset:no") {
    if (chatId != null && messageId != null) {
      try {
        await tg("editMessageText", { chat_id: chatId, message_id: messageId, text: "Left as is." });
      } catch {
        await send(chatId, "Left as is.");
      }
    }
    return;
  }
  if (cb.data !== "reset:yes" || chatId == null) return;
  await deleteTracked(chatId);
  resetAll();
  await syncCommands();
  const setup = askPlace(cb.from.language_code);
  await send(chatId, setup.text);
}

export async function processUpdate(update: Update): Promise<void> {
  if (update.callback_query) {
    await processCallback(update);
    return;
  }

  const msg = update.message;
  const raw = msg?.text?.trim();
  const from = msg?.from?.id;
  if (!msg || !raw || from == null || !allowed(from) || !claimUpdate(update.update_id)) return;

  rememberTgMessage(msg.message_id);
  const chatId = msg.chat.id;
  const text = raw.startsWith("/") ? command(raw) : raw;
  const setup = setupMessage(text, msg.from?.language_code);
  if (setup !== null) {
    if (setup.connect) {
      try {
        await send(chatId, setup.text, connectExtra(chatId));
      } catch {
        await send(chatId, `${setup.text} /connect to link your bank.`);
      }
      return;
    }
    await send(chatId, setup.text);
    return;
  }

  const change = placeChange(raw);
  if (change) {
    if (change.connect) {
      try {
        await send(chatId, change.text, connectExtra(chatId));
      } catch {
        await send(chatId, change.text);
      }
      return;
    }
    await send(chatId, change.text);
    return;
  }

  if (text === "/start" || text === "/setup" || text === "/help") return;

  if (text === "/connect") {
    try {
      await send(chatId, "Finish in 5 minutes.", connectExtra(chatId));
    } catch (err) {
      await send(chatId, err instanceof Error ? err.message : String(err));
    }
    return;
  }

  if (text === "/disconnect") {
    if (!isBankConnected()) {
      await send(chatId, "Not connected.");
      return;
    }
    disconnectBank();
    await syncCommands();
    await send(chatId, "Bank disconnected. Imported spends stay.");
    return;
  }

  if (text === "/reset") {
    await send(chatId, "Wipes the bank link, ledger, notes, and chat. Cannot undo.", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Confirm", callback_data: "reset:yes" },
            { text: "Cancel", callback_data: "reset:no" },
          ],
        ],
      },
    });
    return;
  }

  saveMessage("user", raw);
  try {
    await typing(chatId);
    const reply = await handleMessage(raw);
    saveMessage("assistant", reply);
    await send(chatId, reply);
  } catch (err) {
    console.error("turn", update.update_id, err instanceof Error ? err.message : err);
    await send(chatId, "Something broke. Try again.");
  }
}

export async function handleWebhook(req: Request): Promise<Response> {
  if (!secretOk(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("forbidden", { status: 403 });
  }
  const update = (await req.json()) as Update;
  enqueue(() => processUpdate(update));
  return new Response("ok");
}

async function setWebhook(): Promise<boolean> {
  const url = `${env.PUBLIC_URL}/telegram`;
  const waits = [0, 2000, 4000, 8000, 16000];
  for (const wait of waits) {
    if (wait) await Bun.sleep(wait);
    try {
      await tg("setWebhook", {
        url,
        secret_token: env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: UPDATES,
        drop_pending_updates: true,
      });
      console.log("webhook", url);
      return true;
    } catch (err) {
      console.error("setWebhook", err instanceof Error ? err.message : err);
    }
  }
  return false;
}

export async function start(): Promise<void> {
  try {
    const name = await botUsername();
    if (name) console.log("telegram", `https://t.me/${name}`);
  } catch (err) {
    console.error("getMe", err instanceof Error ? err.message : err);
  }
  await syncCommands();
  if (env.PUBLIC_URL && (await setWebhook())) return;

  try {
    await tg("deleteWebhook", { drop_pending_updates: false });
  } catch (err) {
    console.error("deleteWebhook", err instanceof Error ? err.message : err);
  }
  console.log("polling");
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg<Update[]>("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: UPDATES,
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        enqueue(() => processUpdate(update));
      }
    } catch (err) {
      console.error("poll", err instanceof Error ? err.message : err);
      await Bun.sleep(2000);
    }
  }
}
