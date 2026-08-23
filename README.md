# § Census

A private Telegram money agent. It reads your bank through [TrueLayer](https://truelayer.com) (UK/EU open-banking banks), keeps a small SQLite ledger, and answers spend questions in short replies.

Self-hosted. One process. Built to run on [Railway](https://railway.com). Agents setting this up should read `AGENTS.md`.

## What you need

- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your numeric Telegram user id from [@userinfobot](https://t.me/userinfobot)
- An [OpenRouter](https://openrouter.ai/keys) API key and a model id that can call tools
- A [TrueLayer Console](https://console.truelayer.com) app (live, for a real bank)
- A Railway account

## Telegram

1. Message BotFather → `/newbot` → copy the token.
2. Optional: `/setuserpic` → upload `logo.png`.
3. Message [@userinfobot](https://t.me/userinfobot) → copy your id.

Anyone who finds the bot can message it. The allowlist is the security model. Only your id (or a comma-separated list) gets a reply.

## TrueLayer

Census does not see your bank until you connect it in Telegram. TrueLayer is the pipe.

1. Sign in at [console.truelayer.com](https://console.truelayer.com).
2. Create an app. The `client_id` is 4–30 lowercase letters/numbers and cannot change. `census` is fine.
3. Download the `client_secret`.
4. Use **Live** for a real bank. Sandbox is Mock Bank only.
5. After Railway gives you a public URL, add this exact redirect URI in **Settings**:

   `https://YOUR-RAILWAY-DOMAIN/truelayer`

   No trailing slash. It must match the live URL character for character.
6. Live **Data API** must be enabled on the app. If your bank never appears or connect fails, ask TrueLayer to turn Data on for that `client_id`.

Do not paste a TrueLayer access token into Railway. It expires in about an hour. After `/connect`, Census stores the refresh token in SQLite on the volume, in plaintext. Treat that volume as a secret.

## Railway

Fork this repo. In Railway: **New project → Deploy from GitHub repo**.

Railway will refuse to go live until a volume is attached. Add one, mount it at `/data`. One replica only. SQLite cannot be shared.

Generate a public domain on the service. Bank connect needs it. Census reads `RAILWAY_PUBLIC_DOMAIN` and builds `PUBLIC_URL` itself. Do not set `PUBLIC_URL` on Railway. Copy the domain into TrueLayer as `https://YOUR-RAILWAY-DOMAIN/truelayer`.

Then paste:

| Variable | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | from BotFather |
| `OPENROUTER_API_KEY` | from OpenRouter |
| `OPENROUTER_MODEL` | any OpenRouter model that can call tools |
| `ALLOWED_TELEGRAM_USER_ID` | your Telegram id |
| `TRUELAYER_CLIENT_ID` | from TrueLayer Console |
| `TRUELAYER_CLIENT_SECRET` | from TrueLayer Console |

Deploy. Message the bot. First reply asks for currency and city (`GBP London`, or `yes` if the Telegram language guess is right).

Then send `/connect`. The bot replies with a TrueLayer link. Open it, pick your bank, approve. Finish that flow within 5 minutes so Census can save the accounts and keep syncing.

If you miss the window, send `/connect` again. `/disconnect` drops the bank link. Imported spends stay.

Without a domain, Census still polls Telegram and you can log money by hand. `/connect` will not work until there is a public URL.

## Talk to it

```
/connect
how much have I spent this month?
what's my balance
average a day
Netflix is 12.99 a month
can I buy these headphones for 180
which subs should I drop
```

Bank spends are imported. Repeating charges are treated as subscriptions. You can still type a cash expense or a sub the bank has not shown yet.

Tell it take-home, real-life costs, a save target, and what you will not cut. It stores those and uses them for "can I?" and leftover questions.

Say `GBP London` or `switch to EUR Berlin` to change place. `/reset` wipes everything, after a confirm. The `/` menu shows `/connect` or `/disconnect` depending on whether the bank is linked.

## Run locally

Needs [Bun](https://bun.sh) 1.4+.

```bash
cp .env.example .env
```

Fill Telegram, OpenRouter (key + model), and your allowlist. TrueLayer also needs `PUBLIC_URL` set to a reachable `https` origin whose `/truelayer` path is in Console.

```bash
bun install
bun dev
```

Local mode polls Telegram unless `PUBLIC_URL` is set.

## Optional env

| Variable | Default |
|---|---|
| `PORT` | `3000` (Railway injects this) |
| `PUBLIC_URL` | leave empty on Railway; set locally if you want `/connect` |
| `DATABASE_PATH` | `/data/census.db` on Railway, `data/census.db` locally |
| `TELEGRAM_WEBHOOK_SECRET` | generated onto the volume when a webhook is used |
| `CURRENCY` + `TZ` | skip the place question if both set |
| `LOCALE` | number format, e.g. `en-GB` |
| `TRUELAYER_ENV` | `live` (`sandbox` is Mock Bank) |
| `TRUELAYER_REFRESH_TOKEN` | optional seed if you already have a refresh token |

The ledger and the TrueLayer refresh token live on the volume, in plaintext. Keep the volume private. One replica only.

## License

MIT
