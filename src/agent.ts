import {
  addExpense,
  addSubscription,
  CADENCES,
  cancelSubscription,
  dayExpenses,
  findMerchantMatch,
  getNotes,
  lastMerchantKey,
  ledgerSnapshot,
  listSubscriptions,
  moneyPicture,
  monthStart,
  recentMessages,
  rememberMerchant,
  saveLocale,
  searchExpenses,
  setMerchantBucket,
  setNote,
  spendByMerchant,
  spendSummary,
  subscriptionReview,
  today,
  toMinor,
  viewExpense,
  viewSub,
  viewSubs,
  type Cadence,
} from "./db";
import { bankBalances, bankPulse, beginTurn, syncBank } from "./bank";
import { env } from "./env";
import { parsePlace, type BucketMark } from "./money";
import { systemPrompt } from "./prompt";

export type Intent =
  | "chart"
  | "spent"
  | "income"
  | "subs_ceiling"
  | "food_daily"
  | "flex_daily"
  | "per_day"
  | "subs_list"
  | "food_spent"
  | "travel_spent";

function normalizeTalk(text: string): string {
  return text.toLowerCase().replace(/[?!.,']/g, " ").replace(/\s+/g, " ").trim();
}

function markOf(raw: string): BucketMark {
  const s = raw.toLowerCase();
  if (s.startsWith("not ") || s === "other") return "other";
  if (s.startsWith("a sub")) return "subscriptions";
  if (s === "travel") return "travel";
  return "food";
}

export function parseBucketTalk(text: string): { name: string | null; bucket: BucketMark } | null {
  const t = text.trim();
  const that = t.match(
    /^(?:that(?:'s|s| is)|it(?:'s|s| is))\s+(food|travel|a\s+subs?(?:cription)?s?|other|not\s+food|not\s+travel)\s*$/i,
  );
  if (that) return { name: null, bucket: markOf(that[1]!) };
  const named = t.match(
    /^(.+?)\s+is\s+(food|travel|a\s+subs?(?:cription)?s?|other|not\s+food|not\s+travel)\s*$/i,
  );
  if (!named) return null;
  const name = named[1]!.trim();
  if (!name || name.length > 40) return null;
  if (/how|what|much|spend|can|did|have|should/.test(name.toLowerCase())) return null;
  return { name, bucket: markOf(named[2]!) };
}

function namesAShop(t: string): boolean {
  const m = t.match(/\b(?:on|at|from)\s+(.+)$/);
  if (!m) return false;
  const tail = m[1]!;
  if (/^(what|food|travel|subs|subscriptions|average|it|that|this|stuff|things|everything)\b/.test(tail)) {
    return false;
  }
  return tail.split(/\s+/).length <= 5;
}

export function directIntent(text: string): Intent | null {
  const t = normalizeTalk(text);
  if (!t || t.startsWith("/")) return null;
  if (parseBucketTalk(text)) return null;
  if (namesAShop(t) && /spend|spent|pay|paid|charge/.test(t)) return null;

  if (/\b(split|breakdown|break ?down|spend mix|on what|what on)\b/.test(t)) return "chart";
  if (/show (me )?(the )?(split|breakdown|mix)/.test(t)) return "chart";
  if (/where did .{0,20}money go/.test(t)) return "chart";
  if (/what (have i|did i|do i) (spent|spend)/.test(t) && /on$|on what/.test(t)) return "chart";
  if (/what.*(spent|spend).*on$/.test(t)) return "chart";

  if (
    /how much (have i|did i) spend|what have i spent|whats? my spend|spent this month|spend this month/.test(t) &&
    !/\bon\b/.test(t)
  ) {
    return "spent";
  }

  if (/how much do i make|what is my (pay|income|salary|take home)|whats my (pay|income|salary|take home)/.test(t)) {
    return "income";
  }

  if (/how much can i spend on (subs|subscriptions)|subscription (budget|ceiling)|subs (budget|ceiling)/.test(t)) {
    return "subs_ceiling";
  }

  if (/how much can i spend on food|food a day|how much .*food (a day|daily)/.test(t)) return "food_daily";

  if (/average a day|per day|a day on average/.test(t)) return "per_day";
  if (/how much (can i spend )?a day/.test(t) && !/food/.test(t)) return "flex_daily";

  if (/can i spend on (subs|subscriptions)|subscription (budget|ceiling)|subs (budget|ceiling)/.test(t)) {
    return "subs_ceiling";
  }
  if (/\b(i have more|there are more|look again|you missed|check again|go check|fucking check)\b/.test(t)) {
    return "subs_list";
  }
  if (/\b(subs?|subscription)s?\b/.test(t) && !/\b(add|cancel|get)\b/.test(t)) return "subs_list";

  if (/how much .{0,20}(on )?food\b/.test(t) && !/can i/.test(t)) return "food_spent";
  if (/how much .{0,20}(on )?travel\b/.test(t) && !/can i/.test(t)) return "travel_spent";

  return null;
}

type Picture = ReturnType<typeof moneyPicture>;

function rememberSplit(picture: Picture): void {
  const named = picture.month.split.find((row) => row.key);
  if (named?.key) rememberMerchant(named.key);
}

function withSaving(line: string, picture: Picture): string {
  if (!picture.budget.ask_saving) return line;
  setNote("save_asked", "yes");
  return `${line}\nSaving for anything?`;
}

function applyBucket(talk: { name: string | null; bucket: BucketMark }): string {
  const hit = talk.name
    ? findMerchantMatch(talk.name)
    : lastMerchantKey()
      ? findMerchantMatch(lastMerchantKey()!)
      : null;
  if (!hit) return "Which shop?";
  setMerchantBucket(hit.key, talk.bucket);
  const picture = moneyPicture();
  rememberSplit(picture);
  return `${hit.name} → ${talk.bucket}\n\n${picture.month.chart}`;
}

function subsList(): string {
  const review = subscriptionReview();
  if (!review.definite.length && !review.likely.length && !review.lapsed.length) {
    return "No repeating charges look like subscriptions yet.";
  }
  const blocks: string[] = [];
  if (review.definite.length) {
    blocks.push(
      `${review.definite.length} definite\n${review.definite.map((row) => row.line).join("\n")}`,
    );
  }
  if (review.likely.length) {
    blocks.push(`${review.likely.length} look like it\n${review.likely.map((row) => row.line).join("\n")}`);
  }
  if (review.lapsed.length) {
    blocks.push(
      `${review.lapsed.length} probably cancelled\n${review.lapsed.map((row) => row.line).join("\n")}`,
    );
  }
  return blocks.join("\n\n");
}

function render(intent: Intent, picture: Picture): string {
  rememberSplit(picture);
  if (intent === "chart") return picture.month.chart;
  if (intent === "spent") return `${picture.month.expenses} this month`;
  if (intent === "income") {
    if (!picture.income.typical) return "No pay figure yet.";
    return picture.income.confidence === "high"
      ? `${picture.income.typical}/mo`
      : `About ${picture.income.typical}/mo. Not certain.`;
  }
  if (intent === "subs_ceiling") {
    if (!picture.budget.subs_ceiling) {
      return picture.plan.missing.includes("income_monthly") ? "No pay figure yet." : "No ceiling yet.";
    }
    return withSaving(`${picture.budget.subs_ceiling}/mo`, picture);
  }
  if (intent === "food_daily") {
    if (!picture.budget.food_daily) return picture.month.food ? `${picture.month.food} this month` : picture.month.chart;
    return withSaving(`${picture.budget.food_daily}/day`, picture);
  }
  if (intent === "flex_daily") {
    if (!picture.budget.flex_daily) return picture.month.per_day;
    return withSaving(`${picture.budget.flex_daily}/day`, picture);
  }
  if (intent === "per_day") return `${picture.month.per_day}/day`;
  if (intent === "subs_list") return subsList();
  if (intent === "food_spent") return picture.month.food ?? picture.month.chart;
  if (intent === "travel_spent") return picture.month.travel ?? picture.month.chart;
  return picture.month.chart;
}

export function handleDirect(text: string, bank: { connected: boolean; error?: string | null }): string | null {
  const talk = parseBucketTalk(text);
  if (talk) return applyBucket(talk);

  const intent = directIntent(text);
  if (!intent) return null;

  const picture = moneyPicture();
  const needsLedger = intent !== "income" && intent !== "subs_ceiling" && intent !== "food_daily" && intent !== "flex_daily";
  if (needsLedger && !picture.bank_connected && !picture.month.expense_count) {
    return "/connect to link your bank.";
  }
  if (!bank.connected && needsLedger && !picture.month.expense_count) {
    return "/connect to link your bank.";
  }
  return render(intent, picture);
}

type Args = Record<string, unknown>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function str(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} required`);
  return value.trim();
}

function optStr(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("expected string");
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asNum(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function num(value: unknown, name: string): number {
  const n = asNum(value);
  if (n == null) throw new Error(`${name} must be a number`);
  return n;
}

function optNum(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = asNum(value);
  if (n == null) throw new Error("expected number");
  return n;
}

function bool(value: unknown): boolean {
  return value === true;
}

function date(value: unknown, name: string, fallback?: string): string {
  if (value == null || value === "") {
    if (fallback) return fallback;
    throw new Error(`${name} required`);
  }
  if (typeof value !== "string" || !DATE.test(value)) throw new Error(`${name} must be YYYY-MM-DD`);
  return value;
}

function cadence(value: unknown): Cadence {
  const v = str(value, "cadence");
  if (!CADENCES.includes(v as Cadence)) throw new Error("cadence must be weekly, monthly, or yearly");
  return v as Cadence;
}

function expenseView(args: Args): "merchants" | "day" | "lines" {
  const view = optStr(args.view);
  if (view === "day" || view === "merchants" || view === "lines") return view;
  if (args.day != null && args.day !== "") return "day";
  if (args.amount != null && args.amount !== "") return "lines";
  return "merchants";
}

const handlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  add_subscription: (args) =>
    viewSub(
      addSubscription({
        name: str(args.name, "name"),
        amount_pence: toMinor(num(args.amount, "amount")),
        cadence: cadence(args.cadence),
        next_date: args.next_date == null || args.next_date === "" ? null : date(args.next_date, "next_date"),
        notes: optStr(args.notes) ?? null,
      }),
    ),

  list_subscriptions: (args) => viewSubs(listSubscriptions(bool(args.include_cancelled))),

  cancel_subscription: (args) =>
    viewSub(cancelSubscription(optNum(args.id), optStr(args.name))),

  add_expense: (args) =>
    viewExpense(
      addExpense({
        amount_pence: toMinor(num(args.amount, "amount")),
        merchant: str(args.merchant, "merchant"),
        category: optStr(args.category) ?? null,
        spent_on: date(args.spent_on, "spent_on", today()),
        notes: optStr(args.notes) ?? null,
      }),
    ),

  expenses: (args) => {
    const view = expenseView(args);
    const bank = bankPulse();
    if (view === "day") return { bank, view, ...dayExpenses(date(args.day ?? args.from, "day", today())) };
    if (view === "lines") {
      return {
        bank,
        view,
        expenses: searchExpenses({
          query: optStr(args.query),
          from: args.from == null || args.from === "" ? undefined : date(args.from, "from"),
          to: args.to == null || args.to === "" ? undefined : date(args.to, "to"),
          amount: optNum(args.amount),
          limit: Math.min(Math.max(optNum(args.limit) ?? 25, 1), 100),
        }).map(viewExpense),
      };
    }
    return {
      bank,
      view,
      ...spendByMerchant({
        query: optStr(args.query),
        from: args.from == null || args.from === "" ? monthStart() : date(args.from, "from"),
        to: args.to == null || args.to === "" ? today() : date(args.to, "to"),
        limit: Math.min(Math.max(optNum(args.limit) ?? 40, 1), 80),
      }),
    };
  },

  spend_summary: (args) => ({
    bank: bankPulse(),
    ...spendSummary({
      from: args.from == null || args.from === "" ? monthStart() : date(args.from, "from"),
      to: args.to == null || args.to === "" ? today() : date(args.to, "to"),
      category: optStr(args.category),
    }),
  }),

  sync_bank: (args) =>
    syncBank(
      args.from == null || args.from === "" ? undefined : date(args.from, "from"),
      args.to == null || args.to === "" ? undefined : date(args.to, "to"),
    ),

  bank_balances: () => bankBalances(),

  set_note: (args) => setNote(str(args.key, "key"), str(args.value, "value")),

  set_place: (args) => {
    const place = parsePlace(str(args.place, "place"));
    if (!place) throw new Error("Could not read that. Try GBP London.");
    saveLocale(place);
    return { currency: place.currency, tz: place.tz };
  },

  set_bucket: (args) => {
    const bucket = str(args.bucket, "bucket");
    if (bucket !== "food" && bucket !== "travel" && bucket !== "subscriptions" && bucket !== "other") {
      throw new Error("bucket must be food, travel, subscriptions, or other");
    }
    const hit = findMerchantMatch(str(args.merchant, "merchant"));
    if (!hit) throw new Error("merchant required");
    setMerchantBucket(hit.key, bucket);
    return { merchant: hit.name, key: hit.key, bucket };
  },

  get_notes: (args) => getNotes(optStr(args.key)),

  picture: () => ({ bank: bankPulse(), ...moneyPicture() }),
};

export const toolSpecs = [
  {
    type: "function" as const,
    function: {
      name: "add_subscription",
      description: "Store a typed subscription, or confirm one the bank already repeats. amount is in the home currency, major units, e.g. 12.99.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          amount: { type: "number" },
          cadence: { type: "string", enum: CADENCES },
          next_date: { type: "string", description: "YYYY-MM-DD" },
          notes: { type: "string" },
        },
        required: ["name", "amount", "cadence"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_subscriptions",
      description:
        "List stored subscriptions only. For what they actually have, the ledger snapshot already has subscription_review: definite / likely / lapsed. Prefer that. Do not invent a count.",
      parameters: {
        type: "object",
        properties: { include_cancelled: { type: "boolean" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "cancel_subscription",
      description: "Cancel a subscription by id or exact name.",
      parameters: {
        type: "object",
        properties: { id: { type: "integer" }, name: { type: "string" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_expense",
      description: "Log a one-off expense. amount is in the home currency, major units. spent_on defaults to today.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number" },
          merchant: { type: "string" },
          category: { type: "string" },
          spent_on: { type: "string", description: "YYYY-MM-DD" },
          notes: { type: "string" },
        },
        required: ["amount", "merchant"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "expenses",
      description:
        "Read the ledger. view=merchants (default): one row per merchant with bucket food / travel / subscriptions when inferred from the name. Use this to find a named charge or see what a month went on. Includes every currency and pending. Bank descriptors are ugly (SQ *SUPABASE); the rollup already normalises those. view=day: every charge on one day. view=lines: a tight follow-up. Never dump a month of lines.",
      parameters: {
        type: "object",
        properties: {
          view: { type: "string", enum: ["merchants", "day", "lines"] },
          query: { type: "string" },
          day: { type: "string", description: "YYYY-MM-DD, for view=day" },
          from: { type: "string" },
          to: { type: "string" },
          amount: { type: "number", description: "Major units, e.g. 25.00" },
          limit: { type: "integer" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "spend_summary",
      description:
        "Totals for a date range (defaults to this month) plus monthly subscription run-rate. expenses is home currency and already includes subscription charges. Do not add expenses + subscriptions_monthly. split / chart / food / travel are inferred from merchants (Tesco is food, TFL is travel). Paste chart for an on-what question. Never use bank labels like Purchase. Do not pass category. other_spend is posted spend whose merchant is not an active subscription. by_currency lists the rest. Includes pending.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          category: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "sync_bank",
      description: "Pull TrueLayer transactions into the ledger. Use when they ask to refresh or the bank data looks stale.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "YYYY-MM-DD" },
          to: { type: "string", description: "YYYY-MM-DD" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "bank_balances",
      description: "Live TrueLayer account and card balances.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_place",
      description: "Change home currency and city. place is like GBP London or EUR Berlin. Use when they want to switch currency or city.",
      parameters: {
        type: "object",
        properties: { place: { type: "string" } },
        required: ["place"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_note",
      description:
        "Save a standing fact. Prefer income_monthly, life_monthly, life_daily, save_monthly, save_intent, invest_intent, save_asked, essentials, situation. Values in major units. save_intent is yes or no.",
      parameters: {
        type: "object",
        properties: { key: { type: "string" }, value: { type: "string" } },
        required: ["key", "value"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_bucket",
      description:
        "Remember that a merchant is food, travel, a subscription, or other. Use when they correct the split. merchant is the shop name.",
      parameters: {
        type: "object",
        properties: {
          merchant: { type: "string" },
          bucket: { type: "string", enum: ["food", "travel", "subscriptions", "other"] },
        },
        required: ["merchant", "bucket"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_notes",
      description: "Read standing facts. Omit key to list all.",
      parameters: {
        type: "object",
        properties: { key: { type: "string" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "picture",
      description:
        "The whole money picture: notes, this month (including split, chart, food, travel), subscriptions, inferred pay and life cost, and budget (subs_ceiling, subs_room, food_daily, flex_daily). Use this for almost every money question, including how much they can spend and what a month went on.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

export async function runTool(name: string, raw: string): Promise<string> {
  const handler = handlers[name];
  if (!handler) return JSON.stringify({ error: `unknown tool ${name}` });
  try {
    const args = (raw ? JSON.parse(raw) : {}) as Args;
    return JSON.stringify(await handler(args));
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

const ROUNDS = 4;

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

type Completion = {
  choices: Array<{
    message: { content: string | null; tool_calls?: ToolCall[] };
    finish_reason: string;
  }>;
  error?: { message?: string };
};

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : "",
      )
      .join("");
  }
  return "";
}

async function complete(messages: ChatMessage[]): Promise<Completion["choices"][0]["message"]> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "http-referer": env.PUBLIC_URL || "https://census.local",
      "x-title": "§ Census",
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      messages,
      tools: toolSpecs,
      tool_choice: "auto",
      temperature: 0,
      reasoning: { effort: "low" },
      max_tokens: 768,
    }),
  });
  const data = (await res.json()) as Completion;
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `openrouter ${res.status}`);
  }
  const message = data.choices[0]?.message;
  if (!message) throw new Error("openrouter empty");
  return message;
}

function standingFacts(): string {
  const notes = getNotes();
  if (!notes.length) return "Standing facts: none yet.";
  return `Standing facts:\n${notes.map((row) => `${row.key}: ${row.value}`).join("\n")}`;
}

export async function handleMessage(text: string): Promise<string> {
  const bank = await beginTurn();
  const direct = handleDirect(text, bank);
  if (direct) return direct;

  const history = recentMessages(8);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${systemPrompt()}\n\nToday: ${today()}. Bank: ${bank.connected ? "connected" : "off"}${bank.error ? ` (${bank.error})` : ""}.\n${standingFacts()}\n\nLedger:\n${JSON.stringify(ledgerSnapshot())}`,
    },
    ...history,
  ];

  for (let i = 0; i < ROUNDS; i++) {
    const message = await complete(messages);
    const calls = message.tool_calls ?? [];
    if (calls.length === 0) {
      return textOf(message.content).trim() || "Done.";
    }
    messages.push({
      role: "assistant",
      content: message.content,
      tool_calls: calls,
    });
    for (const call of calls) {
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: await runTool(call.function.name, call.function.arguments ?? "{}"),
      });
    }
  }

  return "I hit the tool limit. Try a narrower question.";
}
