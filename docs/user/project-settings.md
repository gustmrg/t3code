# Customize a project icon

T3 Code selects a project icon automatically. It checks `t3.json`, common favicon and app icon
paths, and icon links in project HTML files.

To choose a different icon:

1. Open **Settings** and select **Projects**.
2. Select the project.
3. Under **Appearance**, select **Choose a project file**.
4. Search for an image file and select it.

T3 Code supports SVG, PNG, ICO, JPEG, GIF, AVIF, and WebP files. The selected path applies to
each checkout in the project group and appears on your connected clients.

To use automatic detection again, select **Automatic**.

## Choose how new threads open

Each project can inherit the application default or open new threads in **Chat** or **Terminal**.
Open **Settings** → **Projects**, select the project, and change **Default view**.

When Terminal is selected, **Open terminal with** can inherit the application setting, open a shell,
or start a configured provider CLI. The override applies to every checkout in the project group.

See [Terminal-first workspaces](./terminal-workspaces.md) for shell fallback, full-width Changes, and
the separation between terminal CLI conversations and structured chat.
