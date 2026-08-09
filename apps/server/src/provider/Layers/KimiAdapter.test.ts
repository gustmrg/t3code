import { describe, expect, it } from "@effect/vitest";
import type * as EffectAcpSchema from "effect-acp/schema";

import {
  classifyKimiPermissionRequest,
  kimiPermissionQuestions,
  selectKimiPermissionOptionId,
  selectKimiUserInputOptionId,
} from "./KimiAdapter.ts";

const request = (
  options: ReadonlyArray<{
    optionId: string;
    name: string;
    kind?: EffectAcpSchema.PermissionOption["kind"];
  }>,
): EffectAcpSchema.RequestPermissionRequest => ({
  sessionId: "session-1",
  toolCall: { toolCallId: "tool-1", title: "Choose wisely" },
  options: options.map((option) => ({
    optionId: option.optionId,
    name: option.name,
    kind: option.kind ?? "allow_once",
  })),
});

describe("Kimi permission classifier", () => {
  it("classifies ordinary approval ids and maps every decision", () => {
    const value = request([
      { optionId: "approve_once", name: "Approve once" },
      { optionId: "approve_always", name: "Always approve", kind: "allow_always" },
      { optionId: "reject", name: "Reject", kind: "reject_once" },
    ]);
    expect(classifyKimiPermissionRequest(value)).toBe("standard");
    expect(selectKimiPermissionOptionId(value, "accept")).toBe("approve_once");
    expect(selectKimiPermissionOptionId(value, "acceptForSession")).toBe("approve_always");
    expect(selectKimiPermissionOptionId(value, "decline")).toBe("reject");
  });

  it("supports legacy standard ids without selecting by display order", () => {
    const value = request([
      { optionId: "reject_once", name: "No", kind: "reject_once" },
      { optionId: "allow_once", name: "Yes" },
    ]);
    expect(classifyKimiPermissionRequest(value)).toBe("standard");
    expect(selectKimiPermissionOptionId(value, "accept")).toBe("allow_once");
  });

  it("classifies a question, preserves labels, and resolves the exact option id", () => {
    const value = request([
      { optionId: "q0_opt_0", name: "Alpha" },
      { optionId: "q0_opt_1", name: "Beta" },
      { optionId: "q0_opt_2", name: "Gamma" },
      { optionId: "q0_skip", name: "Skip" },
    ]);
    expect(classifyKimiPermissionRequest(value)).toBe("question");
    expect(kimiPermissionQuestions(value, "question")[0]?.options.map((o) => o.label)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
      "Skip",
    ]);
    expect(selectKimiUserInputOptionId(value, { "tool-1": ["Beta"] })).toBe("q0_opt_1");
    expect(selectKimiUserInputOptionId(value, {})).toBeUndefined();
  });

  it.each([
    ["plan_opt_0", "Alternative A"],
    ["plan_opt_1", "Alternative B"],
    ["plan_approve", "Approve"],
    ["plan_revise", "Revise"],
    ["plan_reject_and_exit", "Reject and exit"],
  ])("classifies plan option %s", (optionId, name) => {
    const value = request([{ optionId, name }]);
    expect(classifyKimiPermissionRequest(value)).toBe("plan");
    expect(selectKimiUserInputOptionId(value, { "tool-1": name })).toBe(optionId);
  });

  it("fails closed for mixed or unknown namespaces", () => {
    expect(
      classifyKimiPermissionRequest(
        request([
          { optionId: "q0_opt_0", name: "Question" },
          { optionId: "approve_once", name: "Approval" },
        ]),
      ),
    ).toBe("unknown");
    expect(classifyKimiPermissionRequest(request([{ optionId: "mystery", name: "Mystery" }]))).toBe(
      "unknown",
    );
  });
});
