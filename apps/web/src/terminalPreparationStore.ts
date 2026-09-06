import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

type TerminalPreparation =
  | { status: "preparing" }
  | { status: "failed"; message: string; retry?: () => Promise<unknown> };

// Only the selected view is persisted in the draft. Promises and failures belong
// to this client session; a reload offers explicit recovery instead of a spinner.
export const useTerminalPreparationStore = create<{
  byThread: Record<string, TerminalPreparation>;
}>(() => ({ byThread: {} }));

export function beginTerminalPreparation(ref: ScopedThreadRef) {
  useTerminalPreparationStore.setState((state) => ({
    byThread: { ...state.byThread, [scopedThreadKey(ref)]: { status: "preparing" } },
  }));
}

export function failTerminalPreparation(
  ref: ScopedThreadRef,
  message: string,
  retry?: () => Promise<unknown>,
) {
  useTerminalPreparationStore.setState((state) => ({
    byThread: {
      ...state.byThread,
      [scopedThreadKey(ref)]: { status: "failed", message, ...(retry ? { retry } : {}) },
    },
  }));
}

export function finishTerminalPreparation(ref: ScopedThreadRef) {
  useTerminalPreparationStore.setState((state) => {
    const byThread = { ...state.byThread };
    delete byThread[scopedThreadKey(ref)];
    return { byThread };
  });
}
