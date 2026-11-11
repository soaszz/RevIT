// Source data keeps original URLs and hashes. Only the display URL changes.
export function reviewerAssetUrl(source: string): string {
  const match = /^\/reviewer-assets\/(boc-7e|elsevier-1e)\/([A-Za-z0-9][A-Za-z0-9._-]*\.png)$/.exec(source);
  return match ? `/api/reviewer/assets/${match[1] === "boc-7e" ? "boc" : "elsevier"}/${match[2]}` : source;
}
