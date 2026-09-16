import { readFileSync } from "node:fs";

/**
 * Enough CSS and enough colour science to check a theme without a browser.
 *
 * The themes are the one part of the product whose correctness is a number —
 * docs/08-accessibility.md gives a contrast table and docs/04-art-direction.md
 * a token contract — and both are checkable from the source text. Nothing here
 * tries to be a CSS engine: it reads declaration blocks, resolves the colour
 * values a theme is allowed to use, and composites alpha onto a backdrop.
 */

export interface Block {
  /** The selector text, verbatim. */
  selector: string;
  /** The `@media (...)` this block sits inside, or `null` at the top level. */
  media: string | null;
  declarations: Map<string, string>;
}

const COMMENTS = /\/\*[\s\S]*?\*\//g;

export function read(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

/** Every declaration block in a stylesheet, including inside `@media`. */
export function blocksOf(css: string): Block[] {
  const blocks: Block[] = [];
  collect(css.replace(COMMENTS, ""), null, blocks);
  return blocks;
}

function collect(css: string, media: string | null, out: Block[]): void {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) return;
    const prelude = css.slice(i, open).trim();

    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);

    if (prelude.startsWith("@media")) collect(body, prelude, out);
    else if (!prelude.startsWith("@")) {
      out.push({
        selector: prelude,
        media,
        declarations: declarationsOf(body),
      });
    }
    i = j;
  }
}

/** `name: value` pairs, ignoring anything nested (there is none in a theme). */
function declarationsOf(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= body.length; i++) {
    const c = body[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if ((c === ";" && depth === 0) || i === body.length) {
      const text = body.slice(start, i).trim();
      start = i + 1;
      const colon = text.indexOf(":");
      if (colon === -1) continue;
      declarations.set(
        text.slice(0, colon).trim(),
        text.slice(colon + 1).trim(),
      );
    }
  }
  return declarations;
}

// ------------------------------------------------------------- colour

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX = /^#([0-9a-f]{3,8})$/i;
const FUNCTIONAL = /^rgba?\(([^)]*)\)$/i;

/** `#abc`, `#aabbcc`, `#aabbccdd`, `rgb(r g b / a%)`, `rgba(r, g, b, a)`. */
export function parseColor(text: string): Rgba | null {
  const value = text.trim();

  const hex = HEX.exec(value)?.[1];
  if (hex !== undefined) {
    const wide = hex.length > 4;
    const size = wide ? 2 : 1;
    const part = (index: number): number => {
      const digits = hex.slice(index * size, index * size + size);
      const n = parseInt(wide ? digits : digits + digits, 16);
      return Number.isNaN(n) ? 0 : n;
    };
    return {
      r: part(0),
      g: part(1),
      b: part(2),
      a: hex.length === 4 || hex.length === 8 ? part(3) / 255 : 1,
    };
  }

  const args = FUNCTIONAL.exec(value)?.[1];
  if (args === undefined) return null;
  const [channels, alpha] = args.split("/");
  const parts = (channels as string)
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 3) return null;
  const alphaText = alpha ?? parts[3];
  return {
    r: channel(parts[0] as string),
    g: channel(parts[1] as string),
    b: channel(parts[2] as string),
    a: alphaText === undefined ? 1 : number(alphaText),
  };
}

function channel(text: string): number {
  return text.endsWith("%") ? (number(text) / 100) * 255 : number(text);
}

function number(text: string): number {
  const n = Number.parseFloat(text);
  return text.trim().endsWith("%") ? n / 100 : n;
}

/**
 * Every colour in a value. A token may be a gradient — `--table-bg` usually is
 * — and a gradient's worst stop is the one a contrast check has to survive.
 */
export function colorsIn(value: string): Rgba[] {
  const found: Rgba[] = [];
  for (const match of value.matchAll(
    /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi,
  ) as Iterable<RegExpMatchArray>) {
    const color = parseColor(match[0]);
    if (color !== null) found.push(color);
  }
  return found;
}

/** Source-over: what a translucent colour actually looks like on a backdrop. */
export function over(fg: Rgba, bg: Rgba): Rgba {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

/** WCAG 2.x relative luminance. */
export function luminance({ r, g, b }: Rgba): number {
  const linear = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.x contrast ratio, 1 to 21. Both colours must already be opaque. */
export function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** Rounded the way a report would print it, so failures read in the message. */
export function ratio(a: Rgba, b: Rgba): number {
  return Math.round(contrast(a, b) * 100) / 100;
}
