#!/bin/zsh
# Double-click: pick a project folder, then Claude Code opens there with Baton on.
dir=$(osascript -e 'POSIX path of (choose folder with prompt "Baton: choose the project folder")') || exit 0
cd "$dir" || exit 1
exec claude "/baton"
