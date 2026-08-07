import { TriangleAlert } from "lucide-react";
// Explicit .mjs specifier — the bare "lucide-react/dynamic" does not resolve
// under Node's CJS resolver, which breaks `sanity schema extract` on Node 24.
// See lucide-dynamic.d.ts for the detail and the removal condition.
import { DynamicIcon, type dynamicIconImports } from "lucide-react/dynamic.mjs";

export const lucideIconPreview = (icon: keyof typeof dynamicIconImports) => {
  return (
    <DynamicIcon
      name={icon}
      fallback={() => <TriangleAlert size={24} />}
      size={24}
    />
  );
};
