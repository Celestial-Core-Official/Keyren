import { describe, expect, it } from "vitest";
import { editLicenseDetailsSchema } from "@/lib/validation/dashboard";

const LICENSE_ID = "lic_abc123";

function parse(input: { label?: unknown; notes?: unknown }) {
  return editLicenseDetailsSchema.safeParse({ licenseId: LICENSE_ID, ...input });
}

describe("editLicenseDetailsSchema", () => {
  it("accepts a label and notes", () => {
    const result = parse({ label: "Order #4471", notes: "Paid by invoice." });
    expect(result.success).toBe(true);
    expect(result.data?.label).toBe("Order #4471");
    expect(result.data?.notes).toBe("Paid by invoice.");
  });

  it("trims surrounding whitespace", () => {
    const result = parse({ label: "  Acme  ", notes: "\n  note  \n" });
    expect(result.data?.label).toBe("Acme");
    expect(result.data?.notes).toBe("note");
  });

  it("normalizes an empty string to null", () => {
    // An untouched text input submits "", and a column full of empty strings
    // would defeat every `IS NULL` check the dashboard makes.
    const result = parse({ label: "", notes: "" });
    expect(result.data?.label).toBeNull();
    expect(result.data?.notes).toBeNull();
  });

  it("normalizes a whitespace-only string to null", () => {
    const result = parse({ label: "   ", notes: "\t\n " });
    expect(result.data?.label).toBeNull();
    expect(result.data?.notes).toBeNull();
  });

  it("treats a missing field as null", () => {
    const result = parse({});
    expect(result.success).toBe(true);
    expect(result.data?.label).toBeNull();
    expect(result.data?.notes).toBeNull();
  });

  it("accepts exactly the maximum lengths", () => {
    expect(parse({ label: "L".repeat(120) }).success).toBe(true);
    expect(parse({ notes: "N".repeat(1000) }).success).toBe(true);
  });

  it("rejects an oversized label", () => {
    const result = parse({ label: "L".repeat(121) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/120/);
  });

  it("rejects oversized notes", () => {
    const result = parse({ notes: "N".repeat(1001) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/1,?000/);
  });

  it("measures length after trimming, not before", () => {
    // 120 real characters wrapped in spaces is a 120-character label.
    expect(parse({ label: `  ${"L".repeat(120)}  ` }).success).toBe(true);
  });

  it("rejects a malformed license id", () => {
    expect(
      editLicenseDetailsSchema.safeParse({ licenseId: "not-a-license", label: "x" })
        .success,
    ).toBe(false);
  });

  it("ignores an ownerId supplied by the client", () => {
    const result = editLicenseDetailsSchema.safeParse({
      licenseId: LICENSE_ID,
      label: "x",
      ownerId: "user_someone_else",
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("ownerId");
  });
});
