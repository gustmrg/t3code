import { useSyncExternalStore } from "react";

export const TERMINAL_THEME_STORAGE_KEY = "t3code:terminal-theme";
export const FOLLOW_APP_THEME = "";
const listeners = new Set<() => void>();

export function readTerminalThemePreference(): string {
  try {
    return window.localStorage.getItem(TERMINAL_THEME_STORAGE_KEY) ?? FOLLOW_APP_THEME;
  } catch {
    return FOLLOW_APP_THEME;
  }
}

export function setTerminalThemePreference(theme: string): boolean {
  try {
    window.localStorage.setItem(TERMINAL_THEME_STORAGE_KEY, theme);
  } catch {
    return false;
  }
  for (const listener of listeners) listener();
  return true;
}

export function subscribeTerminalTheme(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === TERMINAL_THEME_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTerminalThemePreference() {
  return useSyncExternalStore(
    subscribeTerminalTheme,
    readTerminalThemePreference,
    () => FOLLOW_APP_THEME,
  );
}
