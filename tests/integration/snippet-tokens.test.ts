import { describe, expect, it } from "vitest";
import {
  SNIPPET_LANGUAGES,
  integrationSnippet,
  tokenizeSnippet,
  type SnippetContext,
} from "@/lib/integration/snippets";

const CONTEXT: SnippetContext = {
  applicationId: "app_9k2mQ4vB7xLp",
  appUrl: "https://keys.example.com",
};

const KINDS = new Set(["plain", "comment", "keyword", "string", "fn", "punct"]);

describe("tokenizeSnippet", () => {
  /**
   * The load-bearing invariant. The code a developer reads and the code the
   * copy button puts on their clipboard are produced from the same string, and
   * the only thing guaranteeing they stay identical is that tokenizing is
   * lossless. A tokenizer that drops a character ships a snippet that does not
   * run.
   */
  it("reassembles to exactly the source for every language", () => {
    for (const language of SNIPPET_LANGUAGES) {
      const source = integrationSnippet(language, CONTEXT);
      const rebuilt = tokenizeSnippet(source, language)
        .map((token) => token.text)
        .join("");

      expect(rebuilt).toBe(source);
    }
  });

  it("only ever emits known token kinds", () => {
    for (const language of SNIPPET_LANGUAGES) {
      for (const token of tokenizeSnippet(integrationSnippet(language, CONTEXT), language)) {
        expect(KINDS.has(token.kind)).toBe(true);
      }
    }
  });

  it("emits no empty tokens", () => {
    for (const language of SNIPPET_LANGUAGES) {
      for (const token of tokenizeSnippet(integrationSnippet(language, CONTEXT), language)) {
        expect(token.text.length).toBeGreaterThan(0);
      }
    }
  });

  it("classifies a line comment as a comment", () => {
    const tokens = tokenizeSnippet(`const x = 1; // note here\n`, "javascript");

    expect(tokens.some((t) => t.kind === "comment" && t.text.includes("note here"))).toBe(true);
  });

  it("classifies a double-quoted string as a string", () => {
    const tokens = tokenizeSnippet(`const url = "https://example.com";`, "javascript");

    expect(tokens.some((t) => t.kind === "string" && t.text.includes("example.com"))).toBe(true);
  });

  it("does not treat a // inside a string literal as a comment", () => {
    // Every one of these snippets contains a URL, so this is the exact case
    // that breaks a naive regex tokenizer and paints half the snippet grey.
    const tokens = tokenizeSnippet(`fetch("https://keys.example.com/api");`, "javascript");

    expect(tokens.some((t) => t.kind === "comment")).toBe(false);
  });

  it("classifies a hash comment in python and shell but not in javascript", () => {
    expect(tokenizeSnippet(`# note\n`, "python").some((t) => t.kind === "comment")).toBe(true);
    expect(tokenizeSnippet(`# note\n`, "curl").some((t) => t.kind === "comment")).toBe(true);
    expect(tokenizeSnippet(`# note\n`, "javascript").some((t) => t.kind === "comment")).toBe(false);
  });

  it("marks language keywords", () => {
    const tokens = tokenizeSnippet(`const controller = new AbortController();`, "javascript");

    expect(tokens.some((t) => t.kind === "keyword" && t.text === "const")).toBe(true);
  });
});
