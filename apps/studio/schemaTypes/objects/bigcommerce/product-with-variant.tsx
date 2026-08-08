import { TagIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

/**
 * A reference to a synced BigCommerce product, with an optional pinned
 * variant. The variant list is filtered to the picked product's own variants,
 * which is what makes an invalid combination unpickable — no live fetch, no
 * cross-document validation rule.
 *
 * References are weak on purpose: `pnpm seed:sanity` wipes the dataset before
 * the reconcile sweep repopulates it, and a strong reference would block that
 * wipe. Deterministic ids (`bigcommerceProduct-{entityId}`) make the same
 * reference resolve again after every reseed.
 */
export const productWithVariantReference = defineType({
  name: "productWithVariantReference",
  title: "Product with variant",
  type: "object",
  icon: TagIcon,
  fields: [
    defineField({
      name: "product",
      title: "Product",
      type: "reference",
      to: [{ type: "bigcommerceProduct" }],
      weak: true,
      options: {
        disableNew: true,
        filter: "store.isDeleted != true",
      },
    }),
    defineField({
      name: "variant",
      title: "Variant",
      type: "reference",
      to: [{ type: "bigcommerceProductVariant" }],
      weak: true,
      description: "Optional — the product's first variant applies if empty.",
      hidden: ({ parent }) => !parent?.product,
      options: {
        disableNew: true,
        filter: ({ parent }) => {
          const reference = (parent as { product?: { _ref?: string } })?.product
            ?._ref;
          const entityId = Number(
            reference?.replace("bigcommerceProduct-", "")
          );
          if (!entityId) {
            return { filter: "false" };
          }
          return {
            filter:
              "store.productEntityId == $productEntityId && store.isDeleted != true",
            params: { productEntityId: entityId },
          };
        },
      },
    }),
  ],
  preview: {
    select: {
      title: "product.store.title",
      variantTitle: "variant.store.title",
      imageUrl: "product.store.previewImageUrl",
      isDeleted: "product.store.isDeleted",
    },
    prepare({ title, variantTitle, imageUrl, isDeleted }) {
      const name = title || "No product picked";
      return {
        title: variantTitle ? `${name} — ${variantTitle}` : name,
        subtitle: isDeleted ? "Deleted in BigCommerce" : undefined,
        media: imageUrl ? (
          <img
            alt=""
            src={imageUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          TagIcon
        ),
      };
    },
  },
});
