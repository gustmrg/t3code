import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  readTerminalThemePreference,
  setTerminalThemePreference,
  subscribeTerminalTheme,
  TERMINAL_THEME_STORAGE_KEY,
} from "./terminalThemePreference";

afterEach(() => vi.unstubAllGlobals());

describe("terminal theme preference", () => {
  it("persists selections and notifies open terminals in this window and other windows", () => {
    const values = new Map<string, string>();
    const events = new EventTarget();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
    });
    const listener = vi.fn();
    const unsubscribe = subscribeTerminalTheme(listener);
    expect(readTerminalThemePreference()).toBe("");
    expect(setTerminalThemePreference("Dracula")).toBe(true);
    expect(readTerminalThemePreference()).toBe("Dracula");
    expect(listener).toHaveBeenCalledTimes(1);
    values.set(TERMINAL_THEME_STORAGE_KEY, "Nord");
    events.dispatchEvent(Object.assign(new Event("storage"), { key: TERMINAL_THEME_STORAGE_KEY }));
    expect(readTerminalThemePreference()).toBe("Nord");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setTerminalThemePreference("");
    expect(readTerminalThemePreference()).toBe("");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("falls back when storage is unavailable and reports failed writes", () => {
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("Unavailable");
      },
    });
    expect(readTerminalThemePreference()).toBe("");
    expect(setTerminalThemePreference("Dracula")).toBe(false);
  });
});
