import { TriangleAlert } from "lucide-react";
// Explicit .mjs: the bare specifier does not resolve under native ESM.
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
