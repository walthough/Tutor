#!/usr/bin/env bash
# Run in a second Git Bash window. Ctrl+C stops the display.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

render_progress() {
  subject="React"
  if [[ -f "$script_dir/.tutor-cache/active-subject.txt" ]]; then
    subject="$(cat "$script_dir/.tutor-cache/active-subject.txt")"
  fi
  coverage="$script_dir/StudyVault/$subject/00-Dashboard/Curriculum Coverage.md"
  awk -v subject="$subject" -F "|" '
    $2 ~ /^[[:space:]]*Total[[:space:]]*$/ {
      total = $3 + 0; reached = $4 + 0
      if (total <= 0 || reached < 0 || reached > total) exit 1
      percent = 100 * reached / total
      filled = int(20 * reached / total + 0.5)
      bar = ""
      for (i = 0; i < 20; i++) bar = bar (i < filled ? "#" : "-")
      printf "%s topics [%s] %.1f%%  (%d / %d reached)", subject, bar, percent, reached, total
      found = 1; exit
    }
    END { if (!found) exit 1 }
  ' "$coverage"
}
if [[ "${1:-}" == "--once" ]]; then
  render_progress
  result=$?
  printf "\n"
  exit "$result"
fi
trap 'printf "\n"; exit 0' INT TERM
printf "Live topic coverage - Ctrl+C to stop\n"
last_line=""
while true; do
  if ! line=$(render_progress 2>/dev/null); then
    line="Progress unavailable: check Curriculum Coverage.md"
  fi
  if [[ "$line" != "$last_line" ]]; then
    printf "\r%-90s" "$line"
    last_line="$line"
  fi
  sleep 2
done
