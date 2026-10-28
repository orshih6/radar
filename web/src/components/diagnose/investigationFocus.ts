import { kindToPluralWithGroup, pluralToKind } from "../../utils/navigation";
import type {
  InvestigationCaseItem,
  InvestigationCaseResolution,
} from "./investigationCase";
import {
  investigationEvidenceSubjectRef,
  investigationSourceArgs,
} from "./investigationEvidence/identity";
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
// object the citation bound to, or else the resource a single-resource read
// was asked about.
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

// What the citation bound to, exactly as Radar recorded it.
function boundResource(
  item: InvestigationCaseItem,
): InvestigationTargetIdentity | undefined {
  const data = item.observation?.data;
  const ref = data ? investigationEvidenceSubjectRef(data) : undefined;
  if (!ref?.kind || !ref.name) return undefined;
  return {
    kind: ref.kind,
    group: ref.group ?? "",
    namespace: ref.namespace ?? "",
    name: ref.name,
  };
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
  const group = typeof args?.group === "string" ? args.group : "";
  // Agents spell kinds every way kubectl accepts: deployment, deployments,
  // Deployment. The server canonicalizes the group when a run starts.
  return {
    kind: pluralToKind(kindToPluralWithGroup(kind, group)),
    group,
    namespace: typeof args?.namespace === "string" ? args.namespace : "",
    name,
  };
}
