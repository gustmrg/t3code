import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { WorkspaceModeControl } from "./WorkspaceModeControl";
describe("WorkspaceModeControl", () => {
  it("selects Terminal and renders a truly disabled Chat with visible and accessible explanation", () => {
    const html = renderToStaticMarkup(<WorkspaceModeControl />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Terminal/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Chat/);
    expect(html).toContain("Coming soon");
    expect(html).toContain(
      "View this terminal session as a conversation. Coming in a future update.",
    );
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("aria-describedby=");
  });
});
