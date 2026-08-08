/**
 * Slug validation for the Studio's URL Path field.
 *
 * One consumer: `schemaTypes/common.ts` builds every document's slug field from
 * `createSlugValidator(getDocumentTypeConfig(documentType))`, and
 * `PathnameFieldComponent` renders it. `DOCUMENT_TYPE_CONFIGS` below is the only
 * place a per-document-type URL rule is written down.
 */

export type SlugValidationResult = {
  errors: string[];
  warnings: string[];
};

export type SlugValidationOptions = {
  documentType?: string;
  requireSlash?: boolean;
  requiredPrefix?: string;
  sanityDocumentType?: string;
  segmentCount?: number;
  allowedPatterns?: RegExp[];
  forbiddenPatterns?: RegExp[];
  customValidators?: Array<(slug: string) => string[]>;
};

const SLUG_ERROR_MESSAGES = {
  REQUIRED: "Slug is required.",
  INVALID_CHARACTERS:
    "Only lowercase letters, numbers, and hyphens are allowed.",
  INVALID_START_END: "Slug can't start or end with a hyphen.",
  CONSECUTIVE_HYPHENS: "Use only one hyphen between words.",
  NO_SPACES: "No spaces. Use hyphens instead.",
  NO_UNDERSCORES: "Underscores aren't allowed. Use hyphens instead.",
  MULTIPLE_SLASHES: "Multiple consecutive slashes (//) are not allowed.",
  MISSING_LEADING_SLASH: "URL path must start with a forward slash (/)",
  TRAILING_SLASH: "URL path must not end with a forward slash (/)",
} as const;

const MIN_SLUG_LENGTH = 3;
const MAX_SLUG_LENGTH = 60;
const MIN_BLOG_SLUG_LENGTH = 3;
const VALID_SLUG_REGEX = /^[a-z0-9-]+$/;
const FORBIDDEN_BLOG_PATTERN = /^\/blog\/.+/;
const FORBIDDEN_ADMIN_PATTERN = /^\/admin/;
const FORBIDDEN_API_PATTERN = /^\/api/;

const SLUG_WARNING_MESSAGES = {
  TOO_SHORT: `Slug must be at least ${MIN_SLUG_LENGTH} characters long.`,
  TOO_LONG: `Slug can't be longer than ${MAX_SLUG_LENGTH} characters.`,
} as const;

/**
 * Per-type URL rules.
 *
 * `forbiddenPatterns` and `customValidators` overlap on purpose: the pattern
 * list rejects with one generic message, and the custom validator next to it
 * says *why* in the editor's own terms ("Pages cannot use \"/blog\" prefix -
 * reserved for blog content"). Collapsing the two into one mechanism costs the
 * specific message, which is the part an editor actually acts on.
 */
const DOCUMENT_TYPE_CONFIGS: Record<string, SlugValidationOptions> = {
  author: {
    documentType: "Author",
    requiredPrefix: "/author/",
    requireSlash: true,
    segmentCount: 2,
    sanityDocumentType: "author",
    forbiddenPatterns: [/^\/blog/],
    customValidators: [
      (slug: string) => {
        if (slug.includes("/admin")) {
          return ["Author URLs cannot contain '/admin' path"];
        }
        return [];
      },
    ],
  },
  blog: {
    documentType: "Blog post",
    requiredPrefix: "/blog/",
    requireSlash: true,
    segmentCount: 2,
    sanityDocumentType: "blog",
    forbiddenPatterns: [/^\/author/, /^\/admin/],
    customValidators: [
      (slug: string) => {
        const segments = slug.split("/").filter(Boolean);
        if (
          segments.length === 2 &&
          segments[1].length < MIN_BLOG_SLUG_LENGTH
        ) {
          return ["Blog post slug must be at least 3 characters"];
        }
        return [];
      },
    ],
  },
  blogIndex: {
    documentType: "Blog index",
    requiredPrefix: "/blog",
    requireSlash: true,
    segmentCount: 1,
    sanityDocumentType: "blogIndex",
    forbiddenPatterns: [FORBIDDEN_BLOG_PATTERN],
    customValidators: [
      (slug: string) => {
        if (slug !== "/blog") {
          return ["Blog index must be exactly '/blog'"];
        }
        return [];
      },
    ],
  },
  collectionsIndex: {
    documentType: "Collections index",
    requiredPrefix: "/collections",
    requireSlash: true,
    segmentCount: 1,
    sanityDocumentType: "collectionsIndex",
    customValidators: [
      (slug: string) => {
        if (slug !== "/collections") {
          return ["Collections index must be exactly '/collections'"];
        }
        return [];
      },
    ],
  },
  homePage: {
    documentType: "Home page",
    sanityDocumentType: "homePage",
    requiredPrefix: "/",
    requireSlash: true,
    segmentCount: 0,
    customValidators: [
      (slug: string) => {
        if (slug !== "/") {
          return ["Home page must be exactly '/'"];
        }
        return [];
      },
    ],
  },
  page: {
    documentType: "Page",
    requireSlash: true,
    sanityDocumentType: "page",
    forbiddenPatterns: [
      /^\/blog/,
      /^\/author/,
      FORBIDDEN_ADMIN_PATTERN,
      FORBIDDEN_API_PATTERN,
    ],
    customValidators: [
      (slug: string) => {
        const errors: string[] = [];
        if (slug.startsWith("/blog")) {
          errors.push(
            'Pages cannot use "/blog" prefix - reserved for blog content'
          );
        }
        if (slug.startsWith("/author")) {
          errors.push(
            'Pages cannot use "/author" prefix - reserved for authors'
          );
        }
        if (slug.startsWith("/admin")) {
          errors.push('Pages cannot use "/admin" prefix - reserved for admin');
        }
        if (slug.startsWith("/api")) {
          errors.push(
            'Pages cannot use "/api" prefix - reserved for API routes'
          );
        }
        return errors;
      },
    ],
  },
};

/** Rules for one document type, or a safe default for a type with none. */
export function getDocumentTypeConfig(
  sanityDocumentType: string
): SlugValidationOptions {
  const config = DOCUMENT_TYPE_CONFIGS[sanityDocumentType];

  if (config) {
    return { ...config };
  }

  return {
    documentType: "Document",
    requireSlash: true,
    sanityDocumentType,
    forbiddenPatterns: [FORBIDDEN_ADMIN_PATTERN, FORBIDDEN_API_PATTERN],
    customValidators: [],
  };
}

/** Character and shape rules for a single path segment. */
function validateSlugSegment(slug: string): SlugValidationResult {
  if (!slug.trim()) {
    return { errors: [SLUG_ERROR_MESSAGES.REQUIRED], warnings: [] };
  }

  const errors: string[] = [];

  if (!VALID_SLUG_REGEX.test(slug)) {
    errors.push(SLUG_ERROR_MESSAGES.INVALID_CHARACTERS);
  }
  if (slug.includes(" ")) {
    errors.push(SLUG_ERROR_MESSAGES.NO_SPACES);
  }
  if (slug.includes("_")) {
    errors.push(SLUG_ERROR_MESSAGES.NO_UNDERSCORES);
  }
  if (slug.startsWith("-") || slug.endsWith("-")) {
    errors.push(SLUG_ERROR_MESSAGES.INVALID_START_END);
  }
  if (slug.includes("--")) {
    errors.push(SLUG_ERROR_MESSAGES.CONSECUTIVE_HYPHENS);
  }

  const warnings: string[] = [];

  if (slug.length < MIN_SLUG_LENGTH) {
    warnings.push(SLUG_WARNING_MESSAGES.TOO_SHORT);
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    warnings.push(SLUG_WARNING_MESSAGES.TOO_LONG);
  }

  return { errors, warnings };
}

/** Slashes, segment count and required prefix — the whole-path rules. */
function validatePathStructure(
  slug: string,
  options: SlugValidationOptions
): string[] {
  const errors: string[] = [];
  const segments = slug.split("/").filter(Boolean);

  if (
    options.segmentCount !== undefined &&
    segments.length !== options.segmentCount
  ) {
    errors.push(
      `${options.documentType} URLs must have ${options.segmentCount} segments`
    );
  }
  if (options.requireSlash && !slug.startsWith("/")) {
    errors.push(SLUG_ERROR_MESSAGES.MISSING_LEADING_SLASH);
  }
  // The home page is the one slug that is legitimately a bare "/".
  if (options.sanityDocumentType !== "homePage" && slug.endsWith("/")) {
    errors.push(SLUG_ERROR_MESSAGES.TRAILING_SLASH);
  }
  if (slug.includes("//")) {
    errors.push(SLUG_ERROR_MESSAGES.MULTIPLE_SLASHES);
  }
  if (
    options.requiredPrefix &&
    options.documentType &&
    !slug.startsWith(options.requiredPrefix)
  ) {
    errors.push(
      `${options.documentType} URLs must start with "${options.requiredPrefix}"`
    );
  }

  return errors;
}

/** The config-driven rules: forbidden patterns, then the per-type validators. */
function validateAgainstConfig(
  slug: string,
  options: SlugValidationOptions
): string[] {
  const errors: string[] = [];

  for (const pattern of options.forbiddenPatterns ?? []) {
    if (pattern.test(slug)) {
      errors.push(
        `URL pattern not allowed for ${options.documentType || "this document type"}`
      );
    }
  }
  for (const validator of options.customValidators ?? []) {
    errors.push(...validator(slug));
  }

  return errors;
}

/** Validates a slug against its document type's rules. */
export function validateSlug(
  slug: string | undefined | null,
  options: SlugValidationOptions = {}
): SlugValidationResult {
  if (!slug) {
    return { errors: [SLUG_ERROR_MESSAGES.REQUIRED], warnings: [] };
  }

  const config = options.sanityDocumentType
    ? { ...getDocumentTypeConfig(options.sanityDocumentType), ...options }
    : { ...options };

  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  if (slug.includes("/")) {
    allErrors.push(...validatePathStructure(slug, config));
    allErrors.push(...validateAgainstConfig(slug, config));

    for (const segment of slug.split("/").filter(Boolean)) {
      const segmentValidation = validateSlugSegment(segment);
      allErrors.push(...segmentValidation.errors);
      allWarnings.push(...segmentValidation.warnings);
    }
  } else {
    const segmentValidation = validateSlugSegment(slug);
    allErrors.push(...segmentValidation.errors);
    allWarnings.push(...segmentValidation.warnings);
    allErrors.push(...validateAgainstConfig(slug, config));
  }

  return {
    errors: [...new Set(allErrors)],
    warnings: [...new Set(allWarnings)],
  };
}

/** A `Rule.custom` validator for a document type's slug field. */
export function createSlugValidator(
  options: SlugValidationOptions
): (slug: { current?: string } | undefined) => string | true {
  return (slug) => {
    const validation = validateSlug(slug?.current, options);
    const allMessages = [...validation.errors, ...validation.warnings];
    return allMessages.length > 0 ? allMessages.join("; ") : true;
  };
}

/** Lowercase, hyphenated, nothing else. */
function cleanSlug(slug: string): string {
  if (!slug) {
    return "";
  }

  return slug
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Backs the field's "Generate" button. */
export function generateSlugFromTitle(
  title: string,
  documentType: string,
  currentSlug?: string
): string {
  if (!title?.trim()) {
    return "";
  }

  const config = getDocumentTypeConfig(documentType);
  const cleanTitle = cleanSlug(title);

  if (!cleanTitle) {
    return "";
  }

  switch (documentType) {
    case "homePage":
      return "/";

    case "blogIndex":
      return "/blog";

    case "collectionsIndex":
      return "/collections";

    case "author":
      return `/author/${cleanTitle}`;

    case "blog":
      return `/blog/${cleanTitle}`;

    case "page": {
      // A nested page keeps its parent path — retitling /docs/setup should give
      // /docs/new-title, not /new-title.
      const segments = currentSlug?.split("/").filter(Boolean) ?? [];
      if (segments.length > 1) {
        return `/${segments.slice(0, -1).join("/")}/${cleanTitle}`;
      }
      return `/${cleanTitle}`;
    }

    default:
      if (config.requiredPrefix) {
        return config.requiredPrefix.endsWith("/")
          ? `${config.requiredPrefix}${cleanTitle}`
          : `${config.requiredPrefix}/${cleanTitle}`;
      }
      return `/${cleanTitle}`;
  }
}
