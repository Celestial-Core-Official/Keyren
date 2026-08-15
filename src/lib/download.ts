/**
 * Hands the browser a file built entirely in memory.
 *
 * Deliberately client-side. The alternative — POST the rows to an endpoint
 * that echoes back a file — would put freshly generated plaintext keys on the
 * wire a second time and into a second server's request log, for no benefit:
 * the data is already in the page.
 */
export function downloadTextFile(
  filename: string,
  contents: string,
  mimeType: string,
): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Revoked on the next tick rather than immediately: some browsers have not
  // finished reading the blob when `click()` returns, and pulling the URL out
  // from under them produces an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const CSV_MIME = "text/csv;charset=utf-8";
export const JSON_MIME = "application/json;charset=utf-8";
