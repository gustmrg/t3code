// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - Standalone Sharp asset generator uses Node buffers and filesystem APIs before any app runtime.
/** Deterministic exports of the supplied Gusty vectors; no Icon Composer installation required. */
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import sharp from "sharp";
import { encodePngIco, WINDOWS_ICON_SIZES } from "./lib/icon-export.ts";
import { BRAND_ASSET_PATHS, resolveWebIconOverrides } from "./lib/brand-assets.ts";

const root = NodeURL.fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");
const mark = await NodeFSP.readFile(NodePath.join(root, "assets/gusty/gusty-mark.svg"), "utf8");
const mono = await NodeFSP.readFile(
  NodePath.join(root, "assets/gusty/gusty-mark-light.svg"),
  "utf8",
);
const inner = (svg: string) => svg.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const tile = (mac: boolean) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect x="${mac ? 48 : 0}" y="${mac ? 48 : 0}" width="${mac ? 416 : 512}" height="${mac ? 416 : 512}" rx="${mac ? 96 : 0}" fill="#0B1020"/><g transform="translate(64 64) scale(.75)">${inner(mark)}</g></svg>`;
const png = async (svg: string, size: number) => {
  const raster = await sharp(Buffer.from(svg), { density: Math.max(72, (size / 512) * 288) })
    .resize(size * 4, size * 4)
    .png()
    .toBuffer();
  return sharp(raster).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
};
const outputs = new Map<string, Buffer>();
const full = await png(tile(false), 1024);
const mac = await png(tile(true), 1024);
const universal = await png(mark, 1024);
const apple = await png(tile(false), 180);
const favicon16 = await png(mark, 16);
const favicon32 = await png(mark, 32);
const favicon = encodePngIco(
  await Promise.all([16, 32, 48].map(async (size) => ({ size, contents: await png(mark, size) }))),
);
const windows = encodePngIco(
  await Promise.all(
    WINDOWS_ICON_SIZES.map(async (size) => ({ size, contents: await png(mark, size) })),
  ),
);
for (const [key, target] of Object.entries(BRAND_ASSET_PATHS)) {
  if (key.endsWith("Project")) continue;
  const content =
    key.includes("Mac") || key === "developmentDesktopIconPng"
      ? mac
      : key.includes("Ios")
        ? full
        : key.includes("Windows")
          ? windows
          : key.includes("Favicon16")
            ? favicon16
            : key.includes("Favicon32")
              ? favicon32
              : key.includes("FaviconIco")
                ? favicon
                : key.includes("AppleTouch")
                  ? apple
                  : universal;
  outputs.set(target, content);
}
for (const directory of ["apps/web/public", "apps/marketing/public"]) {
  for (const entry of resolveWebIconOverrides("production", directory)) {
    const content = outputs.get(entry.sourceRelativePath);
    if (!content) throw new Error(`Missing source: ${entry.sourceRelativePath}`);
    outputs.set(entry.targetRelativePath, content);
  }
}
outputs.set("apps/marketing/public/icon.png", full);
outputs.set(
  "apps/marketing/public/icon.webp",
  await sharp(full).webp({ lossless: true }).toBuffer(),
);
// Adaptive foreground retains Android's central safe area; notification is monochrome alpha.
const adaptive = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(100 100) scale(.609375)">${inner(mark)}</g></svg>`;
outputs.set("apps/mobile/assets/android-adaptive-foreground.png", await png(adaptive, 1024));
outputs.set(
  "apps/mobile/assets/android-icon-mark.png",
  await png(adaptive.replace(/fill="url\(#[^)]+\)"/g, 'fill="#ffffff"'), 1024),
);
outputs.set(
  "apps/mobile/assets/android-notification-icon.png",
  await png(mono.replaceAll("#E5E7EB", "#ffffff"), 96),
);
const stale: string[] = [];
for (const [relative, data] of outputs) {
  const target = NodePath.join(root, relative);
  if (check) {
    const existing = await NodeFSP.readFile(target).catch(() => null);
    if (!existing?.equals(data)) stale.push(relative);
  } else {
    await NodeFSP.mkdir(NodePath.dirname(target), { recursive: true });
    await NodeFSP.writeFile(target, data);
  }
}
if (stale.length) throw new Error(`Outdated Gusty assets:\n${stale.join("\n")}`);
console.log(`${check ? "Verified" : "Exported"} ${outputs.size} Gusty Code assets.`);
