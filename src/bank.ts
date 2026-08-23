import { randomBytes } from "node:crypto";
import {
  clearBank,
  findExpenseByExternal,
  getBankTokens,
  getLocale,
  getSetting,
  isBankConnected,
  listBankAccounts,
  replaceBankAccounts,
  refreshInferredIncome,
  refreshInferredLife,
  refreshInferredSubscriptions,
  saveBankIncome,
  replacePendingForPrefix,
  saveBankBalance,
  saveBankExpense,
  saveBankTokens,
  setSetting,
  today,
  toMinorAbs,
  type BankAccount,
} from "./db";
import { env } from "./env";

export const TL_SCOPES = "info accounts balance transactions cards offline_access";
export const TL_PROVIDERS = "uk-ob-all ee-ob-all";
export const SCA_MS = 270_000;
export const RECENT_DAYS = 90;
export const HISTORY_FROM = "2015-01-01";

export type BankKind = "accounts" | "cards";

export type BankTx = {
  transaction_id?: string;
  normalised_provider_transaction_id?: string;
  provider_transaction_id?: string;
  timestamp?: string;
  description?: string;
  amount?: number;
  currency?: string;
  transaction_type?: string;
  transaction_category?: string;
  transaction_classification?: string[];
  merchant_name?: string;
};

export function authQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function inScaWindow(consentedAt: number | null | undefined, now = Date.now()): boolean {
  return Boolean(consentedAt && now - consentedAt < SCA_MS);
}

function daysAgoFrom(today: string, n: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - n);
  return dt.toISOString().slice(0, 10);
}

export function syncRange(opts: {
  today: string;
  consentedAt?: number | null;
  from?: string;
  to?: string;
  now?: number;
}): { from: string; to: string; historic: boolean } {
  const to = opts.to || opts.today;
  const historic = inScaWindow(opts.consentedAt, opts.now);
  const floor = historic ? HISTORY_FROM : daysAgoFrom(opts.today, RECENT_DAYS);
  const from = opts.from && opts.from > floor ? opts.from : floor;
  return { from: from > to ? to : from, to, historic };
}

export function isDebit(tx: BankTx): boolean {
  const type = String(tx.transaction_type || "").toUpperCase();
  if (type === "CREDIT") return false;
  if (type === "DEBIT") return true;
  return typeof tx.amount === "number" && tx.amount < 0;
}

export function isIncomeCredit(tx: BankTx): boolean {
  if (isDebit(tx)) return false;
  const type = String(tx.transaction_type || "").toUpperCase();
  const inbound = type === "CREDIT" || (typeof tx.amount === "number" && tx.amount > 0);
  if (!inbound) return false;
  const blob = [
    tx.transaction_category,
    ...(tx.transaction_classification ?? []),
    tx.description,
    tx.merchant_name,
  ]
    .filter(Boolean)
    .join(" ");
  if (/\b(atm|pot|vault|refund|cashback|reversal)\b/i.test(blob)) return false;
  if (/transfer to|from pot|to pot|internal transfer/i.test(blob)) return false;
  if (/^transfer$/i.test(String(tx.transaction_category || ""))) return false;
  return true;
}

export function stableTxId(tx: BankTx): string | undefined {
  const id = tx.normalised_provider_transaction_id || tx.provider_transaction_id || tx.transaction_id;
  return id?.trim() || undefined;
}

export function txDate(timestamp: string | undefined, fallback: string): string {
  const day = timestamp?.slice(0, 10);
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : fallback;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && forwarded !== "unknown") return forwarded;
  const real = req.headers.get("x-real-ip")?.trim();
  return real && real !== "unknown" ? real : "";
}

export function isRetryable(status: number, code: string): boolean {
  return (
    status === 429 ||
    status === 500 ||
    status === 503 ||
    status === 504 ||
    code === "provider_too_many_requests" ||
    code === "provider_request_limit_exceeded" ||
    code === "internal_server_error" ||
    code === "provider_error" ||
    code === "connector_overload" ||
    code === "temporarily_unavailable" ||
    code === "provider_timeout" ||
    code === "connector_timeout"
  );
}

export function isSca(code: string): boolean {
  return code === "sca_exceeded";
}

export function isGone(code: string): boolean {
  return code === "access_denied" || code === "invalid_grant" || code === "invalid_token";
}

export function isUnsupported(status: number, code: string): boolean {
  return status === 501 || code === "endpoint_not_supported";
}

const FRESH_MS = 30 * 60 * 1000;

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type Listed = {
  account_id: string;
  display_name?: string;
  currency?: string;
  account_type?: string;
  provider?: { provider_id?: string };
};

type Balance = {
  current?: number;
  available?: number;
  currency?: string;
  credit_limit?: number;
};

export type SyncResult = {
  connected: boolean;
  synced: boolean;
  imported: number;
  updated: number;
  skipped: number;
  accounts: number;
  historic?: boolean;
  from?: string;
  to?: string;
  error?: string;
};

class TlError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function authHost(): string {
  return env.TRUELAYER_ENV === "sandbox" ? "https://auth.truelayer-sandbox.com" : "https://auth.truelayer.com";
}

function apiHost(): string {
  return env.TRUELAYER_ENV === "sandbox" ? "https://api.truelayer-sandbox.com" : "https://api.truelayer.com";
}

export function truelayerReady(): boolean {
  return Boolean(env.TRUELAYER_CLIENT_ID && env.TRUELAYER_CLIENT_SECRET);
}

export function redirectUri(): string {
  if (!env.PUBLIC_URL) throw new Error("PUBLIC_URL required for TrueLayer");
  return `${env.PUBLIC_URL}/truelayer`;
}

export function seedRefreshToken(): void {
  if (!env.TRUELAYER_REFRESH_TOKEN || getBankTokens()) return;
  saveBankTokens({
    access_token: "",
    refresh_token: env.TRUELAYER_REFRESH_TOKEN,
    expires_at: 0,
  });
}

function day(): string {
  try {
    return today();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function homeCurrency(): string {
  try {
    return getLocale().currency;
  } catch {
    return "GBP";
  }
}

function psuIp(): string {
  return getBankTokens()?.psu_ip || "";
}

function parseError(status: number, text: string): TlError {
  try {
    const body = JSON.parse(text) as { error?: string; error_description?: string };
    const code = body.error || "";
    return new TlError(status, code, body.error_description || code || text.slice(0, 200));
  } catch {
    return new TlError(status, "", text.slice(0, 200) || `TrueLayer ${status}`);
  }
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${authHost()}/connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  let data: TokenResponse;
  try {
    data = JSON.parse(text) as TokenResponse;
  } catch {
    throw parseError(res.status, text);
  }
  if (!res.ok || data.error) {
    throw new TlError(res.status, data.error || "", data.error_description || data.error || `token ${res.status}`);
  }
  return data;
}

function storeTokens(data: TokenResponse, extra?: { refresh?: string; consented_at?: number; psu_ip?: string }): void {
  const refresh = data.refresh_token || extra?.refresh;
  if (!data.access_token || !refresh) throw new Error("TrueLayer token missing");
  saveBankTokens({
    access_token: data.access_token,
    refresh_token: refresh,
    expires_at: Date.now() + Math.max(30, data.expires_in ?? 3600) * 1000,
    consented_at: extra?.consented_at,
    psu_ip: extra?.psu_ip,
  });
}

export async function exchangeCode(code: string, ip = ""): Promise<void> {
  if (!truelayerReady()) throw new Error("TrueLayer client id/secret not set");
  const data = await tokenRequest({
    grant_type: "authorization_code",
    client_id: env.TRUELAYER_CLIENT_ID,
    client_secret: env.TRUELAYER_CLIENT_SECRET,
    redirect_uri: redirectUri(),
    code,
  });
  storeTokens(data, { consented_at: Date.now(), psu_ip: ip || undefined });
}

async function refresh(): Promise<string> {
  const tokens = getBankTokens();
  if (!tokens) throw new Error("bank not connected");
  if (!truelayerReady()) throw new Error("TrueLayer client id/secret not set");
  try {
    const data = await tokenRequest({
      grant_type: "refresh_token",
      client_id: env.TRUELAYER_CLIENT_ID,
      client_secret: env.TRUELAYER_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
    });
    storeTokens(data, { refresh: tokens.refresh_token });
    return getBankTokens()!.access_token;
  } catch (err) {
    if (err instanceof TlError && isGone(err.code)) {
      clearBank();
      throw new Error("Bank access expired. Send /connect.");
    }
    throw err;
  }
}

async function accessToken(): Promise<string> {
  const tokens = getBankTokens();
  if (!tokens) throw new Error("bank not connected");
  if (tokens.access_token && tokens.expires_at - 60_000 > Date.now()) return tokens.access_token;
  return refresh();
}

async function api<T>(path: string, retried = false): Promise<T> {
  const token = await accessToken();
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  const ip = psuIp();
  if (ip) headers["X-PSU-IP"] = ip;
  const res = await fetch(`${apiHost()}${path}`, { headers });
  const text = await res.text();
  if (res.status === 401 && !retried) {
    await refresh();
    return api<T>(path, true);
  }
  if (!res.ok) {
    const err = parseError(res.status, text);
    if (!retried && isRetryable(err.status, err.code)) {
      await Bun.sleep(err.status === 429 ? 2000 : 1000);
      return api<T>(path, true);
    }
    throw err;
  }
  return (text ? JSON.parse(text) : { results: [] }) as T;
}

function asAccount(row: Listed, kind: BankKind): BankAccount {
  return {
    account_id: row.account_id,
    kind,
    display_name: row.display_name || kind,
    currency: row.currency || null,
    account_type: row.account_type || null,
    provider: row.provider?.provider_id || null,
    current: null,
    available: null,
    credit_limit: null,
  };
}

async function listKind(kind: BankKind): Promise<BankAccount[]> {
  const data = await api<{ results?: Listed[] }>(`/data/v1/${kind}`);
  return (data.results ?? []).filter((row) => row.account_id).map((row) => asAccount(row, kind));
}

async function discoverAccounts(): Promise<BankAccount[]> {
  const stored = listBankAccounts();
  try {
    const accounts = await listKind("accounts");
    let cards: BankAccount[] = [];
    try {
      cards = await listKind("cards");
    } catch (err) {
      if (err instanceof TlError && (isUnsupported(err.status, err.code) || isSca(err.code))) cards = [];
      else throw err;
    }
    const next = [...accounts, ...cards];
    if (next.length) replaceBankAccounts(next);
    return next.length ? next : stored;
  } catch (err) {
    if (stored.length && err instanceof TlError && (isSca(err.code) || err.status === 403)) return stored;
    throw err;
  }
}

function accountsForSync(): Promise<BankAccount[]> {
  const stored = listBankAccounts();
  const sca = inScaNow();
  if (stored.length && !sca) return Promise.resolve(stored);
  return discoverAccounts();
}

function inScaNow(): boolean {
  return inScaWindow(getBankTokens()?.consented_at);
}

function importTx(tx: BankTx, prefix: string, pending = false): "inserted" | "updated" | "skipped" {
  if (typeof tx.amount !== "number" || tx.amount === 0) return "skipped";
  const id = stableTxId(tx);
  if (!id) return "skipped";
  const settledId = `${prefix}:${id}`;
  const currency = (tx.currency || homeCurrency()).toUpperCase();
  const merchant = (tx.merchant_name || tx.description || "unknown").trim() || "unknown";
  const category = tx.transaction_classification?.[0] || tx.transaction_category || null;
  const notes = tx.description && tx.description !== merchant ? tx.description : null;
  if (pending) {
    if (!isDebit(tx)) return "skipped";
    if (findExpenseByExternal(settledId)) return "skipped";
    const { inserted } = saveBankExpense({
      amount_pence: toMinorAbs(tx.amount, currency),
      currency,
      merchant,
      category,
      spent_on: txDate(tx.timestamp, day()),
      notes,
      external_id: `${prefix}:pending:${id}`,
      pending: true,
    });
    return inserted ? "inserted" : "updated";
  }
  if (isDebit(tx)) {
    const { inserted } = saveBankExpense({
      amount_pence: toMinorAbs(tx.amount, currency),
      currency,
      merchant,
      category,
      spent_on: txDate(tx.timestamp, day()),
      notes,
      external_id: settledId,
      pending: false,
    });
    return inserted ? "inserted" : "updated";
  }
  if (isIncomeCredit(tx)) {
    const { inserted } = saveBankIncome({
      amount_pence: toMinorAbs(tx.amount, currency),
      currency,
      merchant,
      category,
      received_on: txDate(tx.timestamp, day()),
      notes,
      external_id: settledId,
    });
    return inserted ? "inserted" : "updated";
  }
  return "skipped";
}

async function pullTransactions(account: BankAccount, from: string, to: string): Promise<BankTx[]> {
  try {
    const data = await api<{ results?: BankTx[] }>(
      `/data/v1/${account.kind}/${encodeURIComponent(account.account_id)}/transactions?from=${from}&to=${to}`,
    );
    return data.results ?? [];
  } catch (err) {
    if (err instanceof TlError && err.code === "invalid_date_range") {
      const recent = syncRange({ today: day() });
      if (from === recent.from) throw err;
      const data = await api<{ results?: BankTx[] }>(
        `/data/v1/${account.kind}/${encodeURIComponent(account.account_id)}/transactions?from=${recent.from}&to=${to}`,
      );
      return data.results ?? [];
    }
    throw err;
  }
}

async function pullPending(account: BankAccount): Promise<BankTx[] | null> {
  try {
    const data = await api<{ results?: BankTx[] }>(
      `/data/v1/${account.kind}/${encodeURIComponent(account.account_id)}/transactions/pending`,
    );
    return data.results ?? [];
  } catch (err) {
    if (
      err instanceof TlError &&
      (isUnsupported(err.status, err.code) || isSca(err.code) || err.status === 403 || err.status === 404)
    ) {
      return null;
    }
    throw err;
  }
}

export async function syncBank(from?: string, to?: string): Promise<SyncResult> {
  if (!isBankConnected()) return { connected: false, synced: false, imported: 0, updated: 0, skipped: 0, accounts: 0 };
  const range = syncRange({
    today: day(),
    consentedAt: getBankTokens()?.consented_at,
    from,
    to,
  });
  const accounts = await accountsForSync();
  if (!accounts.length) {
    throw new Error("No bank accounts stored. Send /connect and finish within 5 minutes.");
  }
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  for (const account of accounts) {
    const prefix = `tl:${account.kind}:${account.account_id}`;
    const txs = await pullTransactions(account, range.from, range.to);
    for (const tx of txs) {
      const result = importTx(tx, prefix);
      if (result === "inserted") imported += 1;
      else if (result === "updated") updated += 1;
      else skipped += 1;
    }
    const pendingTxs = await pullPending(account);
    if (pendingTxs == null) continue;
    replacePendingForPrefix(prefix, () => {
      for (const tx of pendingTxs) {
        const result = importTx(tx, prefix, true);
        if (result === "inserted") imported += 1;
        else if (result === "updated") updated += 1;
        else skipped += 1;
      }
    });
  }
  setSetting("bank_synced_at", new Date().toISOString());
  refreshInferredSubscriptions();
  refreshInferredIncome();
  refreshInferredLife();
  return {
    connected: true,
    synced: true,
    imported,
    updated,
    skipped,
    accounts: accounts.length,
    historic: range.historic,
    from: range.from,
    to: range.to,
  };
}

export async function ensureBankFresh(): Promise<SyncResult> {
  if (!isBankConnected()) return { connected: false, synced: false, imported: 0, updated: 0, skipped: 0, accounts: 0 };
  const last = getSetting("bank_synced_at");
  if (last && Date.now() - Date.parse(last) < FRESH_MS) {
    return { connected: true, synced: false, imported: 0, updated: 0, skipped: 0, accounts: 0 };
  }
  try {
    return await syncBank();
  } catch (err) {
    return {
      connected: isBankConnected(),
      synced: false,
      imported: 0,
      updated: 0,
      skipped: 0,
      accounts: listBankAccounts().length,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

let turnBank: SyncResult | undefined;

export async function beginTurn(): Promise<SyncResult> {
  turnBank = await ensureBankFresh();
  return turnBank;
}

export function bankPulse(): SyncResult {
  return (
    turnBank ?? {
      connected: isBankConnected(),
      synced: false,
      imported: 0,
      updated: 0,
      skipped: 0,
      accounts: 0,
    }
  );
}

export async function bankBalances() {
  if (!isBankConnected()) return { connected: false, accounts: [] as unknown[] };
  const stored = listBankAccounts();
  const listed = stored.length ? stored : await accountsForSync();
  const rows = [];
  for (const account of listed) {
    try {
      const bal = (
        await api<{ results?: Balance[] }>(
          `/data/v1/${account.kind}/${encodeURIComponent(account.account_id)}/balance`,
        )
      ).results?.[0];
      if (bal) saveBankBalance(account.account_id, bal);
      rows.push({
        name: account.display_name,
        type: account.account_type || account.kind,
        provider: account.provider,
        currency: bal?.currency || account.currency,
        current: bal?.current ?? account.current,
        available: bal?.available ?? account.available,
        credit_limit: bal?.credit_limit ?? account.credit_limit,
      });
    } catch (err) {
      if (err instanceof TlError && isSca(err.code)) {
        rows.push({
          name: account.display_name,
          type: account.account_type || account.kind,
          provider: account.provider,
          currency: account.currency,
          current: account.current,
          available: account.available,
          credit_limit: account.credit_limit,
          cached: true,
        });
        continue;
      }
      throw err;
    }
  }
  return { connected: true, accounts: rows };
}

export function authLink(chatId: number): string {
  if (!truelayerReady()) throw new Error("TrueLayer client id/secret not set on Railway");
  if (!env.PUBLIC_URL) throw new Error("need a public URL so TrueLayer can return here");
  const state = randomBytes(16).toString("hex");
  setSetting("tl_oauth_state", state);
  setSetting("tl_oauth_chat", String(chatId));
  return `${authHost()}/?${authQuery({
    response_type: "code",
    client_id: env.TRUELAYER_CLIENT_ID,
    redirect_uri: redirectUri(),
    scope: TL_SCOPES,
    providers: TL_PROVIDERS,
    state,
  })}`;
}

export function disconnectBank(): void {
  clearBank();
  setSetting("bank_synced_at", "");
}

export async function handleTrueLayerCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = getSetting("tl_oauth_state");
  const chatId = Number(getSetting("tl_oauth_chat") || 0);
  const ip = clientIp(req);

  const { send, telegramRedirect, syncCommands } = await import("./telegram");
  const bounce = () => telegramRedirect();
  const notify = async (text: string) => {
    if (!chatId) return;
    await send(chatId, text);
  };

  if (err) {
    await notify(`Bank connect failed. ${err}`);
    return bounce();
  }
  if (!code || !state || !expected || state !== expected) {
    if (expected) await notify("Bad or expired link. Send /connect again.");
    return bounce();
  }

  try {
    await exchangeCode(code, ip);
    setSetting("tl_oauth_state", "");
    const sync = await syncBank();
    await notify(
      `Bank connected. ${sync.accounts} accounts, ${sync.imported} new spends${sync.historic ? " (full history)" : ""}. Ask away.`,
    );
    await syncCommands();
    return bounce();
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    await notify(`Bank connect failed. ${message}`);
    return bounce();
  }
}
