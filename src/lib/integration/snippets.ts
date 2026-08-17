import { verifyUrl } from "@/lib/release";

/**
 * Copy-paste integration examples, one per language.
 *
 * These are the first code a developer runs against Keyren, so they are
 * written as something worth shipping rather than as the shortest thing that
 * demonstrates the endpoint. Every one of them:
 *
 *   - carries a timeout, because a licensing check that hangs takes the
 *     customer's application down with it;
 *   - reads the body as text and parses it defensively, because a 429 from a
 *     proxy or a 502 from a load balancer is frequently HTML, and
 *     `response.json()` on that throws a parse error that reads like a bug in
 *     the integration;
 *   - checks `success` rather than only the status code;
 *   - names every error code, since handling them individually is the whole
 *     point of returning them.
 *
 * The placeholder key is a shaped example rather than a real one — nothing
 * here is ever a live key.
 */

export const SNIPPET_LANGUAGES = ["javascript", "python", "curl", "csharp"] as const;
export type SnippetLanguage = (typeof SNIPPET_LANGUAGES)[number];

export const SNIPPET_LABELS: Record<SnippetLanguage, string> = {
  javascript: "JavaScript",
  python: "Python",
  curl: "cURL",
  csharp: "C#",
};

/** For syntax-highlighting hints and the copied file's implied type. */
export const SNIPPET_FILENAMES: Record<SnippetLanguage, string> = {
  javascript: "verify-license.js",
  python: "verify_license.py",
  curl: "verify-license.sh",
  csharp: "LicenseCheck.cs",
};

const PLACEHOLDER_KEY = "KEYREN-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX";
const PLACEHOLDER_DEVICE = "your-device-fingerprint";
const TIMEOUT_SECONDS = 10;

export type SnippetContext = { applicationId: string; appUrl: string };

function javascriptSnippet({ applicationId, appUrl }: SnippetContext): string {
  return `// Times out rather than hanging: a licensing check that never returns
// takes your application's startup down with it.
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), ${TIMEOUT_SECONDS * 1000});

try {
  const response = await fetch("${verifyUrl(appUrl)}", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicationId: "${applicationId}",
      licenseKey: "${PLACEHOLDER_KEY}",
      deviceId: "${PLACEHOLDER_DEVICE}",
    }),
    signal: controller.signal,
  });

  // Not response.json(): a 429 from a proxy or a 502 from a load balancer is
  // often HTML, and parsing that throws an error that looks like your bug.
  const raw = await response.text();

  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error(\`Keyren returned \${response.status} with a non-JSON body\`);
  }

  if (!result.success) {
    // LICENSE_INVALID, LICENSE_REVOKED, LICENSE_EXPIRED, DEVICE_MISMATCH,
    // APPLICATION_INVALID, APPLICATION_DISABLED, RATE_LIMITED, BAD_REQUEST,
    // INTERNAL_ERROR
    throw new Error(result.error.code);
  }

  // result.license.status    -> "active"
  // result.license.expiresAt -> ISO string, or null for a permanent license
} finally {
  clearTimeout(timeout);
}`;
}

function pythonSnippet({ applicationId, appUrl }: SnippetContext): string {
  return `import requests

# A timeout is not optional: without it requests waits forever by default.
try:
    response = requests.post(
        "${verifyUrl(appUrl)}",
        json={
            "applicationId": "${applicationId}",
            "licenseKey": "${PLACEHOLDER_KEY}",
            "deviceId": "${PLACEHOLDER_DEVICE}",
        },
        timeout=${TIMEOUT_SECONDS},
    )
except requests.RequestException as error:
    raise RuntimeError(f"Keyren was unreachable: {error}") from error

# A proxy or load balancer may answer with HTML rather than JSON.
try:
    result = response.json()
except ValueError as error:
    raise RuntimeError(
        f"Keyren returned {response.status_code} with a non-JSON body"
    ) from error

if not result.get("success"):
    # LICENSE_INVALID, LICENSE_REVOKED, LICENSE_EXPIRED, DEVICE_MISMATCH,
    # APPLICATION_INVALID, APPLICATION_DISABLED, RATE_LIMITED, BAD_REQUEST,
    # INTERNAL_ERROR
    raise RuntimeError(result["error"]["code"])

# result["license"]["status"]    -> "active"
# result["license"]["expiresAt"] -> ISO string, or None for a permanent license`;
}

function curlSnippet({ applicationId, appUrl }: SnippetContext): string {
  return `# --max-time caps the whole request; --fail-with-body keeps the JSON body
# on a 4xx or 5xx so the error code is still readable. -w prints the status
# on its own last line, because a proxy or load balancer can answer with a
# non-JSON body and you want to see that rather than have jq choke on it.
curl --max-time ${TIMEOUT_SECONDS} --show-error --silent --fail-with-body \\
  -w '\\n%{http_code}\\n' \\
  -X POST "${verifyUrl(appUrl)}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "applicationId": "${applicationId}",
    "licenseKey": "${PLACEHOLDER_KEY}",
    "deviceId": "${PLACEHOLDER_DEVICE}"
  }'

# Success (200):
#   {"success":true,"license":{"status":"active","expiresAt":null}}
#
# Failure — the body always carries a code your software should branch on:
#   {"success":false,"error":{"code":"LICENSE_EXPIRED","message":"..."}}
#
#   400 BAD_REQUEST        the body was malformed
#   403 LICENSE_INVALID    no such license for this application
#   403 LICENSE_REVOKED    revoked from the dashboard
#   403 LICENSE_EXPIRED    past its expiry
#   403 DEVICE_MISMATCH    already claimed by a different device
#   404 APPLICATION_INVALID    no such application
#   403 APPLICATION_DISABLED   the developer switched this application off
#   429 RATE_LIMITED       slow down; see the retry-after header
#   500 INTERNAL_ERROR     Keyren failed`;
}

function csharpSnippet({ applicationId, appUrl }: SnippetContext): string {
  return `using System.Net.Http.Json;
using System.Text.Json;

// One HttpClient for the lifetime of the application. A new one per check
// exhausts sockets under load — this is the standard .NET pitfall.
private static readonly HttpClient Http = new()
{
    Timeout = TimeSpan.FromSeconds(${TIMEOUT_SECONDS}),
};

var payload = new
{
    applicationId = "${applicationId}",
    licenseKey = "${PLACEHOLDER_KEY}",
    deviceId = "${PLACEHOLDER_DEVICE}",
};

using var response = await Http.PostAsJsonAsync("${verifyUrl(appUrl)}", payload);

// Read as text first: a proxy or load balancer may answer with HTML, and
// deserializing that throws an error that looks like your bug.
var raw = await response.Content.ReadAsStringAsync();

JsonDocument document;
try
{
    document = JsonDocument.Parse(raw);
}
catch (JsonException)
{
    throw new InvalidOperationException(
        $"Keyren returned {(int)response.StatusCode} with a non-JSON body");
}

using (document)
{
    var root = document.RootElement;

    if (!root.GetProperty("success").GetBoolean())
    {
        // LICENSE_INVALID, LICENSE_REVOKED, LICENSE_EXPIRED, DEVICE_MISMATCH,
        // APPLICATION_INVALID, APPLICATION_DISABLED, RATE_LIMITED, BAD_REQUEST,
    // INTERNAL_ERROR
        throw new InvalidOperationException(
            root.GetProperty("error").GetProperty("code").GetString());
    }

    var license = root.GetProperty("license");
    // license.GetProperty("status").GetString()    -> "active"
    // license.GetProperty("expiresAt")             -> ISO string, or null
}`;
}

const GENERATORS: Record<SnippetLanguage, (context: SnippetContext) => string> = {
  javascript: javascriptSnippet,
  python: pythonSnippet,
  curl: curlSnippet,
  csharp: csharpSnippet,
};

export function integrationSnippet(
  language: SnippetLanguage,
  context: SnippetContext,
): string {
  return GENERATORS[language](context);
}

/* ------------------------------------------------------------------------ *
 * Tokenizing, for syntax colour
 * ------------------------------------------------------------------------ */

export type TokenKind = "plain" | "comment" | "keyword" | "string" | "fn" | "punct";
export type SnippetToken = { kind: TokenKind; text: string };

/**
 * Keywords per language. Short lists on purpose: colouring every reserved word
 * turns a snippet into confetti. These are the words that carry the shape of
 * the example — control flow, declarations, and the error types a reader is
 * meant to notice.
 */
const KEYWORDS: Record<SnippetLanguage, readonly string[]> = {
  javascript: [
    "const", "let", "var", "function", "return", "await", "async", "try", "catch",
    "finally", "throw", "new", "if", "else", "typeof", "class", "import", "export",
  ],
  python: [
    "import", "from", "def", "return", "try", "except", "finally", "raise", "if",
    "else", "elif", "with", "as", "class", "None", "True", "False", "not", "in", "is",
  ],
  curl: ["curl", "if", "then", "else", "fi", "echo", "exit", "local", "set"],
  csharp: [
    "using", "var", "new", "return", "throw", "try", "catch", "finally", "if",
    "else", "public", "static", "async", "await", "class", "void", "string", "int",
  ],
} as const;

/** Which comment syntaxes each language actually uses. */
const COMMENT_STYLE: Record<SnippetLanguage, { slash: boolean; hash: boolean }> = {
  javascript: { slash: true, hash: false },
  python: { slash: false, hash: true },
  curl: { slash: false, hash: true },
  csharp: { slash: true, hash: false },
};

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;
const PUNCTUATION = /[{}()[\];:,.<>=+\-*/%!&|?^~]/;

/**
 * A small hand-written scanner, deliberately not a library.
 *
 * There are four snippets, they are generated by this module, and the whole
 * job is telling comments, strings, keywords and calls apart. A highlighting
 * dependency would be some hundreds of kilobytes to colour text we wrote
 * ourselves.
 *
 * It scans character by character rather than running a set of regexes over
 * the source, because the regex approach gets the one case that matters here
 * wrong: every snippet contains a URL, and `//` inside a string literal is not
 * the start of a comment. Scanning left to right means a string is consumed
 * whole before its contents are ever considered.
 *
 * The contract, enforced by test: concatenating every token's `text` returns
 * the input exactly. The clipboard payload is always the plain source, never
 * this, but the two must never disagree about what the code says.
 */
export function tokenizeSnippet(source: string, language: SnippetLanguage): SnippetToken[] {
  const keywords = new Set(KEYWORDS[language]);
  const comments = COMMENT_STYLE[language];
  const tokens: SnippetToken[] = [];

  let buffer = "";

  function flush() {
    if (buffer.length > 0) {
      tokens.push({ kind: "plain", text: buffer });
      buffer = "";
    }
  }

  function push(kind: TokenKind, text: string) {
    flush();
    tokens.push({ kind, text });
  }

  let index = 0;

  while (index < source.length) {
    const char = source.charAt(index);
    const next = source.charAt(index + 1);

    // Line comment.
    if ((comments.slash && char === "/" && next === "/") || (comments.hash && char === "#")) {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      push("comment", source.slice(index, stop));
      index = stop;
      continue;
    }

    // Block comment.
    if (comments.slash && char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      push("comment", source.slice(index, stop));
      index = stop;
      continue;
    }

    // String literal. Consumed whole, including escapes, so nothing inside it
    // is ever re-examined.
    if (char === '"' || char === "'" || char === "`") {
      let cursor = index + 1;

      while (cursor < source.length) {
        if (source.charAt(cursor) === "\\") {
          cursor += 2;
          continue;
        }
        if (source.charAt(cursor) === char) {
          cursor += 1;
          break;
        }
        // An unterminated literal must not swallow the rest of the file.
        if (source.charAt(cursor) === "\n" && char !== "`") break;
        cursor += 1;
      }

      push("string", source.slice(index, cursor));
      index = cursor;
      continue;
    }

    // Identifier: a keyword, a call, or plain text.
    if (IDENTIFIER_START.test(char)) {
      let cursor = index + 1;
      while (cursor < source.length && IDENTIFIER_PART.test(source.charAt(cursor))) cursor += 1;

      const word = source.slice(index, cursor);
      // A trailing "(" is what distinguishes a call from a variable, and it is
      // the only heuristic here — good enough for four known snippets, and it
      // fails safe to "plain".
      const isCall = source.charAt(cursor) === "(";

      if (keywords.has(word)) push("keyword", word);
      else if (isCall) push("fn", word);
      else buffer += word;

      index = cursor;
      continue;
    }

    if (PUNCTUATION.test(char)) {
      push("punct", char);
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flush();

  return tokens;
}
