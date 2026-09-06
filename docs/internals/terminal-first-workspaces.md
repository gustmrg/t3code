# Terminal-first workspace architecture

Terminal-first sessions reuse orchestration, the terminal manager, provider registry and existing
workspace surfaces. Structured chat threads retain their existing execution model.

## Durable session identity

A thread may carry `terminalWorkspace: { mainTerminalId, startup }`. Absence or null denotes a
traditional thread, including when replaying old events. The binding travels through materialize,
create and metadata commands, events, both projectors, the nullable `terminal_workspace_json` column
(migration 045), repositories and full, paginated and shell snapshots. Metadata omission preserves it.

The client resource identity is `(environmentId, threadId, mainTerminalId)`. The environment is
implicit in each server. The binding identifies a terminal resource, not a PID or React surface.
`startup` captures launch intent; it contains no executable, credentials or environment values.
Application/project preferences affect new sessions only. `panelFirstByThreadKey` remains a layout
preference, separate from the durable binding and from manual maximization.

Servers advertise the optional `terminalWorkspaceSessions` capability. An absent capability is
unsupported: updated clients offer an update message and retain the traditional draft instead of
claiming that an older server persisted a binding it ignored. Mobile creates traditional threads
without rewriting the stored preference, and presents bound threads as unavailable on mobile.

An empty traditional thread can be explicitly converted with **Use as main terminal** on a terminal
tab. The selected ID is persisted without opening/restarting the PTY; known successful launch metadata
supplies startup, otherwise Shell is used. Existing auxiliary resources remain accessible. The decider
rejects conversion with structured messages or a structured provider session, and rejects removing or
replacing an existing binding. Serialized command decisions ensure a competing conversion cannot
replace the first binding. `thread.turn.start` is rejected for bound sessions; a separate traditional
thread remains the way to use structured chat today.

## Materialization barrier

The client creates a draft, resolves preferences, sends `thread.materialize` with the binding, and
waits for the same environment's shell snapshot to reach the returned receipt sequence. The thread
and sequence are read from that one snapshot. Subscriptions read immediately and again after
subscribing, and clean up on success, cancellation, stream error or removal. Coalesced events may
advance past the receipt. A requested worktree must have a non-null final path before opening a PTY.

Only then does the client open the terminal and activate its workspace. Navigation is conditional on
the creation route still being selected. Retry reuses the receipt and re-reads context without
materializing again. In-flight attempts are coalesced by scoped thread; retry clicks also share the
open operation. Setup bootstrap still records script startup, not script completion.

## Per-generation CLI submission

The server resolves provider instance metadata, including executable, arguments and environment.
`TerminalManager.openAgent` holds the existing thread lock around reuse/open, preflight and submission.
The reuse guard runs before cwd/environment changes could restart a live shell. Helpers within the
critical section do not reacquire that lock. Explicit restart waits for the current critical section.

Each runtime session has a generation counter, a flag recording attempted agent writes, and a flag
recording user input. The counter changes when starting a shell, not when attaching or selecting tabs.
A renderer may load history into an inactive generation-zero session; this does not count as an
executed shell and cannot prevent the initial explicit open.

A submitted command is never submitted again in that generation. Missing executables admit retry,
but user input or a busy shell requires explicit restart or manual use. The attempted-write guard and
an uncertain result are set before calling the PTY writer, so a thrown write or lost response cannot
cause retransmission. Results expose `retryPolicy` (`retry`, `restart-required`, `none`) without secrets.
`started` means command submitted, not authenticated, ready, or associated with a native conversation.
Settings changes between retries cannot implicitly terminate a live PTY.

## Presentation and execution lifetimes

The main terminal surface is reconstructed from the binding, placed first, and protected from bulk close operations,
close others, close to right, close all and process-exit cleanup. Files, diffs and previews use existing
central surfaces. In-workspace file links from the main terminal also open these surfaces.
The terminal header toggle, Cmd/Ctrl+J and palette action open the auxiliary bottom drawer.
New-terminal actions in bound sessions also target that drawer; splits operate on its auxiliary
terminals, never on the main terminal. Main and drawer renderers have separate focus requests.
Legacy auxiliary central tabs move into the drawer without PTY close or restart operations.
The main terminal ID is reserved during allocation and excluded from drawer reconciliation.
Workspace visibility follows the panel store, with a reopening placeholder when hidden.

Sidebar rows and search results use the main terminal metadata for provider identification, never
the structured chat model preference. A verified native identity takes precedence over command labels and startup preferences. Without
verified metadata the model and agent state are unavailable; auxiliary terminals never supply them.

The main renderer attaches with `existingOnly`. Missing resources load retained history into an
inactive session without spawning; exited resources remain exited. The renderer itself never launches an agent. On thread selection, ChatView requests an explicit
resume on capable environments; the server reuses live processes without resubmitting commands. The main terminal has no start/restart toolbar. Closing a sheet affects only
presentation; its fallback offers reopening the workspace, never a hidden structured composer.
Deleting a thread retains the existing process cleanup path.

The PTY does not survive backend termination. The binding and persisted history do, but neither is a
promise that the provider history is still available. There is no external multiplexer or supervisor.

## Native Codex observation and resume

Linux environments advertise `terminalSessionResume`. The existing subprocess inspection loop reads
only rollout files held open under `/proc/<descendant pid>/fd` of the main PTY. Exactly one CLI
`session_meta` identity must match; it never selects the newest file or matches only by cwd. Native
`turn_context` records supply the model, and `task_started`, `task_complete`, and `turn_aborted` supply
working/idle transitions. Missing ownership, ambiguous matches and replayed historical state report
unknown. Reads are incremental and bounded; terminal output and prompts are not parsed or copied.

A `.session.json` sidecar beside terminal history stores the native ID, rollout path and last metadata.
This is environment-local runtime metadata, separate from the durable workspace binding. Closing the
main tab captures pending metadata, stops its PTY under the thread lock, retains history, and leaves
auxiliary shells alone. The client lands on a closed-session screen rather than creating a new thread.

Reopening validates the recorded rollout ID and submits `codex resume <id>` with its original
`CODEX_HOME` and last observed model. Launch and resume share the existing generation guards and thread
lock, so duplicate requests cannot submit twice. Missing records, unsupported startup providers and
unsafe nested CLI arguments fail rather than start another conversation. Thread deletion removes the
sidecar. Non-Linux environments and providers other than configured Codex do not support automatic
resume yet. No hooks or changes to provider configuration are installed.

## Future native conversation view

Terminal workspaces have no Terminal/Chat switch or persisted Chat mode.
No structured adapter is started as a second execution of the terminal session.

A future `NativeConversationRef` must associate the owning environment, provider instance and native
conversation ID with the correct execution. That native ID differs from thread ID, terminal ID, PID
and provider-instance ID. It must be discovered reliably from the provider, not invented or inferred
from ANSI output. Structured history reading is the first integration step and may initially be
read-only. Shared input and bidirectional control require actual provider support and a single-writer
policy. The native terminal observer above only supplies identity and status; it does not import conversation history.
