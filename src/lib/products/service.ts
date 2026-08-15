import { and, asc, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { licenses, products } from "@/db/schema";
import type { Database } from "@/db/types";
import { generateProductId } from "@/lib/crypto/ids";
import { notFound } from "@/lib/errors";
import { containsPattern } from "@/lib/search";
import { slugify } from "./slug";
import { DEFAULT_PRODUCT_QUERY, type ProductQuery, type ProductSort } from "./types";

export type Product = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ProductListItem = Product & { licenseCount: number };

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

export async function createProduct(
  db: Database,
  ownerId: string,
  input: { name: string },
): Promise<Product> {
  const now = new Date();
  const [row] = await db
    .insert(products)
    .values({
      id: generateProductId(),
      ownerId,
      name: input.name,
      slug: slugify(input.name),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) throw new Error("Failed to create product");
  return toProduct(row);
}

/**
 * `products.id` is the tiebreaker on every sort. Two products created in the
 * same microsecond, or sharing a name, would otherwise come back in whatever
 * order the planner felt like — which reads as the list reshuffling itself
 * between navigations.
 */
function productOrderBy(sort: ProductSort): SQL[] {
  const tiebreak = asc(products.id);

  switch (sort) {
    case "oldest":
      return [asc(products.createdAt), tiebreak];
    case "name":
      return [asc(products.name), tiebreak];
    case "licenses":
      return [desc(count(licenses.id)), tiebreak];
    case "newest":
      return [desc(products.createdAt), tiebreak];
  }
}

export async function listProducts(
  db: Database,
  ownerId: string,
  query: ProductQuery = DEFAULT_PRODUCT_QUERY,
): Promise<ProductListItem[]> {
  const conditions: SQL[] = [eq(products.ownerId, ownerId)];

  const term = query.q.trim();
  if (term !== "") {
    const pattern = containsPattern(term);
    // Product ID is searchable because it is the value a developer has in
    // front of them — pasted from a stack trace, a support ticket, or their
    // own config — far more often than the name they typed months ago.
    const match = or(
      sql`${products.name} ILIKE ${pattern}`,
      sql`${products.slug} ILIKE ${pattern}`,
      sql`${products.id} ILIKE ${pattern}`,
    );
    if (match) conditions.push(match);
  }

  // A LEFT JOIN with GROUP BY rather than a query-per-product, so the
  // products page stays one round trip regardless of how many products exist.
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      createdAt: products.createdAt,
      updatedAt: products.updatedAt,
      licenseCount: count(licenses.id),
    })
    .from(products)
    .leftJoin(licenses, eq(licenses.productId, products.id))
    .where(and(...conditions))
    .groupBy(products.id)
    .orderBy(...productOrderBy(query.sort));

  return rows.map((row) => ({ ...row, licenseCount: Number(row.licenseCount) }));
}

export async function getProduct(
  db: Database,
  ownerId: string,
  productId: string,
): Promise<Product | null> {
  const [row] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
    .limit(1);

  return row ? toProduct(row) : null;
}

export async function renameProduct(
  db: Database,
  ownerId: string,
  productId: string,
  name: string,
): Promise<Product> {
  // Note that `id` is not in the SET clause. A rename must never change the
  // identifier customer software authenticates against.
  const [row] = await db
    .update(products)
    .set({ name, slug: slugify(name), updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
    .returning();

  if (!row) throw notFound("Product");
  return toProduct(row);
}

export async function deleteProduct(
  db: Database,
  ownerId: string,
  productId: string,
): Promise<void> {
  const deleted = await db
    .delete(products)
    .where(and(eq(products.id, productId), eq(products.ownerId, ownerId)))
    .returning({ id: products.id });

  // Zero rows means the product does not exist OR belongs to someone else.
  // Both produce the same error on purpose.
  if (deleted.length === 0) throw notFound("Product");
}

function toProduct(row: typeof products.$inferSelect): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
