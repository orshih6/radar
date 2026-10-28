// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QuestionComposer } from "./QuestionComposer";

const state = vi.hoisted(() => ({
  openInvestigation: vi.fn(),
  questionDraft: null as null | {
    seq: number;
    text?: string;
    pin?: { kind: string; group: string; namespace: string; name: string };
  },
  actives: ["shop"],
  issues: [] as unknown[],
}));

vi.mock("./DiagnoseContext", () => ({
  useDiagnose: () => ({
    openInvestigation: state.openInvestigation,
    agentLabel: "Claude Code",
    questionDraft: state.questionDraft,
  }),
}));
vi.mock("../../api/client", () => ({
  useNamespaceScope: () => ({
    data: { actives: state.actives, accessibleNamespaces: ["shop", "web"] },
  }),
  useIssues: () => ({ data: { issues: state.issues } }),
  useSearch: () => ({ data: { hits: [] }, isFetching: false }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;

beforeEach(() => {
  state.openInvestigation.mockReset();
  state.questionDraft = null;
  state.issues = [];
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
});
