# Terminal workspaces

Choose **Settings → General → Default new thread view → Terminal** to create sessions with a fixed
main terminal. **Open terminal with** chooses the normal shell or a configured provider CLI. Project
settings can override these defaults. Changing a preference affects new sessions, not existing ones.

Each new terminal session opens in its selected project checkout or newly prepared worktree. Provider
executables and profiles are resolved by the environment that owns the project, including remote
connections. An older environment may need a server update before it can create these sessions.

## Work with tabs

The main terminal is the first tab and stays present. Open files, changes and previews in other central
tabs while the terminal continues running. Use **Cmd+J** on macOS, **Ctrl+J** elsewhere, the Terminal
button or the Command Palette's terminal action to focus the same main terminal again.

Closing other tabs, closing all closable tabs or switching sessions does not stop the main terminal.
New terminal sessions have one main terminal; use another session for another agent. Traditional chat
threads retain their existing terminal drawer and split terminals.

In a narrow window, the workspace opens as a sheet. Dismissing it keeps the terminal running; select
**Open terminal workspace** to return.

## Recover a stopped terminal

If a CLI exits back to its shell, the shell remains usable. If the shell exits, the tab and available
history remain. Use **Start terminal** or **Restart terminal** explicitly to run it again. Restarting
a live terminal asks for confirmation and ends its current process.

If a provider cannot be started, the shell remains available. A safe launch failure offers **Try
again**. If a command may already have been written, or the shell has received input, restart explicitly
or use the shell manually. Repeating a launch request never writes the same provider command twice
into the same shell execution.

Reloading the client reconnects to a live terminal. Restarting the backend ends its processes; the
session's identity and available history remain, but the CLI conversation is not automatically resumed.
Deleting the session performs the normal terminal cleanup.

## Chat is coming later

The main terminal toolbar shows **Terminal** selected and **Chat — Coming soon** disabled. This
session does not yet have a conversation view, and terminal output is not imported into chat.
Create a separate traditional Chat thread to use structured chat today.

Existing threads are not converted automatically. For an empty thread without structured chat history
or a provider session, a terminal tab's menu offers **Use as main terminal**. This keeps that terminal
running and preserves other existing terminals. Mixed chat/terminal threads remain traditional.

Mobile creates traditional Chat threads even when your stored default is Terminal. Opening a terminal
session on mobile explains that web or desktop is required and does not show a sendable composer.
