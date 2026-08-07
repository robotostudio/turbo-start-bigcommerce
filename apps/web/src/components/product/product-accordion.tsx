"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion";

export type AccordionSection = {
  id: string;
  title: string;
  /** Sanitized HTML (isHtml) or plain text. */
  content: string;
  isHtml?: boolean;
};

type ProductAccordionProps = {
  sections: AccordionSection[];
  /** Which section starts expanded. */
  defaultOpenId?: string;
};

export function ProductAccordion({
  sections,
  defaultOpenId,
}: ProductAccordionProps) {
  if (sections.length === 0) return null;

  return (
    <Accordion
      className="w-full  border-border border-t"
      collapsible
      defaultValue={defaultOpenId}
      type="single"
    >
      {sections.map((section) => (
        <AccordionItem key={section.id} value={section.id}>
          <AccordionTrigger className="text-base" indicator="plus-minus">
            {section.title}
          </AccordionTrigger>
          <AccordionContent>
            {section.isHtml ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized upstream with sanitize-html
                dangerouslySetInnerHTML={{ __html: section.content }}
              />
            ) : (
              <p className="whitespace-pre-line text-muted-foreground leading-relaxed">
                {section.content}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
