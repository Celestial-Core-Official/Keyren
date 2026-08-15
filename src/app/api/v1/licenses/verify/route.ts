import { NextResponse } from "next/server";
import { db } from "@/db";
import { env } from "@/env";
import {
  VERIFICATION_ERROR_MESSAGE,
  VERIFICATION_ERROR_STATUS,
  type VerificationErrorCode,
} from "@/lib/errors";
import { verifyLicense } from "@/lib/licenses/verify";
import { PostgresRateLimiter, clientIpFrom, verifyDimensions } from "@/lib/rate-limit";
import { verifyRequestSchema } from "@/lib/validation/verify-request";

/**
 * POST /api/v1/licenses/verify
 *
 * The only public, unauthenticated endpoint in Keyren. It is a thin adapter:
 * parse, meter, delegate to the verification engine, serialize. No licensing
 * decision is made in this file.
 *
 * The URL is versioned `/v1/` on normal semantic-versioning grounds. That is
 * intentionally decoupled from the `Alpha_v1` release name — the marketing
 * name can advance to Alpha_v2 or Beta_v1 without breaking a single deployed
 * client.
 *
 * Alpha_v1 is online-only. There is no offline grant, no cached token, and no
 * grace period: if Keyren is unreachable, integrating software cannot obtain
 * a positive answer. A future release can add server-signed grace tokens by
 * extending this response, which is why the success envelope is an object
 * rather than a bare boolean.
 */

// Node runtime: the verification path uses node:crypto for HMAC.
export const runtime = "nodejs";
// Never cache a licensing decision.
export const dynamic = "force-dynamic";

function errorResponse(code: VerificationErrorCode, headers?: HeadersInit): NextResponse {
  return NextResponse.json(
    { success: false, error: { code, message: VERIFICATION_ERROR_MESSAGE[code] } },
    { status: VERIFICATION_ERROR_STATUS[code], headers },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // 1. Structure. A malformed body is rejected before any work is done.
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return errorResponse("BAD_REQUEST");
    }

    const parsed = verifyRequestSchema.safeParse(raw);
    if (!parsed.success) {
      // Zod's issue list is deliberately discarded: it would describe the
      // expected shape of the request to anyone probing the endpoint.
      return errorResponse("BAD_REQUEST");
    }

    const { productId, licenseKey, deviceId } = parsed.data;

    // 2. Rate limit BEFORE any license lookup, so a flood of guesses never
    //    reaches the database.
    const limiter = new PostgresRateLimiter(db);
    const limit = await limiter.consume(
      verifyDimensions(
        { ip: clientIpFrom(request.headers), productId },
        {
          perIpPerMinute: env.RATE_LIMIT_VERIFY_PER_MINUTE,
          perProductPerMinute: env.RATE_LIMIT_VERIFY_PER_PRODUCT_PER_MINUTE,
        },
      ),
    );

    if (!limit.allowed) {
      // Retry-After is the only detail exposed. Nothing about which axis
      // tripped, what the limits are, or how the limiter is implemented.
      return errorResponse("RATE_LIMITED", {
        "retry-after": String(limit.retryAfterSeconds),
      });
    }

    // 3. Delegate every licensing decision to the engine.
    const result = await verifyLicense(db, {
      productId,
      licenseKey,
      deviceId,
      secret: env.KEYREN_LICENSE_HMAC_SECRET,
    });

    if (!result.success) {
      return errorResponse(result.error.code);
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    // Server-side detail for debugging; nothing here reaches the client. The
    // caught value is never interpolated into the response, so a database
    // error message cannot leak schema details.
    console.error("[verify] unexpected failure", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return errorResponse("INTERNAL_ERROR");
  }
}

/** Explicit 405 so a wrong-method integration bug is obvious, not a 404. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: { code: "BAD_REQUEST", message: "Use POST for license verification." },
    },
    { status: 405, headers: { allow: "POST" } },
  );
}
