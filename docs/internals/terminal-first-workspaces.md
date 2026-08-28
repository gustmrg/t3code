# Terminal-first workspace architecture

Terminal-first launch is a client-coordinated flow with server-owned execution details. It reuses the
existing orchestration, terminal manager, provider-instance registry, and right-panel surface model.

## Preference resolution

Application settings store `defaultThreadView` and a discriminated `terminalStartup`. A project may
override either value. `resolveThreadLaunchPreference` applies this order:

```text
project override -> application setting -> chat + shell defaults
```

The resolver also takes a client capability. Clients without an inline terminal workspace resolve a
stored Terminal preference to Chat without rewriting it. Mobile uses that compatibility behavior;
web and desktop advertise terminal workspace support.

A stale provider-instance ID remains visible in settings but resolves to Shell for launch. This lets
the user recover the selection without making terminal creation depend on provider availability.

## Early materialization

Chat-first creation remains draft-first. Terminal-first creation needs a durable scoped thread before
it can address terminal RPCs, so the shared new-thread handler performs this sequence:

```text
create local draft
  -> resolve launch preference
  -> dispatch thread.materialize
  -> await the projected thread shell
  -> navigate to the durable thread route
  -> open the terminal in the final project/worktree cwd
  -> activate panel-first presentation
```

Materialization uses the same server bootstrap path as first send, including worktree provisioning
and setup scripts, but does not start a provider turn. The coordinator deduplicates concurrent launch
attempts by scoped thread reference. A terminal-open failure restores structured Chat and exposes a
retry against the materialized thread.

All web entry points call the same handler: sidebar actions, command palette actions and keybindings,
empty-state startup, branch/project actions, and continuation flows. Continuation flows that require
structured composition explicitly force Chat.

## Trusted provider launch intent

The terminal RPC accepts only a provider-instance ID. It never accepts an arbitrary browser-built
command. The environment's provider registry resolves that ID to server-owned launch metadata:

- executable and arguments;
- provider-instance environment overrides;
- display name;
- enabled and supported state.

Each built-in driver makes an explicit launch specification for Codex, Claude, Cursor, Grok, or
OpenCode. The WebSocket handler opens the PTY shell before checking or writing the provider command.
Missing, disabled, unsupported, or failed launches are recorded as terminal metadata and returned as
a non-fatal result. Provider credentials and environment values are not serialized in terminal
snapshots, metadata streams, or RPC responses.

The provider command runs as an interactive child of the shell. This terminal process is not a
structured provider session: it does not use the provider adapter, emit orchestration messages, or
share conversation ownership with Chat.

## Workspace presentation

Right-panel surfaces and their active resources remain scoped by environment and thread. Panel-first
presentation is persisted separately from temporary maximize state. Switching Terminal, Changes,
Preview, Files, Pull Requests, or Agents does not restore Chat or recreate the surface.

Command-palette workspace actions dispatch through a small UI action bus to `ChatView`, which remains
the owner of terminal allocation, preview creation, diff activation, and capability checks. Narrow
viewports retain the existing sheet presentation and do not persist an unsupported full-width state.

## Connection ownership

The scoped thread reference determines the target environment for materialization and every terminal
RPC. The server that owns the project resolves the final working directory, provider instance,
executable, profile environment, and PTY. Browser origin is never used to infer execution ownership,
so the same flow works for local, relay, tunnel, and desktop-managed remote connections.
