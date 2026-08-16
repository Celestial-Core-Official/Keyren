import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  actionFailure,
  actionSuccess,
  fieldErrorsFrom,
  firstIssueMessage,
  idleAction,
  isActionError,
  isActionSuccess,
  safeErrorMessage,
} from "@/lib/actions/state";

describe("action state constructors", () => {
  it("starts idle with neither a message nor data", () => {
    const state = idleAction();
    expect(state.status).toBe("idle");
    expect(isActionSuccess(state)).toBe(false);
    expect(isActionError(state)).toBe(false);
  });

  it("carries a message and data on success", () => {
    const state = actionSuccess("Revoked Acme Corp.", { id: "lic_1" });
    expect(isActionSuccess(state)).toBe(true);
    expect(state.message).toBe("Revoked Acme Corp.");
    expect(state.data).toEqual({ id: "lic_1" });
  });

  it("carries a message and field errors on failure", () => {
    const state = actionFailure("Check the form.", { label: "Label is too long" });
    expect(isActionError(state)).toBe(true);
    expect(state.fieldErrors.label).toBe("Label is too long");
  });

  it("defaults failures to an empty field-error map", () => {
    // So a consumer can read `state.fieldErrors.label` without a guard.
    expect(actionFailure("Something went wrong.").fieldErrors).toEqual({});
  });

  it("cannot be success and error at once", () => {
    // The discriminant is the whole point: Alpha_v1's `{ error: string | null }`
    // allowed `{ error: null }` to mean both "nothing happened yet" and
    // "it worked", which is why successes were invisible.
    const success = actionSuccess("Done.", null);
    const failure = actionFailure("Nope.");
    expect(isActionSuccess(success) && isActionError(success)).toBe(false);
    expect(isActionSuccess(failure) && isActionError(failure)).toBe(false);
  });
});

describe("fieldErrorsFrom", () => {
  const schema = z.object({
    label: z.string().max(3, "Label is too long"),
    notes: z.string().max(3, "Notes are too long"),
  });

  it("maps each field to its first message", () => {
    const result = schema.safeParse({ label: "aaaa", notes: "bbbb" });
    expect(fieldErrorsFrom(result.error!)).toEqual({
      label: "Label is too long",
      notes: "Notes are too long",
    });
  });

  it("keeps the first message when a field has several problems", () => {
    const strict = z.object({ label: z.string().min(5, "Too short").regex(/^A/, "Must start with A") });
    const errors = fieldErrorsFrom(strict.safeParse({ label: "b" }).error!);
    expect(errors.label).toBe("Too short");
  });

  it("ignores issues with no path", () => {
    const refined = z.object({ a: z.string() }).refine(() => false, "Whole-form problem");
    expect(fieldErrorsFrom(refined.safeParse({ a: "x" }).error!)).toEqual({});
  });

  it("joins nested paths with a dot", () => {
    const nested = z.object({ outer: z.object({ inner: z.string() }) });
    const errors = fieldErrorsFrom(nested.safeParse({ outer: { inner: 1 } }).error!);
    expect(Object.keys(errors)).toEqual(["outer.inner"]);
  });
});

describe("firstIssueMessage", () => {
  it("returns the first issue's message", () => {
    const schema = z.object({ label: z.string().max(3, "Label is too long") });
    expect(firstIssueMessage(schema.safeParse({ label: "aaaa" }).error!)).toBe(
      "Label is too long",
    );
  });
});

describe("safeErrorMessage", () => {
  it("passes through an actionable message the developer can fix", () => {
    // A future-date rule is the user's problem to correct, so collapsing it
    // into "Could not create license" wastes their time.
    expect(
      safeErrorMessage(new Error("Expiration date must be in the future."), "fallback"),
    ).toBe("Expiration date must be in the future.");
  });

  it("masks anything not on the allow-list", () => {
    expect(
      safeErrorMessage(
        new Error('duplicate key value violates unique constraint "licenses_key_hash_unique"'),
        "Could not create license.",
      ),
    ).toBe("Could not create license.");
  });

  it("masks a message that merely contains an allowed phrase", () => {
    // Substring matching would let a driver error smuggle schema details out
    // by coincidence.
    expect(
      safeErrorMessage(
        new Error('column "future" does not exist: Expiration date must be in the future.'),
        "fallback",
      ),
    ).toBe("fallback");
  });

  it("masks a non-Error throw", () => {
    expect(safeErrorMessage("a bare string", "fallback")).toBe("fallback");
    expect(safeErrorMessage(undefined, "fallback")).toBe("fallback");
    expect(safeErrorMessage({ message: "Expiration date must be in the future." }, "fallback")).toBe(
      "fallback",
    );
  });

  it("passes through the not-found message services raise", () => {
    expect(safeErrorMessage(new Error("License not found."), "fallback")).toBe(
      "License not found.",
    );
  });
});
