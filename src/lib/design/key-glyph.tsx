/**
 * A deterministic mark for a licence, in the spirit of SSH randomart.
 *
 * The seed is a string the developer can already see: a masked key
 * (`KEYREN-7F2A…C1E9`) or a public application ID. Plaintext keys and the
 * stored HMAC never enter this function, so the glyph carries no information
 * that was not already rendered on the screen beside it. That is the whole
 * security argument, and it is why the seed parameter must never be widened.
 *
 * It is pure and synchronous, which is the point: it renders inside a server
 * component with no hydration boundary and no client JavaScript, and the same
 * licence draws the same mark on every render.
 *
 * The mark is functional as well as decorative — two keys in a table are
 * distinguishable at a glance, which a column of `KEYREN-••••` is not.
 */

export const GLYPH_COLS = 9;
export const GLYPH_ROWS = 5;

const CELLS = GLYPH_COLS * GLYPH_ROWS;

/**
 * FNV-1a, 32 bit, with an avalanche finalizer. Chosen for being short, stable
 * across runtimes and dependency-free — explicitly NOT for any cryptographic
 * property, which this deliberately does not need and must not be assumed to
 * have.
 *
 * The finalizer is not optional. Callers take this value modulo a small power
 * of two, and FNV's last step is a multiply, which leaves the low bits barely
 * mixed: `(x * p) mod 8` depends only on `x mod 8`, so the final character of
 * the seed reaches the output through its low three bits alone. "…C1E9" and
 * "…C1EA" differ only above that, which made two adjacent hex keys draw
 * byte-identical glyphs — the exact comparison the mark exists to support.
 */
function fnv1a(input: string, salt: number): number {
  let hash = (0x811c9dc5 ^ salt) >>> 0;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2545f491) >>> 0;
  hash ^= hash >>> 13;

  return hash >>> 0;
}

export function keyGlyphBits(seed: string): number[] {
  // A degenerate seed still has to draw something. Salting the hash per cell
  // gives every cell an independent draw even when the seed itself carries
  // almost no entropy, so a one-character ID produces a mark rather than a
  // near-empty grid.
  const normalized = seed.length > 0 ? seed : "keyren";
  const bits: number[] = [];

  for (let cell = 0; cell < CELLS; cell += 1) {
    const hash = fnv1a(normalized, cell * 0x9e3779b1);
    // Biased toward ink: blank is 3 draws in 8. Below about a fifth filled the
    // grid reads as scattered dust rather than as a mark.
    const draw = hash % 8;
    bits.push(draw < 3 ? 0 : draw < 6 ? 1 : draw === 6 ? 2 : 3);
  }

  return bits;
}

const INTENSITY_OPACITY = [0, 0.18, 0.45, 0.9] as const;

export function KeyGlyph({
  seed,
  size = 20,
  className,
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  const bits = keyGlyphBits(seed);
  const cell = size / GLYPH_COLS;
  const height = cell * GLYPH_ROWS;
  const inset = cell * 0.18;

  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${size} ${height}`}
      className={className}
      // Decorative: every row carrying a glyph also carries the masked key as
      // text, so this is never the only signal.
      aria-hidden="true"
      focusable="false"
    >
      {bits.map((intensity, index) => {
        if (intensity === 0) return null;

        const column = index % GLYPH_COLS;
        const row = Math.floor(index / GLYPH_COLS);

        return (
          <rect
            key={index}
            x={column * cell}
            y={row * cell}
            width={Math.max(cell - inset, 0.5)}
            height={Math.max(cell - inset, 0.5)}
            rx={cell * 0.12}
            // Two colours and no gradient: the accent carries the mark, and the
            // single brightest intensity is the warm counter-signal, so the
            // glyph belongs to the same palette as the status dots beside it.
            fill={intensity === 3 ? "var(--warning)" : "var(--primary)"}
            opacity={INTENSITY_OPACITY[intensity]}
          />
        );
      })}
    </svg>
  );
}
