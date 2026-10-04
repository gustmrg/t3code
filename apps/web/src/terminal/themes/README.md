# Terminal palettes

`catalog.json` contains all 617 themes from the iTerm2 Color Schemes archive
Ghostty pins in its `build.zig.zon`:
https://deps.files.ghostty.org/ghostty-themes-release-20260921-150923-0b55a9e.tgz

Source: https://github.com/mbadolato/iTerm2-Color-Schemes (MIT, see LICENSE).
Regenerate with `python3 apps/web/scripts/update-terminal-themes.py`.
Only color data is imported; Ghostty configuration is not executed.
