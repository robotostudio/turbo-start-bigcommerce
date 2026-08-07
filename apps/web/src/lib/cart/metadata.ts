import type {
  MoneyV2,
  SelectedOption,
  ShopifyImage,
} from "@/lib/shopify/types";
import type { LineMetadata } from "./types";

const DEFAULT_VARIANT_TITLE = "Default Title";

export function variantTitleFromOptions(options: SelectedOption[]): string {
  return (
    options.map((option) => option.value).join(" / ") || DEFAULT_VARIANT_TITLE
  );
}

export function buildLineMetadata(args: {
  productTitle: string;
  productHandle: string;
  price: MoneyV2;
  selectedOptions: SelectedOption[];
  variantTitle?: string;
  image?: ShopifyImage | null;
}): LineMetadata {
  return {
    productTitle: args.productTitle,
    productHandle: args.productHandle,
    variantTitle:
      args.variantTitle ?? variantTitleFromOptions(args.selectedOptions),
    price: args.price,
    image: args.image ?? null,
    selectedOptions: args.selectedOptions,
  };
}
