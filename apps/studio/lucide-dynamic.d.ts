/**
 * `components/icon-preview.tsx` and `schemaTypes/common.ts` import
 * `lucide-react/dynamic.mjs` rather than `lucide-react/dynamic`.
 *
 * lucide-react ships no `exports` map (rechecked on 1.34.0), so the bare
 * specifier resolves only under CJS extension search:
 *
 *   require.resolve("lucide-react/dynamic") → resolves (1.34.0)
 *   import("lucide-react/dynamic")          → ERR_MODULE_NOT_FOUND
 *
 * TypeScript maps a .mjs specifier to .d.mts and lucide only ships dynamic.d.ts,
 * so the explicit specifier loses its types without this re-export.
 *
 * Remove both once lucide-react publishes an `exports` map.
 */
declare module "lucide-react/dynamic.mjs" {
  export * from "lucide-react/dynamic";
}
