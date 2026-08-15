# Keyren — Credentials Setup

Everything Keyren needs to actually **run**. The backend is already built and tested without any of this — 176 tests pass offline. These credentials are only needed from **Task 24** onward (the Clerk-authenticated dashboard) and for the end-to-end walkthrough in Task 34.

---

## Already done for you

`.env.local` has been created and is gitignored. Two of the five values are already filled in:

| Variable | Status |
|---|---|
| `KEYREN_LICENSE_HMAC_SECRET` | ✅ **Generated** — a real 256-bit random secret |
| `NEXT_PUBLIC_APP_URL` | ✅ Set to `http://localhost:3000` |
| `RATE_LIMIT_*` | ✅ Set to defaults (60/min per IP, 600/min per product) |
| `DATABASE_URL` | ❌ **You need to provide this** |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ❌ **You need to provide this** |
| `CLERK_SECRET_KEY` | ❌ **You need to provide this** |

> **About that HMAC secret:** it's what license keys are hashed with. Keep it. If it ever changes, **every license key ever issued stops working** — because verification recomputes the hash and it won't match what's stored. It never leaves the server and must never appear in any client, bundle, or repo.

---

## You need exactly 3 values

1. **`DATABASE_URL`** — a Postgres connection string (Neon, below)
2. **`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`** — starts `pk_test_`
3. **`CLERK_SECRET_KEY`** — starts `sk_test_`

---

## ⚠️ Preferred: paste them yourself, don't send them to me

The safest option is for **you** to open `.env.local` and paste the three values in directly, then just tell me *"done"*. I'll pick it up from there — I never need to see the actual values to finish the build.

Anything you paste into a chat becomes part of the conversation history. That's a real consideration for a database URL (which contains a password) and a Clerk secret key.

If you'd rather send them to me anyway, that's your call and it works fine — just use **test/development** keys, never production ones, and rotate them when Alpha_v1 goes live.

```bash
open -e /Users/marcin_alan/Documents/Github/Keyren/.env.local
```

---

# Tutorial 1 — Neon Postgres (`DATABASE_URL`)

Neon's free tier is more than enough for Alpha_v1. No credit card required.

### 1. Create an account
Go to **https://neon.com** and sign up (GitHub or Google is fastest).

### 2. Create a project
After signup you'll land on a "Create project" screen. If not, hit **New Project**.

- **Project name:** `keyren`
- **Postgres version:** leave the default
- **Region:** pick the one closest to you — this is where your data physically lives, and it affects latency
- **Database name:** leave it as `neondb`, or set it to `keyren` if you prefer

Click **Create**.

### 3. Copy the connection string

Neon shows a **Connection string** box immediately after the project is created. It looks like:

```
postgresql://neondb_owner:npg_AbC123XyZ@ep-cool-name-a1b2c3d4.us-east-2.aws.neon.tech/neondb?sslmode=require
```

**Important details:**
- Make sure the dropdown says **Pooled connection** (Neon's default). Serverless deployments need the pooler.
- Make sure **"Show password"** is toggled on, or you'll copy a string with `********` where the password should be.
- Keep the `?sslmode=require` on the end. Neon requires TLS and the connection fails without it.

If you navigate away, you can get it back any time: **Dashboard → your project → Connect** button (top right).

### 4. That's your `DATABASE_URL`

Paste the whole string, including `postgresql://` and everything after it, into `.env.local`:

```
DATABASE_URL="postgresql://neondb_owner:npg_AbC123XyZ@ep-....neon.tech/neondb?sslmode=require"
```

Keep the double quotes — the string contains characters the shell would otherwise interpret.

### 5. I'll apply the schema

Once it's in place, the tables get created with:

```bash
npm run db:migrate
```

This runs the migration that's already generated and committed (`drizzle/0000_*.sql`) — 4 tables, 1 enum, 2 foreign keys, 6 indexes. I'll run it and confirm it worked.

---

# Tutorial 2 — Clerk (the two auth keys)

Clerk handles **developer** login to the Keyren dashboard. It has nothing to do with license verification — customer software never touches Clerk.

### 1. Create an account
Go to **https://clerk.com** and sign up.

### 2. Create an application

- **Application name:** `Keyren`
- **Sign-in options:** Email is enough for Alpha_v1. Add Google/GitHub if you want them — it changes nothing in the code.

Click **Create application**.

### 3. Copy both keys

Clerk drops you straight onto a screen with framework tabs. **Pick Next.js.** It shows exactly the two values you need:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx
```

You can find them again later at **Dashboard → your app → Configure → API keys**.

### 4. Confirm they're the test keys

For local development the prefixes must be **`pk_test_`** and **`sk_test_`**. If you see `pk_live_` / `sk_live_` you've switched to the production instance — use the environment switcher at the top of the Clerk dashboard to get back to Development.

The `pk_` (publishable) key is designed to be visible in the browser — that's why its variable is prefixed `NEXT_PUBLIC_`. The `sk_` (secret) key must never reach the browser. Keyren only ever reads it server-side.

---

## What happens once all three are in

I'll be able to:

1. Run `npm run db:migrate` to create the tables on Neon
2. Finish Tasks 24–33 (Clerk wiring, server actions, the full dashboard UI, docs)
3. Run the complete end-to-end walkthrough in Task 34:

```
sign up → create product → immutable prod_ ID issued → generate license
→ plaintext key shown once → confirm the DB holds no plaintext
→ verify from device one: success → same device again: success
→ device two: DEVICE_MISMATCH → reset activation → device two: success
→ revoke: LICENSE_REVOKED → restore: success
→ delete with confirmation: LICENSE_INVALID
```

That flow is the definition of Alpha_v1 being finished.

---

## Sanity check

Once the values are in, this confirms the environment parses:

```bash
npm run build
```

If a variable is missing or malformed, the build **fails on purpose** with `Invalid environment configuration. Check: <names>` — that's `src/env.ts` doing its job. It reports which variables are wrong and never prints their values.

---

## Costs

Both free tiers are comfortably sufficient for a private alpha:

- **Neon free:** 0.5 GB storage, plenty of compute hours. Note it **auto-suspends after ~5 minutes idle** — the first query after a pause takes a second or two to wake up. Normal, not a bug.
- **Clerk free:** 10,000 monthly active users.

Neither asks for a card.
