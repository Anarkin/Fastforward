export interface FileTab {
  readonly id: string;
  readonly root?: string;
}

export function fileTabIconUrl(
  route: string,
  tab: string,
  file: string,
): string {
  return `${route}?${new URLSearchParams({ tab, file })}`;
}

export async function fileTabIcon(
  route: string,
  url: URL,
  tabs: readonly FileTab[],
  fileIcon: (file: string) => Promise<Uint8Array>,
): Promise<Response> {
  const tab = url.searchParams.get('tab');
  const file = url.searchParams.get('file');
  const shown =
    url.pathname === route &&
    tabs.find((each) => each.id === tab && each.root === file);
  if (!shown || shown.root === undefined) {
    return new Response(null, { status: 404 });
  }
  try {
    const png = await fileIcon(shown.root);
    return new Response(Buffer.from(png), {
      headers: { 'content-type': 'image/png' },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
