# Terminal-First Workspace Plan

## Objective

Add a configurable new-thread experience with two defaults:

- **Chat** — preserve the existing draft-first, structured provider-chat flow.
- **Terminal** — materialize the new thread, open a shell in its final project/worktree directory,
  promote the existing right panel to the full workspace, and focus its terminal surface.

Terminal mode must work without an agent. An optional startup selection may execute a configured
agent CLI inside the terminal as a convenience. This first version deliberately does not synchronize,
convert, or import the terminal agent conversation into the structured chat session.

The existing right-panel tabs remain the workspace navigation for Terminal, Diff, Preview, Files,
Pull Requests, and Agents. In Terminal mode the chat column is hidden by default, allowing any of
those tabs—especially Diff—to use the full content area.

## Product model

### Independent preferences

1. **Default new-thread view**
   - `chat` (existing behavior and migration default)
   - `terminal`
2. **Terminal startup**
   - `shell` (default and universal fallback)
   - a configured provider instance, used only to resolve and start that provider's CLI
3. **Project override**
   - inherit the application default
   - override the default view and, when needed, terminal startup for that logical project

The effective preference is resolved in this order:

```text
project override -> application preference -> chat + shell defaults
```

### Terminal-first launch

```text
create new thread
  -> resolve effective project/application preference
  -> materialize the server thread and final workspace/worktree
  -> create a right-panel terminal surface
  -> open a PTY in the resolved directory
  -> optionally start the configured provider CLI
  -> maximize the right panel and focus the terminal
```

If no agent is configured, or if agent launch fails, the PTY remains open as a usable shell. Agent
startup failure must be reported without making thread or terminal creation fail.

### Explicit non-goals

- No terminal-to-chat conversation conversion or history import.
- No attempt to parse ANSI/TUI output into structured messages.
- No shared ownership of one provider session between a PTY and a chat adapter.
- No automatic agent launch when the effective default view is Chat.
- No replacement of the existing right-panel surface model.
- No mobile terminal implementation in this first version; mobile must continue to open the chat
  safely when it cannot render the terminal workspace.
- No arbitrary user-authored startup command in this version. Agent commands are resolved from
  trusted provider-instance configuration on the environment that owns the PTY.

## Current architecture and constraints

- `useNewThreadHandler` currently creates a local draft and navigates to `/draft/$draftId`; the
  server thread is normally materialized on first send. Terminal UI requires a scoped server thread
  reference. Terminal First therefore needs an explicit, receipt-backed early materialization path
  after the final environment mode/worktree choice is known.
- `ChatView` already renders Terminal, Diff, Preview, Files, Pull Requests, and Agents as
  `RightPanelSurface` tabs.
- `rightPanelMaximized` already collapses the chat column to width zero, but the value is local,
  transient `ChatView` state and has no default keybinding.
- `rightPanelStore` already persists surface descriptors per scoped thread.
- `TerminalManager` already owns PTY open, attach, write, resize, restart, close, history, and
  metadata streaming. It should remain the terminal execution boundary.
- Provider instances—not only driver kinds—must be used for agent selection because one user may
  configure multiple Codex or Claude accounts.
- Web and desktop share the web workspace. Mobile has a separate React Native navigation model and
  is out of scope except for compatibility with new settings/contracts.

## Phase 1 — Define settings, inheritance, and launch intent

### Goal

Introduce stable typed preferences without changing new-thread behavior.

### Scope

- `packages/contracts/src/settings.ts` and focused settings tests
- client settings decoding/defaults and server settings persistence as required by the existing
  settings architecture
- project settings contracts/storage and `apps/web/src/components/settings/ProjectSettingsPanel.tsx`
- application settings UI in `apps/web/src/components/settings/SettingsPanels.tsx`
- settings search metadata

### Implementation steps

1. Add an application-level `defaultThreadView` schema with literals `chat | terminal`, decoding
   default `chat`, and patch compatibility for older servers/settings files.
2. Add an application-level terminal startup schema whose default is `shell` and whose agent form
   stores a provider instance ID. Prefer a discriminated representation over coupled nullable
   fields.
3. Add optional project overrides using `inherit` semantics by omission. Reuse the existing logical
   project grouping/settings ownership rather than creating another project identity system.
4. Implement one pure resolver that accepts application settings, project overrides, and client
   capability, returning the effective launch preference. Unsupported clients resolve Terminal to
   Chat without rewriting the stored preference.
5. Add settings controls with user-facing language:
   - `Default new thread view: Chat | Terminal`
   - `Open terminal with: Shell | <configured provider instance>`
   - project settings: `Use application default | Chat | Terminal`
6. Filter missing or unavailable provider instances from new selections while preserving a stale
   stored selection long enough to display a recoverable warning/reset state.
7. Add settings search entries and reset actions consistent with existing settings panels.

### Validation

- `vp test run packages/contracts/src/settings.test.ts`
- Run the focused web settings tests touched or added with `vp test run <test-files>`.
- Run targeted typechecks for contracts and web packages using their package scripts.

### Exit criteria

- Existing settings decode to Chat + Shell.
- Global and project preferences round-trip through their current persistence mechanisms.
- The pure resolver covers inheritance, stale provider IDs, and unsupported-client fallback.
- Creating a thread still behaves exactly as before.

### Suggested commit message

`feat(settings): add terminal-first thread preferences`

## Phase 2 — Make panel-first layout durable and reversible

### Goal

Turn the existing maximized right panel into an intentional workspace mode reusable by Terminal,
Diff, Preview, and Files.

### Scope

- `apps/web/src/rightPanelStore.ts` and tests
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/PanelLayoutControls.tsx`
- `apps/web/src/components/RightPanelTabs.tsx`
- keybinding/command-palette exposure where existing panel actions are registered

### Implementation steps

1. Move per-thread panel presentation state out of local `ChatView` state into the persisted,
   scoped right-panel store. Model the durable panel-first preference separately from a temporary
   manual maximize action so Chat First users do not accidentally persist every maximize operation.
2. Preserve the current invariant: maximizing the inline panel collapses, but does not unmount or
   destroy, the chat column.
3. Make restore behavior explicit and reversible. A visible control must return to the chat/panel
   split, and the existing `rightPanel.toggleMaximized` command must operate on the shared state.
4. Ensure switching among Terminal, Diff, Preview, Files, Pull Requests, and Agents never restores
   the chat merely because the active right-panel tab changed.
5. Make `View changes`/diff opening retain panel-first full-width presentation, so review uses the
   same primary content area as the terminal.
6. Preserve tab order, active surface, terminal processes, preview sessions, diff selection, and
   file state while toggling presentation.
7. Keep narrow viewport behavior on the existing sheet model; do not claim full-workspace terminal
   support where the inline panel is unavailable.

### Validation

- `vp test run apps/web/src/rightPanelStore.test.ts`
- Run focused tests for `PanelLayoutControls`, `RightPanelTabs`, and any extracted layout resolver.
- Targeted web typecheck.

### Exit criteria

- Any existing right-panel surface can occupy the full inline workspace.
- Restoring the chat does not close or recreate resources.
- Presentation persists per scoped thread without leaking across environments with identical thread
  IDs.
- Diff remains full-width when opened from a panel-first terminal workspace.

### Suggested commit message

`feat(web): promote the right panel to a primary workspace`

## Phase 3 — Materialize terminal-first threads and open a shell

### Goal

Make `Default new thread view: Terminal` create a usable shell in the correct final workspace and
show it full-width.

### Scope

- `apps/web/src/hooks/useHandleNewThread.ts` and focused tests
- thread creation/promotion helpers used by `ChatView`
- orchestration command/receipt flow only where required for early materialization
- `apps/web/src/components/ChatView.tsx`
- terminal/right-panel client state integration

### Implementation steps

1. Extract a single new-thread launch coordinator used by every entry point: sidebar, command
   palette, keybinding, empty-state route, and project actions. Do not add Terminal First only to one
   button.
2. Preserve the existing local-draft behavior for Chat First.
3. For Terminal First, explicitly materialize the draft as a server thread before opening the PTY.
   Reuse the existing thread creation and worktree provisioning commands; wait on typed state/events
   or receipts, never sleeps or polling.
4. Resolve the final `cwd`, `worktreePath`, environment, runtime environment variables, and scoped
   thread reference only after provisioning settles.
5. Allocate a terminal ID through the existing client-owned terminal-ID rules, open a right-panel
   terminal surface, and call the existing terminal RPC.
6. Apply panel-first presentation and focus only after the target thread route and terminal surface
   are valid. Make the sequence idempotent under React remounts, reconnection, and duplicate events.
7. If terminal creation fails, keep the materialized thread accessible and restore/show Chat with a
   clear retry action. Do not strand the user on a blank maximized panel.
8. Ensure local, remote/relay, and tunnel connections send terminal operations to the environment
   that owns the project and worktree.

### Validation

- Add focused tests for the launch coordinator covering Chat First, Terminal First, worktree mode,
  current-checkout mode, remote environment scoping, duplicate invocation, and terminal-open failure.
- Run the touched thread creation, right-panel, and terminal state tests with `vp test run <files>`.
- Targeted contracts/server/web typechecks for changed packages.

### Exit criteria

- Chat First remains draft-first.
- Terminal First produces a server thread and one focused shell in the correct final directory.
- Every supported new-thread entry point uses the same behavior.
- Failure leaves a navigable thread with an actionable UI.

### Suggested commit message

`feat(web): open terminal-first threads in a shell`

## Phase 4 — Add optional provider-agent startup

### Goal

Optionally launch the selected configured provider CLI inside the new terminal while guaranteeing
that the shell remains usable on failure.

### Scope

- provider driver/instance boundary under `apps/server/src/provider`
- terminal RPC contract and `apps/server/src/terminal/Manager.ts` only as needed for a typed trusted
  launch intent
- client-runtime terminal mutations
- focused server, contracts, and web tests

### Implementation steps

1. Define a server-owned capability for resolving a provider instance to a terminal launch
   specification. Keep driver-specific executable, arguments, profile/account selection, and safe
   environment construction at the provider boundary.
2. Decide support per built-in driver: Codex, Claude, Cursor, Grok, and OpenCode. Unsupported drivers
   must report `agent terminal launch unavailable` and fall back to the shell.
3. Extend terminal opening with a typed optional agent-launch intent, or add a narrowly scoped RPC,
   rather than sending a browser-constructed arbitrary command.
4. Open the PTY first, then start the agent. Preserve shell usability when executable lookup,
   authentication, configuration, or process startup fails.
5. Record launch intent/metadata separately from runtime truth so the UI can label an agent terminal
   without pretending it is a structured provider session.
6. Show the configured provider-instance display name in the tab while retaining server-computed
   active subprocess labels where useful.
7. Surface a non-blocking failure notice with `Try again`, `Choose agent`, and `Continue in shell`
   actions. Never close the terminal automatically.
8. Confirm that secrets and provider credentials are not serialized into client-visible terminal
   metadata, RPC payloads, history, or logs.

### Validation

- Contract tests for launch intent and backward compatibility.
- Focused `TerminalManager` tests for successful startup, missing executable, failed process, stale
  provider instance, and shell fallback.
- One adapter/driver test per supported provider instance mapping.
- Targeted server and web typechecks.

### Exit criteria

- Shell startup remains the default and works without any provider.
- A configured provider instance can start its CLI in the PTY where supported.
- All agent-start failures leave the user at a working shell.
- The terminal session is not represented as or attached to the structured chat session.

### Suggested commit message

`feat(terminal): optionally launch configured agent CLIs`

## Phase 5 — Product integration, documentation, and client verification

### Goal

Complete the user-facing workflow across applicable surfaces and document its boundaries.

### Scope

- Settings, command palette, and keybinding discoverability
- web and desktop behavior
- compatibility behavior in mobile
- `docs/user/` and relevant `docs/internals/`
- focused integrated verification

### Implementation steps

1. Audit all new-thread entry points and ensure each routes through the common coordinator.
2. Add clear empty/error states for no project, missing `cwd`, unavailable environment, stale provider
   selection, failed worktree provisioning, and failed agent launch.
3. Add command-palette actions for switching/restoring workspace presentation and opening Terminal,
   Changes, Files, or Preview in the main panel.
4. Decide whether `rightPanel.toggleMaximized` receives a default shortcut; if not, keep it
   configurable and make the visible action discoverable.
5. Ensure web and desktop have equivalent behavior. Desktop titlebar/window controls must remain
   usable when the chat column is collapsed.
6. Make mobile decode and preserve the settings but safely use Chat when terminal workspace support
   is unavailable.
7. Add user documentation describing Chat vs Terminal defaults, shell fallback, project overrides,
   full-width Diff, and the explicit lack of terminal/chat conversation synchronization.
8. Add internal documentation for early thread materialization, launch-intent ownership, and provider
   capability boundaries.
9. After maintainer approval for computer use, run one integrated web/desktop pass using the
   repository's `test-t3-app` workflow. Verify with non-empty disposable state and do not use live
   `~/.t3/userdata` as writable state.

### Validation

- Focused tests for settings, thread launch coordination, right-panel state, terminal manager, and
  provider launch mapping.
- Targeted lint/typecheck for only changed packages and files.
- Approved integrated pass covering:
  - Chat First unchanged
  - Terminal + Shell
  - Terminal + supported agent
  - failed agent fallback
  - Terminal -> full-width Diff -> Terminal
  - restore Chat without terminating the PTY
  - project override vs application default
  - remote environment scoping

### Exit criteria

- The feature is reachable from all applicable new-thread entry points.
- Web and desktop provide a coherent panel-first workspace.
- Mobile behavior is safe and explicit.
- Documentation accurately states the session-separation limitation.
- Focused automated checks pass and the approved integrated pass has recorded evidence.

### Suggested commit message

`docs(workspace): document terminal-first workflows`

## Dependency order

```text
Phase 1 settings and resolver
  -> Phase 2 durable panel-first layout
  -> Phase 3 terminal-first shell creation
  -> Phase 4 optional agent startup
  -> Phase 5 integration and documentation
```

Phase 3 must not begin until the team agrees that Terminal First intentionally materializes a server
thread before the first prompt. Phase 4 must not begin until each provider driver has an explicit
support decision; unsupported providers are valid and must fall back to Shell.

## Review decisions requested before implementation

1. Confirm that selecting Terminal First may create a durable server thread immediately, unlike the
   current Chat First draft behavior.
2. Confirm that application settings plus optional project override are both in the first release,
   or defer project overrides to a follow-up while retaining the resolver shape.
3. Confirm that automatic agent startup accepts only configured provider instances and does not
   expose an arbitrary startup-command field.
4. Confirm that mobile falls back to Chat in this version.
5. Confirm the proposed phase boundaries and review checkpoint after each phase.
