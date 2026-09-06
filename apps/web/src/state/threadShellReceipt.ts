import type {
  OrchestrationShellSnapshot,
  OrchestrationThreadShell,
  ScopedThreadRef,
} from "@t3tools/contracts";

/** Subscribe to one environment and read the thread and receipt from one accepted snapshot. */
export function waitForThreadShellReceipt(input: {
  readonly ref: ScopedThreadRef;
  readonly sequence: number;
  readonly signal?: AbortSignal;
  readonly read: () => {
    readonly snapshot: OrchestrationShellSnapshot | null;
    readonly error: string | null;
    readonly removed: boolean;
  };
  readonly subscribe: (listener: () => void) => () => void;
}): Promise<OrchestrationThreadShell> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (error: Error | null, thread?: OrchestrationThreadShell) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      input.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else if (thread) resolve(thread);
    };
    const abort = () => finish(new Error("Terminal workspace creation cancelled."));
    const check = () => {
      if (input.signal?.aborted) return abort();
      const { snapshot, error, removed } = input.read();
      if (removed) return finish(new Error("Environment was removed."));
      if (error) return finish(new Error(error));
      if (!snapshot || snapshot.snapshotSequence < input.sequence) return;
      const thread = snapshot.threads.find((candidate) => candidate.id === input.ref.threadId);
      if (!thread) return finish(new Error("The materialized thread was removed."));
      finish(null, thread);
    };
    input.signal?.addEventListener("abort", abort, { once: true });
    check();
    if (settled) return;
    unsubscribe = input.subscribe(check);
    if (settled) unsubscribe();
    else check();
  });
}
