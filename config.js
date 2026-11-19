/* OpenSmash-Ultimate site settings: the only file to edit for links. */
window.OSU_CONFIG = {
  // The project's public repository (no trailing slash).
  REPO_URL: "https://github.com/OpenSmash-Ultimate/OpenSmash-Ultimate",
  // Discord invite.
  DISCORD_URL: "https://discord.gg/pkgyYGf3YB",
  // Live snapshots (status.json, leaderboard.json) are written to the `data` branch every few minutes; GitHub Pages
  // copies at the site root are only the fallback. raw.githubusercontent.com sends CORS headers.
  // The official lobbies over HTTPS, one a region ({eu: "https://...", "na-east": "https://..."}): their /status.json is
  // then read live first. Empty: the lobbies serve plain HTTP only (an HTTPS page may not read it), so the page reads the
  // snapshot (the `data` branch, every ~2.5 minutes), which has the same per-region counts.
  LOBBY_HTTPS: {},
  DATA_BASE: "https://raw.githubusercontent.com/Denkishi/opensmash-site/data/"
};
