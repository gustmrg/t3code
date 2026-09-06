import type { ReactNode, ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

const state = vi.hoisted(() => ({
  draft: { environmentId: "remote", threadId: "thread", launchView: "terminal" } as {
    environmentId: string;
    threadId: string;
    launchView: string;
  },
  preparation: undefined as
    | undefined
    | { status: string; message?: string; retry?: () => Promise<void> },
  serverThread: null as null | { terminalWorkspace: object },
  chat: vi.fn(() => <div>Chat timeline and composer</div>),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ draftId: "draft" }),
  }),
  useNavigate: () => vi.fn(),
}));
vi.mock("../components/ChatView", () => ({ default: state.chat }));
vi.mock("../components/ChatView.logic", () => ({
  threadHasStarted: () => false,
  resolveDraftPromotionNavigationTarget: () => null,
}));
vi.mock("../composerDraftStore", () => ({
  DraftId: { make: (id: string) => id },
  useComposerDraftStore: (select: (store: unknown) => unknown) =>
    select({
      getDraftSession: () => state.draft,
      getDraftSessionByRef: () => state.draft,
    }),
  useBackgroundDraftSubmissionPending: () => false,
  markPromotedDraftThreadByRef: vi.fn(),
}));
vi.mock("../terminalPreparationStore", () => ({
  useTerminalPreparationStore: (select: (store: unknown) => unknown) =>
    select({
      byThread: new Proxy({}, { get: () => state.preparation }),
    }),
}));
vi.mock("../state/entities", () => ({
  useThreadRefs: () =>
    state.serverThread
      ? [scopeThreadRef(EnvironmentId.make("remote"), ThreadId.make("thread"))]
      : [],
  useThread: () => state.serverThread,
}));
vi.mock("../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => vi.fn() }));
vi.mock("../components/ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("../components/WorkspacePageHeader", () => ({
  WorkspacePageHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}));

import { Route } from "./_chat.draft.$draftId";
const Component = Route.options.component as ComponentType;

describe("terminal draft route", () => {
  beforeEach(() => {
    state.chat.mockClear();
    state.draft.launchView = "terminal";
    state.serverThread = null;
    state.preparation = { status: "preparing" };
  });

  it("does not mount chat before materialization, during receipt/worktree waits, or during PTY opening", () => {
    expect(renderToStaticMarkup(<Component />)).toContain("Preparing terminal");
    state.serverThread = { terminalWorkspace: { mainTerminalId: "term-1" } };
    expect(renderToStaticMarkup(<Component />)).toContain("Preparing terminal");
    expect(state.chat).not.toHaveBeenCalled();
  });

  it("keeps errors and retries in Terminal", () => {
    state.preparation = { status: "failed", message: "PTY unavailable", retry: async () => {} };
    const html = renderToStaticMarkup(<Component />);
    expect(html).toContain("PTY unavailable");
    expect(html).toContain("Retry");
    expect(state.chat).not.toHaveBeenCalled();
  });

  it("offers recovery after reload instead of remaining in preparation", () => {
    state.preparation = undefined;
    const html = renderToStaticMarkup(<Component />);
    expect(html).toContain("preparation was interrupted");
    expect(html).toContain("Start new thread");
    expect(state.chat).not.toHaveBeenCalled();
  });

  it("preserves the traditional chat draft", () => {
    state.draft.launchView = "chat";
    expect(renderToStaticMarkup(<Component />)).toContain("Chat timeline and composer");
    expect(state.chat).toHaveBeenCalledOnce();
  });
});
