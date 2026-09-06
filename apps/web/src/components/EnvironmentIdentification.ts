import { useAtomValue } from "@effect/atom-react";
import { APP_STAGE_LABEL } from "../branding";
import { resolveServerBackedAppStageLabel } from "../branding.logic";
import { primaryServerConfigAtom } from "../state/server";

export function resolveEnvironmentIdentificationPillLabel(stageLabel: string): string {
  const label = stageLabel.trim();
  switch (label.toLowerCase()) {
    case "dev":
      return "Dev";
    case "nightly":
      return "Nightly";
    case "latest":
      return "Latest";
    case "alpha":
      return "Alpha";
    default:
      return label || APP_STAGE_LABEL;
  }
}

export function useEnvironmentStageLabel(): string {
  const primaryServerVersion =
    useAtomValue(primaryServerConfigAtom)?.environment.serverVersion ?? null;

  return resolveServerBackedAppStageLabel({
    primaryServerVersion,
    fallbackStageLabel: APP_STAGE_LABEL,
  });
}
