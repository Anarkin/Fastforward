export const viewerIconRoute = '/viewer-icon';

export function viewerIconUrl(tab: string, file: string): string {
  return `${viewerIconRoute}?${new URLSearchParams({ tab, file })}`;
}

export function viewerOfIcon(
  url: URL,
): { readonly tab: string; readonly file: string } | undefined {
  const tab = url.searchParams.get('tab');
  const file = url.searchParams.get('file');
  return url.pathname === viewerIconRoute && tab && file
    ? { tab, file }
    : undefined;
}
