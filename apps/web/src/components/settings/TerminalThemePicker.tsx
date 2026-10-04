import { LegendList, type LegendListRef } from "@legendapp/list/react";
import { useMemo, useRef, useState } from "react";
import { terminalThemeNames } from "../../terminal/terminalTheme";
import {
  FOLLOW_APP_THEME,
  setTerminalThemePreference,
  useTerminalThemePreference,
} from "../../terminal/terminalThemePreference";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxSearchInput,
  ComboboxItem,
  ComboboxListVirtualized,
  ComboboxPopup,
  ComboboxTrigger,
} from "../ui/combobox";
import { SelectButton } from "../ui/select";

const choices = [FOLLOW_APP_THEME, ...terminalThemeNames];
const label = (id: string) => (id === FOLLOW_APP_THEME ? "Follow app theme" : id);

export function TerminalThemePicker() {
  const preference = useTerminalThemePreference();
  const selected = choices.includes(preference) ? preference : FOLLOW_APP_THEME;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);
  const listRef = useRef<LegendListRef | null>(null);
  const items = useMemo(
    () => choices.filter((id) => label(id).toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );

  return (
    <div>
      <Combobox
        items={items}
        filteredItems={items}
        autoHighlight
        virtualized
        open={open}
        value={selected}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setQuery("");
        }}
        onValueChange={(next) => {
          if (typeof next !== "string") return;
          const saved = setTerminalThemePreference(next);
          setError(!saved);
          if (saved) setOpen(false);
        }}
        onItemHighlighted={(_value, details) => {
          if (open && details.index >= 0 && details.reason === "keyboard") {
            void listRef.current?.scrollIndexIntoView?.({ index: details.index, animated: false });
          }
        }}
      >
        <ComboboxTrigger aria-label="Terminal theme" render={<SelectButton size="sm" />}>
          {label(selected)}
        </ComboboxTrigger>
        <ComboboxPopup align="end" className="flex w-72 flex-col">
          <ComboboxSearchInput
            placeholder="Search terminal themes…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ComboboxEmpty>No themes found.</ComboboxEmpty>
            <div className="relative min-h-0 max-h-72 w-full flex-1 overflow-hidden">
              <ComboboxListVirtualized>
                <LegendList<string>
                  ref={listRef}
                  data={items}
                  keyExtractor={(item) => item}
                  renderItem={({ item, index }) => (
                    <ComboboxItem index={index} value={item}>
                      {label(item)}
                    </ComboboxItem>
                  )}
                  estimatedItemSize={30}
                  drawDistance={360}
                  style={{ height: Math.min(items.length * 30, 288) }}
                />
              </ComboboxListVirtualized>
            </div>
          </div>
        </ComboboxPopup>
      </Combobox>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          Could not save the terminal theme.
        </p>
      ) : null}
    </div>
  );
}
