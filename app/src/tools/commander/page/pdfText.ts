import { strings } from '../../../lib/shared/strings';

interface Translated {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  querySelectorAll(selector: string): Iterable<Translated>;
}

const idAttribute = 'data-l10n-id';
const argsAttribute = 'data-l10n-args';

function argsOf(element: Translated): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(
      element.getAttribute(argsAttribute) ?? '{}',
    );
    return typeof parsed === 'object' && parsed !== null
      ? Object.fromEntries(Object.entries(parsed))
      : {};
  } catch {
    return {};
  }
}

function translateOne(element: Translated): void {
  if (element.getAttribute(idAttribute) === 'pdfjs-page-landmark') {
    const { page } = argsOf(element);
    element.setAttribute(
      'aria-label',
      strings.pdf.page(typeof page === 'number' ? page : Number(page)),
    );
  }
}

function message(id: string, args: Record<string, unknown> | null): string {
  if (id === 'pdfjs-annotation-date-time-string') {
    const when = args?.dateObj;
    return typeof when === 'number' || when instanceof Date
      ? new Date(when).toLocaleString()
      : '';
  }
  return '';
}

function translateAll(element: Translated): void {
  translateOne(element);
  for (const each of element.querySelectorAll(`[${idAttribute}]`)) {
    translateOne(each);
  }
}

export function pdfText() {
  const watching = new Set<MutationObserver>();
  const text = {
    getLanguage: () => 'en-us',
    getDirection: () => 'ltr',
    get: (
      ids: string | readonly string[],
      args: Record<string, unknown> | null = null,
    ): Promise<string | string[]> =>
      Promise.resolve(
        typeof ids === 'string'
          ? message(ids, args)
          : ids.map((id) => message(id, null)),
      ),
    translate: (element: Translated): Promise<void> => {
      translateAll(element);
      if (typeof MutationObserver !== 'undefined' && element instanceof Node) {
        const observer = new MutationObserver((changes) => {
          for (const change of changes) {
            for (const added of change.addedNodes) {
              if (added instanceof Element) {
                translateAll(added);
              }
            }
            if (
              change.type === 'attributes' &&
              change.target instanceof Element
            ) {
              translateOne(change.target);
            }
          }
        });
        observer.observe(element, {
          subtree: true,
          childList: true,
          attributeFilter: [idAttribute, argsAttribute],
        });
        watching.add(observer);
      }
      return Promise.resolve();
    },
    translateOnce: (element: Translated): Promise<void> => {
      translateAll(element);
      return Promise.resolve();
    },
    destroy: (): Promise<void> => {
      for (const observer of watching) {
        observer.disconnect();
      }
      watching.clear();
      return Promise.resolve();
    },
    pause: (): void => undefined,
    resume: (): void => undefined,
  };
  return text;
}
