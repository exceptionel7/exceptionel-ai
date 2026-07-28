# Exceptionel AI — Auth & Database module

Real authentication for merchant accounts + durable storage.

- **Passwords** hashed with `scrypt` (Node `crypto`, no dependency).
- **Sessions** via signed **JWT** (HS256, Node `crypto`).
- **Persistence** in a serverless PostgreSQL over HTTPS (PostgREST /
  **Supabase**-compatible) — zero dependency.
- **Demo mode**: in-memory storage when no database is configured, so you can
  try sign up / log in immediately.

---

## 🚀 Run locally

```bash
cd auth
node server.js
```

Open **http://localhost:7000** → sign up, then log in. In demo mode, accounts
live in memory (reset on restart).

---

## 🔑 Environment variables

| Variable | Role | Without it |
| --- | --- | --- |
| `AUTH_JWT_SECRET` | Secret used to sign JWTs (use a long random string) | Insecure default (demo only) |
| `SUPABASE_URL` | Your Supabase project URL (`https://xxxx.supabase.co`) | In-memory demo storage |
| `SUPABASE_SERVICE_KEY` | Supabase **service_role** key (server only, never exposed) | In-memory demo storage |

Generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 🗄️ Set up the database (Supabase, free)

1. Create a project on **[supabase.com](https://supabase.com)**
2. **SQL Editor** → paste and run **`schema.sql`** (creates `users`, `leads`, `videos`, `orders`)
3. **Project Settings → API** → copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** key (under “Project API keys”) → `SUPABASE_SERVICE_KEY`
4. Add these + `AUTH_JWT_SECRET` to your environment (Vercel) and redeploy.

`GET /api/health` should then show `"storage":"postgres"`.

> ⚠️ The `service_role` key bypasses Row Level Security — keep it **server-side only**.

---

## 🔌 API

| Method & route | Body / headers | Result |
| --- | --- | --- |
| `POST /api/signup` | `{ email, password, brand_name? }` | `{ token, user }` |
| `POST /api/login`  | `{ email, password }` | `{ token, user }` |
| `GET  /api/me`     | `Authorization: Bearer <token>` | `{ user }` |
| `GET  /api/health` | — | storage / status |

The JWT is returned to the client and sent back as `Authorization: Bearer <token>`.

---

## ▲ Deploy on Vercel

1. **Add New… → Project → Import** `exceptionel7/exceptionel-ai`
2. **Root Directory** = `auth`
3. Env vars: `AUTH_JWT_SECRET` (+ `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` for persistence)
4. **Deploy**

---

## 🔗 Connecting the other modules (next step)

Other modules (chatbot, video, payments) can:
1. Send the merchant's `Authorization: Bearer <token>` with their requests.
2. Verify it (same `AUTH_JWT_SECRET`) to get the `user_id`.
3. Store/read their data (leads, videos, orders) in the shared tables, scoped by
   `user_id` — replacing the current in-memory storage.

`lib/engine.js` exposes `verifyToken(authHeader)` for that purpose.

---

## 🗂️ Structure

```
auth/
├── index.html          Sign up / log in demo page
├── server.js           Classic Node server
├── vercel.json         Vercel config
├── schema.sql          PostgreSQL schema (run in Supabase)
├── api/
│   └── index.js        Vercel serverless function
└── lib/
    ├── crypto-auth.js  scrypt password hashing + JWT (HS256)
    ├── db.js           PostgREST/Supabase client + in-memory demo fallback
    └── engine.js       signup / login / me
```
