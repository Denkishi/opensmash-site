# data branch

Live snapshots (status.json, leaderboard.json) written by the "Update leaderboard and status" workflow on master.
This branch is not served by GitHub Pages, so updating it never triggers a Pages build. It is a single commit,
force-pushed on every change. The site reads it from https://raw.githubusercontent.com/Denkishi/opensmash-site/data/.
