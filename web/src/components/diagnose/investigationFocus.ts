import {
  apiVersionToGroup,
  kindToPluralWithGroup,
  pluralToKind,
} from "../../utils/navigation";
import type {
  InvestigationCaseItem,
  InvestigationCaseResolution,
} from "./investigationCase";
import { investigationSourceArgs } from "./investigationEvidence/identity";
import { runTargetKey, type InvestigationTargetIdentity } from "./target";

// Reads that are about exactly the resource their arguments name. A broad
// read (a search, a namespace listing) proves nothing about which resource
// mattered, however its rows are cited.
const SINGLE_RESOURCE_TOOLS = new Set([
  "diagnose",
  "get_resource",
  "get_events",
  "get_neighborhood",
  "get_workload_logs",
  "get_pod_logs",
]);

// The resources a question-only assessment came to rest on, causes first.
// Each is named by what Radar produced, never by what the agent wrote: the
// resource or issue the citation bound to, or else the resource a
// single-resource read was asked about.
export function focusFromCase(
  investigationCase: InvestigationCaseResolution | undefined,
  max = 3,
): InvestigationTargetIdentity[] {
  if (!investigationCase) return [];
  const items = investigationCase.items
    .filter((item) => item.role === "cause" || item.role === "symptom")
    .sort((a, b) => Number(b.role === "cause") - Number(a.role === "cause"));
  const seen = new Set<string>();
  const focus: InvestigationTargetIdentity[] = [];
  for (const item of items) {
    const resource = boundResource(item) ?? readResource(item);
    if (!resource) continue;
    const key = runTargetKey(
      resource.kind,
      resource.namespace,
      resource.name,
      resource.group,
    );
    if (seen.has(key)) continue;
    seen.add(key);
    focus.push(resource);
    if (focus.length >= max) break;
  }
  return focus;
}

function boundResource(
  item: InvestigationCaseItem,
): InvestigationTargetIdentity | undefined {
  const data = item.observation?.data;
  if (data?.type === "resource" && data.resource.metadata?.name) {
    const group = apiVersionToGroup(data.resource.apiVersion);
    return identity(
      data.resource.kind,
      group,
      data.resource.metadata.namespace ?? "",
      data.resource.metadata.name,
    );
  }
  if (data?.type === "issue" && data.issue.name) {
    return identity(
      data.issue.kind,
      data.issue.group ?? "",
      data.issue.namespace ?? "",
      data.issue.name,
    );
  }
  return undefined;
}

function readResource(
  item: InvestigationCaseItem,
): InvestigationTargetIdentity | undefined {
  const { source } = item;
  if (!source.confirmedSuccess || !SINGLE_RESOURCE_TOOLS.has(source.tool)) {
    return undefined;
  }
  const args = investigationSourceArgs(source);
  const name = typeof args?.name === "string" ? args.name : "";
  const kind =
    source.tool === "get_pod_logs"
      ? "Pod"
      : typeof args?.kind === "string"
        ? args.kind
        : "";
  if (!name || !kind) return undefined;
  return identity(
    kind,
    typeof args?.group === "string" ? args.group : "",
    typeof args?.namespace === "string" ? args.namespace : "",
    name,
  );
}

// Agents spell kinds every way kubectl accepts: deployment, deployments,
// Deployment. The server canonicalizes the group when a run starts.
function identity(
  kind: string,
  group: string,
  namespace: string,
  name: string,
): InvestigationTargetIdentity {
  return {
    kind: pluralToKind(kindToPluralWithGroup(kind, group)),
    group,
    namespace,
    name,
  };
}
