/* OpenSmash-Ultimate site settings: the only file to edit for links. */
window.OSU_CONFIG = {
  // The project's public repository (no trailing slash).
  REPO_URL: "https://github.com/OpenSmash-Ultimate/OpenSmash-Ultimate",
  // Discord invite.
  DISCORD_URL: "https://discord.gg/pkgyYGf3YB",
  // Live snapshots (status.json, leaderboard.json) are written to the `data` branch every few minutes; GitHub Pages
  // copies at the site root are only the fallback. raw.githubusercontent.com sends CORS headers.
  // One lobby over HTTPS whose status.json is read live first. Empty: there are several lobbies (EU, NA and the v0.4.x
  // one), so the page reads the snapshot that sums them all (the `data` branch, every ~2.5 minutes).
  LOBBY_HTTPS: "",
  DATA_BASE: "https://raw.githubusercontent.com/Denkishi/opensmash-site/data/"
};
