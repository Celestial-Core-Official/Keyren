/**
 * The single source of truth for what release this is.
 *
 * Alpha_v1 spelled the release name into the dashboard header, the settings
 * page and the landing page as three independent string literals, which is
 * exactly how a version badge ends up disagreeing with itself. Everything
 * user-facing reads from here instead.
 *
 * `name` is the marketing release. `apiVersion` is the URL segment of the
 * public verification endpoint, and the two are deliberately independent:
 * the application can advance to Beta_v1 without breaking a single
 * deployed client, because `/api/v1/...` is versioned on ordinary semantic
 * grounds and only moves when the response contract actually breaks.
 */
export const RELEASE = {
  name: "Alpha_v3",
  version: "0.1.3",
  apiVersion: "v1",
} as const;

/** The public verification path, assembled once so no caller hardcodes it. */
export const VERIFY_PATH = `/api/${RELEASE.apiVersion}/licenses/verify` as const;

/** Absolute verification URL for a given deployment origin. */
export function verifyUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}${VERIFY_PATH}`;
}
