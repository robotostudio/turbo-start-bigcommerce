/**
 * `components/icon-preview.tsx` imports `lucide-react/dynamic.mjs` rather than
 * `lucide-react/dynamic`.
 *
 * lucide-react 0.562.0 ships `dynamic.mjs` and `dynamic.d.ts` with no `exports`
 * map, so Node's CJS resolver only tries dynamic.js/.json/.node and finds none
 * of them. Verified directly:
 *
 *   require.resolve("lucide-react/dynamic")     → MODULE_NOT_FOUND
 *   require.resolve("lucide-react/dynamic.mjs") → resolves
 *
 * `sanity schema extract` loads the Studio config through that resolver and
 * fails on Node 24 with a misleading "Failed to load configuration file" error.
 * It happens to succeed on Node 26, but the bare specifier does not resolve
 * there either, so do not rely on that.
 *
 * TypeScript maps a .mjs specifier to .d.mts and lucide only ships dynamic.d.ts,
 * so the explicit specifier loses its types without this re-export.
 *
 * Remove both once lucide-react publishes an `exports` map.
 */
declare module "lucide-react/dynamic.mjs" {
  export * from "lucide-react/dynamic";
}
