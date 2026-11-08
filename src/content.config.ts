// This site does not use Astro content collections. Project JSON is loaded and
// validated at build time in `src/lib/content.ts`, which keeps the same Zod
// contract available to the `/admin` forms. Declaring an empty registry stops
// Astro from auto-generating a legacy collection for `src/content/projects/`.
export const collections = {};
