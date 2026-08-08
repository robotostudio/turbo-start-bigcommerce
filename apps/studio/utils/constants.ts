import {
  ColorWheelIcon,
  ComposeIcon,
  InsertAboveIcon,
  SearchIcon,
} from "@sanity/icons";
import type { FieldGroupDefinition } from "sanity";

// --- Field Groups (unified across all schemas) ---

export const GROUP = {
  CONTENT: "content",
  SEO: "seo",
  OG: "og",
  THEME: "theme",
} as const;

export const GROUPS: FieldGroupDefinition[] = [
  { name: GROUP.CONTENT, icon: ComposeIcon, title: "Content", default: true },
  { name: GROUP.SEO, icon: SearchIcon, title: "SEO" },
  { name: GROUP.OG, icon: InsertAboveIcon, title: "Open Graph" },
  { name: GROUP.THEME, icon: ColorWheelIcon, title: "Theme" },
];

// --- Documents ---

export const LOCKED_DOCUMENT_TYPES = ["settings", "home", "media.tag"];

/** Reference targets for a "link to a page" field. */
export const PAGE_REFERENCES = [
  { type: "bigcommerceCategory" },
  { type: "homePage" },
  { type: "page" },
  { type: "bigcommerceProduct" },
];

// --- API ---

export const API_VERSION =
  process.env.SANITY_STUDIO_API_VERSION ?? "2025-05-08";
