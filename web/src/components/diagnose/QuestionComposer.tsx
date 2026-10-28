// The free-form way into an investigation: the engineer says what they are
// seeing, where to start and since when, and optionally pins the resource it
// is about. It starts the same investigation, with the same Findings page, as
// Investigate on a resource; it is not a chat.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, AtSign, Plus, X } from "lucide-react";
import { Collapse } from "@skyhook-io/k8s-ui";

import { useIssues, useNamespaceScope, useSearch } from "../../api/client";
import { useDiagnose } from "./DiagnoseContext";
import {
  suggestionsFromIssues,
  type QuestionPin,
  type QuestionSuggestion,
} from "./questionSuggestions";
import { formatInvestigationTarget } from "./target";

export const LOOK_BACKS = ["15m", "1h", "6h", "24h"] as const;
const DEFAULT_LOOK_BACK = "1h";

const chipClass =
  "inline-flex max-w-full items-center gap-1 rounded-md border border-theme-border bg-theme-elevated px-2 py-0.5 text-xs text-theme-text-secondary";

export function QuestionComposer({
  onBrowseIssues,
}: {
  onBrowseIssues?: () => void;
}) {
  const { openInvestigation, agentLabel, questionDraft } = useDiagnose();
  const [text, setText] = useState("");
  const [pin, setPin] = useState<QuestionPin | null>(null);
  const [lookBack, setLookBack] = useState<string>(DEFAULT_LOOK_BACK);
  const [pickerOpen, setPickerOpen] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const pickerInputRef = useRef<HTMLInputElement>(null);

  // Where to start follows the namespace picker until the engineer edits it.
  const { data: scope } = useNamespaceScope();
  const [namespaces, setNamespaces] = useState<string[] | null>(null);
  const startIn = namespaces ?? scope?.actives ?? [];

  const { data: issuesData } = useIssues(startIn);
  const suggestions = useMemo(
    () => suggestionsFromIssues(issuesData?.issues ?? []),
    [issuesData],
  );

  useEffect(() => {
    if (pickerOpen) pickerInputRef.current?.focus();
  }, [pickerOpen]);

  // A hand-off (Ask about a resource, the Omnibar) replaces what is here.
  useEffect(() => {
    if (!questionDraft) return;
    setText(questionDraft.text ?? "");
    setPin(questionDraft.pin ?? null);
    if (questionDraft.namespaces) setNamespaces(questionDraft.namespaces);
    if (questionDraft.lookBack) setLookBack(questionDraft.lookBack);
    setPickerOpen(false);
    textRef.current?.focus();
  }, [questionDraft]);

  const question = text.trim();
  const submit = () => {
    if (!question) return;
    openInvestigation({
      kind: pin?.kind ?? "",
      group: pin?.group ?? "",
      namespace: pin?.namespace ?? "",
      name: pin?.name ?? "",
      question,
      namespaces: pin ? [] : startIn,
      lookBack,
    });
  };

  const applySuggestion = (suggestion: QuestionSuggestion) => {
    setText(suggestion.question);
    setPin(suggestion.pin ?? null);
    setNamespaces(suggestion.namespaces);
    textRef.current?.focus();
  };

  const addable = (scope?.accessibleNamespaces ?? []).filter(
    (ns) => !startIn.includes(ns),
  );

  return (
    <section className="mx-auto w-full max-w-2xl">
      <h1 className="text-xl font-semibold text-theme-text-primary">
        What are you seeing?
      </h1>
      <p className="mt-1 text-sm text-theme-text-tertiary">
        Describe the problem in your own words. {agentLabel} investigates it
        with Radar’s read-only tools and shows what it found, with the evidence.
      </p>

      <form
        className="mt-4 rounded-lg border border-theme-border bg-theme-surface shadow-theme-sm focus-within:border-accent"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={textRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "@" && !pin) {
              event.preventDefault();
              setPickerOpen(true);
              return;
            }
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          rows={3}
          maxLength={2000}
          aria-label="What are you seeing?"
          placeholder="e.g. checkout returns 502s since the last deploy"
          className="block w-full resize-none rounded-t-lg bg-transparent px-3 py-2.5 text-sm text-theme-text-primary placeholder:text-theme-text-tertiary focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-1.5 border-t border-theme-border-subtle px-3 py-2">
          {pin ? (
            <span className={chipClass}>
              <span className="text-theme-text-tertiary">About</span>
              <span className="truncate font-medium text-theme-text-primary">
                {formatInvestigationTarget(pin)}
              </span>
              <button
                type="button"
                onClick={() => setPin(null)}
                aria-label="Unpin resource"
                className="rounded text-theme-text-tertiary hover:text-theme-text-primary"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ) : (
            <>
              <span className="text-xs text-theme-text-tertiary">Start in</span>
              {startIn.length === 0 ? (
                <span className={chipClass}>All namespaces</span>
              ) : (
                startIn.map((ns) => (
                  <span key={ns} className={chipClass}>
                    <span className="truncate">{ns}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setNamespaces(startIn.filter((n) => n !== ns))
                      }
                      aria-label={`Remove namespace ${ns}`}
                      className="rounded text-theme-text-tertiary hover:text-theme-text-primary"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
              {addable.length > 0 && (
                <select
                  value=""
                  onChange={(event) =>
                    event.target.value &&
                    setNamespaces([...startIn, event.target.value])
                  }
                  aria-label="Add a namespace to start in"
                  className="rounded-md border border-theme-border bg-theme-elevated px-1.5 py-0.5 text-xs text-theme-text-secondary"
                >
                  <option value="">+ namespace</option>
                  {addable.map((ns) => (
                    <option key={ns} value={ns}>
                      {ns}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => setPickerOpen((open) => !open)}
                aria-expanded={pickerOpen}
                className={`${chipClass} hover:bg-theme-hover hover:text-theme-text-primary`}
              >
                <AtSign className="h-3 w-3" />
                Pin a resource
              </button>
            </>
          )}
          <span className="ml-auto flex items-center gap-1">
            <span className="text-xs text-theme-text-tertiary">
              Started within
            </span>
            <span
              role="radiogroup"
              aria-label="Started within"
              className="inline-flex rounded-md border border-theme-border"
            >
              {LOOK_BACKS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={lookBack === value}
                  onClick={() => setLookBack(value)}
                  className={`px-1.5 py-0.5 text-xs first:rounded-l-md last:rounded-r-md ${
                    lookBack === value
                      ? "bg-accent-muted text-accent-text"
                      : "text-theme-text-tertiary hover:bg-theme-hover"
                  }`}
                >
                  {value}
                </button>
              ))}
            </span>
            <button
              type="submit"
              disabled={!question}
              className="btn-brand ml-1 inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-50"
            >
              Investigate
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
        <Collapse open={pickerOpen && !pin} unmountOnExit>
          <ResourcePicker
            inputRef={pickerInputRef}
            onPick={(picked) => {
              setPin(picked);
              setPickerOpen(false);
              textRef.current?.focus();
            }}
            onCancel={() => {
              setPickerOpen(false);
              textRef.current?.focus();
            }}
          />
        </Collapse>
      </form>

      {suggestions.length > 0 && (
        <div className="mt-5">
          <h2 className="text-xs font-medium text-theme-text-tertiary">
            From what Radar sees now
          </h2>
          <ul className="mt-1.5 space-y-1">
            {suggestions.map((suggestion) => (
              <li key={suggestion.key}>
                <button
                  type="button"
                  onClick={() => applySuggestion(suggestion)}
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm text-theme-text-secondary hover:bg-theme-hover hover:text-theme-text-primary"
                >
                  {suggestion.question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {onBrowseIssues && (
        <button
          type="button"
          onClick={onBrowseIssues}
          className="mt-4 inline-flex items-center gap-1 text-xs text-theme-text-tertiary hover:text-theme-text-primary"
        >
          Or pick a problem from Issues
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </section>
  );
}

function ResourcePicker({
  inputRef,
  onPick,
  onCancel,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (pin: QuestionPin) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const { data, isFetching } = useSearch(query, {
    context: "none",
    limit: 8,
    globalNs: true,
  });
  const hits = data?.hits ?? [];
  return (
    <div className="border-t border-theme-border-subtle px-3 py-2">
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const first = hits[0];
            if (first)
              onPick({
                kind: first.kind,
                group: first.group ?? "",
                namespace: first.namespace ?? "",
                name: first.name,
              });
          }
        }}
        aria-label="Search for a resource to pin"
        aria-controls={listId}
        placeholder="Search resources by name, kind:Deployment, ns:shop…"
        className="w-full rounded-md border border-theme-border bg-theme-elevated px-2 py-1 text-sm text-theme-text-primary placeholder:text-theme-text-tertiary focus:border-accent focus:outline-none"
      />
      <ul id={listId} className="mt-1 max-h-48 overflow-y-auto">
        {hits.map((hit) => (
          <li
            key={`${hit.group ?? ""}/${hit.kind}/${hit.namespace ?? ""}/${hit.name}`}
          >
            <button
              type="button"
              onClick={() =>
                onPick({
                  kind: hit.kind,
                  group: hit.group ?? "",
                  namespace: hit.namespace ?? "",
                  name: hit.name,
                })
              }
              className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-sm hover:bg-theme-hover"
            >
              <span className="truncate text-theme-text-primary">
                {hit.name}
              </span>
              <span className="shrink-0 text-xs text-theme-text-tertiary">
                {hit.kind}
                {hit.namespace ? ` · ${hit.namespace}` : ""}
              </span>
            </button>
          </li>
        ))}
        {query.trim().length > 0 && !isFetching && hits.length === 0 && (
          <li className="px-2 py-1 text-xs text-theme-text-tertiary">
            No matching resources.
          </li>
        )}
      </ul>
      <p className="mt-1 flex items-center gap-1 text-[11px] text-theme-text-tertiary">
        <Plus className="h-3 w-3" />
        Pinning starts the investigation at that resource, and lets you apply a
        fix from it.
      </p>
    </div>
  );
}
