import { describe, expect, it, vi } from "vite-plus/test";
import { GhosttyTerminalCore } from "./core";
import { terminalPreset, terminalThemeNames } from "../terminalTheme";

vi.mock("./vendor/ghostty-vt.wasm?url", async () => ({
  default: (await import("./vendor/ghostty-vt.wasm?inline")).default,
}));
vi.mock("./vendor/ghostty-write-pty.wasm?url&no-inline", async () => ({
  default: (await import("./vendor/ghostty-write-pty.wasm?inline")).default,
}));

const appTheme = {
  foreground: { r: 255, g: 255, b: 255 },
  background: { r: 0, g: 0, b: 0 },
  cursor: { r: 255, g: 255, b: 255 },
};

describe("terminal presets", () => {
  it("ships the complete catalog with valid ANSI palettes", () => {
    expect(terminalThemeNames).toHaveLength(617);
    for (const name of terminalThemeNames) {
      const theme = terminalPreset(name)!;
      expect(theme.palette).toHaveLength(16);
      for (const color of [theme.foreground, theme.background, theme.cursor, ...theme.palette!]) {
        for (const value of Object.values(color)) {
          expect(Number.isInteger(value) && value >= 0 && value <= 255).toBe(true);
        }
      }
    }
    expect(terminalPreset("missing")).toBeUndefined();
    expect(terminalPreset("__proto__")).toBeUndefined();
  });

  it("recolors existing ANSI output, preserves truecolor, and restores defaults", async () => {
    const core = await GhosttyTerminalCore.create(12, 3, 8, 16, appTheme, () => {});
    try {
      core.write("\x1b[31mR\x1b[38;2;1;2;3mT\x1b[0m");
      const original = core.snapshot().rowData[0]!.cells[0]!.foreground;
      const dracula = terminalPreset("Dracula")!;
      core.setTheme(dracula);
      expect(core.snapshot().rowData[0]!.cells[0]!.foreground).toEqual(dracula.palette![1]);
      expect(core.snapshot().rowData[0]!.cells[1]!.foreground).toEqual({ r: 1, g: 2, b: 3 });
      core.resetAndWrite("\x1b[31mR");
      expect(core.snapshot().rowData[0]!.cells[0]!.foreground).toEqual(dracula.palette![1]);
      core.setTheme(appTheme);
      expect(core.snapshot().rowData[0]!.cells[0]!.foreground).toEqual(original);
    } finally {
      core.dispose();
    }
  });

  it("preserves application color overrides across theme switches", async () => {
    const core = await GhosttyTerminalCore.create(12, 3, 8, 16, appTheme, () => {});
    try {
      core.write("\x1b]4;1;rgb:01/02/03\x07\x1b[31mR");
      core.setTheme(terminalPreset("Dracula")!);
      expect(core.snapshot().rowData[0]!.cells[0]!.foreground).toEqual({ r: 1, g: 2, b: 3 });
      core.write("\x1b]104;1\x07");
      expect(core.snapshot().rowData[0]!.cells[0]!.foreground).toEqual(
        terminalPreset("Dracula")!.palette![1],
      );
    } finally {
      core.dispose();
    }
  });
});
