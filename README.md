# toski

Your ski buddy with all the answers. React + Vite front end, one Vercel serverless function.

```
api/verdict.js     POST {city, weekend, pass} -> verdict. Holds the key, builds the prompt, validates output.
data/resorts.json  Single source of truth for the 69 resorts + pass mappings (client and server both read it).
data/config.json   Season window (Nov 15 - May 1) and verdict cut-offs (70 / 45). Client and server both read it.
src/App.jsx        The whole UI. Approved quip bank lives here (QUIPS).
```

## Deploy (about 5 minutes)
1. Push this folder to a GitHub repo.
2. vercel.com → Add New Project → import the repo. Framework: Vite (auto-detected). Leave build settings alone.
3. Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY` (**Production only**, Sensitive). Do the cost-safety checklist below, then redeploy.
4. Run the live check below.

## Cost safety — do ALL of these before you share the link
Every uncached search costs real money. The code limits damage; **the Anthropic spend limit is your hard stop.**

1. **Make a dedicated key in a dedicated workspace.** Console → Workspaces (platform.claude.com/settings/workspaces) → Create workspace "toski" → open it → **Spend limits** → set a monthly cap. Then create the API key for that workspace. (The Default Workspace can't have a spend limit, which is why you make a new one.) Even if everything else fails, the bill can't pass that limit. Don't reuse a personal or work key.
2. **Web search is on by default.** Only if it was ever turned off: platform.claude.com/settings/capabilities. If it's off, every search fails with "data source is busy".
3. **Add Upstash Redis** (Vercel → your project → Storage / Marketplace → Upstash Redis, free tier). It sets the env vars automatically. This makes the daily cap, per-IP limits and cache **global**; without it they're per-instance only.
4. **Set `DAILY_SEARCH_CAP`** (env var, default 300). Web search is billed at $10 per 1,000 searches ($0.01 each, max 4 per verdict) plus token costs for the results Claude reads. After your first few real searches, check Console → Usage for the true all-in cost per verdict, then set cap = daily budget ÷ that cost. Worst-case daily spend = cap × cost per search, no matter how many IPs hit you.
5. **Env vars → Production only** (not Preview), and mark `ANTHROPIC_API_KEY` as *Sensitive*. Preview URLs shouldn't be able to spend your money.
6. **Vercel Firewall:** turn on Bot Protection for the project. If you ever see a spike, switch on Attack Challenge Mode.
7. **Panic button:** revoke the key in the Anthropic Console. The site stops spending instantly (users see a friendly error).

### Season gate: no spend in the off-season
Verdicts only run **Nov 15 – May 1 (US Eastern)**. Outside that window the API answers "closed for the season" before it touches the cache, the limiter or Anthropic, and the UI replaces the form with a closed notice. Only weekends inside the window are offered. Change the dates in `data/config.json`.
- Until Nov 15 the live check below will return the closed message. That's the gate working.
- To test earlier or later, run locally with `SEASON_BYPASS=1` in your `.env` (the UI skips its gate automatically under `npm run dev` / `vercel dev`). **Never set `SEASON_BYPASS` in Vercel Production.**

### How the verdict works
The model returns a score from 0 to 100 and nothing else decides the label: **70+ YES, 45–69 MAYBE, under 45 NO**. The server computes it (`verdictFor` in `api/verdict.js`) and ignores any label the model writes. The UI colours every score with the same cut-offs.

### What the code does
- The browser never sees the key and never sends a prompt: only `{city, weekend, pass}`. The server builds the prompt, fixes the model, and caps tokens and web searches per request (4).
- Cached answers are free and served before any limit (3h, shared across instances when Upstash is on).
- Per-IP limits: 8 uncached searches / 10 min and 30 / day. Real client IP comes from Vercel's own header, so a spoofed `X-Forwarded-For` doesn't help an attacker.
- **Global daily cap** (`DAILY_SEARCH_CAP`): once hit, everyone gets "toski hit today's search limit". Logs warn at 50%, 90% and at the cap (Vercel → Logs).
- Other sites can't borrow the endpoint from a browser (Origin check), and oversized/garbage requests are rejected before any spend.
- Long search turns that come back as `pause_turn` are resumed once (Anthropic's documented fix) with a smaller search allowance, so a verdict uses at most about 5 web searches. This path is unit-tested against a mocked API, not yet against the live one; the first real verdicts will tell you (Vercel Logs shows `stop_reason` on any failure).
- If Upstash goes down, limits fall back to per-instance memory (it fails safe, not open).

### What it can't stop
A distributed attacker (many IPs) can burn the daily cap, so real users see "hit today's search limit" until midnight UTC. That's an annoyance, not a bill. If it ever happens, the next step is a bot check (Cloudflare Turnstile) on the search button. I left it out because it needs a Cloudflare account and I can't test it here.

## Live check (do this once after the first deploy)
```
curl -s -X POST https://YOUR-APP.vercel.app/api/verdict \
  -H 'content-type: application/json' \
  -d '{"city":"Boston","weekend":"'$(date -d 'next saturday' +%F)'","pass":"none"}' | head -c 600
```
(On a Mac use `$(date -v+sat +%F)` instead of `date -d 'next saturday' +%F`.)
You want `{"verdict":{"verdict":"YES|NO|MAYBE", ...}}`. Then open the site and run one real search.
If you get "Server isn't configured yet" the env var is missing; "data source is busy / garbled" means the
upstream call failed (check Vercel → Logs, which show a status code but never the key).

## Local dev
`npm install && npx vercel dev` (plain `npm run dev` serves the UI only; `/api/verdict` needs `vercel dev`).

## Local dev in VS Code
1. `npm install` (this also creates `package-lock.json`; commit it).
2. `npm test` runs the server-logic tests (no key or network needed).
3. `npm run dev:full` (= `vercel dev`) serves the UI and `/api/verdict`; put `ANTHROPIC_API_KEY` in a local `.env` (git-ignored).

## Push to GitHub
```
git init -b main
git add . && git status          # .env must NOT be listed; .env.example should be
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USER/toski.git
git push -u origin main
```
Then import the repo in Vercel (Deploy section above).

## Pass lists (verified Oct 29, 2026 for the 2026–27 season)
Checked against Ikon, Epic and Indy's published lists and trade coverage. Changes made: Windham left Ikon, Whiteface is not on Indy, Smugglers' Notch joined Indy, and Snowshoe (Ikon) and Hidden Valley (Epic) were added. Not included on purpose: Ikon's 2-day "bonus" mountains (Cranmore, Jiminy Peak, Butternut) and Indy partners outside the 69 (Wisp, Wintergreen, Montage, Peek'n Peak, Swain, Lost Valley, McIntyre, Ragged and others). **Re-check every September**; passes change each season. `npm test` catches typos in `resorts.json`, not stale pass info.

## Knobs
- `ANTHROPIC_MODEL` env var overrides the model (default `claude-sonnet-4-6`).
- `SEASON_BYPASS=1` (local only, see Season gate). Season dates and verdict cut-offs are in `data/config.json`.
- `DAILY_SEARCH_CAP` (default 300), `IP_WINDOW_MAX` (8 per 10 min), `IP_DAILY_MAX` (30) are env vars. Cache TTL (3h) and the 4-search cap per request are constants at the top of `api/verdict.js`.
- Search count (4), continuation count (1) and cache size (500) are constants at the top of `api/verdict.js`. The function runs up to 60s (`vercel.json`); the client gives up at 58s.
