# OpenSmash-Ultimate website

The site of [OpenSmash-Ultimate](https://github.com/OpenSmash-Ultimate/OpenSmash-Ultimate), a native PC port of
*Super Smash Bros. Ultimate*: live online stats and the GSP leaderboard first, then install. Plain static HTML, CSS and
JavaScript: no build step, no framework, no screenshots; only the logo, icons and the social card, no trackers, no third-party requests.
GPL-3.0 like the project. Not affiliated with Nintendo.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/home.css`, `js/hero.js`, `js/home.js`, `js/snapshot.js`, `js/session.js`, `js/nav-login.js` | the home page: hero, live counts, top 10 (overall or per fighter), install, the Register / Log in button |
| `css/style.css` | the shared design |
| `config.js` | links: repository, Discord |
| `leaderboard/`, `account/`, `css/pages.css`, `js/leaderboard.js`, `js/account.js`, `js/page.js` | full leaderboard; Discord sign-in and your own GSP |
| `leaderboard.json`, `status.json` | old snapshots, only the fallback; the live ones are on the `data` branch |
| `.github/workflows/leaderboard.yml`, `.github/scripts/leaderboard.py` | the snapshot job |
| `privacy/`, `terms/`, `404.html`, `robots.txt`, `.nojekyll` | legal pages and Pages extras |
| `assets/` | the emblem and favicons |

To look at it locally: `python -m http.server 8000` in this folder, then open http://localhost:8000.

## Live data

The online lobby (`opensmash-lobby.duckdns.org:39421`) answers plain HTTP on its TCP port, and this site is HTTPS, so the
browser cannot read it directly. The **Update leaderboard and status** workflow therefore copies the lobby's
`/leaderboard.json` and `/status.json` to the **`data` branch** (a single commit, force-pushed; Pages does not serve it, so
no Pages build is triggered). The page reads
`https://raw.githubusercontent.com/Denkishi/opensmash-site/data/<file>` (CORS enabled; `DATA_BASE` in `config.js`) and falls
back to the older copies at the site root served by Pages. It refreshes every minute and shows "Updated x min ago".

How the updater stays alive (`.github/workflows/leaderboard.yml`, `.github/scripts/loop.sh`): one job loops for
5 h 50 m, fetching every 150 s and pushing only when the data changed (or, as a heartbeat, when an unchanged file is more
than 10 min old, so the age on the page stays honest). At the end it starts its successor with
`gh workflow run`: `workflow_dispatch` and `repository_dispatch` are the two events that DO create new runs when sent
with `GITHUB_TOKEN` (the workflow needs `actions: write`), so no personal token is needed. The concurrency group `leaderboard`
keeps a single loop; the successor waits as pending. The hourly `schedule` is only a backup if the chain breaks. To restart
by hand: Actions > Update leaderboard and status > Run workflow.

- `leaderboard.json`: `{"updated","ranked","players":[...],"fighters":{kind:{name,top}}}`, built from the lobby's
  leaderboard (fighter names are in `.github/scripts/leaderboard.py`). Players who did not choose to show a name appear as
  Anonymous; no ids are shown.
- `status.json`: `{"updated","up","online","rooms","arenas","open_rooms","playing","ranked"}`. Counts only. Needs the lobby
  built with `/status.json` (OpenSmash-Ultimate PR #370); until it is redeployed the file is absent and the page shows
  "Live counts coming soon". If the lobby does not answer at all, `up` becomes `false` and the page says so.
- The lobby list is at the top of `leaderboard.py` (or the `LOBBIES` environment variable, comma-separated).
- Offline test: `python .github/scripts/leaderboard.py --selftest`.

## Discord sign-in

`account/` is OAuth2 with PKCE in the browser (no server, no secret). It hashes your Discord id in the browser
(`sha256("opensmash-discord
" + id)`, first 16 hex characters) to find your row. The redirect
`https://denkishi.github.io/opensmash-site/account/` must be listed in the Discord application's OAuth2 redirects
(if the site moves, change `REDIRECT_URI` in `js/session.js` and that list together).

The session is kept in `localStorage` (`osu_session`: access token and its expiry, refresh token, your id, name and
avatar) by `js/session.js`, so you stay signed in between visits and the top-bar button shows your name on every page.
The access token is refreshed with the refresh token (Discord accepts the `refresh_token` grant from a PKCE public client
with only `client_id`; it rotates the refresh token each time). `prompt=none` on the authorize request skips the consent
screen for people who already authorised the app. Log out revokes the tokens and clears the session. If storage is blocked
it falls back to `sessionStorage`, then to memory.

## GitHub Pages

Settings > Pages > Deploy from a branch > `main`, folder `/ (root)`. Optional custom domain with **Enforce HTTPS**.

## Legal

Keep the footer lines: not affiliated with Nintendo; no game data, keys or firmware in the project; you must own the
game and dump it yourself; GPL-3.0.
