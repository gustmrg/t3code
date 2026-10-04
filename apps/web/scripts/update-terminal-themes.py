#!/usr/bin/env python3
"""Regenerate the complete palette catalog from Ghostty's pinned theme archive."""
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile
import subprocess

URL = "https://deps.files.ghostty.org/ghostty-themes-release-20260921-150923-0b55a9e.tgz"
DESTINATION = Path(__file__).resolve().parents[1] / "src/terminal/themes/catalog.json"


def main():
    archive = subprocess.check_output(["curl", "-fsSL", URL])
    assert hashlib.sha256(archive).hexdigest() == "da83fb32fcef53c8cb1dca868fb700a904d5d86420d7588e574a0f81a75008d5", "Unexpected theme archive"
    themes = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as source:
        for member in source.getmembers():
            if not member.isfile() or not member.name.startswith("ghostty/"):
                continue
            values = {}
            palette = {}
            for line in source.extractfile(member).read().decode().splitlines():
                key, value = (part.strip() for part in line.split("=", 1))
                if key == "palette":
                    index, value = value.split("=", 1)
                    palette[int(index)] = value
                else:
                    values[key] = value
            assert set(palette) == set(range(16)), member.name
            assert all(re.fullmatch(r"#[0-9a-fA-F]{6}", color) for color in [*values.values(), *palette.values()]), member.name
            themes[member.name.removeprefix("ghostty/")] = {
                "background": values["background"],
                "foreground": values["foreground"],
                "cursor": values["cursor-color"],
                "cursorText": values["cursor-text"],
                "selectionBackground": values["selection-background"],
                "selectionForeground": values["selection-foreground"],
                "palette": [palette[index] for index in range(16)],
            }
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    DESTINATION.write_text(json.dumps(dict(sorted(themes.items())), indent=2) + "\n")
    print(f"Wrote {len(themes)} themes; archive SHA256: {hashlib.sha256(archive).hexdigest()}")


if __name__ == "__main__":
    main()
