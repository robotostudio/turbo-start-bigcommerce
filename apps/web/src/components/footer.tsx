import { sanityFetch } from "@workspace/sanity/live";
import {
  queryFooterData,
  queryGlobalSeoSettings,
} from "@workspace/sanity/query";
import type {
  QueryFooterDataResult,
  QueryGlobalSeoSettingsResult,
} from "@workspace/sanity/types";
import Link from "next/link";

import { NewsletterForm } from "./footer/newsletter-form";
// import { ModeToggle } from "./mode-toggle";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  RobotoWordmark,
  VercelIcon,
  XIcon,
  YoutubeIcon,
} from "./social-icons";

type SocialLinksProps = {
  data: NonNullable<QueryGlobalSeoSettingsResult>["socialLinks"];
};

type FooterProps = {
  data: NonNullable<QueryFooterDataResult>;
  settingsData: NonNullable<QueryGlobalSeoSettingsResult>;
};

export async function FooterServer() {
  // Awaited by the root layout without a Suspense boundary, so this resolves
  // before any HTML is flushed and the footer survives JavaScript being off.
  const [response, settingsResponse] = await Promise.all([
    sanityFetch({
      query: queryFooterData,
    }),
    sanityFetch({
      query: queryGlobalSeoSettings,
    }),
  ]);

  // `sanityFetch` degrades to null data when the Content Lake is unreachable.
  // Nothing is the honest answer here: this is no longer a loading state, and
  // a pulsing skeleton that will never resolve reads as a broken page.
  if (!(response?.data && settingsResponse?.data)) {
    return null;
  }
  return <Footer data={response.data} settingsData={settingsResponse.data} />;
}

function SocialLinks({ data }: SocialLinksProps) {
  if (!data) {
    return null;
  }

  const { facebook, twitter, instagram, youtube, linkedin } = data;

  const socialLinks = [
    { url: twitter, Icon: XIcon, label: "Follow us on Twitter" },
    { url: facebook, Icon: FacebookIcon, label: "Follow us on Facebook" },
    { url: linkedin, Icon: LinkedinIcon, label: "Follow us on LinkedIn" },
    { url: instagram, Icon: InstagramIcon, label: "Follow us on Instagram" },
    { url: youtube, Icon: YoutubeIcon, label: "Subscribe to our YouTube" },
  ].filter((link) => link.url);

  return (
    <ul className="flex items-center gap-3 text-muted-foreground">
      {socialLinks.map(({ url, Icon, label }, index) => (
        <li key={`social-link-${url}-${index.toString()}`}>
          <Link
            aria-label={label}
            href={url ?? "#"}
            prefetch={false}
            rel="noopener noreferrer"
            target="_blank"
          >
            <Icon className="size-[18px] fill-muted-foreground transition-colors hover:fill-foreground" />
            <span className="sr-only">{label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function FooterColumns({ columns }: Pick<FooterProps["data"], "columns">) {
  if (!(Array.isArray(columns) && columns.length > 0)) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-8 sm:flex sm:gap-14">
      {columns.map((column, index) => (
        <div key={`column-${column?._key}-${index}`}>
          <h3 className="mb-2 text-muted-foreground text-sm">
            {column?.title}
          </h3>
          {column?.links && column.links.length > 0 && (
            <ul className="space-y-1">
              {column.links.map((link, columnIndex) => (
                <li key={`${link?._key}-${columnIndex}-column-${column?._key}`}>
                  <Link
                    className="text-foreground text-sm hover:underline"
                    href={link.href ?? "#"}
                    rel={link.openInNewTab ? "noopener noreferrer" : undefined}
                    target={link.openInNewTab ? "_blank" : undefined}
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function HostingCredits() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-foreground text-sm">
      <a
        aria-label="Roboto Studio"
        href="https://robotostudio.com/"
        rel="noopener noreferrer"
        target="_blank"
        className="flex items-center gap-1 hover:opacity-80"
      >
        Built by
        <RobotoWordmark className="h-2.5 w-auto" />
      </a>
      <span className="h-4 w-px bg-border" />
      <a
        className="flex items-center gap-1 hover:opacity-80"
        href="https://vercel.com"
        rel="noopener noreferrer"
        target="_blank"
      >
        Hosted on
        <VercelIcon className="h-3.5 w-auto" />
      </a>
      <span className="h-4 w-px bg-border" />
      <a
        className="flex items-center gap-1 hover:opacity-80"
        href="https://www.bigcommerce.com"
        rel="noopener noreferrer"
        target="_blank"
      >
        {/* Text, not a logo: the icon set has no BigCommerce wordmark and
         * inventing artwork is worse than plain text. */}
        Powered by BigCommerce
      </a>
    </div>
  );
}

function Footer({ data, settingsData }: FooterProps) {
  const { columns } = data;
  const { siteTitle, socialLinks } = settingsData;
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 bg-background">
      <div className="site-container">
        <div className="flex flex-col justify-between gap-10 py-9 lg:flex-row">
          <div className="flex flex-col gap-6">
            <NewsletterForm />
            {socialLinks && <SocialLinks data={socialLinks} />}
          </div>
          <FooterColumns columns={columns} />
        </div>
        <div className="flex flex-col items-start justify-between gap-4 py-4 sm:flex-row sm:items-center">
          <p className="text-foreground text-sm">
            © {year} {siteTitle}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <HostingCredits />
            {/* <ModeToggle /> */}
          </div>
        </div>
      </div>
    </footer>
  );
}
