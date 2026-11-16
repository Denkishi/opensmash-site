/* OpenSmash-Ultimate site settings: the only file to edit for links. */
window.OSU_CONFIG = {
  // The project's public repository (no trailing slash).
  REPO_URL: "https://github.com/OpenSmash-Ultimate/OpenSmash-Ultimate",
  // Discord invite.
  DISCORD_URL: "https://discord.gg/pkgyYGf3YB",
  // Live snapshots (status.json, leaderboard.json) are written to the `data` branch every few minutes; GitHub Pages
  // copies at the site root are only the fallback. raw.githubusercontent.com sends CORS headers.
  // The lobby over HTTPS (Caddy, game repo tools/deploy/CADDY.md): status.json is read from here first when it answers.
  LOBBY_HTTPS: "https://opensmash-lobby.duckdns.org/",
  DATA_BASE: "https://raw.githubusercontent.com/Denkishi/opensmash-site/data/"
};
