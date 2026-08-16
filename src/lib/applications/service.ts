import { and, asc, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { licenses, applications } from "@/db/schema";
import type { Database } from "@/db/types";
import { generateApplicationId } from "@/lib/crypto/ids";
import { notFound } from "@/lib/errors";
import { containsPattern } from "@/lib/search";
import { slugify } from "./slug";
import { DEFAULT_APPLICATION_QUERY, type ApplicationQuery, type ApplicationSort } from "./types";

export type Application = {
  id: string;
  name: string;
  slug: string;
  /** NULL while live. A timestamp means the developer switched it off. */
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ApplicationListItem = Application & { licenseCount: number };

/**
 * Every function here takes `ownerId` as an explicit argument and folds it
 * into the WHERE clause. There is deliberately no "fetch then compare in
 * JavaScript" path: an ownership check that lives in the SQL cannot be
 * forgotten by a caller, and a mismatch returns "not found" rather than
 * "forbidden" so IDs cannot be probed for existence.
 *
 * `ownerId` always originates from a server-side Clerk `auth()` call. It is
 * never accepted from a request body, form field, or URL.
 */

export async function createApplication(
  db: Database,
  ownerId: string,
  input: { name: string },
): Promise<Application> {
  const now = new Date();
  const [row] = await db
    .insert(applications)
    .values({
      id: generateApplicationId(),
      ownerId,
      name: input.name,
      slug: slugify(input.name),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new Error("Failed to create application");
  return toApplication(row);
}

/**
 * `applications.id` is the tiebreaker on every sort. Two applications created in the
 * same microsecond, or sharing a name, would otherwise come back in whatever
 * order the planner felt like — which reads as the list reshuffling itself
 * between navigations.
 */
function applicationOrderBy(sort: ApplicationSort): SQL[] {
  const tiebreak = asc(applications.id);

  switch (sort) {
    case "oldest":
      return [asc(applications.createdAt), tiebreak];
    case "name":
      return [asc(applications.name), tiebreak];
    case "licenses":
      return [desc(count(licenses.id)), tiebreak];
    case "newest":
      return [desc(applications.createdAt), tiebreak];
  }
}

export async function listApplications(
  db: Database,
  ownerId: string,
  query: ApplicationQuery = DEFAULT_APPLICATION_QUERY,
): Promise<ApplicationListItem[]> {
  const conditions: SQL[] = [eq(applications.ownerId, ownerId)];

  const term = query.q.trim();
  if (term !== "") {
    const pattern = containsPattern(term);
    // Application ID is searchable because it is the value a developer has in
    // front of them — pasted from a stack trace, a support ticket, or their
    // own config — far more often than the name they typed months ago.
    const match = or(
      sql`${applications.name} ILIKE ${pattern}`,
      sql`${applications.slug} ILIKE ${pattern}`,
      sql`${applications.id} ILIKE ${pattern}`,
    );
    if (match) conditions.push(match);
  }

  // A LEFT JOIN with GROUP BY rather than a query-per-application, so the
  // applications page stays one round trip regardless of how many applications exist.
  const rows = await db
    .select({
      id: applications.id,
      name: applications.name,
      slug: applications.slug,
      disabledAt: applications.disabledAt,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      licenseCount: count(licenses.id),
    })
    .from(applications)
    .leftJoin(licenses, eq(licenses.applicationId, applications.id))
    .where(and(...conditions))
    .groupBy(applications.id)
    .orderBy(...applicationOrderBy(query.sort));

  return rows.map((row) => ({ ...row, licenseCount: Number(row.licenseCount) }));
}

export async function getApplication(
  db: Database,
  ownerId: string,
  applicationId: string,
): Promise<Application | null> {
  const [row] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.ownerId, ownerId)))
    .limit(1);

  return row ? toApplication(row) : null;
}

export async function renameApplication(
  db: Database,
  ownerId: string,
  applicationId: string,
  name: string,
): Promise<Application> {
  // Note that `id` is not in the SET clause. A rename must never change the
  // identifier customer software authenticates against.
  const [row] = await db
    .update(applications)
    .set({ name, slug: slugify(name), updatedAt: new Date() })
    .where(and(eq(applications.id, applicationId), eq(applications.ownerId, ownerId)))
    .returning();

  if (!row) throw notFound("Application");
  return toApplication(row);
}

/**
 * Switches an application off, or back on.
 *
 * While off, every verification for it fails with `APPLICATION_DISABLED`, no
 * matter how healthy the individual license is. Nothing is destroyed: no
 * license is revoked, no activation is released, and switching back on
 * restores the exact state that was there before. That reversibility is the
 * reason this exists rather than telling a developer to delete and rebuild.
 */
export async function setApplicationDisabled(
  db: Database,
  ownerId: string,
  applicationId: string,
  disabled: boolean,
): Promise<Application> {
  const [row] = await db
    .update(applications)
    .set({ disabledAt: disabled ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(applications.id, applicationId), eq(applications.ownerId, ownerId)))
    .returning();

  if (!row) throw notFound("Application");
  return toApplication(row);
}

export async function deleteApplication(
  db: Database,
  ownerId: string,
  applicationId: string,
): Promise<void> {
  const deleted = await db
    .delete(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.ownerId, ownerId)))
    .returning({ id: applications.id });

  // Zero rows means the application does not exist OR belongs to someone else.
  // Both produce the same error on purpose.
  if (deleted.length === 0) throw notFound("Application");
}

function toApplication(row: typeof applications.$inferSelect): Application {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
