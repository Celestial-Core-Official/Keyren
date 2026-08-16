import type { RateLimitDimension } from "./types";

export * from "./types";
export { PostgresRateLimiter } from "./postgres";

/**
 * Extracts the client address behind Vercel's proxy.
 *
 * `x-forwarded-for` is client-controllable in general, which is why an IP
 * limit alone is never the whole policy — the application axis covers the case of
 * an attacker rotating or forging addresses.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;

  // One shared bucket rather than an exemption.
  return "unknown";
}

export type VerifyLimitConfig = {
  perIpPerMinute: number;
  perApplicationPerMinute: number;
};

/**
 * The dimensions every verification request is metered against.
 *
 * Two axes deliberately, not one: a per-IP limit alone punishes offices and
 * campuses behind a single NAT while doing nothing about a distributed
 * attacker, and a per-application limit alone lets one abusive client exhaust a
 * developer's entire budget. Neither is sufficient; together they bound both
 * shapes of abuse.
 */
export function verifyDimensions(
  request: { ip: string; applicationId: string },
  config: VerifyLimitConfig = { perIpPerMinute: 60, perApplicationPerMinute: 600 },
): RateLimitDimension[] {
  return [
    { name: "ip", value: request.ip, limit: config.perIpPerMinute, windowSeconds: 60 },
    {
      name: "application",
      value: request.applicationId,
      limit: config.perApplicationPerMinute,
      windowSeconds: 60,
    },
  ];
}
