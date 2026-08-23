CREATE TABLE IF NOT EXISTS seen (
  update_id INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount_pence INTEGER NOT NULL,
  currency TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('weekly', 'monthly', 'yearly')),
  next_date TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  merchant_key TEXT,
  kind TEXT NOT NULL DEFAULT 'flat',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS incomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount_pence INTEGER NOT NULL,
  currency TEXT NOT NULL,
  merchant TEXT NOT NULL,
  category TEXT,
  received_on TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'bank',
  external_id TEXT UNIQUE,
  search_text TEXT,
  merchant_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount_pence INTEGER NOT NULL,
  currency TEXT NOT NULL,
  merchant TEXT NOT NULL,
  category TEXT,
  spent_on TEXT NOT NULL,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  external_id TEXT UNIQUE,
  search_text TEXT,
  merchant_key TEXT,
  pending INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bank_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consented_at INTEGER,
  psu_ip TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  account_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('accounts', 'cards')),
  display_name TEXT NOT NULL,
  currency TEXT,
  account_type TEXT,
  provider TEXT,
  current REAL,
  available REAL,
  credit_limit REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS merchant_buckets (
  merchant_key TEXT PRIMARY KEY,
  bucket TEXT NOT NULL CHECK (bucket IN ('food', 'travel', 'subscriptions', 'other')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tg_messages (
  message_id INTEGER PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS expenses_spent_on ON expenses (spent_on);
CREATE INDEX IF NOT EXISTS expenses_merchant ON expenses (merchant);
CREATE INDEX IF NOT EXISTS incomes_received_on ON incomes (received_on);
CREATE INDEX IF NOT EXISTS incomes_merchant_key ON incomes (merchant_key);
CREATE INDEX IF NOT EXISTS subscriptions_active ON subscriptions (cancelled_at, name);
