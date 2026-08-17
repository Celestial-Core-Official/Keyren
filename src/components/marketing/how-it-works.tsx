/**
 * Three named stages, each carrying a real fragment.
 *
 * Deliberately not numbered circles and not icon-top cards: both are structure
 * standing in for content, and both are on every list of generated-page tells.
 * Hairline dividers, no card chrome — the stages are separated by rules the way
 * a spec sheet separates columns.
 */
const STAGES = [
  {
    name: "Create an application",
    body: "You get a permanent identifier your software embeds. It never changes, and it is not a secret.",
    fragment: "app_7Qk2mV9xB4",
  },
  {
    name: "Issue keys",
    body: "Generate one or a hundred. The plaintext is shown once, at creation, and is unrecoverable afterwards.",
    fragment: "KEYREN-7F2A4C81-…-C1E9",
  },
  {
    name: "Verify on start",
    body: "One POST when your software launches. Keyren answers with the licence's real state, or the reason it refused.",
    fragment: '{ "success": true }',
  },
] as const;

export function HowItWorks() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <h2 className="max-w-[24ch] text-[clamp(1.75rem,3vw,2.25rem)] font-medium leading-tight tracking-[var(--tracking-heading)]">
          Three steps, and none of them is a server you maintain.
        </h2>

        <div className="mt-12 grid gap-px sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
          {STAGES.map((stage, index) => (
            <div key={stage.name} className="sm:px-6 sm:first:pl-0 sm:last:pr-0">
              <p className="font-mono text-[12px] text-fg-quaternary tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-3 text-[15px] font-medium tracking-[var(--tracking-heading)]">
                {stage.name}
              </h3>
              <p className="mt-2 max-w-[38ch] text-[14px] leading-relaxed text-fg-tertiary">
                {stage.body}
              </p>
              <p className="mt-4 truncate font-mono text-[12px] text-fg-quaternary">
                {stage.fragment}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
