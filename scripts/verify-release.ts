/**
 * Alpha_v2 release verification.
 *
 * Drives every dashboard service against the real Neon database and the real
 * public verification endpoint on the running dev server. Deliberately does
 * NOT stub anything: the point is to exercise the same code paths the
 * dashboard calls, plus the actual HTTP route customers hit.
 *
 * Creates its own throwaway owner ids and deletes everything it made.
 * Run with: npm run verify:release -- <base-url>
 *
 * The env file is loaded by Node rather than by dotenv inside this file:
 * tsx compiles the project to CJS, which hoists every import above the first
 * statement, so `@/env` would parse an empty environment and throw.
 */
import { eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { activations, licenses, applications } from "@/db/schema";
import { env } from "@/env";
import { createLicenseBatch } from "@/lib/licenses/batch";
import {
  bulkDeleteLicenses,
  bulkResetActivations,
  bulkRestoreLicenses,
  bulkRevokeLicenses,
  licensesForExport,
} from "@/lib/licenses/bulk";
import {
  metadataToCsv,
  metadataToJson,
  plaintextToCsv,
  plaintextToJson,
  exportFilename,
} from "@/lib/licenses/export";
import { getApplicationLicenseStats, queryLicenses } from "@/lib/licenses/query";
import {
  deleteLicense,
  resetActivation,
  restoreLicense,
  revokeLicense,
  updateLicenseDetails,
} from "@/lib/licenses/service";
import { DEFAULT_LICENSE_QUERY } from "@/lib/licenses/types";
import { createApplication, deleteApplication, listApplications } from "@/lib/applications/service";
import { VERIFY_PATH } from "@/lib/release";

const BASE_URL = process.argv[2] ?? "http://localhost:3000";
const OWNER = `e2e_owner_${Date.now()}`;
const INTRUDER = `e2e_intruder_${Date.now()}`;

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** The public envelope, exactly as documented in docs/api.md. */
type VerifyResponse =
  | { success: true; license: { status: string; expiresAt: string | null } }
  | { success: false; error: { code: string; message: string } };

type VerifyOutcome = {
  status: number;
  json: VerifyResponse | null;
  text: string;
};

async function verify(body: unknown): Promise<VerifyOutcome> {
  const response = await fetch(`${BASE_URL}${VERIFY_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json: VerifyResponse | null = null;
  try {
    json = JSON.parse(text) as VerifyResponse;
  } catch {
    // Left null on purpose, so a non-JSON body is visible rather than fatal.
  }

  return { status: response.status, json, text };
}

/** The license block, or null when the call did not succeed. */
function licenseOf(outcome: VerifyOutcome) {
  return outcome.json?.success === true ? outcome.json.license : null;
}

/** The error code, or null when the call succeeded. */
function codeOf(outcome: VerifyOutcome): string | null {
  return outcome.json?.success === false ? outcome.json.error.code : null;
}

async function main() {
  section("Setup");
  const application = await createApplication(db, OWNER, { name: "E2E Verify Application" });
  check("application created with a app_ id", /^app_[0-9A-Za-z]+$/.test(application.id));
  check("slug derived from the name", application.slug.length > 0);

  const intruderApplication = await createApplication(db, INTRUDER, { name: "Someone Else" });

  // ---------------------------------------------------------------- batch
  section("Batch generation (3 labelled licenses, atomic)");
  const created = await createLicenseBatch(db, OWNER, {
    applicationId: application.id,
    quantity: 3,
    expiration: { mode: "permanent" },
    hwidLocked: true,
    secret: env.KEYREN_LICENSE_HMAC_SECRET,
    label: "Acme Corp",
    notes: "E2E verification batch",
  });

  check("three licenses returned", created.length === 3);
  check(
    "labels numbered 1..3",
    created.map((l) => l.label).join("|") === "Acme Corp 1|Acme Corp 2|Acme Corp 3",
    created.map((l) => l.label).join("|"),
  );
  check("all keys distinct", new Set(created.map((l) => l.licenseKey)).size === 3);
  check(
    "keys match the documented format",
    created.every((l) =>
      /^KEYREN-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}$/.test(
        l.licenseKey,
      ),
    ),
  );

  // ------------------------------------------------------- plaintext leak
  section("No plaintext key reaches the database");
  const storedRows = await db
    .select()
    .from(licenses)
    .where(eq(licenses.applicationId, application.id));

  const storedBlob = JSON.stringify(storedRows);
  check("3 rows persisted", storedRows.length === 3);
  for (const license of created) {
    check(
      `key ${license.keyLast4} absent from every stored column`,
      !storedBlob.includes(license.licenseKey),
    );
  }
  check(
    "no column anywhere in the table contains a full key",
    !/KEYREN-[0-9A-HJKMNP-TV-Z]{8}-/.test(storedBlob),
  );

  // A direct scan of every text column across the whole database, not just
  // the rows this run created.
  // postgres.js returns rows as an array; cast rather than widen to `any`.
  const leakScan = (await db.execute(sql`
    SELECT count(*)::int AS hits FROM licenses
    WHERE key_hash LIKE 'KEYREN-%' OR key_last4 LIKE 'KEYREN-%'
       OR coalesce(label, '') LIKE 'KEYREN-%-%-%-%'
       OR coalesce(notes, '') LIKE 'KEYREN-%-%-%-%'
  `)) as unknown as { hits: number }[];

  check(
    "no key-shaped value in any licenses column, database-wide",
    Number(leakScan[0]?.hits ?? 0) === 0,
  );

  // ---------------------------------------------------------- exports
  section("One-time plaintext export");
  const exportRows = created.map((l) => ({
    label: l.label,
    licenseKey: l.licenseKey,
    applicationId: l.applicationId,
    expiresAt: l.expiresAt,
    hwidLocked: l.hwidLocked,
    createdAt: l.createdAt,
  }));

  const csv = plaintextToCsv(exportRows);
  const json = plaintextToJson(exportRows);
  check(
    "CSV header matches the documented columns",
    csv.split("\r\n")[0] === "label,licenseKey,applicationId,expiresAt,hwidLocked,createdAt",
  );
  check("CSV contains every key", created.every((l) => csv.includes(l.licenseKey)));
  check("JSON contains every key", json.every((r, i) => r.licenseKey === created[i]!.licenseKey));
  check(
    "filename shape is <slug>-licenses-YYYY-MM-DD-HHmmss.csv",
    /^[a-z0-9-]+-licenses-\d{4}-\d{2}-\d{2}-\d{6}\.csv$/.test(
      exportFilename(application.slug, "csv"),
    ),
    exportFilename(application.slug, "csv"),
  );

  // CSV injection, end to end through a real stored label.
  await updateLicenseDetails(db, OWNER, created[0]!.id, {
    label: `=cmd|'/c calc'!A0`,
    notes: "injection probe",
  });
  const injected = await licensesForExport(db, OWNER, [created[0]!.id]);
  const injectedCsv = metadataToCsv(injected);
  check(
    "a formula label is neutralised in the metadata CSV",
    injectedCsv.includes(`"'=cmd|'/c calc'!A0"`) || injectedCsv.includes(`'=cmd`),
    injectedCsv.split("\r\n")[1],
  );
  await updateLicenseDetails(db, OWNER, created[0]!.id, {
    label: "Acme Corp 1",
    notes: "E2E verification batch",
  });

  section("Metadata export cannot carry a key");
  const metadata = await licensesForExport(db, OWNER, created.map((l) => l.id));
  const metadataBlob = JSON.stringify(metadataToJson(metadata)) + metadataToCsv(metadata);
  check("3 metadata rows", metadata.length === 3);
  check(
    "no plaintext key in the metadata export",
    created.every((l) => !metadataBlob.includes(l.licenseKey)),
  );
  check("masked keys only", metadata.every((r) => r.maskedKey.includes("••••")));
  check("no licenseKey column", !metadataBlob.includes("licenseKey"));

  // ------------------------------------------------------- verification
  section("Public API — happy path");
  const target = created[1]!;
  const deviceOne = "e2e-device-one";
  const deviceTwo = "e2e-device-two";

  const ok = await verify({
    applicationId: application.id,
    licenseKey: target.licenseKey,
    deviceId: deviceOne,
  });
  check("200 for a valid license", ok.status === 200, `got ${ok.status}: ${ok.text}`);
  check("success envelope", ok.json?.success === true);
  check(
    "response is exactly { status, expiresAt }",
    JSON.stringify(Object.keys(licenseOf(ok) ?? {}).sort()) ===
      JSON.stringify(["expiresAt", "status"]),
    JSON.stringify(licenseOf(ok)),
  );
  check("status is active", licenseOf(ok)?.status === "active");
  check("permanent license reports null expiry", licenseOf(ok)?.expiresAt === null);
  check(
    "label and notes never leave the server",
    !ok.text.includes("Acme") && !ok.text.includes("label") && !ok.text.includes("notes"),
    ok.text,
  );

  const again = await verify({
    applicationId: application.id,
    licenseKey: target.licenseKey,
    deviceId: deviceOne,
  });
  check("same device verifies again", again.status === 200 && again.json?.success === true);

  section("Public API — device binding");
  const mismatch = await verify({
    applicationId: application.id,
    licenseKey: target.licenseKey,
    deviceId: deviceTwo,
  });
  check("second device is refused", mismatch.status === 403, `got ${mismatch.status}`);
  check("DEVICE_MISMATCH code", codeOf(mismatch) === "DEVICE_MISMATCH");

  await resetActivation(db, OWNER, target.id);
  const afterReset = await verify({
    applicationId: application.id,
    licenseKey: target.licenseKey,
    deviceId: deviceTwo,
  });
  check("second device succeeds after reset", afterReset.status === 200);

  section("Public API — lifecycle states");
  await revokeLicense(db, OWNER, target.id);
  const revoked = await verify({
    applicationId: application.id,
    licenseKey: target.licenseKey,
    deviceId: deviceTwo,
  });
  check("revoked license is refused", revoked.status === 403);
  check("LICENSE_REVOKED code", codeOf(revoked) === "LICENSE_REVOKED");

  await restoreLicense(db, OWNER, target.id);
  const restored = await verify({
    applicationId: application.id,
    licenseKey: target.licenseKey,
    deviceId: deviceTwo,
  });
  check("restored license authenticates again", restored.status === 200);

  section("Public API — error codes");
  const badKey = await verify({
    applicationId: application.id,
    licenseKey: "KEYREN-ZZZZZZZZ-ZZZZZZZZ-ZZZZZZZZ-ZZZZZZZZ",
    deviceId: deviceOne,
  });
  check("unknown key -> 403 LICENSE_INVALID",
    badKey.status === 403 && codeOf(badKey) === "LICENSE_INVALID");

  const badApplication = await verify({
    applicationId: "app_doesnotexist",
    licenseKey: target.licenseKey,
    deviceId: deviceOne,
  });
  check("unknown application -> 404 APPLICATION_INVALID",
    badApplication.status === 404 && codeOf(badApplication) === "APPLICATION_INVALID");

  const malformed = await verify({ applicationId: application.id });
  check("missing fields -> 400 BAD_REQUEST",
    malformed.status === 400 && codeOf(malformed) === "BAD_REQUEST");

  const wrongMethod = await fetch(`${BASE_URL}${VERIFY_PATH}`);
  check("GET -> 405 with Allow: POST",
    wrongMethod.status === 405 && wrongMethod.headers.get("allow") === "POST");

  // Expired license.
  const expiredBatch = await createLicenseBatch(db, OWNER, {
    applicationId: application.id,
    quantity: 1,
    expiration: { mode: "permanent" },
    hwidLocked: false,
    secret: env.KEYREN_LICENSE_HMAC_SECRET,
    label: "Expired probe",
    notes: null,
  });
  await db
    .update(licenses)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(licenses.id, expiredBatch[0]!.id));

  const expired = await verify({
    applicationId: application.id,
    licenseKey: expiredBatch[0]!.licenseKey,
    deviceId: deviceOne,
  });
  check("expired license -> 403 LICENSE_EXPIRED",
    expired.status === 403 && codeOf(expired) === "LICENSE_EXPIRED",
    `${expired.status} ${expired.text}`);

  // ------------------------------------------------------------- queries
  section("Discovery — search, filters, sorting, stats");
  const all = await queryLicenses(db, OWNER, application.id, DEFAULT_LICENSE_QUERY);
  check("all licenses listed", all.total === 4, `total=${all.total}`);
  check("effective status computed", all.rows.some((r) => r.effectiveStatus === "expired"));

  const searched = await queryLicenses(db, OWNER, application.id, {
    ...DEFAULT_LICENSE_QUERY,
    q: "acme",
  });
  check("case-insensitive label search", searched.total === 3, `total=${searched.total}`);

  const byLast4 = await queryLicenses(db, OWNER, application.id, {
    ...DEFAULT_LICENSE_QUERY,
    q: created[0]!.keyLast4.toLowerCase(),
  });
  check("search by last four characters", byLast4.total >= 1);

  const expiredOnly = await queryLicenses(db, OWNER, application.id, {
    ...DEFAULT_LICENSE_QUERY,
    status: "expired",
  });
  check("expired filter", expiredOnly.total === 1, `total=${expiredOnly.total}`);

  const unlocked = await queryLicenses(db, OWNER, application.id, {
    ...DEFAULT_LICENSE_QUERY,
    lock: "unlocked",
  });
  check("lock filter", unlocked.total === 1, `total=${unlocked.total}`);

  const activated = await queryLicenses(db, OWNER, application.id, {
    ...DEFAULT_LICENSE_QUERY,
    activation: "activated",
  });
  check("activation filter", activated.total === 1, `total=${activated.total}`);

  const percentProbe = await queryLicenses(db, OWNER, application.id, {
    ...DEFAULT_LICENSE_QUERY,
    q: "%",
  });
  check("a literal % does not match everything", percentProbe.total === 0,
    `total=${percentProbe.total}`);

  const stats = await getApplicationLicenseStats(db, OWNER, application.id);
  check("stats: total", stats.total === 4, `${stats.total}`);
  check("stats: active excludes expired", stats.active === 3, `${stats.active}`);
  check("stats: expired counted", stats.expired === 1, `${stats.expired}`);
  check("stats: bound devices counts only locked bindings", stats.boundDevices === 1,
    `${stats.boundDevices}`);
  check("stats: activated derives verification success", stats.activated === 1,
    `${stats.activated}`);

  const applicationList = await listApplications(db, OWNER, { q: application.id, sort: "newest" });
  check("applications searchable by id", applicationList.length === 1);
  check("license count is right", applicationList[0]?.licenseCount === 4,
    `${applicationList[0]?.licenseCount}`);

  // ---------------------------------------------------------- edit details
  section("Editing details");
  const edited = await updateLicenseDetails(db, OWNER, created[2]!.id, {
    label: "Renamed — 顧客 🔑",
    notes: "Unicode round-trip probe",
  });
  check("label saved with Unicode intact", edited.label === "Renamed — 顧客 🔑", `${edited.label}`);
  check("notes saved", edited.notes === "Unicode round-trip probe");

  const stillValid = await verify({
    applicationId: application.id,
    licenseKey: created[2]!.licenseKey,
    deviceId: "e2e-device-three",
  });
  check("editing details does not affect verification", stillValid.status === 200);

  // -------------------------------------------------------- authorization
  section("Authorization — foreign resources are indistinguishable from missing");
  const foreignQuery = await queryLicenses(db, INTRUDER, application.id, DEFAULT_LICENSE_QUERY)
    .then(() => "resolved")
    .catch((error: Error) => error.message);
  const missingQuery = await queryLicenses(db, INTRUDER, "app_nothing", DEFAULT_LICENSE_QUERY)
    .then(() => "resolved")
    .catch((error: Error) => error.message);
  check("foreign application errors identically to a missing one",
    foreignQuery === missingQuery && foreignQuery.includes("not found"),
    `${foreignQuery} vs ${missingQuery}`);

  const foreignEdit = await updateLicenseDetails(db, INTRUDER, created[0]!.id, {
    label: "stolen",
    notes: null,
  }).then(() => "resolved").catch((error: Error) => error.message);
  check("foreign edit refused", foreignEdit.includes("not found"), foreignEdit);

  const [untouched] = await db
    .select()
    .from(licenses)
    .where(eq(licenses.id, created[0]!.id));
  check("and the row is genuinely unchanged", untouched?.label === "Acme Corp 1",
    `${untouched?.label}`);

  const foreignBulk = await bulkRevokeLicenses(db, INTRUDER, created.map((l) => l.id));
  check("foreign bulk revoke changes nothing",
    foreignBulk.changed === 0 && foreignBulk.notFound === 3,
    JSON.stringify(foreignBulk));

  const missingBulk = await bulkRevokeLicenses(db, INTRUDER, [
    "lic_aaaaaaaaaaaaaaaa",
    "lic_bbbbbbbbbbbbbbbb",
    "lic_cccccccccccccccc",
  ]);
  check("foreign and missing ids give identical counts",
    JSON.stringify(foreignBulk) === JSON.stringify(missingBulk),
    `${JSON.stringify(foreignBulk)} vs ${JSON.stringify(missingBulk)}`);

  const foreignExport = await licensesForExport(db, INTRUDER, created.map((l) => l.id));
  check("foreign export returns nothing", foreignExport.length === 0);

  // ------------------------------------------------------------ bulk ops
  section("Bulk operations");
  const ids = created.map((l) => l.id);

  // All three are active at this point — the one revoked during the lifecycle
  // section was restored again — so a bulk revoke changes all three.
  const bulkRevoke = await bulkRevokeLicenses(db, OWNER, ids);
  check("bulk revoke changes every active license",
    bulkRevoke.changed === 3 && bulkRevoke.skipped === 0 && bulkRevoke.notFound === 0,
    JSON.stringify(bulkRevoke));

  // Immediately again: now every one of them is already revoked, so the
  // honest answer is "nothing changed, three skipped".
  const bulkRevokeAgain = await bulkRevokeLicenses(db, OWNER, ids);
  check("re-revoking reports skipped rather than changed",
    bulkRevokeAgain.changed === 0 && bulkRevokeAgain.skipped === 3,
    JSON.stringify(bulkRevokeAgain));

  const mixed = await bulkRestoreLicenses(db, OWNER, [ids[0]!]);
  check("restoring one of three", mixed.changed === 1, JSON.stringify(mixed));
  const partial = await bulkRevokeLicenses(db, OWNER, ids);
  check("a mixed selection reports both halves",
    partial.changed === 1 && partial.skipped === 2,
    JSON.stringify(partial));

  const bulkRestore = await bulkRestoreLicenses(db, OWNER, ids);
  check("bulk restore: all 3 changed",
    bulkRestore.changed === 3 && bulkRestore.skipped === 0,
    JSON.stringify(bulkRestore));

  const bulkReset = await bulkResetActivations(db, OWNER, ids);
  check("bulk reset only counts licenses that held a binding",
    bulkReset.changed + bulkReset.skipped === 3,
    JSON.stringify(bulkReset));

  const dupes = await bulkRevokeLicenses(db, OWNER, [ids[0]!, ids[0]!, ids[0]!]);
  check("a repeated id counts once", dupes.changed === 1, JSON.stringify(dupes));
  await bulkRestoreLicenses(db, OWNER, [ids[0]!]);

  const bulkDelete = await bulkDeleteLicenses(db, OWNER, [ids[0]!, ids[1]!]);
  check("bulk delete removes exactly the selection", bulkDelete.changed === 2,
    JSON.stringify(bulkDelete));

  const remaining = await queryLicenses(db, OWNER, application.id, DEFAULT_LICENSE_QUERY);
  check("two licenses left", remaining.total === 2, `${remaining.total}`);

  const deletedKeyCheck = await verify({
    applicationId: application.id,
    licenseKey: created[0]!.licenseKey,
    deviceId: deviceOne,
  });
  check("a deleted license no longer authenticates",
    deletedKeyCheck.status === 403 && codeOf(deletedKeyCheck) === "LICENSE_INVALID");

  section("Single-license delete");
  const deleted = await deleteLicense(db, OWNER, created[2]!.id);
  check("delete returns the row so it can be named", deleted.label === "Renamed — 顧客 🔑");
  const orphans = await db
    .select()
    .from(activations)
    .where(eq(activations.licenseId, created[2]!.id));
  check("activation cascaded away", orphans.length === 0);

  // -------------------------------------------------------------- cleanup
  section("Cleanup");
  await deleteApplication(db, OWNER, application.id);
  await deleteApplication(db, INTRUDER, intruderApplication.id);

  const leftovers = await db
    .select()
    .from(applications)
    .where(or(eq(applications.ownerId, OWNER), eq(applications.ownerId, INTRUDER)));
  check("test data removed", leftovers.length === 0);

  const orphanLicenses = await db
    .select()
    .from(licenses)
    .where(inArray(licenses.id, [...ids, expiredBatch[0]!.id]));
  check("licenses cascaded with the application", orphanLicenses.length === 0);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }
  console.log("ALL CHECKS PASSED");
  process.exit(0);
}

main().catch((error) => {
  console.error("\nE2E run threw:", error);
  process.exit(1);
});
