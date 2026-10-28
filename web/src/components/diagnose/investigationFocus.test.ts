import { describe, expect, it } from "vitest";

import { focusFromCase } from "./investigationFocus";
import type {
  InvestigationCaseItem,
  InvestigationCaseResolution,
} from "./investigationCase";

function item(
  role: InvestigationCaseItem["role"],
  tool: string,
  args: Record<string, unknown>,
  patch: Partial<InvestigationCaseItem["source"]> = {},
): InvestigationCaseItem {
  return {
    index: 0,
    role,
    claim: "",
    placement: "card",
    source: {
      id: `${tool}-${JSON.stringify(args)}`,
      turnIndex: 0,
      timelineIndex: 0,
      stepId: "s",
      tool,
      args: JSON.stringify(args),
      order: 0,
      phase: "initial",
      confirmedSuccess: true,
      ...patch,
    },
  };
}

const resolution = (
  items: InvestigationCaseItem[],
): InvestigationCaseResolution => ({ items, ruledOut: [] });

describe("focusFromCase", () => {
  it("names resources by the arguments Radar recorded, causes first", () => {
    const focus = focusFromCase(
      resolution([
        item("symptom", "get_pod_logs", { namespace: "shop", name: "api-0" }),
        item("cause", "get_resource", {
          kind: "configmaps",
          namespace: "shop",
          name: "api-config",
        }),
      ]),
    );
    expect(focus).toEqual([
      { kind: "ConfigMap", group: "", namespace: "shop", name: "api-config" },
      { kind: "Pod", group: "", namespace: "shop", name: "api-0" },
    ]);
  });

  it("names the cited issue's subject, not the resource the read was about", () => {
    const cause = item("cause", "diagnose", {
      kind: "Deployment",
      namespace: "gl-netpol",
      name: "web",
    });
    cause.observation = {
      data: {
        type: "issue",
        relevance: "producer-related",
        issue: {
          kind: "NetworkPolicy",
          group: "networking.k8s.io",
          namespace: "gl-netpol",
          name: "deny-all-ingress",
        },
      },
    } as unknown as InvestigationCaseItem["observation"];
    expect(focusFromCase(resolution([cause]))).toEqual([
      {
        kind: "NetworkPolicy",
        group: "networking.k8s.io",
        namespace: "gl-netpol",
        name: "deny-all-ingress",
      },
    ]);
  });

  it("names a bound resource by its apiVersion group", () => {
    const cause = item("cause", "list_resources", { kind: "configmaps" });
    cause.observation = {
      data: {
        type: "resource",
        resource: {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: { namespace: "shop", name: "api" },
        },
        warnings: [],
      },
    } as unknown as InvestigationCaseItem["observation"];
    expect(focusFromCase(resolution([cause]))).toEqual([
      { kind: "Deployment", group: "apps", namespace: "shop", name: "api" },
    ]);
  });

  it("spells an agent's lowercase kind the Kubernetes way", () => {
    expect(
      focusFromCase(
        resolution([
          item("cause", "diagnose", {
            kind: "deployment",
            namespace: "gl-missing-cm",
            name: "checkout",
          }),
        ]),
      ),
    ).toEqual([
      {
        kind: "Deployment",
        group: "",
        namespace: "gl-missing-cm",
        name: "checkout",
      },
    ]);
  });

  it("ignores broad reads, context, failed reads and repeats", () => {
    const focus = focusFromCase(
      resolution([
        item("cause", "search", { query: "checkout" }),
        item("context", "get_resource", { kind: "Pod", name: "x" }),
        item(
          "cause",
          "get_resource",
          { kind: "Pod", namespace: "shop", name: "denied" },
          { confirmedSuccess: false },
        ),
        item("cause", "diagnose", {
          kind: "Deployment",
          group: "apps",
          namespace: "shop",
          name: "api",
        }),
        item("symptom", "get_events", {
          kind: "Deployment",
          group: "apps",
          namespace: "shop",
          name: "api",
        }),
      ]),
    );
    expect(focus).toEqual([
      { kind: "Deployment", group: "apps", namespace: "shop", name: "api" },
    ]);
  });
});
