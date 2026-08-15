import { describe, expect, it } from "vitest";
import {
  SNIPPET_LANGUAGES,
  SNIPPET_LABELS,
  integrationSnippet,
  type SnippetLanguage,
} from "@/lib/integration/snippets";
import { VERIFY_PATH } from "@/lib/release";

const CONTEXT = { productId: "prod_31DFQX8", appUrl: "https://keys.example.com" };

function snippet(language: SnippetLanguage): string {
  return integrationSnippet(language, CONTEXT);
}

describe("every language", () => {
  it("covers exactly the four documented languages", () => {
    expect([...SNIPPET_LANGUAGES]).toEqual(["javascript", "python", "curl", "csharp"]);
    expect(Object.values(SNIPPET_LABELS)).toEqual([
      "JavaScript",
      "Python",
      "cURL",
      "C#",
    ]);
  });

  it.each(SNIPPET_LANGUAGES)("%s embeds the real endpoint", (language) => {
    expect(snippet(language)).toContain(`https://keys.example.com${VERIFY_PATH}`);
  });

  it.each(SNIPPET_LANGUAGES)("%s embeds the real product id", (language) => {
    expect(snippet(language)).toContain("prod_31DFQX8");
  });

  it.each(SNIPPET_LANGUAGES)("%s carries a timeout", (language) => {
    // A licensing check that hangs takes the customer's application down with
    // it, so no snippet may rely on a default.
    expect(snippet(language)).toMatch(/10_?000|timeout=10|--max-time 10|FromSeconds\(10\)/);
  });

  it.each(SNIPPET_LANGUAGES)("%s handles a non-JSON response", (language) => {
    // A 429 from a proxy or a 502 from a load balancer is frequently HTML.
    expect(snippet(language)).toMatch(/non-JSON/);
  });

  it.each(SNIPPET_LANGUAGES)("%s names every error code", (language) => {
    const text = snippet(language);
    for (const code of [
      "LICENSE_INVALID",
      "LICENSE_REVOKED",
      "LICENSE_EXPIRED",
      "DEVICE_MISMATCH",
      "PRODUCT_INVALID",
      "RATE_LIMITED",
      "BAD_REQUEST",
      "INTERNAL_ERROR",
    ]) {
      expect(text).toContain(code);
    }
  });

  it.each(SNIPPET_LANGUAGES)("%s checks success rather than only the status", (language) => {
    expect(snippet(language)).toMatch(/success/);
  });

  it.each(SNIPPET_LANGUAGES)("%s uses a placeholder key, never a real one", (language) => {
    const text = snippet(language);
    expect(text).toContain("KEYREN-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX");
    // Nothing resembling a real Crockford-alphabet key.
    expect(text).not.toMatch(/KEYREN-(?!X)[0-9A-HJKMNP-TV-Z]{8}/);
  });

  it.each(SNIPPET_LANGUAGES)("%s sends all three required fields", (language) => {
    const text = snippet(language);
    expect(text).toContain("productId");
    expect(text).toContain("licenseKey");
    expect(text).toContain("deviceId");
  });

  it.each(SNIPPET_LANGUAGES)("%s never mentions the HMAC secret", (language) => {
    // The one thing that must never appear in code a developer ships.
    expect(snippet(language)).not.toMatch(/HMAC_SECRET|CLERK_SECRET|hmacSecret/i);
  });

  it.each(SNIPPET_LANGUAGES)("%s does not double a slash in the URL", (language) => {
    const text = integrationSnippet(language, {
      ...CONTEXT,
      appUrl: "https://keys.example.com/",
    });
    expect(text).not.toContain("com//api");
  });
});

describe("JavaScript", () => {
  it("aborts through a controller and always clears the timer", () => {
    const text = snippet("javascript");
    expect(text).toContain("AbortController");
    expect(text).toContain("signal: controller.signal");
    expect(text).toContain("clearTimeout(timeout)");
  });

  it("reads the body as text before parsing", () => {
    expect(snippet("javascript")).toContain("await response.text()");
    expect(snippet("javascript")).not.toContain("await response.json()");
  });
});

describe("Python", () => {
  it("catches transport failures separately from bad bodies", () => {
    const text = snippet("python");
    expect(text).toContain("except requests.RequestException");
    expect(text).toContain("except ValueError");
  });

  it("uses None rather than null in its comment", () => {
    expect(snippet("python")).toContain("None for a permanent license");
  });
});

describe("cURL", () => {
  it("keeps the body on a failing status so the code is still readable", () => {
    expect(snippet("curl")).toContain("--fail-with-body");
  });

  it("shows both response envelopes", () => {
    const text = snippet("curl");
    expect(text).toContain('"success":true');
    expect(text).toContain('"success":false');
  });
});

describe("C#", () => {
  it("warns against a per-request HttpClient", () => {
    // The standard .NET socket-exhaustion pitfall.
    const text = snippet("csharp");
    expect(text).toContain("static readonly HttpClient");
    expect(text).toContain("exhausts sockets");
  });

  it("parses defensively with JsonDocument", () => {
    const text = snippet("csharp");
    expect(text).toContain("JsonDocument.Parse");
    expect(text).toContain("catch (JsonException)");
  });
});
