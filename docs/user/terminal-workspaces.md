# Terminal workspaces

Choose **Settings → General → Default new thread view → Terminal** to create sessions with a fixed
main terminal. **Open terminal with** chooses the normal shell or a configured provider CLI. Project
settings can override these defaults. Changing a preference affects new sessions, not existing ones.

Each new terminal session opens in its selected project checkout or newly prepared worktree. Provider
executables and profiles are resolved by the environment that owns the project, including remote
connections. An older environment may need a server update before it can create these sessions.

## Main terminal and tools

A new Terminal thread opens directly into terminal preparation, without showing a chat composer.
The main terminal occupies the page. Files, changes, pull requests, agents and previews open in the
right panel beside it. Closing the tools panel leaves the terminal visible. **Maximize tools** hides
the main terminal temporarily; restoring the split preserves its session and the previous panel width.

Use **Cmd+J** on macOS, **Ctrl+J** elsewhere, or the Terminal button to show or hide the bottom terminal
drawer. The Command Palette's **Open terminal drawer** action opens it too. Create auxiliary shells
with the drawer's new-terminal and split controls, the new-terminal shortcut, or **+ → Terminal** in
the top tab bar. In a terminal workspace, these auxiliary shells appear in the bottom drawer.

The drawer has its own numbering, starting at **Terminal 1**. Closing or splitting an auxiliary does
not renumber the others. Custom names and provider labels are preserved.
Use **Maximize terminal drawer** to fill the main workspace while keeping the left sidebar visible.
**Restore terminal drawer** returns it to its previous height.

Hiding the drawer keeps its processes running. Close individual auxiliary terminals when finished.
They do not replace the main terminal's identity or contribute to its sidebar process indicator.
Closing other tabs, closing all closable tabs or switching sessions does not stop the main terminal.
The right panel button shows and hides tools independently of the terminal and drawer.

For Codex on a Linux environment, the sidebar reads the native session associated with the main
terminal process to show its model and **Working**, **Idle**, **Stopped** or **Unknown** state.
For a verified Codex session, an unnamed thread takes a short title from the first request. Manually
renamed threads keep their names. **Working** includes elapsed time from the native turn start;
changing threads or reconnecting does not reset it. These details currently require Codex on Linux.

This requires no hooks. Missing information appears as **Model unavailable** or **Unknown**;
silence in the terminal is not treated as evidence that the agent is idle. Other providers currently
use process or startup metadata for their icon, without verified model or agent state.

In a narrow window, the main terminal stays on the page and tools open in a sheet. Close the sheet
to return to the terminal.

## Recover a stopped terminal

Use **End session** in the main terminal header to stop its execution and leave the workspace. The thread and terminal
history remain in the sidebar. Auxiliary terminals are independent and are not stopped by this action.
Selecting the thread again resumes the exact recorded Codex session, including its last observed model.
Automatic resume currently requires a Linux environment and Codex configured as the thread's startup
provider. A Codex session launched manually from a Shell workspace can be identified, but must be
resumed manually. If no verified session was captured, reopening reports the problem instead of
starting a different conversation.

If a CLI exits back to its shell, the shell remains usable. If the shell exits, its history remains;
use **Resume session** to start a fresh Shell, or select another thread and return to request
provider resume. Restarting a Shell clears its previous terminal output.

If terminal preparation or opening fails, the error stays in the Terminal view. **Retry** repeats
opening without creating another thread. If preparation was interrupted before a usable session was
created, **Start new thread** begins a new creation.

If a provider cannot be started, the shell remains available. A safe launch failure offers **Try
again**. If a command may already have been written, or the shell has received input, use the shell
manually while it is still running. Repeating a launch request never writes the same provider command twice
into the same shell execution.

Reloading the client reconnects to a live terminal. Restarting the backend ends its processes; the
session's identity and available history remain. Supported Codex sessions resume when selected again.
Deleting the session performs the normal terminal cleanup.

## Chat is coming later

Terminal sessions do not yet have a conversation view, and terminal output is not imported into chat.
Create a separate traditional Chat thread to use structured chat today.

Existing threads are not converted automatically. For an empty thread without structured chat history
or a provider session, a terminal tab's menu offers **Use as main terminal**. This keeps that terminal
running and preserves other existing terminals. Mixed chat/terminal threads remain traditional.

Mobile creates traditional Chat threads even when your stored default is Terminal. Opening a terminal
session on mobile explains that web or desktop is required and does not show a sendable composer.
