export const viewedFileRoute = '/commander-file';

export function viewedFileUrl(
  tab: string,
  file: string,
  version?: number,
): string {
  const query = new URLSearchParams({ tab, file });
  if (version !== undefined) {
    query.set('version', String(version));
  }
  return `${viewedFileRoute}?${query}`;
}

export function viewedFileOf(
  url: URL,
): { readonly tab: string; readonly file: string } | undefined {
  const tab = url.searchParams.get('tab');
  const file = url.searchParams.get('file');
  return url.pathname === viewedFileRoute && tab && file
    ? { tab, file }
    : undefined;
}
