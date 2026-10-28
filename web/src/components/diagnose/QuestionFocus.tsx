import { ArrowRight } from "lucide-react";

import type { DiagnosisResourceRef } from "./diagnoseEvidenceTypes";
import {
  formatInvestigationTarget,
  type InvestigationTargetIdentity,
} from "./target";

// Where a question-only investigation came to rest. Investigating one of these
// starts a run about that resource with the same question, which is where a
// fix can be confirmed and applied. The earlier verdict is not carried over:
// it was written from cluster data, and the new run's question must stay the
// engineer's own words.
export function QuestionFocus({
  focus,
  onOpenResource,
  onInvestigate,
  disabled,
}: {
  focus: InvestigationTargetIdentity[];
  onOpenResource?: (ref: DiagnosisResourceRef) => void;
  onInvestigate: (resource: InvestigationTargetIdentity) => void;
  disabled?: boolean;
}) {
  if (focus.length === 0) return null;
  return (
    <section aria-label="Focused on" className="card-inner px-3 py-2">
      <h3 className="text-xs font-medium text-theme-text-tertiary">
        Focused on
      </h3>
      <ul className="mt-1 space-y-1">
        {focus.map((resource) => {
          const label = formatInvestigationTarget(resource);
          return (
            <li
              key={label}
              className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm"
            >
              {onOpenResource ? (
                <button
                  type="button"
                  onClick={() => onOpenResource(resource)}
                  className="min-w-0 truncate text-left text-theme-text-primary hover:underline"
                >
                  {label}
                </button>
              ) : (
                <span className="min-w-0 truncate text-theme-text-primary">
                  {label}
                </span>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onInvestigate(resource)}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-accent-text hover:underline disabled:opacity-50"
              >
                Investigate here
                <ArrowRight className="h-3 w-3" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px] text-theme-text-tertiary">
        A fix is applied from an investigation of the resource it changes.
      </p>
    </section>
  );
}
