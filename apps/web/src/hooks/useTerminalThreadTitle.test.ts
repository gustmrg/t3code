import { expect, it } from "vite-plus/test";
import type { TerminalSummary } from "@t3tools/contracts";
import { terminalThreadTitle } from "./useTerminalThreadTitle";
const summary: TerminalSummary = {
  threadId: "thread",
  terminalId: "term-1",
  cwd: "/fixture",
  worktreePath: null,
  status: "running",
  pid: 123,
  exitCode: null,
  exitSignal: null,
  hasRunningSubprocess: true,
  label: "codex",
  updatedAt: "2026-09-06T00:00:00Z",
  agentSession: {
    provider: "codex",
    sessionId: "session",
    model: null,
    state: "working",
    title: "Fix desktop controls",
  },
};
it("uses native title only for an untouched placeholder", () => {
  expect(terminalThreadTitle("New thread", summary)).toBe("Fix desktop controls");
  expect(terminalThreadTitle("My manual title", summary)).toBe("My manual title");
  expect(terminalThreadTitle("New thread", null)).toBe("New thread");
});
