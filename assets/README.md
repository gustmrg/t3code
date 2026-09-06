# Gusty Code brand assets

The active identity and export workflow are documented in [the design system](../docs/branding/design-system.md). Canonical SVGs live in `gusty/`. Run `vp run icons:export` to regenerate all 37 raster outputs and `vp run icons:check` to verify them. Do not edit generated PNGs or ICOs.

## Optional Icon Composer workflow

The native projects remain in `dev/app-icon.icon`, `nightly/app-icon.icon` and `prod/app-icon.icon`. Their foreground is the canonical Gusty mark. The optional `vp run icons:export:composer` requires Icon Composer 2 on macOS and manual pre-Tahoe macOS exports; see the exporter’s instructions. The active export uses Sharp and the Gusty kit’s macOS container instead.
