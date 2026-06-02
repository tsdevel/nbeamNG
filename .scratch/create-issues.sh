#!/bin/bash
set -e

GH="C:/Program Files/GitHub CLI/gh.exe"
REPO="tsdevel/nbeamNG"

# Create labels if they don't exist
"$GH" label create ready-for-agent --repo "$REPO" --color "0E8A16" --description "Fully specified, ready for an AFK agent" 2>/dev/null || true
"$GH" label create ready-for-human --repo "$REPO" --color "B60205" --description "Requires human implementation or design review" 2>/dev/null || true

# Extract issue bodies (skip the ## Issue N: header line itself)
for i in $(seq 1 9); do
  next=$((i+1))
  sed -n "/^## Issue $i:/,/^## Issue $next:/p" docs/kanban/slice-issues-draft.md | sed '$d' | sed '1d' > "/tmp/issue${i}.md"
  grep "^## Issue $i:" docs/kanban/slice-issues-draft.md | sed "s/^## Issue $i: //" > "/tmp/issue${i}_title.txt"
done
sed -n '/^## Issue 10:/,$p' docs/kanban/slice-issues-draft.md | sed '1d' > /tmp/issue10.md
grep "^## Issue 10:" docs/kanban/slice-issues-draft.md | sed 's/^## Issue 10: //' > /tmp/issue10_title.txt

# Create issues and capture numbers from URL output
for i in $(seq 1 10); do
  title=$(cat "/tmp/issue${i}_title.txt")
  if [ "$i" = "7" ] || [ "$i" = "10" ]; then
    label="ready-for-human"
  else
    label="ready-for-agent"
  fi
  url=$("$GH" issue create --repo "$REPO" --title "$title" --body-file "/tmp/issue${i}.md" --label "$label")
  num=$(echo "$url" | sed 's/.*\/issues\///')
  eval "N${i}=$num"
  echo "Created Issue $i: #$num - $title"
done

# Add dependency comments
echo ""
echo "Adding dependency comments..."
"$GH" issue comment "$N2" --repo "$REPO" --body "**Blocked by:** #$N1 (Slice 1 — Ingest a Deal)"
"$GH" issue comment "$N3" --repo "$REPO" --body "**Blocked by:** #$N2 (Slice 2 — Generate an Auditable First Draft)"
"$GH" issue comment "$N4" --repo "$REPO" --body "**Blocked by:** #$N2 (Slice 2 — Generate an Auditable First Draft)"
"$GH" issue comment "$N5" --repo "$REPO" --body "**Blocked by:** #$N4 (Slice 4 — Govern Material Claims)"
"$GH" issue comment "$N6" --repo "$REPO" --body "**Blocked by:** #$N4 (Slice 4), #$N5 (Slice 5)"
"$GH" issue comment "$N7" --repo "$REPO" --body "**Blocked by:** #$N4 (Slice 4), #$N5 (Slice 5), #$N6 (Slice 6)"
"$GH" issue comment "$N8" --repo "$REPO" --body "**Blocked by:** #$N4 (Slice 4), #$N5 (Slice 5), #$N6 (Slice 6), #$N7 (Slice 7)"
"$GH" issue comment "$N9" --repo "$REPO" --body "**Blocked by:** Issues #$N1 through #$N8"
"$GH" issue comment "$N10" --repo "$REPO" --body "**Blocked by:** Issues #$N1 through #$N9"

echo ""
echo "All issues created successfully:"
for i in $(seq 1 10); do
  eval "echo \"  Issue $i: #\$N$i\""
done
