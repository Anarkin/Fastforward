const scheme = /^[a-z][a-z\d+.-]*:/i;

const shareRoot = 4;

export interface DocumentLink {
  readonly path: string;
  readonly anchor: string;
}

function decoded(text: string): string | undefined {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
}

export function documentLink(
  document: string,
  href: string,
): DocumentLink | undefined {
  const slashed = href.replaceAll('\\', '/');
  if (scheme.test(slashed) || slashed.startsWith('/')) {
    return undefined;
  }
  const mark = slashed.indexOf('#');
  const target = decoded(mark < 0 ? slashed : slashed.slice(0, mark));
  const anchor = mark < 0 ? '' : decoded(slashed.slice(mark + 1));
  if (target === undefined || anchor === undefined) {
    return undefined;
  }
  if (target === '') {
    return { path: document, anchor };
  }
  const parts = document.replaceAll('\\', '/').split('/').slice(0, -1);
  const root = parts[0] === '' && parts[1] === '' ? shareRoot : 1;
  for (const part of target.split('/')) {
    if (part === '..') {
      if (parts.length <= root) {
        return undefined;
      }
      parts.pop();
    } else if (part !== '' && part !== '.') {
      parts.push(part);
    }
  }
  return { path: parts.join('/'), anchor };
}
