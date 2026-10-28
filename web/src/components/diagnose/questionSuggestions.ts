import { issueTitle, type Issue } from "@skyhook-io/k8s-ui";
import { compareIssues } from "@skyhook-io/k8s-ui/components/issues/types";

import { formatInvestigationTarget } from "./target";

export interface QuestionPin {
  kind: string;
  group: string;
  namespace: string;
  name: string;
}

export interface QuestionSuggestion {
  key: string;
  question: string;
  namespaces: string[];
  /** Set when the suggestion is about one resource, so the run can start
   *  there instead of searching for it. */
  pin?: QuestionPin;
}

// Questions an engineer would plausibly ask about what Radar sees right now,
// most severe first: one per kind of problem per namespace. A problem on one
// resource becomes a question about that resource; the same problem on
// several becomes a question about the namespace. A cluster with no issues
// gets no suggestions — a stock prompt would only be noise.
export function suggestionsFromIssues(
  issues: readonly Issue[],
  max = 3,
): QuestionSuggestion[] {
  const groups = new Map<string, Issue[]>();
  for (const issue of [...issues].sort(compareIssues)) {
    const key = `${issue.category}\u0000${issue.namespace ?? ""}`;
    const members = groups.get(key);
    if (members) members.push(issue);
    else groups.set(key, [issue]);
  }
  const suggestions: QuestionSuggestion[] = [];
  for (const [key, members] of groups) {
    if (suggestions.length >= max) break;
    const first = members[0];
    const title = issueTitle(first);
    const namespaces = first.namespace ? [first.namespace] : [];
    if (members.length === 1) {
      const pin = {
        kind: first.kind,
        group: first.group ?? "",
        namespace: first.namespace ?? "",
        name: first.name,
      };
      suggestions.push({
        key,
        question: `What's causing “${title}” on ${formatInvestigationTarget(pin)}?`,
        namespaces,
        pin,
      });
      continue;
    }
    const where = first.namespace
      ? `in ${first.namespace}`
      : "across the cluster";
    suggestions.push({
      key,
      question: `What's causing “${title}” on ${members.length} resources ${where}?`,
      namespaces,
    });
  }
  return suggestions;
}
