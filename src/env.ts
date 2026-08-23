import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

function req(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function missing(names: string[]): void {
  const gone = names.filter((name) => !process.env[name]?.trim());
  if (gone.length) throw new Error(`missing ${gone.join(", ")}`);
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port <= 0) throw new Error("bad PORT");

const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT);
const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH?.trim();
const explicitDb = process.env.DATABASE_PATH?.trim();

if (onRailway && !volume && !explicitDb) {
  throw new Error("attach a Railway volume at /data so the ledger survives redeploys");
}

const dataDir = explicitDb ? dirname(resolve(explicitDb)) : resolve(volume || "data");
const databasePath = explicitDb ? resolve(explicitDb) : join(dataDir, "census.db");

const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
const publicUrl = (process.env.PUBLIC_URL?.trim() || (railway ? `https://${railway}` : "")).replace(
  /\/$/,
  "",
);

function webhookSecret(): string {
  const fromEnv = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (!publicUrl) return "";
  const file = join(dataDir, "webhook.secret");
  if (existsSync(file)) {
    const stored = readFileSync(file, "utf8").trim();
    if (stored) return stored;
  }
  const generated = randomBytes(32).toString("hex");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

function secrets(): void {
  missing(["TELEGRAM_BOT_TOKEN", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "ALLOWED_TELEGRAM_USER_ID"]);
}

export const env = {
  get TELEGRAM_BOT_TOKEN() {
    secrets();
    return req("TELEGRAM_BOT_TOKEN");
  },
  get OPENROUTER_API_KEY() {
    secrets();
    return req("OPENROUTER_API_KEY");
  },
  get ALLOWED_TELEGRAM_USER_IDS() {
    secrets();
    return req("ALLOWED_TELEGRAM_USER_ID")
      .split(/[,\s]+/)
      .filter(Boolean);
  },
  get TELEGRAM_WEBHOOK_SECRET() {
    return webhookSecret();
  },
  get OPENROUTER_MODEL() {
    secrets();
    return req("OPENROUTER_MODEL");
  },
  DATABASE_PATH: databasePath,
  PORT: port,
  PUBLIC_URL: publicUrl,
  CURRENCY: process.env.CURRENCY?.trim().toUpperCase() || "",
  TZ: process.env.TZ?.trim() || "",
  LOCALE: process.env.LOCALE?.trim() || "",
  TRUELAYER_CLIENT_ID: process.env.TRUELAYER_CLIENT_ID?.trim() || "",
  TRUELAYER_CLIENT_SECRET: process.env.TRUELAYER_CLIENT_SECRET?.trim() || "",
  TRUELAYER_REFRESH_TOKEN: process.env.TRUELAYER_REFRESH_TOKEN?.trim() || "",
  TRUELAYER_ENV: process.env.TRUELAYER_ENV?.trim().toLowerCase() === "sandbox" ? "sandbox" : "live",
};
