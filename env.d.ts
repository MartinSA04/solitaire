/// <reference types="astro/client" />

// Raw `tsc` does not parse `.astro` single-file components, so importing one
// from a `.ts` module is TS2307 without this. Real prop typing is enforced by
// the Astro compiler at build time (and `astro check`).
declare module "*.astro" {
  const Component: (props: Record<string, unknown>) => unknown;
  export default Component;
}
