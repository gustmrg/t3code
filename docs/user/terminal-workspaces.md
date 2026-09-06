# Terminal workspaces

Choose **Settings → General → Default new thread view → Terminal** to create sessions with a fixed
main terminal. **Open terminal with** chooses the normal shell or a configured provider CLI. Project
settings can override these defaults. Changing a preference affects new sessions, not existing ones.

Each new terminal session opens in its selected project checkout or newly prepared worktree. Provider
executables and profiles are resolved by the environment that owns the project, including remote
connections. An older environment may need a server update before it can create these sessions.

## Work with tabs

The main terminal is the first tab. Open files, changes and previews in other central
tabs while the terminal continues running. Select the main terminal tab to return to the agent.

Use **Cmd+J** on macOS, **Ctrl+J** elsewhere, or the Terminal button to show or hide the bottom terminal
drawer. The Command Palette's **Open terminal drawer** action opens it too. Create auxiliary shells
with the drawer's new-terminal and split controls, the new-terminal shortcut, or **+ → Terminal** in
the top tab bar. In a terminal workspace, these auxiliary shells appear in the bottom drawer.

The drawer lists one item per terminal, using stable names such as **Terminal 2** and **Terminal 3**.
Use **Maximize terminal drawer** to fill the main workspace while keeping the left sidebar visible.
**Restore terminal drawer** returns it to its previous height.

Hiding the drawer keeps its processes running. Close individual auxiliary terminals when finished.
They do not replace the main terminal's identity or contribute to its sidebar process indicator.
Closing other tabs, closing all closable tabs or switching sessions does not stop the main terminal.
The right panel button hides and restores the central workspace without stopping its processes.

For Codex on a Linux environment, the sidebar reads the native session associated with the main
terminal process to show its model and **Working**, **Idle**, **Stopped** or **Unknown** state.
This requires no hooks. Missing information appears as **Model unavailable** or **Unknown**;
silence in the terminal is not treated as evidence that the agent is idle. Other providers currently
use process or startup metadata for their icon, without verified model or agent state.

In a narrow window, the workspace opens as a sheet. Dismissing it keeps the terminal running; select
**Open terminal workspace** to return.

## Recover a stopped terminal

Close the main terminal tab to stop its execution and leave the workspace. The thread and terminal
history remain in the sidebar. Auxiliary terminals are independent and are not stopped by this action.
Selecting the thread again resumes the exact recorded Codex session, including its last observed model.
Automatic resume currently requires a Linux environment and Codex configured as the thread's startup
provider. A Codex session launched manually from a Shell workspace can be identified, but must be
resumed manually. If no verified session was captured, reopening reports the problem instead of
starting a different conversation.

If a CLI exits back to its shell, the shell remains usable. If the shell exits, its history remains;
select another thread and return to request resume.

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
