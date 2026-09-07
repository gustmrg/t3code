# Plan 001: Add Kimi Code as a first-party provider

> **Executor instructions**: Follow this plan phase by phase and step by step.
> Run every verification command and confirm the expected result before moving
> on. If anything in "STOP conditions" occurs, stop and report; do not
> improvise. When done, update the status row in `plans/README.md`, unless a
> reviewer explicitly says they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 89ee692bf..HEAD -- packages/contracts/src apps/server/src/provider apps/server/src/textGeneration apps/web/src apps/mobile/src docs README.md`
> If an in-scope file changed since this plan was written, compare the "Current
> state" excerpts with live code before proceeding. A load-bearing mismatch is
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L (estimated 4–7 engineering days)
- **Risk**: HIGH
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `89ee692bf`, 2026-08-08

## Why this matters

T3 Code currently supports Codex, Claude Code, Cursor, Grok, and OpenCode, but a
user with a configured Kimi Code subscription cannot select or run it. Kimi Code
0.34.0 exposes an ACP stdio server through `kimi acp`, so most transport and
orchestration behavior can reuse T3's existing ACP runtime. The risky part is
semantic: Kimi multiplexes tool approvals, ask-user questions, and plan reviews
over `session/request_permission`; choosing the first `allow_once` option would
silently answer questions or pick a plan on the user's behalf.

The finished change makes Kimi Code an Early Access, multi-instance provider on
web, desktop (through the web client), and mobile. It supports install/auth
status, ACP model discovery, new and resumed conversations, attachments, mode
mapping, cancellation, user questions, plan review, and background text
generation without reading or logging provider secrets.

## Current state

### T3 Code facts

- `packages/contracts/src/providerInstance.ts` defines `ProviderDriverKind` as
  an open branded slug. Do not replace it with a closed provider union.
- `packages/contracts/src/settings.ts:265-317` uses
  `makeProviderSettingsSchema` for provider settings. The legacy provider mirror
  is still load-bearing:

  ```ts
  providers: Schema.Struct({
    codex: CodexSettings.pipe(...),
    claudeAgent: ClaudeSettings.pipe(...),
    cursor: CursorSettings.pipe(...),
    grok: GrokSettings.pipe(...),
    opencode: OpenCodeSettings.pipe(...),
  })
  ```

- `apps/server/src/provider/builtInDrivers.ts:47-53` is the registration point:

  ```ts
  export const BUILT_IN_DRIVERS = [
    CodexDriver,
    ClaudeDriver,
    CursorDriver,
    GrokDriver,
    OpenCodeDriver,
  ];
  ```

- `apps/server/src/provider/Layers/ProviderInstanceRegistryHydration.ts:55-94`
  derives default instances by indexing `settings.providers` with every built-in
  driver's slug. A `kimi` driver therefore requires a matching legacy settings
  key even though `providerInstances` is the forward-looking storage model.
- `apps/server/src/provider/acp/AcpSessionRuntime.ts:207-222` already exposes
  `setMode`, `setConfigOption`, and `setModel`. It tracks configuration options
  returned by new/load/resume and sends `session/set_config_option`.
- Cursor and Grok are the closest server exemplars:
  `Drivers/CursorDriver.ts`, `Layers/CursorAdapter.ts`,
  `Layers/CursorProvider.ts`, `acp/CursorAcpSupport.ts`, and their Grok siblings.
  Match their per-instance closure, snapshot, scoped process, event, resume,
  cancellation, and text-generation patterns. Do not introduce a second ACP
  transport abstraction.
- `apps/server/src/provider/Layers/CursorAdapter.ts:300-317` and
  `GrokAdapter.ts:184-203` select approval options by ACP `kind`. That generic
  approach is unsafe for Kimi questions and plan review because several choices
  legitimately have `kind: "allow_once"`.
- Canonical T3 questions are already represented by
  `UserInputQuestion` in `packages/contracts/src/providerRuntime.ts:444-464` and
  emitted as `user-input.requested` / `user-input.resolved`. Use this existing
  contract; do not add a Kimi-specific wire event.
- Web provider metadata is a hardcoded list in
  `apps/web/src/components/settings/providerDriverMeta.ts:31-73`; model pickers
  have another hardcoded list in `apps/web/src/session-logic.ts:34-55`; icons are
  mapped in `apps/web/src/components/chat/providerIconUtils.ts` and implemented
  in `apps/web/src/components/Icons.tsx`.
- Mobile uses the separate React Native implementation in
  `apps/mobile/src/components/ProviderIcon.tsx`. Desktop wraps the web client and
  needs no separate provider UI when the web path is complete.
- User docs are indexed by `docs/README.md`; root `README.md:74` links the
  provider guides.

### Verified Kimi Code facts

The investigation used the locally installed CLI at
`/Users/gmiranda/.kimi-code/bin/kimi`, version `0.34.0`, and the official
Moonshot AI repository `https://github.com/MoonshotAI/kimi-code` at reference
commit `01c74e93`. These are evidence, not paths to import from.

- `kimi acp` is a clean JSON-RPC stdio entry point. A read-only initialize and
  authenticate probe negotiated ACP protocol version 1 and auth method `login`.
- Official reference `docs/en/reference/kimi-acp.md` says new/load/resume,
  prompt, cancel, image input, embedded resources, HTTP/SSE MCP forwarding, and
  `session/set_config_option` are supported. New/load/resume return
  `configOptions`.
- Kimi advertises `model`, `thinking`, and `mode` through ACP config options.
  Use these negotiated IDs and values; do not hardcode a model catalog.
- The supported mode values are `default`, `plan`, and `yolo`. Required mapping:

  | T3 state                           | Kimi mode |
  | ---------------------------------- | --------- |
  | `interactionMode: "plan"`          | `plan`    |
  | `runtimeMode: "approval-required"` | `default` |
  | `runtimeMode: "full-access"`       | `yolo`    |

- Kimi's standard tool choices use option IDs `approve_once`,
  `approve_always`, and `reject` (with legacy aliases possible).
- Kimi ask-user choices use `q0_opt_<index>` and `q0_skip`. Plan review uses
  `plan_opt_<index>`, `plan_approve`, `plan_revise`, and
  `plan_reject_and_exit`. Their display names are the values that must be
  returned to Kimi.
- Kimi persists sessions created by `session/new`. Version 0.34.0 accepts the
  raw ACP request `session/delete`; every temporary discovery or text-generation
  session must invoke it in cleanup. Normal user conversation sessions must not
  be deleted by that helper.
- The official icon source is
  `apps/vscode/resources/kimi-icon.svg` in the Kimi repository. Reproduce its
  small 24×24 current-color robot outline as repo-native SVG/React Native SVG;
  do not add a runtime dependency or import from the cached checkout.
- Never invoke, parse, log, snapshot, or recommend `kimi provider list --json`:
  it can include provider configuration and API keys.

## Commands you will need

Run commands from the repository root unless the command starts with `cd`.
Do not run repo-wide checks (`vp check`, recursive tests, or recursive
typechecks).

| Purpose                 | Command                                                                                                                                                                                     | Expected on success                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Contract tests          | `vp test run packages/contracts/src/settings.test.ts packages/contracts/src/providerInstance.test.ts`                                                                                       | exit 0; selected tests pass                               |
| ACP/runtime tests       | `vp test run apps/server/src/provider/acp/AcpSessionRuntime.test.ts apps/server/src/provider/acp/KimiAcpSupport.test.ts`                                                                    | exit 0; selected tests pass                               |
| Provider tests          | `vp test run apps/server/src/provider/Layers/KimiProvider.test.ts apps/server/src/provider/Layers/KimiAdapter.test.ts apps/server/src/provider/Layers/ProviderInstanceRegistryLive.test.ts` | exit 0; selected tests pass                               |
| Text-generation tests   | `vp test run apps/server/src/textGeneration/KimiTextGeneration.test.ts`                                                                                                                     | exit 0; selected tests pass                               |
| Web tests               | `vp test run apps/web/src/components/settings/ProviderSettingsForm.test.ts apps/web/src/session-logic.test.ts`                                                                              | exit 0; selected tests pass                               |
| Mobile tests            | `vp test run apps/mobile/src/lib/providerOptions.test.ts`                                                                                                                                   | exit 0; selected tests pass                               |
| Contracts typecheck     | `cd packages/contracts && vp run typecheck`                                                                                                                                                 | exit 0; no type errors                                    |
| Server typecheck        | `cd apps/server && vp run typecheck`                                                                                                                                                        | exit 0; no type errors                                    |
| Web typecheck           | `cd apps/web && vp run typecheck`                                                                                                                                                           | exit 0; no type errors                                    |
| Mobile typecheck        | `cd apps/mobile && vp run typecheck`                                                                                                                                                        | exit 0; no type errors                                    |
| Optional real CLI probe | `T3_KIMI_ACP_PROBE=1 vp test run apps/server/src/provider/acp/KimiAcpCliProbe.test.ts`                                                                                                      | exit 0; initialize/auth/new/config/delete assertions pass |

The real CLI probe is opt-in and should only be run on a machine whose operator
has configured Kimi Code. It must not send a model prompt, alter global Kimi
configuration, print credentials, or leave a session behind.

## Scope

**In scope** (the only source/docs files to modify or create):

- `packages/contracts/src/settings.ts`
- `packages/contracts/src/settings.test.ts`
- `packages/contracts/src/model.ts`
- `apps/server/src/provider/acp/AcpSessionRuntime.ts`
- `apps/server/src/provider/acp/AcpSessionRuntime.test.ts`
- `apps/server/src/provider/acp/KimiAcpSupport.ts` (create)
- `apps/server/src/provider/acp/KimiAcpSupport.test.ts` (create)
- `apps/server/src/provider/acp/KimiAcpCliProbe.test.ts` (create)
- `apps/server/src/provider/Services/KimiAdapter.ts` (create)
- `apps/server/src/provider/Layers/KimiAdapter.ts` (create)
- `apps/server/src/provider/Layers/KimiAdapter.test.ts` (create)
- `apps/server/src/provider/Layers/KimiProvider.ts` (create)
- `apps/server/src/provider/Layers/KimiProvider.test.ts` (create)
- `apps/server/src/provider/Drivers/KimiDriver.ts` (create)
- `apps/server/src/provider/builtInDrivers.ts`
- `apps/server/src/provider/Layers/ProviderInstanceRegistryHydration.ts`
- `apps/server/src/provider/Layers/ProviderInstanceRegistryLive.test.ts`
- `apps/server/src/textGeneration/KimiTextGeneration.ts` (create)
- `apps/server/src/textGeneration/KimiTextGeneration.test.ts` (create)
- `apps/web/src/components/Icons.tsx`
- `apps/web/src/components/chat/providerIconUtils.ts`
- `apps/web/src/components/settings/providerDriverMeta.ts`
- `apps/web/src/components/settings/ProviderSettingsForm.test.ts`
- `apps/web/src/session-logic.ts`
- `apps/web/src/session-logic.test.ts`
- `apps/mobile/src/components/ProviderIcon.tsx`
- `apps/mobile/src/lib/providerOptions.test.ts`
- `docs/user/providers-kimi.md` (create)
- `docs/internals/providers.md`
- `docs/README.md`
- `README.md`
- `plans/README.md`

If the live code demonstrates that a provider registry test belongs in
`ProviderRegistry.test.ts` rather than `ProviderInstanceRegistryLive.test.ts`,
STOP and report the proposed one-file scope substitution before editing it.

**Out of scope**:

- Modifying `.repos/`, the cached Kimi checkout, the installed Kimi CLI, or any
  files under `~/.kimi-code`.
- Reading or copying API keys, access tokens, Kimi provider JSON, or the live T3
  database. Tests must use fake values and temporary directories.
- A broad refactor that unifies Cursor, Grok, and Kimi adapters. Reuse shared ACP
  primitives, but keep Kimi's wire semantics at its adapter boundary.
- Adding new orchestration event types or changing the public question/approval
  schemas. Existing canonical events are sufficient.
- Implementing ACP terminal reverse-RPC, audio prompts, session list UI, logout,
  or provider management.
- Adding a Kimi update installer. Manual-only maintenance status is sufficient.
- Browser, simulator, or desktop GUI verification without explicit operator
  approval.
- Pushing a branch or opening a pull request.

## Git workflow

- Suggested branch: `feat/kimi-code-provider`.
- Commit at phase boundaries when practical. Use Conventional Commits, for
  example `feat(server): add Kimi Code provider`.
- Preserve unrelated worktree changes. Do not commit them.
- Do not push or open a PR unless the operator explicitly requests it.

## Phase 1 — Contracts and provider identity

### Step 1.1: Add Kimi settings and defaults

In `packages/contracts/src/settings.ts`, add `KimiSettings` through
`makeProviderSettingsSchema` with these fields:

- `enabled`, default `true`, hidden in the generated form;
- `binaryPath`, using `makeBinaryPathSetting("kimi")`, label and placeholder
  matching the other CLI providers;
- `customModels`, default `[]`, hidden. This remains a fallback/override when ACP
  discovery is temporarily unavailable.

Add `kimi` to both `ServerSettings.providers` and `ServerSettingsPatch.providers`
with a matching `KimiSettingsPatch`. Export the inferred `KimiSettings` type.
Do not add auth tokens or provider configuration fields.

In `packages/contracts/src/settings.test.ts`, assert default decoding, custom
binary path/custom model decoding, and patch decoding for the `kimi` key.

In `packages/contracts/src/model.ts`, add a `KIMI_DRIVER_KIND` and use a stable
fallback model only where the current API requires one. Prefer the discovered
ACP current model; do not invent aliases or expose a guessed catalog. If the
existing selection code handles a provider absent from `DEFAULT_MODEL_BY_PROVIDER`,
leave Kimi absent and test/use the snapshot's default instead.

**Verify**:
`vp test run packages/contracts/src/settings.test.ts packages/contracts/src/providerInstance.test.ts`
→ exit 0 and all selected tests pass.

### Step 1.2: Prove legacy hydration and open-slug compatibility

Add a focused case to
`apps/server/src/provider/Layers/ProviderInstanceRegistryLive.test.ts` proving
that `providers.kimi` synthesizes default instance ID `kimi`, and that an
explicit `providerInstances.kimi` entry wins over the legacy mirror. Keep
`ProviderDriverKind` open.

Do not register `KimiDriver` in `BUILT_IN_DRIVERS` yet; the phase should remain
type-correct while server implementation is absent.

**Verify**:
`vp test run apps/server/src/provider/Layers/ProviderInstanceRegistryLive.test.ts`
→ exit 0; the two Kimi hydration assertions pass.

## Phase 2 — Shared ACP lifecycle support

### Step 2.1: Make configuration snapshots authoritative

In `apps/server/src/provider/acp/AcpSessionRuntime.ts`, confirm and, if needed,
fix the shared config-option path so the runtime replaces its local
`configOptions` snapshot with the array returned by
`session/set_config_option`. Also ensure inbound
`session/update { sessionUpdate: "config_option_update" }` refreshes the same
reference. This is needed because changing Kimi's model, thinking flag, or mode
can update more than one option/current value.

Keep this provider-neutral and add regression tests to
`AcpSessionRuntime.test.ts` for:

- set-config response updates current values and allowed values;
- inbound config-option update updates `getConfigOptions`;
- no-op writes do not send a duplicate request;
- invalid values fail before a request is sent.

If the generated `effect-acp` schema cannot decode Kimi 0.34's
`config_option_update`, STOP; do not cast the payload to `any`.

**Verify**:
`vp test run apps/server/src/provider/acp/AcpSessionRuntime.test.ts`
→ exit 0; all shared ACP tests pass.

### Step 2.2: Add a scoped raw session-delete helper

Expose the smallest typed helper needed to send raw
`session/delete { sessionId }` through the runtime's already logged generic ACP
request path. Put Kimi-specific request/response schemas and the helper wrapper
in `KimiAcpSupport.ts`; keep the shared runtime generic. The helper must only be
called by code that explicitly owns a temporary session ID.

Use `Effect.ensuring`/scope finalization so deletion is attempted after success,
failure, interruption, and timeout. Cleanup failure may be logged/surfaced as a
health warning, but must never reveal raw protocol payloads containing secrets.
Do not attach automatic deletion to `runtime.stop`, because normal chat sessions
are durable and resumable.

**Verify**:
`vp test run apps/server/src/provider/acp/KimiAcpSupport.test.ts apps/server/src/provider/acp/AcpSessionRuntime.test.ts`
→ exit 0; a mock peer records exactly one delete for each temporary session and
zero deletes for ordinary runtime shutdown.

## Phase 3 — Kimi ACP support and provider snapshot

### Step 3.1: Implement Kimi ACP launch and option parsing

Create `apps/server/src/provider/acp/KimiAcpSupport.ts`, modeled structurally on
`CursorAcpSupport.ts`/`GrokAcpSupport.ts`, with:

- spawn input `{ command: binaryPath || "kimi", args: ["acp"], cwd, env }`;
- auth method `login`;
- client capabilities for file read/write plus Kimi-supported image and embedded
  context content; preserve shared MCP forwarding behavior;
- pure parsers that find `model`, `thinking`, and `mode` by config option ID and
  turn picker choices into T3 `ServerProviderModel` values;
- model selection through `setConfigOption("model", value)` and optional thinking
  selection only when a negotiated `thinking` option is present;
- the exact T3-to-Kimi mode mapping from "Current state";
- version gate constant `0.34.0` checked with
  `@t3tools/shared/semver`, not string comparison.

Unknown option IDs must be ignored, and invalid configured values must produce a
clear provider error. Never infer Kimi behavior from option display order.

Add unit tests for the spawn command, auth method, model extraction,
current/default model selection, thinking option present/absent, all three mode
mappings, and unsupported values.

**Verify**:
`vp test run apps/server/src/provider/acp/KimiAcpSupport.test.ts`
→ exit 0; every parser and mapping case passes.

### Step 3.2: Implement install/auth/model health snapshots

Create `KimiProvider.ts` and `KimiProvider.test.ts`, using `GrokProvider.ts` as
the closest pattern and `OpenCodeProvider.ts` for semver comparison. It must:

1. Return disabled/pending snapshots without running the CLI when disabled.
2. Resolve the configured executable and collect `kimi --version` with a short
   timeout and sanitized errors.
3. Mark versions below 0.34.0 unsupported with an actionable upgrade message.
4. Start a temporary `kimi acp` runtime, initialize/authenticate, create one
   session, read model choices/current value from `configOptions`, then delete
   that session in guaranteed cleanup.
5. Merge discovered models with normalized `customModels`, deduplicate by slug,
   and mark the negotiated current model as default.
6. Cache/probe through the existing managed provider snapshot path; do not probe
   on every UI render or model-picker open.
7. Report missing credentials as an auth-required provider status, not an
   installation failure.

Presentation: display name `Kimi Code`, badge `Early Access`, interaction-mode
toggle enabled, and new-thread requirement consistent with whether live model
changes are proven safe in adapter tests.

Tests must use executable mock scripts/peers in scoped temporary directories and
cover disabled, binary missing, version failure with secret stderr redaction,
unsupported version, auth-required, discovered models, custom fallback models,
timeout, and delete-on-every-exit-path.

**Verify**:
`vp test run apps/server/src/provider/Layers/KimiProvider.test.ts`
→ exit 0; all snapshot cases pass and cleanup assertions show no leaked probe
session.

### Step 3.3: Add the opt-in real CLI compatibility probe

Create `KimiAcpCliProbe.test.ts` guarded by `T3_KIMI_ACP_PROBE=1`. Against the
operator's configured CLI it should assert:

- initialize returns protocol 1 and identifies Kimi;
- authenticate with `login` succeeds;
- new session returns a nonempty session ID and `model`/`mode` config options;
- setting each option to its existing current value succeeds;
- raw `session/delete` succeeds in guaranteed cleanup.

Do not prompt the model. Do not print response payloads. A failed assertion must
still attempt deletion.

**Verify**: leave the probe skipped in normal test runs. If the operator has
authorized use of their configured CLI, run the optional command from the table
and expect exit 0 with no remaining probe session.

## Phase 4 — Runtime adapter and interaction correctness

### Step 4.1: Implement the adapter shell and lifecycle

Create `Services/KimiAdapter.ts` as the provider-specific shape anchor and
`Layers/KimiAdapter.ts`/`.test.ts`, following Grok's adapter structure. Implement:

- per-thread scoped ACP process creation;
- new session and load/resume from an opaque versioned resume payload containing
  only the Kimi session ID;
- prompt streaming through canonical runtime events;
- tool-call start/update/completion, plan updates, agent text/thoughts, usage if
  supplied, prompt completion, cancellation, and stop;
- text, image, resource, and resource-link prompt conversion using shared ACP
  converters; reject unsupported audio with an actionable adapter error;
- mode/model/thinking configuration before the prompt starts;
- pending callback cleanup on cancel, stop, or process failure.

Keep raw native event logging behind the existing sanitized event logger. Never
include Kimi configuration files, environment credentials, or full provider
JSON in snapshots or errors.

**Verify**:
`vp test run apps/server/src/provider/Layers/KimiAdapter.test.ts`
→ exit 0; mocked new/resume/prompt/cancel/content cases pass.

### Step 4.2: Classify permission, question, and plan-review callbacks

Before applying full-access auto-approval, classify each Kimi
`session/request_permission` callback from its option-ID namespace:

- standard `approve_*`/`reject` options → canonical T3 approval request;
- `q<index>_opt_<index>` / `q<index>_skip` → canonical T3
  `user-input.requested`;
- `plan_opt_*`, `plan_approve`, `plan_revise`, or
  `plan_reject_and_exit` → canonical T3 `user-input.requested`, with labels and
  descriptions preserved as choices.

Questions and plan review must still reach the user in `full-access`; only
standard tool approval may auto-select `approve_always` then `approve_once`.
Maintain a pending map keyed by `ApprovalRequestId`. On
`respondToUserInput`, translate the selected T3 label back to the exact Kimi
`optionId`; on cancellation/empty response return ACP `cancelled` or the explicit
skip/revise choice only when the user's action means that. Unknown IDs and stale
answers must fail closed and must never choose the first `allow_once` entry.

Tests are the release gate. Cover at minimum:

- ordinary accept once, accept for session, reject, and cancel;
- ordinary full-access auto-approval;
- one Kimi question with 3 choices, skip, cancellation, stale answer, and an
  unknown option namespace;
- plan with 2 alternatives, approve fallback, revise, reject-and-exit;
- question and plan callbacks in full-access still emit user-input events;
- concurrent callbacks remain correlated to their own thread/turn/request;
- stop/cancel resolves pending callbacks and leaves no hanging fiber.

**Verify**:
`vp test run apps/server/src/provider/Layers/KimiAdapter.test.ts`
→ exit 0; every named interaction case passes.

## Phase 5 — Driver registration and text generation

### Step 5.1: Add scoped Kimi text generation

Create `KimiTextGeneration.ts` and its test from the Grok text-generation
pattern. For commit messages, PR content, branch names, and thread titles:

- reuse `TextGenerationPrompts.ts`, structured JSON extraction, sanitizers, and
  the caller's model selection;
- create a temporary Kimi ACP session, apply negotiated model/options, prompt,
  collect only agent text, validate against the requested schema, and enforce a
  bounded timeout;
- always delete the temporary Kimi session, including invalid JSON, timeout,
  interruption, and provider failure paths;
- never reuse/delete a user chat session.

Tests must cover all four operations, invalid/empty output, timeout, model
selection, and exactly-once deletion on success and each failure path.

**Verify**:
`vp test run apps/server/src/textGeneration/KimiTextGeneration.test.ts`
→ exit 0; all operations and cleanup paths pass.

### Step 5.2: Bundle and register the first-party driver

Create `Drivers/KimiDriver.ts` modeled on `GrokDriver.ts`. Set driver kind
`kimi`, display name `Kimi Code`, multiple instances `true`, manual-only update
maintenance, merged per-instance environment, managed status snapshot, Kimi
adapter, and Kimi text generation. Stamp instance identity and continuation
identity exactly as other drivers do.

Then update `builtInDrivers.ts` to import Kimi, include `KimiDriverEnv` in
`BuiltInDriversEnv`, and place `KimiDriver` after Grok and before OpenCode. Ensure
legacy hydration's dynamic access remains sound now that `settings.providers`
has the matching `kimi` key.

Add/extend registry tests to prove the built-in driver is discoverable,
disabled settings stay disabled, and multiple Kimi instances remain isolated by
config/environment/continuation identity.

**Verify**:
`vp test run apps/server/src/provider/Layers/KimiProvider.test.ts apps/server/src/provider/Layers/KimiAdapter.test.ts apps/server/src/provider/Layers/ProviderInstanceRegistryLive.test.ts`
→ exit 0; Kimi is registered and instance isolation tests pass.

## Phase 6 — Web, desktop, mobile, and docs

### Step 6.1: Add browser-client presentation

In `Icons.tsx`, add a current-color `KimiIcon` based on the official 24×24 icon.
Register it in `providerIconUtils.ts`. In `providerDriverMeta.ts`, add Kimi Code
with value `kimi`, `KimiSettings`, and `Early Access`. Add Kimi to
`session-logic.ts` wherever provider choices/order are hardcoded.

Extend tests to prove Kimi:

- appears once in Add Provider and model-provider lists;
- uses the generated binary-path form and Early Access badge;
- remains selectable only according to the same availability/status rules as
  other providers;
- renders the Kimi icon rather than the unknown-provider fallback.

Desktop requires no separate code because it wraps this web UI. Check all web
entry points that consume the shared hardcoded arrays: settings, chat/model
picker, command palette, and any keybinding-driven new-thread path.

**Verify**:
`vp test run apps/web/src/components/settings/ProviderSettingsForm.test.ts apps/web/src/session-logic.test.ts`
→ exit 0; Kimi metadata and selection assertions pass.

### Step 6.2: Add the React Native icon and provider option coverage

Add a `provider === "kimi"` branch to
`apps/mobile/src/components/ProviderIcon.tsx` using the same 24×24 geometry and
theme-aware `currentColor` equivalent. Preserve the generic fallback for truly
unknown drivers. Extend `apps/mobile/src/lib/providerOptions.test.ts` to prove a
Kimi server snapshot appears in the mobile model/provider options and retains
its driver slug.

**Verify**:
`vp test run apps/mobile/src/lib/providerOptions.test.ts`
→ exit 0; selected mobile tests pass.

### Step 6.3: Document setup, capabilities, and limitations

Create `docs/user/providers-kimi.md` in shipped-product voice. Document:

- install/configure Kimi Code separately, authenticate with `kimi login`, then
  verify `kimi --version` is at least 0.34.0;
- default executable `kimi` and optional binary-path override;
- Early Access label, supported attachments, model discovery, plan/default/full
  access mode behavior, resume, and remote-environment rule (CLI and credentials
  live on the T3 server environment, not necessarily the viewing client);
- troubleshooting for missing binary, outdated CLI, auth required, empty model
  catalog, and failed ACP startup;
- no tokens should be pasted into T3 provider settings.

Update `docs/README.md`, root `README.md`, and
`docs/internals/providers.md`. The internals doc should identify the Kimi adapter
as ACP, explain temporary-session deletion, and record the permission/question/
plan classifier invariant for future maintainers.

**Verify**:
`rg -n "Kimi Code|providers-kimi" README.md docs/README.md docs/user/providers-kimi.md docs/internals/providers.md`
→ matches exist in all four files, and no line contains an API key/token value.

## Phase 7 — Integrated focused verification

### Step 7.1: Run the focused suite and package typechecks

Run every non-optional test command in "Commands you will need", followed by the
four package-scoped typechecks. Fix only failures caused by this change. Do not
expand to a repo-wide test/typecheck unless explicitly instructed.

**Verify**: every command exits 0 with no test or type errors.

### Step 7.2: Audit scope, secrets, and provider coverage

Run:

```sh
git status --short
rg -n "provider list --json|api[_-]?key|access[_-]?token" \
  packages/contracts/src apps/server/src/provider apps/server/src/textGeneration \
  apps/web/src apps/mobile/src docs/user/providers-kimi.md
rg -n 'ProviderDriverKind.make\("kimi"\)|provider === "kimi"|value: ProviderDriverKind.make\("kimi"\)' \
  packages/contracts/src apps/server/src apps/web/src apps/mobile/src
```

Expected results:

- `git status --short` lists only files in Scope (plus pre-existing unrelated
  changes that were present before execution).
- The secret-pattern search finds only defensive tests/docs wording; it finds no
  values and no invocation of `kimi provider list --json` outside an explicit
  prohibition comment/test.
- The provider search finds contracts/defaults as applicable, server driver,
  web metadata/icon map, and mobile icon branch.

Do not perform browser or simulator verification unless the operator explicitly
approves it. If approved later, use the repo's `test-t3-app`/`test-t3-mobile`
skills and a disposable `.t3` state directory, never live `~/.t3/userdata`.

## Test plan

New tests:

- `KimiAcpSupport.test.ts`: spawn/auth, config-option parsing, model/thinking,
  mode mapping, delete helper.
- `KimiAcpCliProbe.test.ts`: opt-in installed CLI compatibility without prompts.
- `KimiProvider.test.ts`: disabled/missing/outdated/auth/model/status/cleanup and
  stderr redaction.
- `KimiAdapter.test.ts`: lifecycle, resume, attachments, stream conversion,
  cancellation, standard approvals, Kimi questions, plan review, full-access
  exception, concurrency, cleanup.
- `KimiTextGeneration.test.ts`: all four operations, schema failures, timeout,
  and temporary-session deletion.

Existing tests to extend:

- `settings.test.ts`: settings and patch round-trip.
- `AcpSessionRuntime.test.ts`: authoritative config snapshots.
- `ProviderInstanceRegistryLive.test.ts`: legacy hydration, registration, and
  multi-instance isolation.
- `ProviderSettingsForm.test.ts` and `session-logic.test.ts`: web metadata and
  picker presence.
- `providerOptions.test.ts`: mobile option presence.

Mock ACP peers must assert outbound method names/payloads and emit receipts or
deferred events; do not use sleeps or polling. Test fixtures must use fake
credentials and scoped temporary directories.

## Done criteria

- [ ] `KimiSettings` decodes and patches through both legacy and instance config.
- [ ] `KimiDriver` is registered as `kimi`, supports multiple instances, and
      produces sanitized managed snapshots.
- [ ] Kimi 0.34+ install, auth, and models are discovered through ACP only.
- [ ] Every temporary ACP session is deleted on success/failure/timeout; normal
      user chat sessions remain resumable and are not deleted.
- [ ] Standard approvals map correctly; questions and plan review always reach
      the user, including in full-access mode.
- [ ] New/load/resume, prompt streaming, attachments, model/thinking/mode,
      cancel, and stop have focused passing tests.
- [ ] Kimi text generation supports all four existing operations with cleanup.
- [ ] Web/desktop and mobile expose Kimi with the Kimi icon and Early Access
      label where labels are supported.
- [ ] User and internals docs are linked from their indexes.
- [ ] All focused tests and four scoped typechecks exit 0.
- [ ] No source or docs files outside Scope are modified.
- [ ] `plans/README.md` status is updated to DONE.

## STOP conditions

Stop and report; do not improvise if:

- A load-bearing current-state excerpt no longer matches after the drift check.
- The target CLI/version does not support `kimi acp`, protocol version 1,
  `configOptions`, auth method `login`, or raw `session/delete`.
- Model discovery appears to require `kimi provider list --json` or reading a
  Kimi config/credential file.
- Kimi's live question or plan-review option IDs differ from the documented
  `q*`/`plan_*` namespaces. Capture a redacted fixture and report the mismatch;
  do not fall back to selecting by option kind/order.
- The generated `effect-acp` schema cannot represent Kimi's config-option update
  payload without `any`, unchecked casts, or generated-file edits.
- Supporting Kimi requires a new public orchestration event or schema rather than
  the existing approval/user-input events.
- A temporary session cannot be deleted reliably on all exit paths.
- A required change falls outside Scope. Report the exact file and why it is
  needed before editing.
- Any focused verification fails twice after a reasonable correction.
- Tests would require live credentials, prompts that incur usage, sleep-based
  timing, or access to live `~/.t3/userdata`.

## Maintenance notes

- The 0.34.0 minimum is tied to the verified ACP surface, especially temporary
  session deletion and the question/plan option namespaces. Re-run the opt-in
  compatibility probe before lowering or raising it.
- Reviewers should scrutinize callback classification before auto-approval,
  fail-closed behavior for unknown option IDs, and cleanup finalizers. These are
  more important than visual/provider-list boilerplate.
- If Kimi later exposes a non-persistent ephemeral-session flag, it may replace
  explicit `session/delete`, but only after a compatibility probe and cleanup
  tests prove equivalent behavior.
- If ACP standardizes first-class elicitation/plan-review callbacks, migrate the
  Kimi boundary to those methods while continuing to emit T3's canonical
  `user-input.*` events.
- Keep the Kimi icon geometry synchronized between web and React Native when the
  upstream official mark changes.
- Update installation remains manual-only until Kimi publishes a stable,
  platform-safe self-update contract; that work is intentionally deferred.
