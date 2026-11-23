/** PDP link carrying an option selection in the query string. */
export function buildVariantUrl(
  handle: string,
  selectedOptions: Record<string, string>
): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(selectedOptions)) {
    if (value) {
      params.set(name, value);
    }
  }
  const qs = params.toString();
  return `/products/${handle}${qs ? `?${qs}` : ""}`;
}
