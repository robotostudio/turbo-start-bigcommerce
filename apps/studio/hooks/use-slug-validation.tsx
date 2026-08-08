import { useMemo } from "react";
import type { SanityDocument } from "sanity";
import { getPublishedId, useFormValue, useValidationStatus } from "sanity";

import { getDocumentTypeConfig, validateSlug } from "@/utils/slug-validation";

/**
 * Everything wrong with a slug, for the URL Path field to render.
 *
 * Two sources merge here: this package's own rules, and whatever Sanity's
 * schema-level validation already said about the same field — otherwise the
 * editor sees a `Rule.custom` failure in the document footer and nothing next
 * to the input they have to fix.
 */
export function useSlugValidation(options: {
  slug: string | undefined | null;
  /** Defaults to the document's own `_type`. */
  documentType?: string;
}): { errors: string[]; warnings: string[] } {
  const { slug, documentType: providedDocumentType } = options;

  const document = useFormValue([]) as SanityDocument;
  const documentType = providedDocumentType || document?._type;

  const documentConfig = useMemo(
    () => (documentType ? getDocumentTypeConfig(documentType) : {}),
    [documentType]
  );

  const publishedId = useMemo(
    () => (document?._id ? getPublishedId(document._id) : ""),
    [document?._id]
  );

  const { validation: sanityValidation } = useValidationStatus(
    publishedId || "",
    document?._type,
    true
  );

  return useMemo(() => {
    const own = slug
      ? validateSlug(slug, documentConfig)
      : { errors: [], warnings: [] };

    const fromSanity = sanityValidation
      .filter(
        (item) =>
          (item?.path.includes("current") || item?.path.includes("slug")) &&
          item.message
      )
      .map((item) => item.message);

    const errors = new Set([...own.errors, ...fromSanity]);

    return {
      errors: [...errors],
      // A message that is already an error must not also render as a warning.
      warnings: [...new Set(own.warnings)].filter(
        (warning) => !errors.has(warning)
      ),
    };
  }, [slug, documentConfig, sanityValidation]);
}
