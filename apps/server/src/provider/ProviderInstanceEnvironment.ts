import type { ProviderInstanceEnvironment } from "@t3tools/contracts";

export function providerInstanceEnvironmentOverrides(
  environment: ProviderInstanceEnvironment | undefined,
): NodeJS.ProcessEnv {
  const overrides: NodeJS.ProcessEnv = {};
  for (const variable of environment ?? []) {
    overrides[variable.name] = variable.value;
  }
  return overrides;
}

export function mergeProviderInstanceEnvironment(
  environment: ProviderInstanceEnvironment | undefined,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (!environment || environment.length === 0) {
    return baseEnv;
  }

  return { ...baseEnv, ...providerInstanceEnvironmentOverrides(environment) };
}
