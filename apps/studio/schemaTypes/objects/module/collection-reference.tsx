import { PackageIcon } from "@sanity/icons";
import { defineField } from "sanity";

export const collectionReference = defineField({
  name: "collectionReference",
  title: "Collection",
  type: "object",
  icon: PackageIcon,
  description:
    "A reference to a BigCommerce category with optional background image display",
  fields: [
    defineField({
      name: "collection",
      type: "reference",
      description: "The BigCommerce category to display",
      weak: true,
      to: [{ type: "bigcommerceCategory" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "showBackground",
      type: "boolean",
      description: "Use the category image as background (if available)",
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      collectionTitle: "collection.store.title",
      imageUrl: "collection.store.imageUrl",
      isDeleted: "collection.store.isDeleted",
    },
    prepare({ collectionTitle, imageUrl, isDeleted }) {
      return {
        media: imageUrl ? (
          <img
            alt=""
            src={imageUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          PackageIcon
        ),
        subtitle: isDeleted ? "Deleted in BigCommerce" : "Collection",
        title: collectionTitle,
      };
    },
  },
});
