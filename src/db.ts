import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { env } from "./env";
import {
  buildSplit,
  cadencePhrase,
  classifySpend,
  displayMerchant,
  ignoreSpendCategory,
  inferIncome,
  inferLife,
  inferSubscriptions,
  lifeMonthlyMajor,
  likeToken,
  localeForCurrency,
  merchantKey,
  minorFactor,
  normalizeIntent,
  normalizeNoteKey,
  parseNoteMajor,
  preferMerchant,
  scoreSubscriptions,
  searchText,
  searchTokens,
  validCurrency,
  validTz,
  type BucketMark,
  type Locale,
  type ScoredSub,
} from "./money";

export const CADENCES = ["weekly", "monthly", "yearly"] as const;
export type Cadence = (typeof CADENCES)[number];

export type Subscription = {
  id: number;
  name: string;
  amount_pence: number;
  currency: string;
  cadence: Cadence;
  next_date: string | null;
  notes: string | null;
  source: string;
  merchant_key: string | null;
  kind: "flat" | "usage";
  created_at: string;
  cancelled_at: string | null;
};

export type Expense = {
  id: number;
  amount_pence: number;
  currency: string;
  merchant: string;
  category: string | null;
  spent_on: string;
  notes: string | null;
  source: string;
  external_id: string | null;
  pending: number;
};

export type BankTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  consented_at: number | null;
  psu_ip: string | null;
};

export type BankAccount = {
  account_id: string;
  kind: "accounts" | "cards";
  display_name: string;
  currency: string | null;
  account_type: string | null;
  provider: string | null;
  current: number | null;
  available: number | null;
  credit_limit: number | null;
};

export type Note = { key: string; value: string; updated_at: string };
export type ChatTurn = { role: "user" | "assistant"; content: string };

await mkdir(dirname(env.DATABASE_PATH), { recursive: true });

export const db = new Database(env.DATABASE_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec(await Bun.file(new URL("./schema.sql", import.meta.url)).text());

function tableColumns(table: string): Set<string> {
  return new Set(
    (db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name),
  );
}

function migrate(): void {
  const expenseCols = tableColumns("expenses");
  if (!expenseCols.has("source")) db.exec("ALTER TABLE expenses ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  if (!expenseCols.has("external_id")) db.exec("ALTER TABLE expenses ADD COLUMN external_id TEXT");
  db.exec("DROP INDEX IF EXISTS expenses_external_id");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS expenses_external_id ON expenses (external_id)");
  const tokenCols = tableColumns("bank_tokens");
  if (!tokenCols.has("consented_at")) db.exec("ALTER TABLE bank_tokens ADD COLUMN consented_at INTEGER");
  if (!tokenCols.has("psu_ip")) db.exec("ALTER TABLE bank_tokens ADD COLUMN psu_ip TEXT");
  if (!expenseCols.has("search_text")) db.exec("ALTER TABLE expenses ADD COLUMN search_text TEXT");
  if (!expenseCols.has("merchant_key")) db.exec("ALTER TABLE expenses ADD COLUMN merchant_key TEXT");
  if (!expenseCols.has("pending")) db.exec("ALTER TABLE expenses ADD COLUMN pending INTEGER NOT NULL DEFAULT 0");
  db.exec("CREATE INDEX IF NOT EXISTS expenses_merchant_key ON expenses (merchant_key)");
  db.exec("CREATE INDEX IF NOT EXISTS expenses_search_text ON expenses (search_text)");
  const subCols = tableColumns("subscriptions");
  if (!subCols.has("source")) db.exec("ALTER TABLE subscriptions ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  if (!subCols.has("merchant_key")) db.exec("ALTER TABLE subscriptions ADD COLUMN merchant_key TEXT");
  if (!subCols.has("kind")) db.exec("ALTER TABLE subscriptions ADD COLUMN kind TEXT NOT NULL DEFAULT 'flat'");
  db.exec("CREATE INDEX IF NOT EXISTS subscriptions_merchant_key ON subscriptions (merchant_key)");
  backfillSearch();
}

function expenseIndex(merchant: string, notes: string | null, category: string | null) {
  return {
    search_text: searchText(merchant, notes, category),
    merchant_key: merchantKey(merchant),
  };
}

function backfillSearch(): void {
  const rows = db
    .query(
      `SELECT id, merchant, notes, category FROM expenses
       WHERE search_text IS NULL OR search_text = '' OR merchant_key IS NULL OR merchant_key = ''`,
    )
    .all() as Array<{ id: number; merchant: string; notes: string | null; category: string | null }>;
  if (!rows.length) return;
  const update = db.query("UPDATE expenses SET search_text = ?, merchant_key = ? WHERE id = ?");
  const write = db.transaction(() => {
    for (const row of rows) {
      const index = expenseIndex(row.merchant, row.notes, row.category);
      update.run(index.search_text, index.merchant_key, row.id);
    }
  });
  write();
}

migrate();

const EXPENSE_COLS =
  "id, amount_pence, currency, merchant, category, spent_on, notes, source, external_id, pending";

const claim = db.query("INSERT OR IGNORE INTO seen (update_id) VALUES (?)");
const insertMessage = db.query("INSERT INTO messages (role, content) VALUES (?, ?)");
const selectMessages = db.query(
  "SELECT role, content FROM messages ORDER BY id DESC LIMIT ?",
);
const SUB_COLS =
  "id, name, amount_pence, currency, cadence, next_date, notes, source, merchant_key, kind, created_at, cancelled_at";
const insertSub = db.query(
  `INSERT INTO subscriptions (name, amount_pence, currency, cadence, next_date, notes, source, merchant_key, kind)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const selectSubs = db.query(
  `SELECT ${SUB_COLS}
   FROM subscriptions
   WHERE (? = 1 OR cancelled_at IS NULL)
   ORDER BY name COLLATE NOCASE`,
);
const selectAllSubs = db.query(`SELECT ${SUB_COLS} FROM subscriptions`);
const selectSubById = db.query(`SELECT ${SUB_COLS} FROM subscriptions WHERE id = ?`);
const selectSubByName = db.query(
  `SELECT ${SUB_COLS}
   FROM subscriptions
   WHERE cancelled_at IS NULL AND name = ? COLLATE NOCASE
   LIMIT 1`,
);
const selectActiveSubByKey = db.query(
  `SELECT ${SUB_COLS}
   FROM subscriptions
   WHERE cancelled_at IS NULL AND merchant_key = ?
   LIMIT 1`,
);
const cancelSub = db.query(
  "UPDATE subscriptions SET cancelled_at = datetime('now') WHERE id = ? AND cancelled_at IS NULL",
);
const updateSub = db.query(
  `UPDATE subscriptions
   SET name = ?, amount_pence = ?, currency = ?, cadence = ?, next_date = ?, notes = ?, source = ?, merchant_key = ?, kind = ?
   WHERE id = ?`,
);
const selectCharges = db.query(
  `SELECT merchant_key, merchant, currency, amount_pence, spent_on, category
   FROM expenses
   WHERE pending = 0 AND merchant_key IS NOT NULL AND merchant_key != ''`,
);
const selectSubCharges = db.query(
  `SELECT merchant_key, currency, amount_pence, spent_on
   FROM expenses
   WHERE pending = 0
     AND merchant_key IN (
       SELECT merchant_key FROM subscriptions
       WHERE merchant_key IS NOT NULL AND merchant_key != ''
     )`,
);
const sumOtherSpend = db.query(
  `SELECT COALESCE(SUM(amount_pence), 0) AS total
   FROM expenses
   WHERE currency = ?
     AND pending = 0
     AND (? IS NULL OR spent_on >= ?)
     AND (? IS NULL OR spent_on <= ?)
     AND (merchant_key IS NULL OR merchant_key NOT IN (
       SELECT merchant_key FROM subscriptions
       WHERE cancelled_at IS NULL AND merchant_key IS NOT NULL AND merchant_key != ''
     ))`,
);
const insertExpense = db.query(
  `INSERT INTO expenses (amount_pence, currency, merchant, category, spent_on, notes, source, external_id, search_text, merchant_key)
   VALUES (?, ?, ?, ?, ?, ?, 'manual', NULL, ?, ?)`,
);
const upsertBankExpense = db.query(
  `INSERT INTO expenses (amount_pence, currency, merchant, category, spent_on, notes, source, external_id, search_text, merchant_key, pending)
   VALUES (?, ?, ?, ?, ?, ?, 'bank', ?, ?, ?, ?)
   ON CONFLICT(external_id) DO UPDATE SET
     amount_pence = excluded.amount_pence,
     currency = excluded.currency,
     merchant = excluded.merchant,
     category = excluded.category,
     spent_on = excluded.spent_on,
     notes = excluded.notes,
     search_text = excluded.search_text,
     merchant_key = excluded.merchant_key,
     pending = excluded.pending`,
);
const selectExpenseById = db.query(`SELECT ${EXPENSE_COLS} FROM expenses WHERE id = ?`);
const selectExpenseByExternal = db.query(`SELECT ${EXPENSE_COLS} FROM expenses WHERE external_id = ?`);
const upsertBankIncome = db.query(
  `INSERT INTO incomes (amount_pence, currency, merchant, category, received_on, notes, source, external_id, search_text, merchant_key)
   VALUES (?, ?, ?, ?, ?, ?, 'bank', ?, ?, ?)
   ON CONFLICT(external_id) DO UPDATE SET
     amount_pence = excluded.amount_pence,
     currency = excluded.currency,
     merchant = excluded.merchant,
     category = excluded.category,
     received_on = excluded.received_on,
     notes = excluded.notes,
     search_text = excluded.search_text,
     merchant_key = excluded.merchant_key`,
);
const selectIncomeByExternal = db.query("SELECT id FROM incomes WHERE external_id = ?");
const selectIncomeCredits = db.query(
  `SELECT merchant_key, merchant, currency, amount_pence, received_on
   FROM incomes
   WHERE merchant_key IS NOT NULL AND merchant_key != ''`,
);
const sumIncome = db.query(
  `SELECT COALESCE(SUM(amount_pence), 0) AS total
   FROM incomes
   WHERE currency = ?
     AND (? IS NULL OR received_on >= ?)
     AND (? IS NULL OR received_on <= ?)`,
);
const selectSpendRows = db.query(
  `SELECT merchant_key, merchant, category, currency, amount_pence, spent_on
   FROM expenses
   WHERE pending = 0 AND merchant_key IS NOT NULL AND merchant_key != ''`,
);
const selectRangeSpend = db.query(
  `SELECT IFNULL(merchant_key, '') AS merchant_key, merchant, category, currency, amount_pence
   FROM expenses
   WHERE (? IS NULL OR spent_on >= ?)
     AND (? IS NULL OR spent_on <= ?)`,
);
const searchExpensesQ = db.query(
  `SELECT ${EXPENSE_COLS}
   FROM expenses
   WHERE (? IS NULL OR spent_on >= ?)
     AND (? IS NULL OR spent_on <= ?)
     AND (? IS NULL OR search_text LIKE ?)
     AND (? IS NULL OR search_text LIKE ?)
     AND (? IS NULL OR search_text LIKE ?)
     AND (? IS NULL OR search_text LIKE ?)
     AND (? IS NULL OR amount_pence BETWEEN ? AND ?)
   ORDER BY spent_on DESC, id DESC
   LIMIT ?`,
);
const spendByMerchantQ = db.query(
  `SELECT merchant_key,
          currency,
          merchant,
          SUM(amount_pence) AS total,
          COUNT(*) AS n,
          SUM(CASE WHEN pending = 1 THEN 1 ELSE 0 END) AS pending_n,
          MAX(spent_on) AS last_spent_on
   FROM expenses
   WHERE (? IS NULL OR spent_on >= ?)
     AND (? IS NULL OR spent_on <= ?)
     AND (? IS NULL OR search_text LIKE ?)
     AND (? IS NULL OR search_text LIKE ?)
     AND (? IS NULL OR search_text LIKE ?)
     AND (? IS NULL OR search_text LIKE ?)
   GROUP BY merchant_key, currency, merchant
   ORDER BY total DESC
   LIMIT ?`,
);
const sumByCurrency = db.query(
  `SELECT currency,
          COALESCE(SUM(amount_pence), 0) AS total,
          COUNT(*) AS n,
          COALESCE(SUM(CASE WHEN pending = 1 THEN 1 ELSE 0 END), 0) AS pending_n
   FROM expenses
   WHERE (? IS NULL OR spent_on >= ?)
     AND (? IS NULL OR spent_on <= ?)
     AND (? IS NULL OR category = ? COLLATE NOCASE)
   GROUP BY currency`,
);
const sumExpenses = db.query(
  `SELECT COALESCE(SUM(amount_pence), 0) AS total, COUNT(*) AS n
   FROM expenses
   WHERE currency = ?
     AND (? IS NULL OR spent_on >= ?)
     AND (? IS NULL OR spent_on <= ?)
     AND (? IS NULL OR category = ? COLLATE NOCASE)`,
);
const deletePendingPrefix = db.query(
  "DELETE FROM expenses WHERE pending = 1 AND external_id LIKE ? ESCAPE '\\'",
);
const selectBankTokens = db.query(
  "SELECT access_token, refresh_token, expires_at, consented_at, psu_ip FROM bank_tokens WHERE id = 1",
);
const upsertBankTokens = db.query(
  `INSERT INTO bank_tokens (id, access_token, refresh_token, expires_at, consented_at, psu_ip, updated_at)
   VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
   ON CONFLICT(id) DO UPDATE SET
     access_token = excluded.access_token,
     refresh_token = excluded.refresh_token,
     expires_at = excluded.expires_at,
     consented_at = COALESCE(excluded.consented_at, bank_tokens.consented_at),
     psu_ip = COALESCE(excluded.psu_ip, bank_tokens.psu_ip),
     updated_at = datetime('now')`,
);
const deleteBankTokens = db.query("DELETE FROM bank_tokens WHERE id = 1");
const selectBankAccounts = db.query(
  `SELECT account_id, kind, display_name, currency, account_type, provider, current, available, credit_limit
   FROM bank_accounts ORDER BY kind, display_name`,
);
const insertBankAccount = db.query(
  `INSERT INTO bank_accounts (account_id, kind, display_name, currency, account_type, provider, current, available, credit_limit)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const updateBankBalanceQ = db.query(
  `UPDATE bank_accounts
   SET current = ?, available = ?, credit_limit = ?, updated_at = datetime('now')
   WHERE account_id = ?`,
);
const deleteBankAccounts = db.query("DELETE FROM bank_accounts");
const upsertNote = db.query(
  `INSERT INTO notes (key, value, updated_at) VALUES (?, ?, datetime('now'))
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
);
const selectNote = db.query("SELECT key, value, updated_at FROM notes WHERE key = ?");
const selectNotes = db.query("SELECT key, value, updated_at FROM notes ORDER BY key");
const selectSetting = db.query("SELECT value FROM settings WHERE key = ?");
const upsertSetting = db.query(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
);
const selectBuckets = db.query("SELECT merchant_key, bucket FROM merchant_buckets");
const upsertBucket = db.query(
  `INSERT INTO merchant_buckets (merchant_key, bucket, updated_at) VALUES (?, ?, datetime('now'))
   ON CONFLICT(merchant_key) DO UPDATE SET bucket = excluded.bucket, updated_at = datetime('now')`,
);
const selectMerchantMatch = db.query(
  `SELECT merchant_key, merchant, SUM(amount_pence) AS total
   FROM expenses
   WHERE merchant_key = ? OR search_text LIKE ?
   GROUP BY merchant_key
   ORDER BY CASE WHEN merchant_key = ? THEN 0 ELSE 1 END, total DESC
   LIMIT 5`,
);

export function getSetting(key: string): string | undefined {
  const row = selectSetting.get(key) as { value: string } | null;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  upsertSetting.run(key, value);
}

export function bucketOverrides(): Map<string, BucketMark> {
  const out = new Map<string, BucketMark>();
  for (const row of selectBuckets.all() as Array<{ merchant_key: string; bucket: BucketMark }>) {
    out.set(row.merchant_key, row.bucket);
  }
  return out;
}

export function setMerchantBucket(key: string, bucket: BucketMark): void {
  const clean = key.trim();
  if (!clean) throw new Error("merchant required");
  upsertBucket.run(clean, bucket);
  setSetting("last_merchant_key", clean);
}

export function lastMerchantKey(): string | undefined {
  return getSetting("last_merchant_key");
}

export function rememberMerchant(key: string | undefined): void {
  if (key?.trim()) setSetting("last_merchant_key", key.trim());
}

export function findMerchantMatch(name: string): { key: string; name: string } | null {
  const key = merchantKey(name);
  if (!key) return null;
  const rows = selectMerchantMatch.all(key, likeToken(key), key) as Array<{
    merchant_key: string;
    merchant: string;
    total: number;
  }>;
  if (!rows.length) {
    return { key, name: displayMerchant(name, key) };
  }
  const exact = rows.find((row) => row.merchant_key === key) ?? rows[0]!;
  return { key: exact.merchant_key, name: displayMerchant(exact.merchant, exact.merchant_key) };
}

export function saveLocale(loc: Locale): void {
  setSetting("currency", loc.currency);
  setSetting("tz", loc.tz);
  setSetting("locale", loc.locale);
}

export function clearLocale(): void {
  db.query("DELETE FROM settings WHERE key IN ('currency', 'tz', 'locale')").run();
}

export function isConfigured(): boolean {
  return Boolean(getSetting("currency") && getSetting("tz"));
}

export function getLocale(): Locale {
  const currency = getSetting("currency");
  const tz = getSetting("tz");
  if (!currency || !tz) throw new Error("locale not configured");
  return { currency, tz, locale: getSetting("locale") || localeForCurrency(currency) };
}

if (env.CURRENCY && env.TZ && !isConfigured() && validCurrency(env.CURRENCY) && validTz(env.TZ)) {
  saveLocale({
    currency: env.CURRENCY,
    tz: env.TZ,
    locale: env.LOCALE || localeForCurrency(env.CURRENCY),
  });
}

export function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: getLocale().tz });
}

export function monthStart(day = today()): string {
  return `${day.slice(0, 7)}-01`;
}

export function formatMoney(minor: number, currency = getLocale().currency): string {
  const factor = minorFactor(currency);
  return new Intl.NumberFormat(getLocale().locale, { style: "currency", currency }).format(minor / factor);
}

export function toMinor(amount: number, currency = getLocale().currency): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount must be a positive number");
  return Math.round(amount * minorFactor(currency));
}

export function toMinorAbs(amount: number, currency: string): number {
  if (!Number.isFinite(amount) || amount === 0) throw new Error("amount required");
  return Math.round(Math.abs(amount) * minorFactor(currency));
}

export function monthlyPence(amount: number, cadence: Cadence): number {
  if (cadence === "weekly") return Math.round((amount * 52) / 12);
  if (cadence === "yearly") return Math.round(amount / 12);
  return amount;
}

export function claimUpdate(updateId: number): boolean {
  return claim.run(updateId).changes === 1;
}

const pruneMessages = db.query(
  "DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT 40)",
);
const insertTgMessage = db.query("INSERT OR IGNORE INTO tg_messages (message_id) VALUES (?)");
const selectTgMessages = db.query("SELECT message_id FROM tg_messages");
const pruneTgMessages = db.query(
  "DELETE FROM tg_messages WHERE message_id NOT IN (SELECT message_id FROM tg_messages ORDER BY message_id DESC LIMIT 500)",
);

export function saveMessage(role: ChatTurn["role"], content: string): void {
  insertMessage.run(role, content);
  if (role === "assistant") pruneMessages.run();
}

export function rememberTgMessage(id: number): void {
  insertTgMessage.run(id);
  pruneTgMessages.run();
}

export function listTgMessages(): number[] {
  return (selectTgMessages.all() as Array<{ message_id: number }>).map((row) => row.message_id);
}

export function resetAll(): void {
  const wipe = db.transaction(() => {
    db.exec(`
      DELETE FROM expenses;
      DELETE FROM incomes;
      DELETE FROM subscriptions;
      DELETE FROM notes;
      DELETE FROM merchant_buckets;
      DELETE FROM messages;
      DELETE FROM bank_tokens;
      DELETE FROM bank_accounts;
      DELETE FROM settings;
      DELETE FROM tg_messages;
    `);
  });
  wipe();
}

export function recentMessages(limit = 8): ChatTurn[] {
  return (selectMessages.all(limit) as ChatTurn[]).reverse();
}

export function addSubscription(row: {
  name: string;
  amount_pence: number;
  cadence: Cadence;
  next_date: string | null;
  notes: string | null;
}): Subscription {
  const key = merchantKey(row.name);
  const existing = selectActiveSubByKey.get(key) as Subscription | null;
  if (existing) {
    updateSub.run(
      row.name,
      row.amount_pence,
      existing.currency,
      row.cadence,
      row.next_date,
      row.notes,
      "manual",
      key,
      existing.kind || "flat",
      existing.id,
    );
    return selectSubById.get(existing.id) as Subscription;
  }
  const result = insertSub.run(
    row.name,
    row.amount_pence,
    getLocale().currency,
    row.cadence,
    row.next_date,
    row.notes,
    "manual",
    key,
    "flat",
  );
  return selectSubById.get(Number(result.lastInsertRowid)) as Subscription;
}

export function refreshInferredSubscriptions(): void {
  const found = inferSubscriptions(
    selectCharges.all() as Array<{
      merchant_key: string;
      merchant: string;
      currency: string;
      amount_pence: number;
      spent_on: string;
      category: string | null;
    }>,
    today(),
  );
  const existing = selectAllSubs.all() as Subscription[];
  const seen = new Set<string>();
  const write = db.transaction(() => {
    for (const sub of found) {
      const key = `${sub.merchant_key}\0${sub.currency}`;
      seen.add(key);
      const matches = existing.filter((row) => row.merchant_key === sub.merchant_key);
      if (matches.some((row) => row.cancelled_at)) continue;
      const active = matches.find((row) => !row.cancelled_at);
      if (active?.source === "manual") continue;
      if (
        existing.some(
          (row) =>
            !row.cancelled_at &&
            row.source === "manual" &&
            row.name.localeCompare(sub.name, undefined, { sensitivity: "accent" }) === 0,
        )
      ) {
        continue;
      }
      if (active) {
        updateSub.run(
          sub.name,
          sub.amount_pence,
          sub.currency,
          sub.cadence,
          sub.next_date,
          active.notes,
          "inferred",
          sub.merchant_key,
          sub.kind,
          active.id,
        );
        continue;
      }
      insertSub.run(
        sub.name,
        sub.amount_pence,
        sub.currency,
        sub.cadence,
        sub.next_date,
        null,
        "inferred",
        sub.merchant_key,
        sub.kind,
      );
    }
    for (const row of existing) {
      if (row.source !== "inferred" || row.cancelled_at) continue;
      if (seen.has(`${row.merchant_key}\0${row.currency}`)) continue;
      cancelSub.run(row.id);
    }
  });
  write();
}

export function listSubscriptions(includeCancelled = false): Subscription[] {
  refreshInferredSubscriptions();
  return selectSubs.all(includeCancelled ? 1 : 0) as Subscription[];
}

export function findSubscription(id?: number, name?: string): Subscription | undefined {
  if (id != null) return (selectSubById.get(id) as Subscription | null) ?? undefined;
  if (name) return (selectSubByName.get(name) as Subscription | null) ?? undefined;
  throw new Error("id or name required");
}

export function cancelSubscription(id?: number, name?: string): Subscription {
  const row = findSubscription(id, name);
  if (!row) throw new Error("subscription not found");
  if (row.cancelled_at) throw new Error("already cancelled");
  cancelSub.run(row.id);
  return { ...row, cancelled_at: today() };
}

export function addExpense(row: {
  amount_pence: number;
  merchant: string;
  category: string | null;
  spent_on: string;
  notes: string | null;
}): Expense {
  const index = expenseIndex(row.merchant, row.notes, row.category);
  const result = insertExpense.run(
    row.amount_pence,
    getLocale().currency,
    row.merchant,
    row.category,
    row.spent_on,
    row.notes,
    index.search_text,
    index.merchant_key,
  );
  return selectExpenseById.get(Number(result.lastInsertRowid)) as Expense;
}

export function saveBankExpense(row: {
  amount_pence: number;
  currency: string;
  merchant: string;
  category: string | null;
  spent_on: string;
  notes: string | null;
  external_id: string;
  pending?: boolean;
}): { expense: Expense; inserted: boolean } {
  const before = selectExpenseByExternal.get(row.external_id) as Expense | null;
  const index = expenseIndex(row.merchant, row.notes, row.category);
  upsertBankExpense.run(
    row.amount_pence,
    row.currency,
    row.merchant,
    row.category,
    row.spent_on,
    row.notes,
    row.external_id,
    index.search_text,
    index.merchant_key,
    row.pending ? 1 : 0,
  );
  const expense = selectExpenseByExternal.get(row.external_id) as Expense;
  return { expense, inserted: !before };
}

export function saveBankIncome(row: {
  amount_pence: number;
  currency: string;
  merchant: string;
  category: string | null;
  received_on: string;
  notes: string | null;
  external_id: string;
}): { inserted: boolean } {
  const before = selectIncomeByExternal.get(row.external_id) as { id: number } | null;
  const index = expenseIndex(row.merchant, row.notes, row.category);
  upsertBankIncome.run(
    row.amount_pence,
    row.currency,
    row.merchant,
    row.category,
    row.received_on,
    row.notes,
    row.external_id,
    index.search_text,
    index.merchant_key,
  );
  return { inserted: !before };
}

function writeNote(key: string, value: string): void {
  upsertNote.run(key, value);
}

export function refreshInferredIncome(): void {
  const currency = getLocale().currency;
  const guess = inferIncome(
    selectIncomeCredits.all() as Array<{
      merchant_key: string;
      merchant: string;
      currency: string;
      amount_pence: number;
      received_on: string;
    }>,
    today(),
    currency,
  );
  if (guess.typical_monthly_pence <= 0) return;
  const stored = parseNoteMajor((selectNote.get("income_monthly") as Note | null)?.value ?? "");
  const source = ((selectNote.get("income_source") as Note | null)?.value ?? "").trim();
  const inferredMajor = guess.typical_monthly_pence / minorFactor(currency);
  const inferred = Number.isInteger(inferredMajor) ? String(inferredMajor) : inferredMajor.toFixed(2);
  if (source === "stated" && stored != null && guess.confidence !== "high") return;
  if (source === "stated" && stored != null) {
    const mid = Math.max(stored, inferredMajor);
    if (mid > 0 && Math.abs(stored - inferredMajor) / mid <= 0.15) return;
  }
  writeNote("income_monthly", inferred);
  writeNote("income_source", "inferred");
}

function noteMajor(pence: number, currency: string): string {
  const major = pence / minorFactor(currency);
  return Number.isInteger(major) ? String(major) : major.toFixed(2);
}

export function refreshInferredLife(): void {
  const currency = getLocale().currency;
  const skip = (selectSubs.all(0) as Subscription[])
    .map((row) => row.merchant_key)
    .filter((key): key is string => Boolean(key));
  const guess = inferLife(
    selectSpendRows.all() as Array<{
      merchant_key: string;
      merchant: string;
      category: string | null;
      currency: string;
      amount_pence: number;
      spent_on: string;
    }>,
    today(),
    currency,
    skip,
    bucketOverrides(),
  );
  if (guess.monthly_pence <= 0) return;
  const source = ((selectNote.get("life_source") as Note | null)?.value ?? "").trim();
  if (source === "stated") return;
  writeNote("life_monthly", noteMajor(guess.monthly_pence, currency));
  writeNote("life_daily", noteMajor(guess.daily_pence, currency));
  writeNote("life_days_per_week", String(guess.days_per_week));
  writeNote("life_source", "inferred");
}

export function findExpenseByExternal(id: string): Expense | undefined {
  return (selectExpenseByExternal.get(id) as Expense | null) ?? undefined;
}

export function replacePendingForPrefix(prefix: string, write: () => void): void {
  const like = `${prefix.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}:pending:%`;
  const run = db.transaction(() => {
    deletePendingPrefix.run(like);
    write();
  });
  run();
}

export function getBankTokens(): BankTokens | undefined {
  return (selectBankTokens.get() as BankTokens | null) ?? undefined;
}

export function saveBankTokens(tokens: {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  consented_at?: number | null;
  psu_ip?: string | null;
}): void {
  upsertBankTokens.run(
    tokens.access_token,
    tokens.refresh_token,
    tokens.expires_at,
    tokens.consented_at ?? null,
    tokens.psu_ip ?? null,
  );
}

export function clearBank(): void {
  deleteBankTokens.run();
  deleteBankAccounts.run();
}

export function isBankConnected(): boolean {
  return Boolean(getBankTokens());
}

export function listBankAccounts(): BankAccount[] {
  return selectBankAccounts.all() as BankAccount[];
}

export function replaceBankAccounts(rows: BankAccount[]): void {
  const write = db.transaction(() => {
    deleteBankAccounts.run();
    for (const row of rows) {
      insertBankAccount.run(
        row.account_id,
        row.kind,
        row.display_name,
        row.currency,
        row.account_type,
        row.provider,
        row.current,
        row.available,
        row.credit_limit,
      );
    }
  });
  write();
}

export function saveBankBalance(
  account_id: string,
  bal: { current?: number; available?: number; credit_limit?: number },
): void {
  updateBankBalanceQ.run(bal.current ?? null, bal.available ?? null, bal.credit_limit ?? null, account_id);
}

function tokenBinds(query?: string): Array<string | null> {
  const tokens = query ? searchTokens(query) : [];
  return [0, 1, 2, 3].flatMap((i) => {
    const token = tokens[i];
    return token ? [token, likeToken(token)] : [null, null];
  });
}

function amountWindow(amount?: number): [number | null, number | null, number | null] {
  if (amount == null) return [null, null, null];
  const minor = Math.round(Math.abs(amount) * minorFactor(getLocale().currency));
  const slack = Math.max(1, Math.round(minor * 0.02));
  return [minor, minor - slack, minor + slack];
}

export function searchExpenses(opts: {
  query?: string;
  from?: string;
  to?: string;
  amount?: number;
  limit?: number;
}): Expense[] {
  const [amount, lo, hi] = amountWindow(opts.amount);
  return searchExpensesQ.all(
    opts.from ?? null,
    opts.from ?? null,
    opts.to ?? null,
    opts.to ?? null,
    ...tokenBinds(opts.query),
    amount,
    lo,
    hi,
    opts.limit ?? 25,
  ) as Expense[];
}

export function spendByMerchant(opts: {
  query?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  const from = opts.from ?? monthStart();
  const to = opts.to ?? today();
  const home = getLocale().currency;
  const rows = spendByMerchantQ.all(
    from,
    from,
    to,
    to,
    ...tokenBinds(opts.query),
    200,
  ) as Array<{
    merchant_key: string;
    currency: string;
    merchant: string;
    total: number;
    n: number;
    pending_n: number;
    last_spent_on: string;
  }>;
  const merged = new Map<
    string,
    { merchant_key: string; currency: string; merchant: string; total: number; n: number; pending_n: number; last_spent_on: string }
  >();
  for (const row of rows) {
    const id = `${row.merchant_key}\0${row.currency}`;
    const cur = merged.get(id);
    if (!cur) {
      merged.set(id, { ...row });
      continue;
    }
    cur.merchant = preferMerchant(cur.merchant, row.merchant);
    cur.total += row.total;
    cur.n += row.n;
    cur.pending_n += row.pending_n;
    if (row.last_spent_on > cur.last_spent_on) cur.last_spent_on = row.last_spent_on;
  }
  const merchants = [...merged.values()].sort((a, b) => {
    if (a.currency === home && b.currency !== home) return -1;
    if (b.currency === home && a.currency !== home) return 1;
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    return b.total - a.total;
  });
  const subKeys = new Set(
    listSubscriptions(false)
      .map((sub) => sub.merchant_key)
      .filter((key): key is string => Boolean(key)),
  );
  const shown = merchants.slice(0, opts.limit ?? 40);
  if (opts.query && shown.length === 1) rememberMerchant(shown[0]!.merchant_key);
  return {
    from,
    to,
    merchants: shown.map((row) => ({
      merchant: displayMerchant(row.merchant, row.merchant_key),
      key: row.merchant_key,
      currency: row.currency,
      total: formatMoney(row.total, row.currency),
      count: row.n,
      pending: row.pending_n,
      last_spent_on: row.last_spent_on,
      bucket: classifySpend(row, subKeys, bucketOverrides()),
    })),
  };
}

export function dayExpenses(day: string) {
  return {
    day,
    expenses: searchExpenses({ from: day, to: day, limit: 80 }).map(viewExpense),
  };
}

function daysInclusive(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  return Math.max(1, Math.round((end - start) / 86_400_000) + 1);
}

function daysInMonth(day: string): number {
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function spendSummary(opts: { from?: string; to?: string; category?: string }) {
  const from = opts.from ?? monthStart();
  const to = opts.to ?? today();
  const currency = getLocale().currency;
  const category = ignoreSpendCategory(opts.category) ? null : opts.category ?? null;
  const totals = sumExpenses.get(currency, from, from, to, to, category, category) as {
    total: number;
    n: number;
  };
  const currencies = (
    sumByCurrency.all(from, from, to, to, category, category) as Array<{
      currency: string;
      total: number;
      n: number;
      pending_n: number;
    }>
  ).sort((a, b) => {
    if (a.currency === currency && b.currency !== currency) return -1;
    if (b.currency === currency && a.currency !== currency) return 1;
    return b.total - a.total;
  });
  const days = daysInclusive(from, to);
  const month_days = daysInMonth(from);
  const subs = listSubscriptions(false);
  const homeSubs = subs.filter((sub) => sub.currency === currency);
  const monthly = homeSubs.reduce((sum, sub) => sum + monthlyPence(sub.amount_pence, sub.cadence), 0);
  const other = (sumOtherSpend.get(currency, from, from, to, to) as { total: number }).total;
  const mix = buildSplit(
    selectRangeSpend.all(from, from, to, to) as Array<{
      merchant_key: string;
      merchant: string;
      category: string | null;
      currency: string;
      amount_pence: number;
    }>,
    currency,
    homeSubs.map((sub) => sub.merchant_key).filter((key): key is string => Boolean(key)),
    formatMoney,
    from,
    to,
    formatMoney(totals.total),
    bucketOverrides(),
  );
  return {
    from,
    to,
    days,
    month_days,
    expenses: formatMoney(totals.total),
    per_day: formatMoney(Math.round(totals.total / days)),
    projected_month: formatMoney(Math.round((totals.total / days) * month_days)),
    other_spend: formatMoney(other),
    expense_count: currencies.reduce((sum, row) => sum + row.n, 0),
    pending_count: currencies.reduce((sum, row) => sum + row.pending_n, 0),
    by_currency: currencies.map((row) => ({
      currency: row.currency,
      total: formatMoney(row.total, row.currency),
      count: row.n,
      pending: row.pending_n,
    })),
    split: mix.split,
    chart: mix.chart,
    food: mix.food,
    travel: mix.travel,
    active_subscriptions: subs.length,
    subscriptions_monthly: formatMoney(monthly),
    bank_connected: isBankConnected(),
    bank_synced_at: getSetting("bank_synced_at") ?? null,
  };
}

export function setNote(key: string, value: string): Note {
  const slug = normalizeNoteKey(key);
  let stored = value.trim();
  if (slug === "save_intent" || slug === "invest_intent") stored = normalizeIntent(stored);
  upsertNote.run(slug, stored);
  if (slug === "income_monthly") upsertNote.run("income_source", "stated");
  if (slug === "life_monthly" || slug === "life_daily") upsertNote.run("life_source", "stated");
  if (slug === "save_monthly" && parseNoteMajor(stored)) upsertNote.run("save_intent", "yes");
  if (slug === "save_intent" && stored === "no") upsertNote.run("save_monthly", "0");
  return selectNote.get(slug) as Note;
}

export function getNotes(key?: string): Note[] {
  if (key) {
    const row = selectNote.get(normalizeNoteKey(key)) as Note | null;
    return row ? [row] : [];
  }
  return selectNotes.all() as Note[];
}

type ChargeStat = { min: number; max: number; last: number; last_on: string };

function loadSubStats(): Map<string, ChargeStat> {
  const stats = new Map<string, ChargeStat>();
  const rows = selectSubCharges.all() as Array<{
    merchant_key: string;
    currency: string;
    amount_pence: number;
    spent_on: string;
  }>;
  for (const row of rows) {
    const id = `${row.merchant_key}\0${row.currency}`;
    const seen = stats.get(id);
    if (!seen) {
      stats.set(id, {
        min: row.amount_pence,
        max: row.amount_pence,
        last: row.amount_pence,
        last_on: row.spent_on,
      });
      continue;
    }
    seen.min = Math.min(seen.min, row.amount_pence);
    seen.max = Math.max(seen.max, row.amount_pence);
    if (row.spent_on >= seen.last_on) {
      seen.last = row.amount_pence;
      seen.last_on = row.spent_on;
    }
  }
  return stats;
}

function formatSub(row: Subscription, stats: Map<string, ChargeStat>) {
  const stat = row.merchant_key ? stats.get(`${row.merchant_key}\0${row.currency}`) : undefined;
  const usage = row.kind === "usage" || Boolean(stat && stat.min > 0 && stat.max / stat.min >= 1.2);
  return {
    id: row.id,
    name: row.name,
    amount: formatMoney(row.amount_pence, row.currency),
    monthly: formatMoney(monthlyPence(row.amount_pence, row.cadence), row.currency),
    cadence: row.cadence,
    kind: usage ? "usage" : "flat",
    next_date: row.next_date,
    last: stat ? formatMoney(stat.last, row.currency) : null,
    range:
      usage && stat
        ? { min: formatMoney(stat.min, row.currency), max: formatMoney(stat.max, row.currency) }
        : null,
    notes: row.notes,
    source: row.source,
    cancelled: Boolean(row.cancelled_at),
  };
}

export function viewSub(row: Subscription) {
  return formatSub(row, loadSubStats());
}

export function viewSubs(rows: Subscription[]) {
  const stats = loadSubStats();
  return rows.map((row) => formatSub(row, stats));
}

function reviewLine(row: {
  name: string;
  amount_pence: number;
  currency: string;
  cadence: ScoredSub["cadence"];
  kind: "flat" | "usage";
  last_spent_on?: string;
  key: string;
}) {
  const money = formatMoney(row.amount_pence, row.currency);
  const phrase = cadencePhrase(row.cadence);
  const usage = row.kind === "usage" ? "  usage" : "";
  const last = row.last_spent_on ? `  last ${row.last_spent_on}` : "";
  return {
    name: row.name,
    key: row.key,
    amount: money,
    amount_pence: row.amount_pence,
    cadence: row.cadence,
    kind: row.kind,
    last_spent_on: row.last_spent_on ?? null,
    line: `${row.name}  ${row.kind === "usage" ? "~" : ""}${money}${phrase}${usage}${last}`,
  };
}

export function subscriptionReview() {
  refreshInferredSubscriptions();
  const day = today();
  const scored = scoreSubscriptions(
    selectCharges.all() as Array<{
      merchant_key: string;
      merchant: string;
      currency: string;
      amount_pence: number;
      spent_on: string;
      category: string | null;
    }>,
    day,
  );
  const stored = selectAllSubs.all() as Subscription[];
  const cancelled = new Set(
    stored.filter((row) => row.cancelled_at && row.merchant_key).map((row) => row.merchant_key as string),
  );
  const taken = new Set<string>();
  const definite: ReturnType<typeof reviewLine>[] = [];
  const likely: ReturnType<typeof reviewLine>[] = [];
  const lapsed: ReturnType<typeof reviewLine>[] = [];

  for (const row of stored.filter((sub) => !sub.cancelled_at && sub.source === "manual")) {
    if (!row.merchant_key || taken.has(row.merchant_key)) continue;
    taken.add(row.merchant_key);
    definite.push(
      reviewLine({
        name: row.name,
        amount_pence: row.amount_pence,
        currency: row.currency,
        cadence: row.cadence,
        kind: row.kind,
        key: row.merchant_key,
      }),
    );
  }

  for (const row of scored) {
    if (cancelled.has(row.merchant_key)) {
      if (!taken.has(row.merchant_key)) {
        taken.add(row.merchant_key);
        lapsed.push(
          reviewLine({
            name: row.name,
            amount_pence: row.amount_pence,
            currency: row.currency,
            cadence: row.cadence,
            kind: row.kind,
            last_spent_on: row.last_spent_on,
            key: row.merchant_key,
          }),
        );
      }
      continue;
    }
    if (taken.has(row.merchant_key)) continue;
    taken.add(row.merchant_key);
    const line = reviewLine({
      name: row.name,
      amount_pence: row.amount_pence,
      currency: row.currency,
      cadence: row.cadence,
      kind: row.kind,
      last_spent_on: row.confidence === "lapsed" ? row.last_spent_on : undefined,
      key: row.merchant_key,
    });
    if (row.confidence === "definite") definite.push(line);
    else if (row.confidence === "likely") likely.push(line);
    else lapsed.push(line);
  }

  for (const row of stored.filter((sub) => sub.cancelled_at && sub.merchant_key && !taken.has(sub.merchant_key))) {
    taken.add(row.merchant_key!);
    lapsed.push(
      reviewLine({
        name: row.name,
        amount_pence: row.amount_pence,
        currency: row.currency,
        cadence: row.cadence,
        kind: row.kind,
        key: row.merchant_key!,
      }),
    );
  }

  const byCost = (a: { amount_pence: number }, b: { amount_pence: number }) => b.amount_pence - a.amount_pence;
  definite.sort(byCost);
  likely.sort(byCost);
  lapsed.sort(byCost);
  return { definite, likely, lapsed };
}

function majorMinor(amount: number | undefined): number {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return 0;
  return toMinor(amount);
}

export function moneyPicture() {
  refreshInferredIncome();
  const currency = getLocale().currency;
  const from = monthStart();
  const to = today();
  const month = spendSummary({});
  const rows = listSubscriptions(false);
  refreshInferredLife();
  const notes = Object.fromEntries(getNotes().map((row) => [row.key, row.value]));
  const subs = viewSubs(rows);
  const payGuess = inferIncome(
    selectIncomeCredits.all() as Array<{
      merchant_key: string;
      merchant: string;
      currency: string;
      amount_pence: number;
      received_on: string;
    }>,
    to,
    currency,
  );
  const lifeGuess = inferLife(
    selectSpendRows.all() as Array<{
      merchant_key: string;
      merchant: string;
      category: string | null;
      currency: string;
      amount_pence: number;
      spent_on: string;
    }>,
    to,
    currency,
    rows.map((row) => row.merchant_key).filter((key): key is string => Boolean(key)),
    bucketOverrides(),
  );
  const thisMonthIn = (sumIncome.get(currency, from, from, to, to) as { total: number }).total;
  const incomeMajor = notes.income_monthly ? parseNoteMajor(notes.income_monthly) : undefined;
  const saveMajor = notes.save_monthly ? parseNoteMajor(notes.save_monthly) : undefined;
  const lifeMajor = lifeMonthlyMajor(notes) ?? (lifeGuess.monthly_pence > 0 ? lifeGuess.monthly_pence / minorFactor(currency) : undefined);
  const subMinor = rows
    .filter((sub) => sub.currency === currency)
    .reduce((sum, sub) => sum + monthlyPence(sub.amount_pence, sub.cadence), 0);
  const incomeMinor =
    incomeMajor != null
      ? majorMinor(incomeMajor)
      : payGuess.typical_monthly_pence > 0
        ? payGuess.typical_monthly_pence
        : null;
  const lifeMinor = lifeMajor != null ? majorMinor(lifeMajor) : lifeGuess.monthly_pence;
  const saveNo = notes.save_intent === "no" || saveMajor === 0;
  const investNo = notes.invest_intent === "no";
  const saveMinor = saveNo ? 0 : majorMinor(saveMajor);
  const leftover = incomeMinor != null ? incomeMinor - lifeMinor - subMinor - saveMinor : null;
  const young = /(?:^|\b)(1[3-9]|student|teen|sixth ?form|college)(?:\b|$)/i.test(notes.situation || "");
  const afterLife = incomeMinor != null ? Math.max(0, incomeMinor - lifeMinor) : null;
  const bufferPct = young ? 0.2 : saveNo && investNo ? 0.08 : 0.12;
  const buffer = afterLife != null ? Math.round(afterLife * bufferPct) : null;
  const subsCeiling = incomeMinor != null && buffer != null ? Math.max(0, incomeMinor - lifeMinor - saveMinor - buffer) : null;
  const monthDays = daysInMonth(from);
  const eatDays = Math.max(1, Math.round((lifeGuess.days_per_week * 52) / 12));
  const foodCeiling =
    incomeMinor != null && buffer != null
      ? Math.max(0, Math.round((incomeMinor - subMinor - saveMinor - buffer - lifeGuess.travel_monthly_pence) / eatDays))
      : null;
  const flexDaily =
    leftover != null && buffer != null ? Math.max(0, Math.round((leftover - buffer) / monthDays)) : leftover != null ? Math.round(leftover / monthDays) : null;
  const missing: string[] = [];
  if (incomeMinor == null) missing.push("income_monthly");
  return {
    notes,
    month,
    subscriptions: subs,
    income: {
      typical: incomeMinor != null ? formatMoney(incomeMinor) : null,
      this_month: formatMoney(thisMonthIn),
      confidence: payGuess.confidence,
      source: notes.income_source || (payGuess.typical_monthly_pence > 0 ? "inferred" : null),
      streams: payGuess.streams.map((row) => ({
        name: row.name,
        cadence: row.cadence,
        amount: formatMoney(row.amount_pence, row.currency),
        monthly: formatMoney(row.monthly_pence, row.currency),
      })),
    },
    life: {
      typical: lifeMinor > 0 ? formatMoney(lifeMinor) : null,
      daily: lifeGuess.daily_pence > 0 ? formatMoney(lifeGuess.daily_pence) : notes.life_daily || null,
      food_daily: lifeGuess.food_daily_pence > 0 ? formatMoney(lifeGuess.food_daily_pence) : null,
      days_per_week: lifeGuess.days_per_week,
      confidence: lifeGuess.confidence,
      source: notes.life_source || (lifeGuess.monthly_pence > 0 ? "inferred" : null),
    },
    plan: {
      income: incomeMinor != null ? formatMoney(incomeMinor) : null,
      life: lifeMinor > 0 ? formatMoney(lifeMinor) : null,
      subscriptions: formatMoney(subMinor),
      save: saveMinor ? formatMoney(saveMinor) : formatMoney(0),
      leftover: leftover != null ? formatMoney(leftover) : null,
      missing,
    },
    budget: {
      subs_ceiling: subsCeiling != null ? formatMoney(subsCeiling) : null,
      subs_room: subsCeiling != null ? formatMoney(Math.max(0, subsCeiling - subMinor)) : null,
      food_daily: foodCeiling != null ? formatMoney(foodCeiling) : null,
      flex_daily: flexDaily != null ? formatMoney(flexDaily) : null,
      buffer: buffer != null ? formatMoney(buffer) : null,
      assume_not_saving: !notes.save_intent || saveNo,
      ask_saving: !notes.save_intent && notes.save_asked !== "yes",
    },
    bank_connected: isBankConnected(),
    bank_synced_at: getSetting("bank_synced_at") ?? null,
  };
}

export function ledgerSnapshot() {
  const picture = moneyPicture();
  return {
    month: {
      from: picture.month.from,
      to: picture.month.to,
      expenses: picture.month.expenses,
      per_day: picture.month.per_day,
      food: picture.month.food,
      travel: picture.month.travel,
      split: picture.month.split,
      chart: picture.month.chart,
    },
    income: {
      typical: picture.income.typical,
      this_month: picture.income.this_month,
      confidence: picture.income.confidence,
    },
    life: {
      typical: picture.life.typical,
      daily: picture.life.daily,
      food_daily: picture.life.food_daily,
    },
    budget: picture.budget,
    plan: { leftover: picture.plan.leftover, missing: picture.plan.missing },
    subscriptions: { count: picture.subscriptions.length, monthly: picture.plan.subscriptions },
    subscription_review: subscriptionReview(),
    bank_connected: picture.bank_connected,
  };
}

export function viewExpense(row: Expense) {
  return {
    id: row.id,
    amount: formatMoney(row.amount_pence, row.currency),
    merchant: displayMerchant(row.merchant),
    category: row.category,
    spent_on: row.spent_on,
    notes: row.notes,
    source: row.source,
    pending: Boolean(row.pending),
  };
}
