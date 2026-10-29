// A verdict as one plain line, for places that show it outside Findings: the
// history, the completion card, an issue or resource that was investigated.
// Markdown links keep their text; code and emphasis markers are dropped.
export function plainVerdictText(text: string | undefined): string {
  return (text ?? "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`|\*\*|__/g, "")
    .replace(/(^|\W)[*_](\S(?:[^*_\n]*\S)?)[*_](?=\W|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

// The sentence a finished assessment stands on: its headline when it has
// one, else the technical cause. Empty for an answer that settled nothing.
export function verdictSentence(diagnosis: {
  summary?: string;
  rootCause?: string;
}): string {
  return plainVerdictText(diagnosis.summary || diagnosis.rootCause);
}
