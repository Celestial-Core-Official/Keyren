/**
 * The honest substitute for social proof.
 *
 * There are no customers to quote, no logos to display and no certifications
 * to claim, and inventing any of those is both checkable and fatal. What a
 * pre-proof product does have is its actual mechanics, stated precisely enough
 * that a reader can judge them.
 *
 * Every claim below is a description of code in this repository. The device
 * caveat in particular is published deliberately: `lib/crypto/device.ts`
 * already concedes internally that a fingerprint raises the cost of casual
 * sharing rather than being a hardware security primitive, and saying so is
 * worth more than a badge would be.
 */
const CLAIMS = [
  {
    claim: "Keys are never stored.",
    mechanism:
      "Only HMAC-SHA256 of a normalized key is written to the database. The plaintext is shown once, at creation, and no one — including us — can recover it afterwards.",
  },
  {
    claim: "A licence can be bound to one device.",
    mechanism:
      "The first device to authenticate claims it. A fingerprint raises the cost of casual key sharing; it is not a hardware security primitive, and it is not treated as one.",
  },
  {
    claim: "Rate limited at the endpoint.",
    mechanism:
      "Per IP and per application, in fixed sixty-second windows, enforced in Postgres rather than in front of it.",
  },
  {
    claim: "Ownership is enforced in SQL.",
    mechanism:
      "Every read and mutation is one statement scoped by owner. A miss returns not-found rather than forbidden, so identifiers cannot be probed for existence.",
  },
] as const;

export function SecurityModel() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-20">
          <div>
            <h2 className="max-w-[18ch] text-[clamp(1.75rem,3vw,2.25rem)] font-medium leading-tight tracking-[var(--tracking-heading)]">
              What happens to a key after you generate it.
            </h2>
            <p className="mt-4 max-w-[40ch] text-[14px] leading-relaxed text-fg-tertiary">
              Every client is assumed compromised — browsers, your own software, the network.
              Only the backend and the secrets it holds are trusted.
            </p>
          </div>

          {/* A ruled list, not a grid of icon cards. Each row is a claim and
              the mechanism that backs it. */}
          <dl className="divide-y divide-border border-y border-border">
            {CLAIMS.map((entry) => (
              <div key={entry.claim} className="grid gap-2 py-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-8">
                <dt className="text-[15px] font-medium tracking-[var(--tracking-heading)]">
                  {entry.claim}
                </dt>
                <dd className="max-w-[52ch] text-[14px] leading-relaxed text-fg-tertiary">
                  {entry.mechanism}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
