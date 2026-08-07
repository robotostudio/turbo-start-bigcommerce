"use client";

import { cn } from "@workspace/ui/lib/utils";
import {
  type ReadonlyURLSearchParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useCallback } from "react";

import { useListingControls } from "@/components/collection/listing-controls";
import { PRICE_BUCKETS } from "@/components/collection/filter-utils";
import { getColorHex } from "@/lib/shopify/color";
import type { ShopifyFilter } from "@/lib/shopify/types";

type FilterPanelProps = {
  filters: ShopifyFilter[];
};

/**
 * Resolve a Shopify filter value's `input` JSON into a URL param key + value.
 * `label` is the human-readable value label, used for id-based facets (Category)
 * whose input carries an opaque id that would make an ugly chip.
 */
function resolveValue(
  inputRaw: string,
  label: string
): { key: string; value: string; multi: boolean } | null {
  try {
    const input = JSON.parse(inputRaw) as Record<string, unknown>;
    if ("available" in input) {
      return {
        key: "filter.available",
        value: String(input.available),
        multi: false,
      };
    }
    if (typeof input.productType === "string") {
      return { key: "filter.type", value: input.productType, multi: true };
    }
    if (typeof input.productVendor === "string") {
      return { key: "filter.vendor", value: input.productVendor, multi: true };
    }
    if (typeof input.tag === "string") {
      return { key: "filter.tag", value: input.tag, multi: true };
    }
    const variantOption = input.variantOption as
      | { name?: string; value?: string }
      | undefined;
    if (variantOption?.name && variantOption.value) {
      return {
        key: `filter.option.${variantOption.name}`,
        value: variantOption.value,
        multi: true,
      };
    }
    // Standard taxonomy category: Shopify needs the id, so store "<id>|<label>"
    // — the id round-trips to the query, the label renders in the chip.
    const category = input.category as { id?: string } | undefined;
    if (category?.id) {
      return {
        key: "filter.category",
        value: `${category.id}|${label}`,
        multi: true,
      };
    }
  } catch {
    // Unknown/malformed input (e.g. metafield facets) — not supported yet.
  }
  return null;
}

const columnHeaderClass =
  "font-medium text-sm text-zinc-600 tracking-[0.24px] dark:text-zinc-400";

const optionBaseClass =
  "w-fit text-left text-sm leading-[18px] tracking-[0.24px] transition-colors";

/** Preferred column order; unlisted facets trail after. */
const FILTER_ORDER = ["category", "color", "size", "price", "material", "fit"];

function filterRank(label: string): number {
  const i = FILTER_ORDER.indexOf(label.toLowerCase());
  return i === -1 ? FILTER_ORDER.length : i;
}

export function FilterPanel({ filters }: FilterPanelProps) {
  const { filterOpen } = useListingControls();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const toggleMulti = useCallback(
    (key: string, value: string, add: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("after");
      if (add) {
        params.append(key, value);
      } else {
        const all = params.getAll(key).filter((v) => v !== value);
        params.delete(key);
        for (const v of all) params.append(key, v);
      }
      const qs = params.toString();
      router.push(qs ? `?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const setSingle = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("after");
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const qs = params.toString();
      router.push(qs ? `?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  if (filters.length === 0) return null;

  const orderedFilters = [...filters].sort(
    (a, b) => filterRank(a.label) - filterRank(b.label)
  );

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-300 ease-out",
        filterOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}
    >
      <div
        className={cn(
          "overflow-hidden transition-opacity duration-300 ease-out",
          filterOpen ? "opacity-100" : "opacity-0"
        )}
        inert={!filterOpen}
      >
        <div
          className="flex flex-wrap items-start justify-end gap-x-14 gap-y-8 pt-2"
          data-testid="filter-panel"
        >
          {orderedFilters.map((filter) => {
            if (filter.type === "PRICE_RANGE") {
              return (
                <PriceColumn
                  key={filter.id}
                  onSelect={setSingle}
                  searchParams={searchParams}
                />
              );
            }

            const isColor = /colou?r/i.test(filter.label);

            const rows = filter.values
              .map((fv) => ({ fv, resolved: resolveValue(fv.input, fv.label) }))
              .filter(
                (
                  r
                ): r is {
                  fv: ShopifyFilter["values"][number];
                  resolved: NonNullable<ReturnType<typeof resolveValue>>;
                } => r.resolved !== null
              );

            if (rows.length === 0) return null;

            return (
              <div className="flex flex-col gap-2" key={filter.id}>
                <span className={columnHeaderClass}>{filter.label}</span>
                <div className="flex flex-col gap-1">
                  {rows.map(({ fv, resolved }) => {
                    const selected = resolved.multi
                      ? searchParams
                          .getAll(resolved.key)
                          .includes(resolved.value)
                      : searchParams.get(resolved.key) === resolved.value;

                    const onClick = () => {
                      if (resolved.multi) {
                        toggleMulti(resolved.key, resolved.value, !selected);
                      } else {
                        setSingle(
                          resolved.key,
                          selected ? null : resolved.value
                        );
                      }
                    };

                    return (
                      <button
                        className={cn(
                          optionBaseClass,
                          "flex items-center gap-1",
                          selected
                            ? "border-zinc-400 border-b-[0.75px] text-zinc-950 dark:border-zinc-500 dark:text-zinc-50"
                            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                        )}
                        key={fv.id}
                        onClick={onClick}
                        type="button"
                      >
                        {isColor && <ColorSwatch name={fv.label} />}
                        {fv.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ColorSwatch({ name }: { name: string }) {
  const hex = getColorHex(name);
  return (
    <span
      aria-hidden="true"
      className={cn("h-2 w-4 shrink-0", !hex && "border border-zinc-300")}
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}

function PriceColumn({
  searchParams,
  onSelect,
}: {
  searchParams: ReadonlyURLSearchParams;
  onSelect: (key: string, value: string | null) => void;
}) {
  const current = searchParams.get("filter.price");
  return (
    <div className="flex flex-col gap-2">
      <span className={columnHeaderClass}>Price</span>
      <div className="flex flex-col gap-1">
        {PRICE_BUCKETS.map((bucket) => {
          const selected = current === bucket.value;
          return (
            <button
              className={cn(
                optionBaseClass,
                selected
                  ? "border-zinc-400 border-b-[0.75px] text-zinc-950 dark:border-zinc-500 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
              key={bucket.value}
              onClick={() =>
                onSelect("filter.price", selected ? null : bucket.value)
              }
              type="button"
            >
              {bucket.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
