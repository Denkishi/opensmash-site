# OpenSmash-Ultimate website

The landing page of [OpenSmash-Ultimate](https://github.com/Denkishi/ssbu-recomp), a native PC port of
*Super Smash Bros. Ultimate* made by static recompilation. Plain static HTML, CSS and JavaScript: no build step, no
framework, no tracking. Licensed GPL-3.0 like the project.

Not affiliated with Nintendo. The site uses no Nintendo logos, emblems, artwork, fonts or screenshots: the emblem,
the slashes, the social card and the screenshot fallbacks are original (SVG, CSS and canvas).

## Files

| Path | What it is |
|---|---|
| `index.html` | the page (all sections) |
| `config.js` | **the only file to edit**: repository URL, Discord, video, lobby status URL, tool links |
| `css/style.css` | the design |
| `js/main.js` | links from `config.js`, hero animation, scroll reveals, feature filter, lobby status widget |
| `assets/emblem.svg`, `assets/favicon.svg`, `assets/favicon-32.png`, `assets/apple-touch-icon.png` | the emblem and icons |
| `assets/og-image.png` | the social card (1200x630); its source is `assets/og/og-image.html` |
| `assets/screens/` | your screenshots (see below) |
| `404.html`, `robots.txt`, `.nojekyll` | GitHub Pages extras |

## Turn on GitHub Pages

1. Create a repository for the site (for example `opensmash-ultimate.github.io` under an organisation, or `site` under
   your account) and push the contents of this folder to its `main` branch, at the root.
2. On GitHub: **Settings > Pages > Build and deployment > Source: Deploy from a branch**, branch `main`, folder `/ (root)`,
   **Save**. After a minute the page is at `https://<owner>.github.io/<repository>/` (or `https://<owner>.github.io/` for
   a repository named `<owner>.github.io`).
3. Optional, your own domain: Settings > Pages > Custom domain, then tick **Enforce HTTPS**.
4. Social cards want absolute URLs: in `index.html` replace `content="assets/og-image.png"` (two places) and
   `og:url` with the full `https://...` address of the site.

To look at it on your PC: `python -m http.server 8000` in this folder, then open http://localhost:8000.

## Settings (`config.js`)

- `REPO_URL`: every link to the repository is built from it. When the repository is renamed to OpenSmash-Ultimate,
  change this one line.
- `INSTALL_GUIDE`, `ONLINE_GUIDE`: paths inside the repository (or full URLs).
- `DISCORD_URL`, `VIDEO_URL`: empty means the buttons show "soon" and are disabled.
- `TOOLS`: links for the tool cards; an empty value shows "Soon".
- `STATUS_URL`, `STATUS_REFRESH_S`: the live lobby status (below).

## Live server status

The **Lobby status** box reads a small JSON document every 30 seconds:

```json
{"up": true, "players": 3, "rooms": 1, "version": "1.1 (protocol SU 1)", "uptime_s": 86400}
```

Counts only: the lobby never puts addresses, names or lobby codes in it.

1. On the lobby server, the lobby serves it with `--status-port`:
   `python3 ssbu_lobby.py --port 39500 --status-port 8080` (listens on 127.0.0.1:8080 by default).
   `deploy_lobby.sh` (in the project's `tools/net/`) already starts the service this way.
2. The site is served over HTTPS, so the status must be HTTPS too. Point a DNS record of a domain you own (for example
   `lobby.<your domain>`) at the server, open TCP 80 and 443 in the cloud firewall, and run on the server:
   `sudo DOMAIN=lobby.<your domain> bash deploy_lobby.sh`. It installs Caddy from its official repository and publishes
   `https://lobby.<your domain>/status` with an automatic certificate. Optional: `ACME_EMAIL=...` for the certificate
   authority's notices.
3. In `config.js` set `STATUS_URL: "https://lobby.<your domain>/status"` and push.

With `STATUS_URL` empty the box says **Not configured**; when the lobby does not answer it says **Offline** and keeps
trying. The endpoint sends `Access-Control-Allow-Origin: *`, so any page may read it.

## Screenshots

Five slots, filled automatically when the file exists (until then a drawn fallback is shown):

| File | Caption on the page |
|---|---|
| `assets/screens/01.jpg` | A full match, native, 59-60 fps |
| `assets/screens/02.jpg` | The one-click installer |
| `assets/screens/03.jpg` | In-game settings menu (F1) |
| `assets/screens/04.jpg` | Menus, natively on Windows |
| `assets/screens/05.jpg` | Fighters as readable C++ |

Use captures of your own build, 16:9, about 1600x900, JPEG under 300 KB each. Captions and alt texts are in
`index.html` (search for `assets/screens/`). Keep in mind that game screenshots show Nintendo's artwork: use them to
show the software running, never as the site's branding.

## Legal

The page says it in the footer and in the FAQ: not affiliated with Nintendo; the project contains no game data, keys
or firmware; you must own the game and dump it yourself; GPL-3.0. Keep those lines when you edit the page.
