# Mapeamento de rebranding visual

Este documento descreve os pontos necessários para atualizar visualmente a marca do T3 Code sem alterar compatibilidade, persistência ou integrações.

## Resumo da iconografia

Não existe um único pacote de ícones em toda a aplicação:

| Superfície                | Sistema principal                      | Uso                                      |
| ------------------------- | -------------------------------------- | ---------------------------------------- |
| Web e renderer do Desktop | `lucide-react` `^0.564.0`              | Ícones gerais da interface               |
| Mobile iOS                | `expo-symbols` `~56.0.6`               | SF Symbols nativos                       |
| Mobile Android/fallback   | `@tabler/icons-react-native` `^3.44.0` | Adaptação dos símbolos para Android      |
| Árvores de arquivos       | `@pierre/trees`                        | Ícones de arquivos e pastas              |
| Branding e integrações    | SVGs inline/customizados               | Wordmark, providers e ícones específicos |

Referências:

- [apps/web/package.json](apps/web/package.json)
- [apps/mobile/package.json](apps/mobile/package.json)
- [apps/mobile/src/components/AppSymbol.tsx](apps/mobile/src/components/AppSymbol.tsx)
- [apps/web/src/pierre-icons.ts](apps/web/src/pierre-icons.ts)
- [apps/web/src/components/Icons.tsx](apps/web/src/components/Icons.tsx)
- [apps/mobile/src/components/T3Wordmark.tsx](apps/mobile/src/components/T3Wordmark.tsx)

Trocar a família de ícones não é necessário para um rebranding visual básico. Essa mudança seria uma refatoração ampla, envolvendo os imports Lucide da web e o adaptador `AppSymbol` do mobile.

## 1. Assets-fonte da marca

Os projetos do Icon Composer são a fonte de verdade dos ícones do aplicativo:

- [`assets/dev/app-icon.icon`](assets/dev/app-icon.icon)
- [`assets/nightly/app-icon.icon`](assets/nightly/app-icon.icon)
- [`assets/prod/app-icon.icon`](assets/prod/app-icon.icon)
- `text.svg` e `background.svg` dentro de cada variante

Os assets gerados incluem ícones para iOS, macOS, Windows, Linux, favicon, Apple Touch Icon e ícones web.

Após alterar os projetos-fonte:

1. Executar `vp run icons:export`.
2. Exportar manualmente o preset de macOS quando indicado pela ferramenta.
3. Executar `vp run icons:check`.
4. Não editar diretamente PNGs, ICOs ou outros arquivos gerados.

Referências:

- [assets/README.md](assets/README.md)
- [scripts/export-brand-icons.ts](scripts/export-brand-icons.ts)
- [scripts/lib/brand-assets.ts](scripts/lib/brand-assets.ts)

## 2. Web e PWA

### Assets e metadados

Atualizar os arquivos abaixo para cada variante necessária:

- `apps/web/public/favicon.ico`
- `apps/web/public/favicon-16x16.png`
- `apps/web/public/favicon-32x32.png`
- `apps/web/public/apple-touch-icon.png`
- [apps/web/public/manifest.webmanifest](apps/web/public/manifest.webmanifest)
- [apps/web/index.html](apps/web/index.html)

O `index.html` também contém a paleta inicial inline usada durante o boot para evitar flash visual. Se as cores principais mudarem, essa paleta e as metas `theme-color` precisam acompanhar a alteração.

### Interface

- [apps/web/src/components/sidebar/SidebarChrome.tsx](apps/web/src/components/sidebar/SidebarChrome.tsx): wordmark principal exibido na sidebar.
- [apps/web/src/components/SplashScreen.tsx](apps/web/src/components/SplashScreen.tsx): imagem exibida durante o carregamento.
- [apps/web/src/branding.ts](apps/web/src/branding.ts): nome exibido e labels de ambiente.
- [apps/web/src/index.css](apps/web/src/index.css): tokens globais, cores, fontes e temas claro/escuro.
- [apps/web/src/themePalette.ts](apps/web/src/themePalette.ts): paletas padrão e cores de status.

Os assets de produção/nightly podem ser aplicados ao output web por:

- [scripts/apply-web-brand-assets.ts](scripts/apply-web-brand-assets.ts)
- [scripts/lib/brand-assets.ts](scripts/lib/brand-assets.ts)

## 3. Desktop/Electron

Atualizar os seguintes pontos:

- [apps/desktop/package.json](apps/desktop/package.json): `productName`.
- [apps/desktop/src/app/DesktopEnvironment.ts](apps/desktop/src/app/DesktopEnvironment.ts): nome exibido, labels de estágio e nomes legados.
- [apps/desktop/src/app/DesktopAssets.ts](apps/desktop/src/app/DesktopAssets.ts): seleção dos assets de desenvolvimento e produção.
- [apps/desktop/src/app/DesktopAppIdentity.ts](apps/desktop/src/app/DesktopAppIdentity.ts): nome nativo, painel About e dock.
- [apps/desktop/scripts/electron-launcher.mjs](apps/desktop/scripts/electron-launcher.mjs): nome, ícone, bundle metadata e `Info.plist`.
- [scripts/build-desktop-artifact.ts](scripts/build-desktop-artifact.ts): staging e configuração dos ícones `icns`, ICO e Linux.
- [apps/desktop/resources/dmg/dmg-background-latest.svg](apps/desktop/resources/dmg/dmg-background-latest.svg): fundo do instalador.
- [apps/desktop/resources/dmg/dmg-background-nightly.svg](apps/desktop/resources/dmg/dmg-background-nightly.svg): fundo do instalador nightly.

Os backgrounds do DMG contêm texto e marca visíveis, incluindo “T3 CODE”, “Desktop” e instruções de instalação; eles precisam ser atualizados manualmente junto com o logo.

## 4. Mobile

### Configuração nativa

- [apps/mobile/app.config.ts](apps/mobile/app.config.ts): nome do app, ícone, splash screen, adaptive icon, cores de notificação, favicon web e variantes Dev/Preview/produção.
- `apps/mobile/assets/android-icon-mark.png`: marca do Android.
- `apps/mobile/assets/android-notification-icon.png`: ícone de notificação.
- [apps/mobile/assets/widget/T3Mark.svg](apps/mobile/assets/widget/T3Mark.svg): logo do widget.

### Componentes visuais

- [apps/mobile/src/components/BrandMark.tsx](apps/mobile/src/components/BrandMark.tsx): marca da tela de loading.
- [apps/mobile/src/components/T3Wordmark.tsx](apps/mobile/src/components/T3Wordmark.tsx): SVG do wordmark.
- [apps/mobile/src/components/CompactBrandTitle.tsx](apps/mobile/src/components/CompactBrandTitle.tsx): marca nos headers nativos.
- `apps/mobile/src/features/home/HomeHeader.tsx`: marca do cabeçalho da home.
- `apps/mobile/src/features/threads/ThreadNavigationSidebar.tsx`: marca da navegação de threads.
- `apps/mobile/src/components/LoadingScreen.tsx`: marca durante carregamento.

### Plugins e tema

- [apps/mobile/plugins/withWidgetLogoAsset.cjs](apps/mobile/plugins/withWidgetLogoAsset.cjs): empacotamento do logo do widget.
- [apps/mobile/plugins/withShareExtensionDisplayName.cjs](apps/mobile/plugins/withShareExtensionDisplayName.cjs): nome da Share Extension.
- [apps/mobile/global.css](apps/mobile/global.css): tokens globais.
- `apps/mobile/src/lib/mobileTheme.ts`: tema e cores.
- `apps/mobile/src/lib/mobileDefaultTheme.ts`: valores padrão.
- `apps/mobile/src/lib/useFontFamily.ts`: famílias tipográficas.

## 5. Site de marketing

Atualizar:

- `apps/marketing/public/favicon.ico`
- `apps/marketing/public/icon.png`
- `apps/marketing/public/icon.webp`
- `apps/marketing/public/apple-touch-icon.png`
- [apps/marketing/src/layouts/Layout.astro](apps/marketing/src/layouts/Layout.astro): metadata, favicon, navegação, logo do footer, fontes e cores.
- [apps/marketing/src/pages/index.astro](apps/marketing/src/pages/index.astro): hero, textos, ilustrações e SVGs de plataformas/providers.
- [apps/marketing/src/pages/download.astro](apps/marketing/src/pages/download.astro): título, textos e ícones de plataformas.

Se o novo branding alterar a aparência da aplicação mostrada nos screenshots do marketing, os screenshots também precisam ser recriados.

As páginas legais possuem metadata e textos com o nome atual; atualizá-los somente se o nome exibido da marca também mudar.

## 6. Identificadores que devem permanecer intactos

Para limitar a mudança ao visual e evitar incompatibilidades, preservar:

- `slug: "t3-code"`.
- Schemes `t3code`, `t3code-dev` e `t3code-preview`.
- Bundle IDs e `appId` do Electron.
- Nomes de pacotes `@t3tools/*`.
- Diretórios de dados, chaves persistidas e namespaces internos.
- Endpoints OAuth, Clerk, WebSocket e protocolos de atualização.
- Contratos entre servidor, web, desktop e mobile.

É seguro alterar nomes visíveis, logos, cores, fontes, splash screens, favicons, ícones e textos de marketing sem alterar esses identificadores.

## Ordem recomendada

1. Definir o novo logo, wordmark, paleta, fontes e variantes.
2. Atualizar os três projetos `app-icon.icon`.
3. Regenerar e validar os assets nativos e web.
4. Atualizar web/PWA e o branding da sidebar.
5. Atualizar o shell Desktop, o instalador DMG e os metadados nativos.
6. Atualizar configuração, componentes e widgets do Mobile.
7. Atualizar marketing, screenshots e textos visíveis.
8. Inspecionar os outputs gerados sem editar diretamente os diretórios `dist`, `ios` ou `android`.
