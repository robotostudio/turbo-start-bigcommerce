import { defineField } from "sanity";

export const spot = defineField({
  name: "spot",
  title: "Spot",
  type: "object",
  description:
    "A single product hotspot positioned at specific coordinates on an image",
  fieldsets: [{ name: "position", options: { columns: 2 } }],
  fields: [
    defineField({
      name: "productWithVariant",
      type: "productWithVariantReference",
      description: "The product and variant shown when this hotspot is clicked",
    }),
    defineField({
      name: "x",
      type: "number",
      description: "Horizontal position of the hotspot on the image (0-100%)",
      readOnly: true,
      fieldset: "position",
      initialValue: 50,
      validation: (Rule) => Rule.required().min(0).max(100),
    }),
    defineField({
      name: "y",
      type: "number",
      description: "Vertical position of the hotspot on the image (0-100%)",
      readOnly: true,
      fieldset: "position",
      initialValue: 50,
      validation: (Rule) => Rule.required().min(0).max(100),
    }),
  ],
  preview: {
    select: {
      isDeleted: "productWithVariant.product.store.isDeleted",
      previewImageUrl: "productWithVariant.product.store.previewImageUrl",
      productTitle: "productWithVariant.product.store.title",
      // `imageUrl`, not `previewImageUrl`: that is the field name the sync
      // writes on a variant document.
      variantImageUrl: "productWithVariant.variant.store.imageUrl",
      x: "x",
      y: "y",
    },
    prepare(selection) {
      const {
        isDeleted,
        previewImageUrl,
        productTitle,
        variantImageUrl,
        x,
        y,
      } = selection;
      const url = variantImageUrl || previewImageUrl;
      return {
        media: url ? (
          <img
            alt=""
            src={url}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : undefined,
        title: productTitle,
        subtitle: isDeleted
          ? "Deleted in BigCommerce"
          : x && y
            ? `[${x}%, ${y}%]`
            : "No position set",
      };
    },
  },
});
