// Stand-in for the `server-only` package in the Vitest (plain Node)
// environment, which lacks the Next.js webpack aliasing that package
// relies on to no-op inside real Server Components. Real Next.js builds
// still use the genuine package (see package.json) and get the real
// client-bundle guard; this stub only applies under `vitest`.
export {};
