# Census

Private Telegram money agent. Reads a bank through TrueLayer, keeps a SQLite ledger, answers spend questions.

If you are an agent setting this up or changing it: do the work. Do not add a framework, a runtime package, Discord, MCP, Postgres, or a second process unless the operator asks.

## Stack

- Bun 1.4+, TypeScript, **zero runtime npm dependencies**
- `bun:sqlite` on a Railway volume at `/data`
- OpenRouter (`/api/v1/chat/completions` + tools)
- Telegram only
- TrueLayer Data API (live) for the bank

`src/` is the whole app. Read `src/index.ts` then the file you need.

## Commands

```bash
bun install
bunx tsc --noEmit
bun dev          # local, polls Telegram unless PUBLIC_URL is set
bun src/index.ts # production start (see railway.toml)
```

Do not add scripts or deps to make those work.

## Model

Do not hardcode a model. Do not put a model slug in source, README, `.env.example`, or setup replies.

`OPENROUTER_MODEL` is required. Any OpenRouter model that supports tool calling works. The operator picks it. Boot fails if it is missing.

## Setup, local

1. Bun 1.4+.
2. `cp .env.example .env`
3. Fill `TELEGRAM_BOT_TOKEN`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `ALLOWED_TELEGRAM_USER_ID`.
4. `bun dev`
5. Message the bot. First reply asks currency + city (`GBP London`, or `yes` to accept the Telegram language guess).

Bank connect locally also needs `PUBLIC_URL` as a reachable `https` origin and that exact origin plus `/truelayer` in TrueLayer Console. Without it, the bot still works as a typed ledger.

Never commit `.env`. Never print secrets.

## Setup, Railway

Fork or clone. **New project → Deploy from GitHub**.

Railway will fail until a volume is attached. Mount it at `/data`. **One replica.** SQLite cannot be shared. `railway.toml` already sets `requiredMountPath = "/data"`, `numReplicas = 1`, `overlapSeconds = 0`.

Generate a public domain. Census builds `PUBLIC_URL` from `RAILWAY_PUBLIC_DOMAIN`. **Do not set `PUBLIC_URL` on Railway.**

Required variables (empty until the operator pastes):

| Variable | From |
|---|---|
| `TELEGRAM_BOT_TOKEN` | BotFather `/newbot` |
| `OPENROUTER_API_KEY` | openrouter.ai/keys |
| `OPENROUTER_MODEL` | any OpenRouter model that can call tools. Operator chooses. |
| `ALLOWED_TELEGRAM_USER_ID` | numeric id from @userinfobot. Comma-separated if several. |
| `TRUELAYER_CLIENT_ID` | console.truelayer.com |
| `TRUELAYER_CLIENT_SECRET` | download once from Console |

Optional: `CURRENCY` + `TZ` (skips the place question), `LOCALE`, `TRUELAYER_ENV=sandbox` (Mock Bank only).

After deploy: message the bot → place question → `/connect`.

Telegram: BotFather `/newbot`, optional `/setuserpic` with `logo.png`. The allowlist is the security model. Anyone who finds the bot can message it; only listed ids get a reply.

## TrueLayer

Do not "simplify" this. Revolut will break.

- Live Console for a real bank. Sandbox is Mock Bank only.
- Redirect URI, exact, no trailing slash: `https://<domain>/truelayer`
- Live Data API must be enabled on the app. If the bank never appears, ask TrueLayer to turn Data on for that `client_id`.
- Do not put an access token in env. It dies in about an hour. After `/connect`, the refresh token lives in SQLite on the volume, plaintext. Treat the volume as a secret.
- `TRUELAYER_REFRESH_TOKEN` is an optional seed if they already have a refresh token. Still no access token.
- `/connect` → operator must finish in **5 minutes**. Revolut only lists `/accounts` inside that SCA window. Persist account ids. Later syncs must **not** re-list `/accounts`.
- First sync (inside SCA): history from `2015-01-01`. After that: last 90 days.
- Auth scopes encoded as `%20`, not `+`. Providers: `uk-ob-all ee-ob-all`. See `src/bank.ts`.
- `X-PSU-IP` is the browser IP from the OAuth callback, then reused. Never Telegram's webhook IP.
- Dedup: `normalised_provider_transaction_id`, then `provider_transaction_id`, then `transaction_id`.
- Card DEBIT amounts can be positive. Use `transaction_type`, not sign.
- Credits that look like pay are stored in `incomes`. Transfers, pots, ATM, and refunds are skipped. Do not add credits into spend. Infer take-home from repeating inbound and update `income_monthly` when the bank is clear. Subscriptions are inferred from repeating bank charges, plus anything typed. Do not count a cancelled `merchant_key` again.
- Pending: pull `/transactions/pending` per account. `pending=true` on the row. Wipe that account's pending on each successful pending list so a settled charge cannot double-count. If pending is 403/SCA/501, leave existing pending alone.
- Dead refresh (`invalid_grant`) → clear bank, tell them `/connect`. Do not wipe the ledger on a generic `/accounts` 403.
- 429: retry once.

`/disconnect` drops tokens and account ids. Imported spends stay.

## How the bot is supposed to work

The operator's bank is the source of spend. The agent reads the ledger. It does not invent merchants or totals.

- Money is integer minor units (`amount_pence`). Tools take major units.
- `spend_summary.expenses` / `per_day` / `projected_month` are **home currency only**. `by_currency` is the rest. Do not convert. Do not add EUR into GBP.
- Merchant rollup groups processor junk (`SQ *SUPABASE` → Supabase). Prefer `expenses` `view=merchants` to find a named charge. `view=day` when they name a date. `view=lines` is a tight follow-up, never a month dump.
- One keyword miss is not proof a charge is gone.
- Pending counts. If the only hit is pending, say so.
- Notes: `income_monthly`, `life_monthly` / `life_daily`, `save_monthly`, `save_intent`, `invest_intent`, `essentials`, `situation`. Infer pay and life cost from the ledger. Assume not saving until they say otherwise. Store what they state.
- Subscriptions come from repeating bank charges plus typed rows. Usage bills keep a typical amount and a range. `picture` is the whole money view. Do not add `expenses` and `subscriptions_monthly`. Plan leftover is income - life - subs - save.
- Voice lives in `src/prompt.ts`. Short. No preamble, no outro, no emoji, no em dashes. Understand the situation they state. Do not turn it into a chatbot. Replies go out as plain `sendMessage`. Do not wrap bars or lists in `<pre>`. Do not use `sendRichMessage`. After place setup and on `/connect`, send a Connect URL button. Telegram cannot open the bank page from the slash command alone.
- Subscription answers use three buckets from the ledger: definite, look like it, probably cancelled. Usage bills (Supabase, Railway) count even when they skip a month. Do not rush “you have N”. “I have more” reprints the same review, not a new guess.
- Spend split is inferred from merchants (food / travel / subscriptions / named shops). Never from bank labels like Purchase. `spend_summary.chart` is the "on what" reply. Never say food or travel cannot be seen if the ledger has the charges.
- Common questions (on what, spent this month, pay, subs ceiling, food a day, sub list) are answered in `src/agent.ts` (`handleDirect`). Do not send those through the model. "Tesco is food" writes `merchant_buckets` and reprints the chart.

Telegram commands (menu via `setMyCommands`; `/connect` and `/disconnect` swap on bank state):

- `/connect` when not linked
- `/disconnect` when linked
- `/reset` wipe bank, ledger, notes, chat. Inline confirm required. Do not reset without that confirm.

No `/start` or `/setup`. First open still asks place if unset. After that, currency and city change by saying it (`GBP London`, `switch to EUR Berlin`). `set_place` is the tool.

Webhook and polling must allow `callback_query`. Everything else is the model.

## Layout

```
src/index.ts      Bun.serve — GET /health, POST /telegram, GET /truelayer
src/env.ts        secrets, volume path, PUBLIC_URL from RAILWAY_PUBLIC_DOMAIN
src/db.ts         bun:sqlite + WAL + migrate()
src/schema.sql    seen, settings, subscriptions, expenses, notes, messages, bank_*
src/telegram.ts   webhook or polling, allowlist, place setup
src/agent.ts      OpenRouter loop, tools, direct answers
src/prompt.ts     system prompt
src/bank.ts       TrueLayer OAuth, refresh, sync, balances
src/money.ts      place, search, split, pay, life, subs
```

## Constraints

- No runtime dependencies. `@types/bun` is the only package.
- No second database. No Railway Postgres.
- One replica. Overlap 0. Volume at `/data`.
- Do not set `PUBLIC_URL` on Railway.
- Do not add Discord, MCP, income import, or auto-detected subs unless asked.
- Do not rewrite history or force-push `main` unless the operator says to.
- `tsc` before you call it done.

## If something is broken

- Boot: `missing TELEGRAM_BOT_TOKEN, OPENROUTER_API_KEY, OPENROUTER_MODEL, ALLOWED_TELEGRAM_USER_ID` or no volume at `/data`.
- `/connect` Invalid redirect_uri: Console redirect is not exactly `https://<domain>/truelayer` (Live, not Sandbox). Can take a few minutes to apply.
- Bank connected but no spends: they missed the 5 minute window. `/connect` again.
- "Did I pay X" miss: use merchant rollup / day list, not a guessed pretty name. Check pending. Check other currencies.
- Deploy still on the old GitHub commit: the operator has to push. Do not `git pull` if local `main` was amended; histories have diverged.
