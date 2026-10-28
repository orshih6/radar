// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { QuestionDraft } from "./DiagnoseContext";
import { QuestionComposer } from "./QuestionComposer";

const state = vi.hoisted(() => ({
  openInvestigation: vi.fn(),
  saveQuestionDraft: vi.fn(),
  questionDraft: null as null | QuestionDraft,
  actives: ["shop"],
  issues: [] as unknown[],
  pinIssues: [] as unknown[],
  searchHits: [] as unknown[],
}));

vi.mock("./DiagnoseContext", () => ({
  useDiagnose: () => ({
    openInvestigation: state.openInvestigation,
    agentLabel: "Claude Code",
    questionDraft: state.questionDraft,
    saveQuestionDraft: state.saveQuestionDraft,
  }),
}));
vi.mock("../../api/client", () => ({
  useNamespaceScope: () => ({
    data: { actives: state.actives, accessibleNamespaces: ["shop", "web"] },
  }),
  useIssues: () => ({ data: { issues: state.issues } }),
  useResourceIssues: () => ({ data: state.pinIssues }),
  useSearch: () => ({
    data: { hits: state.searchHits },
    isFetching: false,
    isPlaceholderData: false,
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;

beforeEach(() => {
  state.openInvestigation.mockReset();
  state.saveQuestionDraft.mockReset();
  state.questionDraft = null;
  state.issues = [];
  state.pinIssues = [];
  state.searchHits = [];
  state.actives = ["shop"];
  const element = document.createElement("div");
  document.body.appendChild(element);
  root = createRoot(element);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

async function render() {
  await act(async () => root.render(<QuestionComposer />));
}

function textarea() {
  return document.querySelector("textarea")!;
}

async function type(value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(textarea(), value);
    textarea().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(key: string) {
  await act(async () => {
    textarea().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

describe("QuestionComposer", () => {
  it("starts a question-only run where the namespace picker points", async () => {
    await render();
    await type("  checkout returns 502s  ");
    await press("Enter");
    expect(state.openInvestigation).toHaveBeenCalledWith({
      kind: "",
      group: "",
      namespace: "",
      name: "",
      question: "checkout returns 502s",
      namespaces: ["shop"],
      lookBack: "1h",
      askedAt: undefined,
      fromComposer: true,
    });
  });

  it("does nothing without words", async () => {
    await render();
    await type("   ");
    await press("Enter");
    expect(state.openInvestigation).not.toHaveBeenCalled();
  });

  it("opens the resource picker on @ instead of typing it", async () => {
    await render();
    await press("@");
    const pinButton = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Pin a resource"),
    );
    expect(pinButton?.getAttribute("aria-expanded")).toBe("true");
    expect(textarea().value).toBe("");
  });

  it("asks about a handed-off resource instead of the namespaces", async () => {
    state.questionDraft = {
      seq: 1,
      pin: {
        kind: "Deployment",
        group: "apps",
        namespace: "shop",
        name: "api",
      },
    };
    await render();
    expect(document.body.textContent).toContain("Deployment shop/api");
    await type("why did it restart?");
    await press("Enter");
    expect(state.openInvestigation).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "Deployment",
        name: "api",
        question: "why did it restart?",
        namespaces: [],
      }),
    );
  });

  it("suggests only from live issues", async () => {
    await render();
    expect(document.body.textContent).not.toContain("From what Radar sees now");
    state.issues = [
      {
        id: "i",
        severity: "critical",
        source: "problem",
        category: "crashloop",
        category_group: "runtime",
        grouping_scope: "workload",
        kind: "Deployment",
        group: "apps",
        namespace: "shop",
        name: "api",
        reason: "CrashLoopBackOff",
      },
    ];
    await render();
    expect(document.body.textContent).toContain("From what Radar sees now");
  });

  it("suggests from the pinned resource's own issues", async () => {
    state.questionDraft = {
      seq: 1,
      pin: {
        kind: "Deployment",
        group: "apps",
        namespace: "shop",
        name: "api",
      },
    };
    state.issues = [
      {
        id: "elsewhere",
        severity: "critical",
        source: "problem",
        category: "crashloop",
        category_group: "runtime",
        grouping_scope: "workload",
        kind: "Deployment",
        group: "apps",
        namespace: "other",
        name: "x",
        reason: "CrashLoopBackOff",
      },
    ];
    state.pinIssues = [
      {
        id: "np",
        severity: "warning",
        source: "problem",
        category: "network_policy_denies",
        category_group: "networking",
        grouping_scope: "workload",
        kind: "NetworkPolicy",
        group: "networking.k8s.io",
        namespace: "shop",
        name: "deny-all",
        reason: "DenyAll",
      },
    ];
    await render();
    const text = document.body.textContent ?? "";
    expect(text).toContain("on NetworkPolicy shop/deny-all?");
    expect(text).not.toContain("other/x");
  });

  it("gives back unsent words when it unmounts", async () => {
    await render();
    await type("half a question");
    await act(async () => root.render(<></>));
    expect(state.saveQuestionDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: "half a question" }),
    );
  });

  it("starts from a saved draft without treating it as a new hand-off", async () => {
    state.questionDraft = { seq: 3, text: "where I left off", lookBack: "6h" };
    await render();
    expect(textarea().value).toBe("where I left off");
    expect(
      document.querySelector('[role="radio"][aria-checked="true"]')
        ?.textContent,
    ).toBe("6h");
  });

  it("hands a submitted question to its start, not the draft", async () => {
    await render();
    await type("question A");
    await press("Enter");
    await act(async () => root.render(<></>));
    expect(state.saveQuestionDraft).toHaveBeenLastCalledWith({});
  });

  it("does not let a returned question overwrite newer words", async () => {
    await render();
    await type("question B");
    state.questionDraft = { seq: 2, text: "question A", restore: true };
    await render();
    expect(textarea().value).toBe("question B");
  });

  it("keeps when a handed-over question was first asked until it is edited", async () => {
    state.questionDraft = {
      seq: 1,
      text: "checkout 502s",
      askedAt: "2026-10-27T09:00:00Z",
    };
    await render();
    await press("Enter");
    expect(state.openInvestigation).toHaveBeenLastCalledWith(
      expect.objectContaining({ askedAt: "2026-10-27T09:00:00Z" }),
    );
    await type("checkout 502s again");
    await press("Enter");
    expect(state.openInvestigation).toHaveBeenLastCalledWith(
      expect.objectContaining({ askedAt: undefined }),
    );
  });

  it("opens the picker when asked to choose a resource", async () => {
    state.questionDraft = { seq: 1, text: "why?", pickResource: true };
    await render();
    expect(
      document.querySelector(
        'input[aria-label="Search for a resource to pin"]',
      ),
    ).not.toBeNull();
  });

  it("pins the highlighted search result with the keyboard", async () => {
    state.searchHits = [
      {
        score: 2,
        kind: "Deployment",
        group: "apps",
        namespace: "shop",
        name: "api",
      },
      { score: 1, kind: "Service", group: "", namespace: "shop", name: "api" },
    ];
    await render();
    await press("@");
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search for a resource to pin"]',
    )!;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(input, "api");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const key = (k: string) =>
      act(async () => {
        input.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: k,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
    await key("ArrowDown");
    expect(
      document.querySelector('[role="option"][aria-selected="true"]')
        ?.textContent,
    ).toContain("Service");
    await key("Enter");
    expect(document.body.textContent).toContain("Service shop/api");
  });

  it("starts across the cluster when more namespaces are picked than a run takes", async () => {
    state.actives = Array.from({ length: 21 }, (_, i) => `ns-${i}`);
    await render();
    expect(document.body.textContent).toContain("All namespaces (21 selected)");
    await type("why?");
    await press("Enter");
    expect(state.openInvestigation).toHaveBeenLastCalledWith(
      expect.objectContaining({ namespaces: [] }),
    );
    state.actives = ["shop"];
  });
});
