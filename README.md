# OpenSmash-Ultimate website

The site of [OpenSmash-Ultimate](https://github.com/OpenSmash-Ultimate/OpenSmash-Ultimate), a native PC port of
*Super Smash Bros. Ultimate*: live online stats and the top mastery points first, then install. Plain static HTML, CSS and
JavaScript: no build step, no framework, no screenshots; only the logo, icons and the social card, no trackers, no third-party requests.
GPL-3.0 like the project. Not affiliated with Nintendo.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/home.css`, `js/hero.js`, `js/home.js`, `js/snapshot.js`, `js/nav-login.js`, `js/fighters.js` | the home page: hero, live counts, top 10 Global Mastery Points (all fighters or one, with fighter icons), install, the Register / Log in button |
| `css/style.css` | the shared design |
| `config.js` | links: repository, Discord |
| `js/opensmash-auth.js`, `js/opensmash-account-ui.js`, `auth/callback/` | "Sign in with your OpenSmash account" (see below) |
| `leaderboard/`, `js/mastery.js` | the Mastery page: Global Mastery Points (GMP), top 100 overall and per fighter (# / fighter icon / player / GMP), drawn 50 rows at a time as you scroll; signed in, the player's own GMP, rank and top fighters first |
| `competitive/` | the Competitive page: one line on SSBU Arena's ranked (same account, linked) and its `/embed/leaderboard` iframe at full width |
| `leaderboard/gsp/`, `js/gsp-archive.js` | the GSP archive: the frozen GSP leaderboard, read only (no longer linked from the other pages) |
| `js/fighters.js` | fighter names and icons: Max_Hamm's stock icons loaded from ssbuarena.com (no image in this repository), credited under each table; the name's initial if an icon is missing |
| `account/`, `js/account-mastery.js`, `css/pages.css`, `js/page.js` | the account page (shared OpenSmash account) with the player's own mastery |
| `mastery.json`, `leaderboard.json`, `status.json` | fallback copies only (mastery.json empty); the live ones are on the `data` branch |
| `.github/workflows/leaderboard.yml`, `.github/scripts/leaderboard.py` | the snapshot job |
| `privacy/`, `terms/`, `404.html`, `robots.txt`, `.nojekyll` | legal pages and Pages extras |
| `assets/` | the emblem and favicons |

To look at it locally: `python -m http.server 8000` in this folder, then open http://localhost:8000.

## Live data

The online lobby (`opensmash-lobby.duckdns.org:39421`) answers plain HTTP on its TCP port, and this site is HTTPS, so the
browser cannot read it directly. The **Update mastery and status** workflow therefore copies the lobbies'
`/mastery.json` (summed) and `/status.json` to the **`data` branch** (a single commit, force-pushed; Pages does not serve it, so
no Pages build is triggered). The page reads
`https://raw.githubusercontent.com/Denkishi/opensmash-site/data/<file>` (CORS enabled; `DATA_BASE` in `config.js`) and falls
back to the older copies at the site root served by Pages. It refreshes every minute and shows "Updated x min ago".

How the updater stays alive (`.github/workflows/leaderboard.yml`, `.github/scripts/loop.sh`): one job loops for
5 h 50 m, fetching every 150 s and pushing only when the data changed (or, as a heartbeat, when an unchanged file is more
than 10 min old, so the age on the page stays honest). At the end it starts its successor with
`gh workflow run`: `workflow_dispatch` and `repository_dispatch` are the two events that DO create new runs when sent
with `GITHUB_TOKEN` (the workflow needs `actions: write`), so no personal token is needed. The concurrency group `leaderboard`
keeps a single loop; the successor waits as pending. The hourly `schedule` is only a backup if the chain breaks. To restart
by hand: Actions > Update mastery and status > Run workflow.

- `mastery.json`: `{"updated","regions","players","total":[row],"fighters":{key:[row]}}`, row =
  `{"pos","id","name"?,"points","veteran","total"}` (+ `"fighter"`, the most played, in `total`). Built from every lobby's
  `/mastery.json`: points are SUMMED over the regions (each region counts only its own matches), the one-time veteran
  bonus is the largest per account and fighter (never summed). Engagement points, not a skill ranking: no levels, no tiers.
  A lobby without `/mastery.json` is skipped; a region that stops answering keeps its last points (`mastery_regions.json`).
  Fighter keys are the game's `ui_chara_<key>` names; the display names are in `js/fighters.js`. Players who did not
  choose to show a name appear as Anonymous.
- `gsp_archive.json`: the GSP leaderboard frozen. The first run copies the last `leaderboard.json` once and never touches
  it again; `leaderboard.json` is no longer written. The page `leaderboard/gsp/` shows it read only.
- `status.json`: `{"updated","up","online","rooms","arenas","open_rooms","playing"}`. Counts only. Needs the lobby
  built with `/status.json` (OpenSmash-Ultimate PR #370); until it is redeployed the file is absent and the page shows
  "Live counts coming soon". If the lobby does not answer at all, `up` becomes `false` and the page says so.
  The top-level counts are summed over every lobby; `"regions": {"eu": {...}, "na-east": {...}}` has the official lobbies'
  own counts (`"up": false` for one that did not answer), by host name (`REGION_OF_HOST` in `leaderboard.py`). The home's
  "Online now" card shows Total (the two regions summed) or one region. The lobbies send `Access-Control-Allow-Origin: *`
  but serve plain HTTP only, which an HTTPS page may not read (mixed content), so the page reads this snapshot; once they
  have HTTPS addresses, `LOBBY_HTTPS` in `config.js` (`{"eu": "https://...", "na-east": "https://..."}`) makes the page
  read them live first.
- The lobby list is at the top of `leaderboard.py` (or the `LOBBIES` environment variable, comma-separated).
- Offline test: `python .github/scripts/leaderboard.py --selftest`.

## Sign-in

The only sign-in is the shared OpenSmash / SSBU Arena account (js/opensmash-auth.js, signed in on
account.opensmashultimate.com). The site's own Discord sign-in was removed: players who signed in with it were not saved in
the accounts database. Discord is linked from the account site.

## OpenSmash account sign-in

The shared OpenSmash / SSBU Arena account (the one the launcher and ssbuarena.com use). This site is a public OAuth
client of the accounts service (Supabase Auth OAuth 2.1 server): authorization code + PKCE (S256), no secret, no
`supabase-js`, no server. "Sign in" goes to `https://account.opensmashultimate.com`, comes back to `auth/callback/`
with a one-time code, and `js/opensmash-auth.js` (`window.OpenSmashAuth`) exchanges it for this site's own session.
`js/opensmash-account-ui.js` wires the panel on `account/` (ids `osa-*`); `js/nav-login.js` shows `Name#0042` in the
top bar. `account/` also shows the player's own mastery (`OpenSmashAuth.myMastery()`: the RPC
`my_opensmash_mastery()` with the same publishable key and the player's token; until it is deployed the panel says "not
available yet").

- The sign-in talks only to `gnufjvqwynxmudpgrded.supabase.co` and `account.opensmashultimate.com`. The session (access
  and refresh token, player id, name, tag, rating) is kept in this browser's `localStorage` under `osu_account` until
  Sign out. A sign-in in progress lives in `sessionStorage` (`osu_account_pending`) and is deleted when the callback runs.
- The client id, redirect URI (`https://denkishi.github.io/opensmash-site/auth/callback/`, trailing slash included) and
  publishable key are public and are constants at the top of `js/opensmash-auth.js`. If the site moves, the registered
  redirect URI and `SITE_URL` there change together (ask the OpenSmash / SSBU Arena team). There is no client secret.
- Test (no network, fake `fetch` and storage): `node .github/opensmash-auth.test.cjs`.

## GitHub Pages

Settings > Pages > Deploy from a branch > `main`, folder `/ (root)`. Optional custom domain with **Enforce HTTPS**.

## Legal

Keep the footer lines: not affiliated with Nintendo; no game data, keys or firmware in the project; you must own the
game and dump it yourself; GPL-3.0.
