import { UserIcon } from "@sanity/icons";
import { defineField } from "sanity";

export const instagram = defineField({
  name: "instagram",
  title: "Instagram",
  type: "object",
  icon: UserIcon,
  description: "An embedded Instagram post displayed in editorial content",
  fields: [
    defineField({
      name: "url",
      title: "URL",
      type: "string",
      description: "The full URL of the Instagram post to embed",
      validation: (Rule) =>
        Rule.custom((url) => {
          // Accepts posts, reels and IGTV, with or without the username
          // segment Instagram's share button includes:
          //   instagram.com/p/<id>
          //   instagram.com/<username>/p/<id>
          //   instagram.com/<username>/reel/<id>
          const pattern =
            /^https?:\/\/(?:www\.)?instagram\.com\/(?:[^/?#]+\/)?(?:p|reel|tv)\/([^/?#&]+)/;
          const isValid = url?.match(pattern);
          return isValid ? true : "Not a valid Instagram post, reel or TV URL";
        }),
    }),
  ],
  preview: {
    select: {
      url: "url",
    },
    prepare(selection) {
      const { url } = selection;
      return {
        subtitle: "Instagram",
        title: url,
        media: UserIcon,
      };
    },
  },
});
