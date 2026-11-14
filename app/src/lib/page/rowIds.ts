const loneSurrogate =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function encodedKey(key: string): string {
  if (key.isWellFormed()) {
    return encodeURIComponent(key);
  }
  let encoded = '';
  let from = 0;
  for (const lone of key.matchAll(loneSurrogate)) {
    encoded += `${encodeURIComponent(key.slice(from, lone.index))}%u${lone[0].charCodeAt(0).toString(16)}`;
    from = lone.index + 1;
  }
  return `${encoded}${encodeURIComponent(key.slice(from))}`;
}

export const rowId = (list: string, key: React.Key) =>
  `${list}${encodedKey(String(key))}`;

export function activeDescendant(
  list: string,
  key: React.Key | undefined,
  drawn: readonly { readonly key: React.Key }[],
): string | undefined {
  return key !== undefined && drawn.some((row) => row.key === key)
    ? rowId(list, key)
    : undefined;
}
