# Terminal-first workspaces

New threads can start in structured **Chat** or in a full-width **Terminal** workspace.

Choose the application default in **Settings** → **General** → **Default new thread view**:

- **Chat** creates a draft first. The thread is added to the server when you send its first message.
- **Terminal** creates the thread immediately, opens its project or worktree directory, and focuses a
  shell in the main workspace.

Terminal-first threads still have structured chat. Select **Restore Chat and panel split** from the
Command Palette, or use the restore button above the panel, to show it beside the workspace.

## Choose what the terminal starts

Under **Open terminal with**, choose:

- **Shell** to open the environment's normal interactive shell.
- A configured provider to start that provider's CLI inside the shell.

Provider selection uses the configured instance, so separate accounts or profiles remain separate.
The provider executable and credentials are resolved by the environment that owns the project. This
also applies when the client is connected remotely.

The shell always opens first. If the provider is unavailable, disabled, missing, or cannot be
started, the terminal remains usable. The warning offers **Try again**, **Choose agent**, and
**Continue in shell**.

The terminal CLI conversation is independent from structured chat. T3 Code does not import terminal
output into the chat timeline, attach that CLI process as the thread's structured provider session,
or synchronize messages between the two.

## Override one project

Open **Settings** → **Projects**, select a project, and use **Default view** to choose:

- **Use application default**
- **Chat**
- **Terminal**

When Terminal is selected, **Open terminal with** can inherit the application setting or choose a
different shell or provider for that project. The override applies to every checkout in the logical
project group.

## Use other surfaces as the workspace

The right-panel tabs are one shared workspace. Terminal, Changes, Preview, Files, Pull Requests, and
Agents keep their state while the panel switches between split and full-width presentation.

The Command Palette includes actions to:

- open Terminal, Changes, Files, or Preview as the full-width workspace;
- keep the current panel as the workspace while switching tabs;
- restore the Chat and panel split.

Opening Changes from a terminal-first thread keeps the panel full-width. Restoring Chat does not stop
the terminal or recreate its process.

Mobile currently opens new threads in Chat even when Terminal is stored as the application or
project default. The preference is preserved, so web and desktop clients still honor it.
