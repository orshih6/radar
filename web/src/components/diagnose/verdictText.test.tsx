import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VerdictText } from "./AssessmentCard";
import { plainVerdictText, verdictSentence } from "./verdictText";

describe("VerdictText", () => {
  it("renders code spans and nothing else as markup", () => {
    const html = renderToStaticMarkup(
      <VerdictText text="ConfigMap `checkout-settings` is **missing**" />,
    );
    expect(html).toBe(
      'ConfigMap <code class="inline-code">checkout-settings</code> is missing',
    );
  });

  it("keeps a sentence that looks like markdown structure as text", () => {
    expect(
      renderToStaticMarkup(<VerdictText text="1. pod restarts # times" />),
    ).toBe("1. pod restarts # times");
  });
});

describe("verdictSentence", () => {
  it("is the headline, as one plain line", () => {
    expect(
      verdictSentence({
        summary: "The `api` container\nexits; see [logs](http://x)",
        rootCause: "ignored",
      }),
    ).toBe("The api container exits; see logs");
  });

  it("falls back to the cause, and is empty for an answer", () => {
    expect(verdictSentence({ rootCause: "DB_PORT is `abc`" })).toBe(
      "DB_PORT is abc",
    );
    expect(verdictSentence({})).toBe("");
    expect(plainVerdictText(undefined)).toBe("");
  });
});
