# OpenSmash-Ultimate website

The site of [OpenSmash-Ultimate](https://github.com/OpenSmash-Ultimate/OpenSmash-Ultimate), a native PC port of
*Super Smash Bros. Ultimate*: live online stats and the GSP leaderboard first, then install. Plain static HTML, CSS and
JavaScript: no build step, no framework, no images beyond the logo and icons, no trackers, no third-party requests.
Light and dark follow the visitor's system. GPL-3.0 like the project. Not affiliated with Nintendo.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/home.css`, `js/home.js` | the home page: live counts, top 10 (overall or per fighter), install |
| `css/style.css`, `css/theme.css` | the shared design and the light theme |
| `config.js` | links: repository, Discord |
| `leaderboard/`, `account/`, `css/pages.css`, `js/leaderboard.js`, `js/account.js`, `js/page.js` | full leaderboard; Discord sign-in and your own GSP |
| `leaderboard.json`, `status.json` | snapshots of the lobby, rewritten by the workflow |
| `.github/workflows/leaderboard.yml`, `.github/scripts/leaderboard.py` | the snapshot job |
| `privacy/`, `terms/`, `404.html`, `robots.txt`, `.nojekyll` | legal pages and Pages extras |
| `assets/` | the emblem and favicons |

To look at it locally: `python -m http.server 8000` in this folder, then open http://localhost:8000.

## Live data

The online lobby (`opensmash-lobby.duckdns.org:39421`) answers plain HTTP on its TCP port, and this site is HTTPS, so the
browser cannot read it directly. The **Update leaderboard and status** workflow runs every 10 minutes (GitHub may
delay scheduled runs), fetches `/leaderboard.json` and `/status.json` from the lobby and commits them here, only when
the data changed. The page reads the snapshots and refreshes them every minute.

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
(`sha256("opensmash-discord\n" + id)`, first 16 hex characters) to find your row. The redirect
`https://denkishi.github.io/opensmash-site/account/` must be listed in the Discord application's OAuth2 redirects
(if the site moves, change `REDIRECT_URI` in `js/account.js` and that list together).

## GitHub Pages

Settings > Pages > Deploy from a branch > `main`, folder `/ (root)`. Optional custom domain with **Enforce HTTPS**.

## Legal

Keep the footer lines: not affiliated with Nintendo; no game data, keys or firmware in the project; you must own the
game and dump it yourself; GPL-3.0.
