const pdfSheet = 'pdfViewer.css';

interface Sheet {
  readonly element: HTMLStyleElement;
  readonly loaded: Promise<void>;
  holders: number;
}

const sheets = new WeakMap<Document, Sheet>();

function added(document: Document): Sheet {
  const element = document.createElement('style');
  element.textContent = `@import url('${pdfSheet}') layer(pdfjs);`;
  const loaded = new Promise<void>((resolve) => {
    element.addEventListener('load', () => resolve(), { once: true });
    element.addEventListener('error', () => resolve(), { once: true });
  });
  document.head.append(element);
  return { element, loaded, holders: 0 };
}

export interface HeldPdfStyles {
  readonly loaded: Promise<void>;
  readonly release: () => void;
}

export function holdPdfStyles(document: Document): HeldPdfStyles {
  const sheet = sheets.get(document) ?? added(document);
  sheets.set(document, sheet);
  sheet.holders += 1;
  let holding = true;
  return {
    loaded: sheet.loaded,
    release: () => {
      if (!holding) {
        return;
      }
      holding = false;
      sheet.holders -= 1;
      if (sheet.holders === 0) {
        sheet.element.remove();
        sheets.delete(document);
      }
    },
  };
}
