import type { TerminalSummary, TerminalWorkspaceBinding } from "@t3tools/contracts";
import type { ProviderInstanceEntry } from "../providerInstances";

/** Verified native metadata wins over launch preferences and process-name fallbacks. */
export function terminalWorkspaceIdentity(
  binding: TerminalWorkspaceBinding,
  summary: TerminalSummary | null,
  providers: ReadonlyMap<string, ProviderInstanceEntry>,
) {
  const startupId = binding.startup._tag === "agent" ? binding.startup.providerInstanceId : null;
  const launchId =
    summary?.agentLaunch?.status === "started" ? summary.agentLaunch.providerInstanceId : startupId;
  const label = summary?.label ?? "Terminal";
  const command =
    summary?.agentSession?.provider ??
    (summary?.hasRunningSubprocess
      ? /(?:^|[\s/])(codex|claude|cursor|grok|opencode)(?:\s|$)/i.exec(label)?.[1]?.toLowerCase()
      : undefined);
  const launchedProvider = launchId ? (providers.get(launchId) ?? null) : null;
  const provider = command
    ? launchedProvider?.driverKind === command
      ? launchedProvider
      : ([...providers.values()].find((entry) => entry.driverKind === command && entry.isDefault) ??
        null)
    : summary?.hasRunningSubprocess
      ? launchedProvider
      : null;
  const model = summary?.agentSession?.model;
  const modelName = model
    ? (provider?.models.find((entry) => entry.slug === model)?.name ?? model)
    : "Model unavailable";
  return { provider, label: provider ? `${provider.displayName} · ${modelName}` : label };
}
