// The free-form way into an investigation: the engineer says what they are
// seeing, where to start and since when, and optionally pins the resource it
// is about. It starts the same investigation, with the same Findings page, as
// Investigate on a resource; it is not a chat.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, AtSign, X } from "lucide-react";
import { Collapse, useDebouncedValue } from "@skyhook-io/k8s-ui";

import {
  useIssues,
  useNamespaceScope,
  useResourceIssues,
  useSearch,
} from "../../api/client";
import { kindToPluralWithGroup } from "../../utils/navigation";
import { searchCoverageNote } from "../ui/searchCoverageNote";
import { useDiagnose } from "./DiagnoseContext";
import {
  suggestionsForPin,
  suggestionsFromIssues,
  type QuestionPin,
  type QuestionSuggestion,
} from "./questionSuggestions";
import { formatInvestigationTarget } from "./target";

export const LOOK_BACKS = ["15m", "1h", "6h", "24h"] as const;
const DEFAULT_LOOK_BACK = "1h";
const MAX_START_NAMESPACES = 20;

// Chips state what the question carries; actions change it. They must not
// look alike, or a scope chip reads as a menu and an action as a value.
const chipClass =
  "inline-flex max-w-full items-center gap-1 rounded-md border border-theme-border bg-theme-elevated px-2 py-0.5 text-xs text-theme-text-secondary";
const actionClass =
  "inline-flex items-center gap-1 rounded-md border border-dashed border-theme-border px-2 py-0.5 text-xs text-theme-text-tertiary hover:border-theme-text-tertiary hover:text-theme-text-primary";

export function QuestionComposer({
  onBrowseIssues,
}: {
  onBrowseIssues?: () => void;
}) {
  const { openInvestigation, agentLabel, questionDraft, saveQuestionDraft } =
    useDiagnose();
  // The draft outlives this component: it starts from it, and gives back
  // whatever is unsent when it unmounts (opening a run, a resource).
  const [text, setText] = useState(questionDraft?.text ?? "");
  const [pin, setPin] = useState<QuestionPin | null>(
    questionDraft?.pin ?? null,
  );
  const [lookBack, setLookBack] = useState<string>(
    questionDraft?.lookBack ?? DEFAULT_LOOK_BACK,
  );
  // A handed-over question keeps when it was first asked until it is edited.
  const [inherited, setInherited] = useState(
    questionDraft?.askedAt && questionDraft.text
      ? { text: questionDraft.text.trim(), askedAt: questionDraft.askedAt }
      : null,
  );
  const [pickerOpen, setPickerOpen] = useState(!!questionDraft?.pickResource);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const pickerInputRef = useRef<HTMLInputElement>(null);

  // Where to start follows the namespace picker until the engineer edits it.
  const { data: scope } = useNamespaceScope();
  const [namespaces, setNamespaces] = useState<string[] | null>(
    questionDraft?.namespaces ?? null,
  );
  const picked = namespaces ?? scope?.actives ?? [];
  // Past a handful of namespaces, the whole cluster is the honest place to
  // start, and the backend accepts at most MAX_START_NAMESPACES.
  const tooMany = picked.length > MAX_START_NAMESPACES;
  const startIn = tooMany ? [] : picked;

  // Suggestions follow what the question is about: the pinned resource's
  // own issues, or the issues where the namespaces say to start.
  const { data: issuesData } = useIssues(startIn, !pin);
  const { data: pinIssues } = useResourceIssues(
    pin ? kindToPluralWithGroup(pin.kind, pin.group) : "",
    pin?.group || undefined,
    pin?.namespace ?? "",
    pin?.name ?? "",
    !!pin,
  );
  const asked = text.trim();
  const suggestions = useMemo(
    () =>
      (pin
        ? suggestionsForPin(pinIssues ?? [], pin)
        : suggestionsFromIssues(issuesData?.issues ?? [])
      ).filter((suggestion) => suggestion.question !== asked),
    [pin, pinIssues, issuesData, asked],
  );

  useEffect(() => {
    if (pickerOpen) pickerInputRef.current?.focus();
  }, [pickerOpen]);

  const unsent = useRef({ text, pin, namespaces, lookBack, inherited });
  unsent.current = { text, pin, namespaces, lookBack, inherited };
  // A submitted question belongs to its start, not the draft; the start gives
  // it back if it never becomes a run.
  const submitted = useRef(false);
  useEffect(
    () => () => {
      if (submitted.current) {
        saveQuestionDraft({});
        return;
      }
      const draft = unsent.current;
      saveQuestionDraft({
        askedAt:
          draft.inherited?.text === draft.text.trim()
            ? draft.inherited.askedAt
            : undefined,
        text: draft.text,
        pin: draft.pin ?? undefined,
        namespaces: draft.namespaces ?? undefined,
        lookBack: draft.lookBack,
      });
    },
    [saveQuestionDraft],
  );

  // A new hand-off (Ask about a resource, a start that never became a run)
  // replaces what is here; the draft this composer started from does not.
  const appliedSeq = useRef(questionDraft?.seq);
  useEffect(() => {
    if (!questionDraft || questionDraft.seq === appliedSeq.current) return;
    appliedSeq.current = questionDraft.seq;
    if (questionDraft.restore && unsent.current.text.trim()) return;
    submitted.current = false;
    setText(questionDraft.text ?? "");
    setInherited(
      questionDraft.askedAt && questionDraft.text
        ? { text: questionDraft.text.trim(), askedAt: questionDraft.askedAt }
        : null,
    );
    setPin(questionDraft.pin ?? null);
    setNamespaces(questionDraft.namespaces ?? null);
    setLookBack(questionDraft.lookBack ?? DEFAULT_LOOK_BACK);
    setPickerOpen(!!questionDraft.pickResource);
    if (!questionDraft.pickResource) textRef.current?.focus();
  }, [questionDraft]);

  const question = text.trim();
  const submit = () => {
    if (!question) return;
    submitted.current = true;
    openInvestigation({
      fromComposer: true,
      kind: pin?.kind ?? "",
      group: pin?.group ?? "",
      namespace: pin?.namespace ?? "",
      name: pin?.name ?? "",
      question,
      namespaces: pin ? [] : startIn,
      lookBack,
      askedAt: inherited?.text === question ? inherited.askedAt : undefined,
    });
  };

  const applySuggestion = (suggestion: QuestionSuggestion) => {
    setText(suggestion.question);
    setPin(suggestion.pin ?? null);
    setNamespaces(suggestion.namespaces);
    textRef.current?.focus();
  };

  const addable =
    startIn.length >= MAX_START_NAMESPACES
      ? []
      : (scope?.accessibleNamespaces ?? []).filter(
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
                <span
                  className={chipClass}
                  title={
                    tooMany
                      ? `${picked.length} namespaces are selected; investigations start across the cluster past ${MAX_START_NAMESPACES}.`
                      : undefined
                  }
                >
                  All namespaces
                  {tooMany ? ` (${picked.length} selected)` : ""}
                </span>
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
                  className="w-28 cursor-pointer rounded-md border border-dashed border-theme-border bg-transparent px-1.5 py-0.5 text-xs text-theme-text-tertiary hover:border-theme-text-tertiary hover:text-theme-text-primary"
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
                className={actionClass}
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
                  {suggestion.label}
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

// Kinds that are usually children of what an engineer means: a question is
// about the Deployment or Service, not one of its ReplicaSets or Pods. They
// stay pickable, after everything else.
const OWNED_KINDS = new Set([
  "Pod",
  "ReplicaSet",
  "ControllerRevision",
  "EndpointSlice",
  "Event",
]);

function rankForPinning<T extends { kind: string }>(hits: T[]): T[] {
  return [...hits].sort(
    (a, b) => Number(OWNED_KINDS.has(a.kind)) - Number(OWNED_KINDS.has(b.kind)),
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
  const [active, setActive] = useState(0);
  const listId = useId();
  // Search the way the Omnibar does: once typing pauses, not per keystroke.
  const searched = useDebouncedValue(query, 150, (value) => !value.trim());
  const { data, isFetching, isPlaceholderData, isError, refetch } = useSearch(
    searched,
    { context: "none", limit: 8, globalNs: true },
  );
  // Results belong to what is in the box only once it has been searched.
  const current =
    searched === query && query.trim().length >= 2 && !isPlaceholderData;
  // Results kept from the previous query while the next one loads must not
  // be pinnable: Enter would pin what the engineer just typed away from.
  const hits = useMemo(
    () => (current && !isError ? rankForPinning(data?.hits ?? []) : []),
    [current, isError, data],
  );
  const note = current
    ? searchCoverageNote(data?.coverage, { hits: data?.hits, query })
    : undefined;
  const noteText = note?.parts
    ? note.parts.map((part) => part.text).join(" ")
    : note?.text;
  const activeIndex = Math.min(active, Math.max(hits.length - 1, 0));
  const pick = (hit: (typeof hits)[number]) =>
    onPick({
      kind: hit.kind,
      group: hit.group ?? "",
      namespace: hit.namespace ?? "",
      name: hit.name,
    });
  return (
    <div className="border-t border-theme-border-subtle px-3 py-2">
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (hits.length === 0) return;
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive((activeIndex + step + hits.length) % hits.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const hit = hits[activeIndex];
            if (hit) pick(hit);
          }
        }}
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-label="Search for a resource to pin"
        aria-controls={listId}
        aria-activedescendant={
          hits.length > 0 ? `${listId}-${activeIndex}` : undefined
        }
        placeholder="Search resources by name, kind:Deployment, ns:shop…"
        className="w-full rounded-md border border-theme-border bg-theme-elevated px-2 py-1 text-sm text-theme-text-primary placeholder:text-theme-text-tertiary focus:border-accent focus:outline-none"
      />
      <ul id={listId} role="listbox" className="mt-1 max-h-48 overflow-y-auto">
        {hits.map((hit, index) => (
          <li
            key={`${hit.group ?? ""}/${hit.kind}/${hit.namespace ?? ""}/${hit.name}`}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
          >
            <button
              type="button"
              tabIndex={-1}
              onClick={() => pick(hit)}
              onMouseEnter={() => setActive(index)}
              className={`flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-sm ${
                index === activeIndex ? "bg-theme-hover" : ""
              }`}
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
        {current && isError && !isFetching && (
          <li className="flex items-center gap-2 px-2 py-1 text-xs text-theme-text-secondary">
            Couldn’t search resources.
            <button
              type="button"
              onClick={() => void refetch()}
              className="font-medium text-theme-text-primary hover:underline"
            >
              Try again
            </button>
          </li>
        )}
        {current && !isError && !isFetching && hits.length === 0 && (
          <li className="px-2 py-1 text-xs text-theme-text-tertiary">
            {noteText
              ? "No matches in what Radar searched."
              : "No matching resources."}
          </li>
        )}
        {current && !isError && noteText && (
          <li className="px-2 py-1 text-[11px] text-theme-text-tertiary">
            {noteText}
          </li>
        )}
      </ul>
      <p className="mt-1 text-[11px] text-theme-text-tertiary">
        Pinning starts the investigation at that resource, and lets you apply a
        fix from it.
      </p>
    </div>
  );
}
