// target and rel travel together so no link opens a new tab without rel:
// noopener cuts window.opener, noreferrer drops our URL from the Referer.
export function newTab(openInNewTab: boolean | null | undefined) {
  return openInNewTab
    ? ({ target: "_blank", rel: "noopener noreferrer" } as const)
    : {};
}
