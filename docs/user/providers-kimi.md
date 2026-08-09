# Kimi Code

Kimi Code is available as an Early Access provider. Install and configure the Kimi Code CLI on the
machine running your T3 server, then authenticate it:

```sh
kimi login
kimi --version
```

T3 Code requires Kimi Code 0.34.0 or newer. The default executable is `kimi`; set a custom binary
path in the provider settings if the CLI is installed elsewhere. Do not paste access tokens or API
keys into T3 provider settings.

## Supported behavior

T3 discovers the available and current models from Kimi's ACP session configuration. Conversations
can be created and resumed, cancelled, and sent text, image, and embedded-resource context. Plan
mode maps to Kimi's `plan` mode, approval-required mode maps to `default`, and full access maps to
`yolo`. Questions and plan reviews still require your answer in full access.

The composer also shows the thinking levels supported by the selected model. Choose **Off** to
disable thinking when the model permits it, or choose an effort such as **Low**, **High**, or
**Max**. T3 applies that choice to the thread through ACP. Until you choose a value, a new thread
uses Kimi's configured default. After you choose a value, T3 stores it with the thread and reapplies
it when the thread resumes. Models that always use thinking do not offer **Off**.

Kimi and its credentials belong to the T3 server environment. When you connect from the web app,
desktop app, phone, a relay, or a tunnel, the viewing device does not need its own Kimi install.

## Troubleshooting

- **Binary missing:** install Kimi Code on the server or set the provider's binary path.
- **Version too old:** upgrade to 0.34.0 or newer.
- **Authentication required:** run `kimi login` on the server environment.
- **No models:** confirm login is complete and restart the provider health check; models come from
  the ACP session and are not read from Kimi configuration files.
- **ACP startup failed:** run `kimi --version`, verify the configured binary, and check the T3 server
  logs for the sanitized startup error.
