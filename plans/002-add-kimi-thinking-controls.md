> **Retired:** Kimi support was removed from this fork at the maintainer’s request.
> Historical reference only; do not implement or reapply this plan.

# Plan 002: Add Kimi thinking controls to the composer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update this plan and `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 89ee692bf..HEAD -- apps/server/src/provider/acp/KimiAcpSupport.ts apps/server/src/provider/Layers/KimiProvider.ts apps/web/src/components/chat apps/mobile/src/lib/providerOptions.ts`
> The Kimi implementation is currently an uncommitted worktree change, so also
> compare the excerpts below with the live files. Any mismatch is a STOP
> condition until the plan is reconciled.

## Status

- **State**: DONE
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-add-kimi-code-provider.md`
- **Category**: bug / direction
- **Planned at**: commit `89ee692bf`, 2026-08-08

## Why this matters

Kimi Code exposes thinking through ACP as a model-dependent select. Depending
on the selected model, its values are `off` / `on` or `off` plus concrete
efforts such as `low`, `high`, and `max`. T3 currently discovers Kimi models
with empty option descriptors, so the web composer and mobile thread-settings
sheet cannot show, persist, or deliberately apply the effective thinking
level. Users therefore inherit an invisible CLI/session default.

Represent Kimi thinking as one select named `Thinking`, with choices supplied
verbatim by ACP. Do not create separate Enabled and Effort controls: that would
permit contradictory states such as `enabled=false` with `effort=high`.

## Current state

- `apps/server/src/provider/acp/KimiAcpSupport.ts:100-119` converts Kimi's ACP
  model picker into `ServerProviderModel` values but hard-codes
  `optionDescriptors: []`.
- `apps/server/src/provider/acp/KimiAcpSupport.ts:166-173` forwards a stored
  `thinking` selection only when ACP negotiates that option. This path already
  accepts the contract's string values, but its tests incorrectly model Kimi
  0.34.0 thinking as a boolean.
- `apps/server/src/provider/Layers/KimiProvider.ts:102-119` creates one temporary
  ACP session and reads only its initial config snapshot. Because thinking
  choices are model-dependent, discovery must select each advertised model and
  re-read config options serially before deleting the temporary session.
- `packages/contracts/src/model.ts:24-30` already supports the required select
  descriptor shape. No contract or persistence migration is needed.
- `apps/web/src/components/chat/TraitsPicker.tsx` renders every advertised
  select descriptor in the composer and persists the full selection through
  `composerDraftStore`. Kimi-specific rendering must not be added.
- `apps/mobile/src/lib/providerOptions.ts` and
  `apps/mobile/src/features/threads/ThreadSettingsSheet.tsx` already render and
  persist generic select descriptors. Kimi-specific rendering must not be
  added.

The required descriptor for a model whose ACP snapshot advertises
`off`, `low`, `high`, and `max` is structurally:

```ts
{
  id: "thinking",
  label: "Thinking",
  type: "select",
  options: [
    { id: "off", label: "Thinking Off" },
    { id: "low", label: "Thinking Low" },
    { id: "high", label: "Thinking High", isDefault: true },
    { id: "max", label: "Thinking Max" },
  ],
  currentValue: "high",
}
```

Use ACP's option names as labels. `isDefault` means the value Kimi reported as
current when the model was probed; it must not be guessed from ordering.

## Commands you will need

| Purpose          | Command                                                                                                                                                                    | Expected on success |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Format           | `vp fmt <changed-files>`                                                                                                                                                   | exit 0              |
| Server tests     | `vp test run apps/server/src/provider/acp/KimiAcpSupport.test.ts apps/server/src/provider/Layers/KimiProvider.test.ts apps/server/src/provider/Layers/KimiAdapter.test.ts` | all pass            |
| Web tests        | `vp test run apps/web/src/components/chat/TraitsPicker.test.ts apps/web/src/components/chat/composerProviderState.test.tsx`                                                | all pass            |
| Mobile tests     | `vp test run apps/mobile/src/lib/providerOptions.test.ts apps/mobile/src/lib/modelOptions.test.ts`                                                                         | all pass            |
| Server typecheck | `pnpm --dir apps/server run typecheck`                                                                                                                                     | exit 0, no errors   |
| Web typecheck    | `pnpm --dir apps/web run typecheck`                                                                                                                                        | exit 0, no errors   |
| Mobile typecheck | `pnpm --dir apps/mobile run typecheck`                                                                                                                                     | exit 0, no errors   |

Do not run repo-wide checks. Do not launch a browser or simulator unless the
user explicitly approves computer use.

## Scope

**In scope**:

- `apps/server/src/provider/acp/KimiAcpSupport.ts`
- `apps/server/src/provider/acp/KimiAcpSupport.test.ts`
- `apps/server/src/provider/Layers/KimiProvider.ts`
- `apps/server/src/provider/Layers/KimiProvider.test.ts`
- `apps/server/src/provider/Layers/KimiAdapter.test.ts`
- `apps/web/src/components/chat/TraitsPicker.test.ts`
- `apps/web/src/components/chat/composerProviderState.test.tsx`
- `apps/mobile/src/lib/providerOptions.test.ts`
- `apps/mobile/src/lib/modelOptions.test.ts`
- `docs/user/providers-kimi.md`
- `plans/002-add-kimi-thinking-controls.md`
- `plans/README.md`

**Out of scope**:

- Contract schema changes or database migrations; the generic option contract
  already carries string selections.
- Provider-specific branches in web or mobile UI components.
- Changing Codex `reasoningEffort`, Claude effort, or Cursor reasoning behavior.
- Persisting changes back into `~/.kimi-code/config.toml`; this is a per-thread
  T3 selection sent through ACP.
- Hard-coding `low`, `high`, or `max`; available values are model-owned.

## Git workflow

- Use conventional commits if asked to commit, for example:
  `feat(kimi): expose thinking effort in the composer`.
- Do not push or open a pull request unless explicitly requested.
- Preserve unrelated worktree changes.

## Steps

### Step 1: Parse Kimi's negotiated thinking select

In `KimiAcpSupport.ts`, add a pure conversion from the ACP config option with
ID `thinking` to a T3 select `ProviderOptionDescriptor`:

1. Accept only ACP `type: "select"` for Kimi 0.34.0 and newer.
2. Flatten grouped and ungrouped choices using the existing select flattener.
3. Trim IDs and labels, remove blank IDs, and deduplicate by ID while
   preserving ACP order.
4. Preserve ACP labels and descriptions when present.
5. Set `currentValue` only when it matches an advertised choice.
6. Mark that matching choice `isDefault: true` so untouched composer state
   dispatches Kimi's current effective default.
7. Return no descriptor when the option is absent or has no usable choices.

Update `kimiModelsFromConfigOptions` or introduce a narrowly named companion
helper so each `ServerProviderModel` receives the capabilities captured for
that model.

**Verify**: extend `KimiAcpSupport.test.ts` with realistic select fixtures for
`off/on`, `off/low/high/max`, grouped choices, duplicates/blanks, and an absent
thinking option. Run the focused server test; all cases pass.

### Step 2: Discover capabilities per Kimi model

In `KimiProvider.ts`, keep the existing temporary ACP session but probe models
serially:

1. Read the initial model option and remember its current model ID.
2. For each advertised model choice, call `setConfigOption("model", modelId)`.
3. Re-read `getConfigOptions` after the call; Kimi updates the thinking select
   to match the newly selected model.
4. Build that model with only the thinking descriptor from its own snapshot.
5. Preserve the original model as `isDefault`, independent of the last model
   selected during probing.
6. Continue deleting the temporary session in `Effect.ensuring`, including on
   partial failure.
7. Keep probing sequential. Do not parallelize mutations of one ACP session.

If one model rejects selection, fail the discovery attempt and retain the
provider's existing fallback behavior rather than publishing partially wrong
capabilities.

**Verify**: add a stateful fake ACP runtime test proving two models can expose
different thinking choices, the original default remains marked, call order is
serial, and temporary-session deletion still runs on failure.

### Step 3: Validate and apply the selected effort after model selection

In `applyKimiSessionConfiguration`, retain the required order:

1. Apply `model` first.
2. Re-read config options.
3. If a `thinking` selection exists, require it to be a string and require the
   freshly negotiated thinking select to advertise that value.
4. Send `setConfigOption("thinking", value)`.
5. Apply `mode` last.

An absent stored selection means "inherit the Kimi session/default value" and
must not force `off`. An invalid or stale selection must produce a clear
provider validation error instead of silently choosing another effort.

Replace the boolean Kimi fixture with the real select shape. Test `off`, a
concrete effort (`high`), no selection, no negotiated thinking option, stale
effort rejection, and exact call order.

**Verify**: run the three focused Kimi server test files; all pass.

### Step 4: Prove the generic clients render and persist Kimi thinking

No production UI component should need modification. Add focused integration
fixtures using provider `kimi` and a model capability containing the Thinking
select:

- Web: verify the traits control renders, its trigger reflects `High`, changing
  to `Off` yields `{ id: "thinking", value: "off" }`, and composer dispatch
  includes the selected value.
- Mobile: verify descriptor resolution, summary labels, option mutation, and a
  newly selected Kimi model's default selection.

If these tests reveal a generic UI defect, stop and report before adding a
Kimi-only condition.

**Verify**: run the focused web and mobile tests; all pass.

### Step 5: Document scope and inheritance

Update `docs/user/providers-kimi.md` in shipped-product language:

- The composer exposes the values supported by the selected Kimi model.
- `Off` disables thinking when the model permits it.
- Selecting an effort applies it to the T3 thread/session through ACP.
- Leaving a thread without a stored selection inherits Kimi's own configured or
  resumed-session value.
- Always-thinking models may omit `Off`.

Do not mention source paths, test tooling, or implementation internals.

**Verify**: `vp fmt docs/user/providers-kimi.md` exits 0.

### Step 6: Run final targeted verification

Format all changed files, run the server/web/mobile focused test commands, then
run the three scoped typechecks. Inspect `git diff --check` and `git status` to
confirm only in-scope files changed beyond the user's pre-existing worktree.

## Test plan

- ACP parsing: boolean-era fixture removed; select values, defaults, grouping,
  malformed entries, and missing option covered.
- Discovery: per-model capabilities and serial mutation covered.
- Adapter: new session, resumed session, and per-turn application preserve the
  model → thinking → mode order.
- Web: Kimi Thinking appears in the composer and persists `off` / effort.
- Mobile: Kimi Thinking appears in the existing settings sheet and updates the
  model selection.
- Regression: models without negotiated thinking expose no control and inherit
  Kimi behavior unchanged.

## Done criteria

- [ ] Kimi models expose an ACP-derived select descriptor named `Thinking`.
- [ ] Options exactly match the selected model's negotiated ACP values.
- [ ] The current ACP value is the untouched/default composer selection.
- [ ] Web and mobile show and persist the option through generic UI paths.
- [ ] Server sends model → thinking → mode, using string effort values.
- [ ] Missing thinking selection inherits Kimi state; it never implicitly means
      off.
- [ ] Invalid/stale efforts fail clearly.
- [ ] All targeted tests and scoped typechecks pass.
- [ ] `git diff --check` reports no errors.
- [ ] No browser or simulator was launched without approval.

## STOP conditions

Stop and report instead of improvising if:

- Installed Kimi 0.34.0 advertises a non-select thinking option in a real ACP
  probe; reconcile the version gate and protocol before changing contracts.
- Selecting a model does not synchronously refresh `getConfigOptions`; the
  discovery design then needs a receipt/notification-based boundary.
- Correct implementation requires storing provider credentials or reading raw
  provider configuration.
- A generic web/mobile test fails in a way that appears to require a
  provider-specific UI branch.
- Any verification command fails twice after a reasonable correction.

## Maintenance notes

- Kimi owns the effort vocabulary; never assume the current `low/high/max` set
  is permanent.
- Review future Kimi minimum-version bumps against ACP's `thinking` option type
  and config-update semantics.
- The per-model probe adds one lightweight ACP config mutation per advertised
  model during provider refresh. Review latency if Kimi later advertises a very
  large catalog; do not add parallel mutations to a single session.
