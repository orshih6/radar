import { kindToPluralWithGroup, pluralToKind } from "../../utils/navigation";
import type { InvestigationCaseResolution } from "./investigationCase";
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

// The resources a question-only assessment came to rest on: the ones its
// cause and symptom citations read, named by the arguments Radar recorded for
// each read rather than by what the agent wrote about it. Causes come first.
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
    const { source } = item;
    if (!source.confirmedSuccess || !SINGLE_RESOURCE_TOOLS.has(source.tool)) {
      continue;
    }
    const args = investigationSourceArgs(source);
    const name = typeof args?.name === "string" ? args.name : "";
    const rawKind =
      source.tool === "get_pod_logs"
        ? "Pod"
        : typeof args?.kind === "string"
          ? args.kind
          : "";
    if (!name || !rawKind) continue;
    const group = typeof args?.group === "string" ? args.group : "";
    const resource = {
      // Agents spell kinds every way kubectl accepts: deployment, deployments,
      // Deployment. The server canonicalizes the group when a run starts.
      kind: pluralToKind(kindToPluralWithGroup(rawKind, group)),
      group,
      namespace: typeof args?.namespace === "string" ? args.namespace : "",
      name,
    };
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
