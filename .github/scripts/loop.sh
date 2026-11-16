#!/usr/bin/env bash
# Snapshot loop run by .github/workflows/leaderboard.yml. The `data` branch is checked out in $DATA_DIR.
# Every INTERVAL_S seconds (default 150) until LOOP_S (default 21000 = 5 h 50 m) have passed: fetch the lobby,
# and when status.json / leaderboard.json changed (or the heartbeat in leaderboard.py says the age is getting
# old) amend the single commit of `data` and force-push it. The branch is not served by Pages: no Pages builds.
set -u
: "${DATA_DIR:?}"
INTERVAL_S="${INTERVAL_S:-150}"
LOOP_S="${LOOP_S:-21000}"
end=$(( $(date +%s) + LOOP_S ))
git -C "$DATA_DIR" config user.name "github-actions[bot]"
git -C "$DATA_DIR" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
n=0
while :; do
  n=$((n + 1))
  python .github/scripts/leaderboard.py || echo "iteration $n: updater failed, continuing"
  if [ -n "$(git -C "$DATA_DIR" status --porcelain)" ]; then
    git -C "$DATA_DIR" add -A
    git -C "$DATA_DIR" commit -q --amend -m "Snapshot $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    git -C "$DATA_DIR" push -q --force origin HEAD:data && echo "iteration $n: pushed" || echo "iteration $n: push failed, will retry"
  else
    echo "iteration $n: unchanged"
  fi
  [ $(( $(date +%s) + INTERVAL_S )) -ge "$end" ] && break
  sleep "$INTERVAL_S"
done
echo "loop finished after $n iterations"
