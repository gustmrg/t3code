import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { PanelLayoutControls } from "./PanelLayoutControls";

describe("PanelLayoutControls", () => {
  it.each([false, true])(
    "reflects drawer visibility independently of the main workspace (%s)",
    (terminalOpen) => {
      const html = renderToStaticMarkup(
        <PanelLayoutControls
          terminalAvailable
          terminalOpen={terminalOpen}
          terminalShortcutLabel={null}
          rightPanelAvailable
          rightPanelOpen
          rightPanelShortcutLabel={null}
          liveAgentCount={0}
          onToggleTerminal={vi.fn()}
          onToggleRightPanel={vi.fn()}
        />,
      );
      const button = html.match(/<button[^>]*aria-label="Toggle terminal drawer"[^>]*>/)?.[0];
      expect(button).toBeDefined();
      expect(button).toContain(`aria-pressed="${terminalOpen}"`);
      expect(button).not.toContain(' disabled=""');
      expect(html).not.toContain("Focus main terminal");
    },
  );
});
