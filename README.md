# Exceptionel AI ✦

An AI-powered growth platform for e-commerce — it **creates marketing content and
videos, sells on your site via an AI chatbot, takes payments, and manages
merchant accounts**. Built as independent, zero-dependency modules, deployable on
Vercel.

> Every module runs in **demo mode** out of the box (no keys, no database) and
> upgrades to real AI / payments / persistence when you add the relevant keys.

---

## 🧩 Modules

| Folder | What it does | Real integrations |
| --- | --- | --- |
| **`/` (root)** | **Marketing studio** — content generator, post visuals, publishing calendar, catalog, chatbot demo (bilingual FR/EN) | OpenAI (optional) |
| **`sales-chatbot/`** | Embeddable **AI sales chatbot** — recommends products, handles objections, qualifies leads, closes the sale | Claude (Anthropic) |
| **`marketing-video/`** | **Marketing video** — AI script → video render → auto-publish to social | Claude + Runway/HeyGen + Meta/TikTok |
| **`payments/`** | **Stripe** checkout (product + subscription), signed webhooks, orders | Stripe |
| **`auth/`** | **Merchant accounts** — sign up / log in (scrypt + JWT), PostgreSQL persistence | Supabase |
| **`dashboard/`** | **Central dashboard** — stats, leads, videos, orders (per merchant, after login) | reads the modules |

Each module is **zero-dependency** (Node's native `http`/`https`/`crypto`) and
**Vercel-ready** (`api/index.js` + `vercel.json`), with a local `server.js`.

---

## 🚀 Deploy (one Vercel project per module)

For each module: **Add New → Project → Import this repo → set _Root Directory_ to
the module folder → add its env vars → Deploy.**

| Module | Root Directory | Key env vars |
| --- | --- | --- |
| Studio | `.` (repo root) | `OPENAI_API_KEY` (optional) |
| Chatbot | `sales-chatbot` | `ANTHROPIC_API_KEY` |
| Video | `marketing-video` | `ANTHROPIC_API_KEY`, `RUNWAY_API_KEY` or `HEYGEN_API_KEY` |
| Payments | `payments` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Auth | `auth` | `AUTH_JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| Dashboard | `dashboard` | — (static; configured in its Settings tab) |

Check any module's status at `/(api)/health`.

---

## 🗄️ Shared persistence & accounts

To make data durable and multi-tenant, the chatbot, video and payments modules
share the **same database and JWT secret** as the `auth` module:

```
AUTH_JWT_SECRET       # MUST be identical across auth, chatbot, video, payments
SUPABASE_URL          # https://xxxx.supabase.co
SUPABASE_SERVICE_KEY  # service_role key (server only)
```

1. Create a free [Supabase](https://supabase.com) project.
2. Run **`auth/schema.sql`** in the SQL editor (creates `users`, `leads`, `videos`, `orders`).
3. Set the three variables above on **each** module's Vercel project, then redeploy.

Then: leads, videos and orders are stored per merchant (`user_id`), and the
dashboard shows a merchant's own data after they log in.

Without these variables, every module still works in **in-memory demo mode**.

---

## 🔒 Security

- API keys and secrets live **only** in environment variables — never in the code or Git.
- Passwords are hashed (`scrypt`); sessions use signed JWTs (HS256).
- Stripe webhooks are verified by signature; the `service_role` key stays server-side.

---

## 🧪 Run any module locally

```bash
cd <module>        # e.g. sales-chatbot
node server.js     # zero dependencies — nothing to install
```

Each module prints its local URL and current mode on startup.

---

## 📄 Per-module docs

See the `README.md` inside each module folder for detailed setup, API routes and
environment variables. Architecture overview: **`ARCHITECTURE.md`**.
