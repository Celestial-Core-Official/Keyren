import type { ZodError } from "zod";

/**
 * The shape every dashboard server action returns.
 *
 * Alpha_v1 used `{ error: string | null }`, where `{ error: null }` had to
 * mean both "nothing has happened yet" and "it worked". Nothing could tell
 * those apart, which is why successful revokes, restores and resets produced
 * no feedback at all — the component genuinely could not know one had
 * occurred. A three-way discriminant makes success representable, and makes
 * "success and error at once" unrepresentable.
 */
export type ActionState<TData = null> =
  | { status: "idle" }
  | { status: "success"; message: string; data: TData }
  | { status: "error"; message: string; fieldErrors: Record<string, string> };

export function idleAction(): { status: "idle" } {
  return { status: "idle" };
}

export function actionSuccess<TData>(
  message: string,
  data: TData,
): { status: "success"; message: string; data: TData } {
  return { status: "success", message, data };
}

export function actionFailure(
  message: string,
  fieldErrors: Record<string, string> = {},
): { status: "error"; message: string; fieldErrors: Record<string, string> } {
  return { status: "error", message, fieldErrors };
}

export function isActionSuccess<TData>(
  state: ActionState<TData>,
): state is { status: "success"; message: string; data: TData } {
  return state.status === "success";
}

export function isActionError<TData>(
  state: ActionState<TData>,
): state is { status: "error"; message: string; fieldErrors: Record<string, string> } {
  return state.status === "error";
}

/**
 * Turns a Zod error into a field -> message map so the offending input can be
 * marked inline rather than the whole form failing with one sentence.
 *
 * Only the first message per field survives: showing a developer three
 * complaints about one box is noise, and the second is usually a consequence
 * of the first.
 */
export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const issue of error.issues) {
    if (issue.path.length === 0) continue;
    const key = issue.path.join(".");
    errors[key] ??= issue.message;
  }

  return errors;
}

export function firstIssueMessage(error: ZodError, fallback = "Invalid input"): string {
  return error.issues[0]?.message ?? fallback;
}

/**
 * Messages a caught exception is permitted to show the developer verbatim.
 *
 * Everything else is replaced by the caller's fallback. A dashboard error may
 * be actionable, but it must never carry driver text, SQL, a constraint name
 * or a schema detail — those describe the database to whoever provoked the
 * error.
 *
 * Matching is exact rather than substring: a driver error that happened to
 * contain one of these phrases would otherwise smuggle the rest of its
 * message out alongside it.
 */
const DISCLOSABLE_MESSAGES = new Set([
  "Expiration date must be in the future.",
  "License not found.",
  "Product not found.",
]);

export function safeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return DISCLOSABLE_MESSAGES.has(error.message) ? error.message : fallback;
}
