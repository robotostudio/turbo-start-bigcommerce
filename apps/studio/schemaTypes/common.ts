import { iconNames } from "lucide-react/dynamic.mjs";
import {
  defineField,
  type ImageRule,
  type ImageValue,
  type StringRule,
  type ValidationBuilder,
} from "sanity";

import { PathnameFieldComponent } from "@/components/slug-field-component";
import { GROUP } from "@/utils/constants";
import {
  createSlugValidator,
  getDocumentTypeConfig,
} from "@/utils/slug-validation";

export const richTextField = defineField({
  name: "richText",
  type: "richText",
  description:
    "A text editor that lets you add formatting like bold text, links, and bullet points",
});

export const buttonsField = defineField({
  name: "buttons",
  type: "array",
  of: [{ type: "button" }],
  description:
    "Add one or more clickable buttons that visitors can use to navigate your website",
});

/**
 * The meta-description length warnings, shared by every document that has one.
 *
 * The floor is 50, not the 140 this started at. At 140 all seven seeded pages
 * and posts tripped the warning on a fresh install, so an editor's first
 * impression of the Studio was seven amber triangles on content they had not
 * written — which teaches them that warnings are decoration. There is no SEO
 * minimum at 140; the floor exists only to catch a description that is really
 * a stub.
 */
export const metaDescriptionRules: ValidationBuilder<StringRule, string> = (
  rule
) => [
  rule
    .min(50)
    .warning("Add a little more — under 50 characters reads as a stub"),
  rule
    .max(160)
    .warning(
      "Google truncates around 160 characters, so the end of this may not be shown"
    ),
];

export const pageBuilderField = defineField({
  name: "pageBuilder",
  group: GROUP.CONTENT,
  type: "pageBuilder",
  description:
    "Build your page by adding different sections like text, images, and other content blocks",
});

export const iconField = defineField({
  name: "icon",
  title: "Icon",
  options: {
    // The picker lists icons from its own lucide-react (1.0.3 pins ^0.532.0)
    // while both renderers resolve DynamicIcon from the catalog's 1.34.0. A
    // name only the picker knows saves fine, then silently renders the fallback
    // triangle -- the brand icons v1 dropped, plus the picker's kebab-case bug
    // on digit suffixes ("volume2" where lucide names it "volume-2").
    allowedIcons: iconNames,
  },
  type: "lucide-icon",
  description:
    "Choose a small picture symbol to represent this item, like a home icon or shopping cart",
});

export const documentSlugField = (
  documentType: string,
  options: {
    group?: string;
    description?: string;
    title?: string;
  } = {}
) => {
  const {
    group,
    description = `The web address where people can find your ${documentType} (automatically created from title)`,
    title = "URL",
  } = options;

  return defineField({
    name: "slug",
    type: "slug",
    title,
    description,
    group,
    components: {
      field: PathnameFieldComponent,
    },
    validation: (Rule) => [
      Rule.required().error("A URL slug is required"),
      Rule.custom(createSlugValidator(getDocumentTypeConfig(documentType))),
    ],
  });
};

export const imageWithAltField = ({
  name = "image",
  title = "Image",
  description = "An image, make sure to add an alt text and use the hotspot tool to ensure if image is cropped it highlights the focus point",
  validation,
  group,
}: {
  name?: string;
  title?: string;
  description?: string;
  group?: string;
  validation?: ValidationBuilder<ImageRule, ImageValue>;
} = {}) =>
  defineField({
    name,
    type: "image",
    title,
    description,
    group,
    validation,
    options: {
      hotspot: true,
    },
    fields: [
      defineField({
        name: "alt",
        type: "string",
        title: "Alt Text",
        description:
          "The text that describes the image for screen readers and search engines",
      }),
    ],
  });
