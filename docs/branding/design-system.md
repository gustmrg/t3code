# Gusty Code design system

Version 1.0 / 6 September 2026

## 1. Identity

Gusty Code expresses useful momentum: turning ideas into working software while keeping the workspace clear and composed. The name links a gust of wind with making and coding. The identity is energetic in its accents and calm in its surfaces.

The mark develops option **05 - Geometrico** from the supplied concept board. Four tapered crescent arms orbit an open hurricane eye. The silhouette was redrawn by hand with cubic Bezier paths, smoothing the raster reference without changing its four-arm structure. The central space represents focus; the surrounding curves suggest movement and iteration. These are intended brand meanings, not claims about a finished product.

The canonical source is `assets/gusty/gusty-mark.svg`. It contains four closed paths, actual vector gradients and transparent negative space. It contains no embedded image, font, filter, script or external asset. Every delivered mark and icon is derived from this geometry.

Use the name **Gusty Code**, with a space and both words capitalized. The horizontal lockup pairs the symbol with Gusty in Avenir Next Demi Bold and Code in Avenir Next Regular. Its lettering is converted to vector paths, so the delivered SVGs do not need those fonts installed. Use the mark alone in app icons and compact navigation. No tagline or abbreviation is required. Do not introduce alternate initials as independent logos.

## 2. Logo system

| Asset                                  | Use                                                       |
| -------------------------------------- | --------------------------------------------------------- |
| `assets/gusty/gusty-mark.svg`          | Primary cyan-blue-violet mark, transparent                |
| `assets/gusty/gusty-mark-light.svg`    | Mist monochrome mark on dark backgrounds                  |
| `assets/gusty/gusty-mark-dark.svg`     | Midnight monochrome mark on light backgrounds             |
| `assets/gusty/gusty-mark-current.svg`  | Inline SVG that inherits `currentColor`                   |
| `assets/gusty/gusty-logo-on-dark.svg`  | Horizontal logo with outlined Mist / light-blue lettering |
| `assets/gusty/gusty-logo-on-light.svg` | Horizontal logo with outlined Midnight / Blue lettering   |

Use them at 180px wide or larger, with at least one eighth of the visible symbol height as surrounding clear space. Do not change the lettering, symbol-to-type scale or spacing independently.

Keep the supplied orientation, four arms and open eye. All variants use the same path data. Do not mirror, stretch, rotate individual arms, add a fifth arm, close the eye or change the gradients independently. Avoid bevels, glow, drop shadows, extra outlines and patterns behind the mark.

**Clear space:** reserve at least one eighth of the visible mark's height on all sides. The SVG's built-in margin is part of the canvas; add layout spacing as needed to reach this clear space outside the visible silhouette. App containers use their own fixed spacing and must not be cropped.

**Minimum sizes:** use the standalone mark at 24 CSS px or larger in ordinary UI. The supplied 16px and 20px PNGs are reserved for OS icon slots. Use the template version at 18 logical pixels in the macOS menu bar. Omit any wordmark or tagline at these sizes. At 16px the crescent tips necessarily soften; do not compensate by stretching the icon.

On textured or low-contrast backgrounds, use a solid neutral container or the appropriate monochrome mark. The color version is decorative brand artwork; it is not a replacement for a functional status icon.

## 3. Color palette

Emerald has been removed from the active identity, gradients and tokens. The five core colors are:

| Name     | Hex       | Role                                                    |
| -------- | --------- | ------------------------------------------------------- |
| Midnight | `#0B1020` | Main dark background; dark monochrome logo              |
| Blue     | `#2563EB` | Primary actions and the middle of the brand gradient    |
| Violet   | `#8B5CF6` | Secondary brand accent; gradient endpoint               |
| Cyan     | `#06B6D4` | Bright accent; focus and completion emphasis on dark UI |
| Mist     | `#E5E7EB` | Main text on dark backgrounds; light monochrome logo    |

The decorative gradient is `linear-gradient(135deg, #06B6D4 0%, #2563EB 50%, #8B5CF6 100%)`. The logo uses these same stops in per-arm directions defined in the SVG. Preserve those directions. Use neutral surfaces for most of the UI, solid blue for the main action, and gradients sparingly in identity artwork. Avoid gradient body text and gradient button backgrounds.

Supporting neutrals and accessible tints are implementation colors, not extra brand accents:

| Role             | Dark theme            | Light theme           |
| ---------------- | --------------------- | --------------------- |
| Background       | `#0B1020`             | `#F8FAFC`             |
| Surface          | `#111A2E`             | `#FFFFFF`             |
| Text             | `#E5E7EB`             | `#0B1020`             |
| Muted text       | `#94A3B8`             | `#475569`             |
| Link             | `#60A5FA`             | `#1D4ED8`             |
| Subtle divider   | `#334155`             | `#CBD5E1`             |
| Control boundary | `#64748B`             | `#64748B`             |
| Action / hover   | `#2563EB` / `#1D4ED8` | `#2563EB` / `#1D4ED8` |
| Action label     | `#FFFFFF`             | `#FFFFFF`             |
| Focus ring       | `#06B6D4`             | `#2563EB`             |
| Completed state  | `#06B6D4`             | `#0E7490`             |

Use a check icon and the text "Completed" with the success color. Success and focus share cyan only when shape and labeling distinguish them. Error and warning semantics remain a product-level decision; do not use the brand gradient to imply an error or use color alone to convey status.

## 4. Accessibility and UI foundations

Normal text needs at least 4.5:1 contrast; large text needs at least 3:1. Large text means at least 24 CSS px regular or approximately 18.67 CSS px bold. Necessary control boundaries and meaningful graphical objects need at least 3:1 against adjacent colors. These thresholds follow [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

The computed pairings are recorded in `assets/gusty/contrast-report.json`. Use the lighter blue link token on dark UI, not brand Blue: brand Blue on Midnight is below the normal-text threshold. Use white, not Mist, for labels on blue buttons. Subtle dividers are decorative; use the control-boundary token when an outline is needed to identify an input. Use a 2px focus outline with a 2px neutral offset, so it is distinguishable from the button fill. Check new combinations independently; this palette is not a complete accessibility certification.

**Typography:** use the native system sans serif for product UI: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Use `ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace` for code and command output. This kit does not bundle or require custom fonts.

| Role              | Size / line height | Weight    |
| ----------------- | ------------------ | --------- |
| Caption           | 12px / 16px        | 400-500   |
| Body / control    | 14px / 21px        | 400 / 500 |
| Emphasized body   | 16px / 24px        | 400-500   |
| Section heading   | 20px / 28px        | 600       |
| Page heading      | 28px / 36px        | 600       |
| Marketing display | 40px / 48px        | 600       |

Use sentence case in product UI. Keep uppercase tracking for rare short labels. Write direct, specific messages: "Build completed" rather than vague celebration. Avoid making routine actions sound dramatic.

**Layout:** use the spacing scale 4, 8, 12, 16, 24, 32, 48 and 64px. Use 8px corners on controls, 12px on cards and 16px on dialogs. Favor 36-40px control height; dense desktop toolbars can use 32px with adequate separation. This is a foundation for the future application, not a delivered component library.

**Motion:** use 120ms for hover/focus changes, 180ms for ordinary transitions and 240ms for panels. Avoid decorative continuous spinning of the logo. A progress indicator may rotate only while work is actually pending, with a static alternative when `prefers-reduced-motion` is enabled. The provided CSS sets duration tokens to zero for that preference.

The source tokens are in `assets/gusty/tokens.json`. Web and desktop expose the Gusty Code theme in Settings → Appearance, with light, dark and system appearance.

## 5. Repository integration

The canonical SVGs are in `assets/gusty/`. `vp run icons:export` generates all tracked web, desktop and mobile raster assets with Sharp; `vp run icons:check` compares every output byte for byte. Do not edit generated PNGs or ICOs. The exporter uses the supplied kit’s macOS tile (416px at 48px inset on a 512px canvas, with a 96px corner radius) and a bare mark for Windows/Linux. Android adaptive foregrounds reserve a central safe area; notification icons are monochrome.

The three Icon Composer projects also contain the new canonical mark, with glass, shadows and decorative layers disabled. The original native exporter remains available as `vp run icons:export:composer`; it requires Icon Composer 2 and manual macOS export. The active Sharp pipeline uses the kit’s geometry and does not claim to produce Apple’s native pre-Tahoe shadow.

Visible names change to Gusty Code. Package names, app IDs, schemes, update endpoints, authentication integrations and stored data paths remain unchanged. Saved `t3-chat` and `t3-chat-dark` preferences resolve to Gusty Code, preserving the legacy dark hint.

The Electron internal name intentionally remains `T3 Code (stage)` so existing OS-backed encryption entries stay readable. The installed bundle, application menu and About panel use Gusty Code. [Electron distinguishes this internal name from the OS display name](https://www.electronjs.org/docs/latest/api/app#appsetnamename).

This checkout has no PWA manifest or custom DMG background files at the paths listed in REBRANDING.md; no new PWA or installer layout is introduced. The marketing screenshot must be recaptured in an authorized local browser session.

The built-in **T3 Code** theme retains its original name, light/dark palette and default appearance. Only the former pink **T3 Chat** theme is replaced by **Gusty Code**; the Gusty palette applies when that theme is selected.
