# Deploying Silicon Streets for Free

Silicon Streets has **two deployable pieces**:

| Piece | What it is | Free host |
|-------|------------|-----------|
| **Web app** | Next.js UI (`app/`, `src/components`, `src/hooks`) | **Vercel** (Hobby) |
| **Game server** | Persistent Socket.io authority (`src/server/bootstrap.ts`) | **Render** (free web service) |

> Why two hosts? Socket.io needs a **long-lived process** holding open WebSocket
> connections. Vercel's serverless functions are short-lived, so the realtime
> server lives on Render (or Fly.io / Railway), while the static-ish Next.js app
> goes on Vercel. They talk over `wss://`.

Optional persistence (both have free tiers): **Upstash Redis** (ephemeral game
state) and **Neon** or **Supabase** Postgres (completed-match history). The app
runs fine without them using the built-in `InMemoryStore`.

---

## 0. Prerequisites

- A GitHub repo containing this project (push it: `git init && git add . && git commit && git push`).
- Free accounts: [vercel.com](https://vercel.com), [render.com](https://render.com).

---

## 1. Deploy the game server (Render)

1. **render.com → New → Web Service →** connect your GitHub repo.
2. Configure:
   - **Runtime:** Node
   - **Build Command:** `npm install --include=dev`  ← installs `tsx` (a devDependency)
   - **Start Command:** `npm run server`  (runs `tsx src/server/bootstrap.ts`)
   - **Instance Type:** Free
3. **Environment variables:**
   - `CLIENT_ORIGIN` = `https://<your-vercel-app>.vercel.app` (set after step 2; for first deploy use `*`, then tighten)
   - `PORT` is provided automatically by Render — `bootstrap.ts` reads `process.env.PORT`.
4. Deploy. Note the public URL, e.g. `https://silicon-streets.onrender.com`.
   It serves **WebSockets over HTTPS** out of the box.

> **Free-tier caveat:** Render free services **sleep after ~15 min idle** and
> cold-start in ~30–60 s. Fine for demos. For always-on, use **Fly.io** (see §4).

---

## 2. Deploy the web app (Vercel)

1. **vercel.com → Add New → Project →** import the same repo.
2. Framework preset: **Next.js** (auto-detected). Root directory: repo root.
3. **Environment variable:**
   - `NEXT_PUBLIC_SERVER_URL` = `https://silicon-streets.onrender.com` (your Render URL)
4. Deploy. You'll get `https://<your-app>.vercel.app`.
5. **Go back to Render** and set `CLIENT_ORIGIN` to this exact Vercel URL, then
   redeploy the server so CORS only allows your front end.

That's it — open the Vercel URL, create a room, share the room id, and play.

---

## 3. Wiring notes (so it actually connects)

- **CORS / origin:** `bootstrap.ts` sets `cors: { origin: CLIENT_ORIGIN ?? '*' }`.
  In production set `CLIENT_ORIGIN` to your Vercel URL (no trailing slash).
- **Client target:** `useGameState.ts` reads `NEXT_PUBLIC_SERVER_URL`. The
  `NEXT_PUBLIC_` prefix is required for the value to reach the browser.
- **Transport:** the client requests `transports: ['websocket']`. Render and
  Fly both support WS upgrades; no extra config needed.
- **HTTPS ↔ WSS:** a page served over `https://` (Vercel) must talk to a
  `https://`/`wss://` server (Render gives you this free). Mixed content (http
  server) will be blocked by the browser.

---

## 4. Alternatives & optional add-ons

**Always-on server (Fly.io free allowance):**
```bash
npm i -g flyctl && fly launch   # generates fly.toml; set internal_port = 3001
fly secrets set CLIENT_ORIGIN=https://<your-app>.vercel.app
fly deploy
```
Use the resulting `https://<app>.fly.dev` as `NEXT_PUBLIC_SERVER_URL`.

**Upstash Redis (free) for shared/ephemeral game state** — implement a
`RedisStore implements Store` (see `src/server/store.ts`) and pass it to
`new RoomManager(redisStore)` in `bootstrap.ts`.

**Neon / Supabase Postgres (free)** — persist finished games for history/replay
(the engine's `turnHistory` + seed already make any game fully replayable).

---

## 5. Pre-flight checklist

```bash
npm install        # all deps
npm run typecheck  # strict engine/server core must pass
npm test           # determinism + authority harnesses
npm run build      # Next.js production build succeeds
```
Green across all four → safe to deploy.
