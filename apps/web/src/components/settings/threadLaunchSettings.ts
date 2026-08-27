import { ProviderInstanceId, type TerminalStartup } from "@t3tools/contracts";

interface TerminalStartupProviderEntry {
  readonly instanceId: ProviderInstanceId;
  readonly enabled: boolean;
  readonly isAvailable: boolean;
}

const AGENT_SELECTION_PREFIX = "agent:";

export function selectableTerminalStartupProviders<T extends TerminalStartupProviderEntry>(
  entries: ReadonlyArray<T>,
): T[] {
  return entries.filter((entry) => entry.enabled && entry.isAvailable);
}

export function terminalStartupSelectionValue(startup: TerminalStartup): string {
  return startup._tag === "shell"
    ? "shell"
    : `${AGENT_SELECTION_PREFIX}${startup.providerInstanceId}`;
}

export function terminalStartupFromSelection(value: string): TerminalStartup | null {
  if (value === "shell") return { _tag: "shell" };
  if (!value.startsWith(AGENT_SELECTION_PREFIX)) return null;
  const providerInstanceId = value.slice(AGENT_SELECTION_PREFIX.length).trim();
  return providerInstanceId.length > 0
    ? { _tag: "agent", providerInstanceId: ProviderInstanceId.make(providerInstanceId) }
    : null;
}

export function unavailableTerminalStartupProviderId(
  startup: TerminalStartup,
  entries: ReadonlyArray<TerminalStartupProviderEntry>,
): ProviderInstanceId | null {
  if (startup._tag === "shell") return null;
  return entries.some((entry) => entry.instanceId === startup.providerInstanceId)
    ? null
    : startup.providerInstanceId;
}
