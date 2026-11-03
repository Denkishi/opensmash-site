/*
 * OpenSmash-Ultimate site settings. This is the only file you need to edit for links and the server status.
 * Every link on the page that points at the repository is built from REPO_URL, so the rename to
 * OpenSmash-Ultimate is a one-line change here.
 */
window.OSU_CONFIG = {
  // The project's public repository (no trailing slash).
  REPO_URL: "https://github.com/OpenSmash-Ultimate/OpenSmash-Ultimate",

  // Branch used for links to files in the repository.
  REPO_BRANCH: "main",

  // Releases page.
  RELEASES_URL: "https://github.com/OpenSmash-Ultimate/OpenSmash-Ultimate/releases",

  // Install guide. Relative paths are resolved against the repository (blob/<branch>/...); a full URL is used as is.
  INSTALL_GUIDE: "docs/BUILDING.md#install-in-one-go",

  // Online guide in the repository.
  ONLINE_GUIDE: "docs/MULTIPLAYER.md",

  // Discord invite (e.g. "https://discord.gg/xxxxxxx"). Empty: the buttons show "Discord: soon" and are disabled.
  DISCORD_URL: "https://discord.gg/pkgyYGf3YB",

  // Video tutorial (e.g. a YouTube link). Empty: the button shows "Video tutorial: soon" and is disabled.
  VIDEO_URL: "",

  // Live lobby status: an HTTPS URL that returns JSON {"up":true,"players":N,"rooms":N,"version":"...","uptime_s":N}.
  // The lobby serves it with:  python ssbu_lobby.py --status-port 8080   and deploy_lobby.sh publishes it as
  // https://<your domain>/status through Caddy. Empty: the widget says "not configured".
  // It must be HTTPS: a page on GitHub Pages cannot read a plain http:// URL.
  STATUS_URL: "https://opensmash-lobby.duckdns.org/status",

  // Seconds between two status refreshes.
  STATUS_REFRESH_S: 30,

  // Future tools: set "url" when a tool is published. Empty url: the card shows "Soon".
  TOOLS: {
    lobby: "ssbu-recomp/tools/net/ssbu_lobby.py",          // in the repository today (relative = inside the repo)
    sdk: "ssbu-recomp/fighter_sdk",                        // in the repository today
    packager: "",                              // single-file fighter packager: planned
    modmanager: "OpenSmash.Launcher",          // the launcher and mod manager (OpenSmash-Ultimate #62)
    replay: ""                                 // frame-by-frame build comparer (state hash viewer): planned
  }
};
