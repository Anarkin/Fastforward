import type { Locator } from 'playwright-core';

export const nearItsStart = { x: 48, y: 4 };

export interface ShownRow {
  readonly name: string;
  readonly extension: string;
  readonly size: string;
  readonly date: string;
  readonly drawn: string;
  readonly classes: readonly string[];
}

export const rowsShown = (pane: Locator): Promise<ShownRow[]> =>
  pane.locator('.commander-row').evaluateAll((rows) =>
    rows.map((row) => {
      const classes = [...row.classList];
      if (!classes.includes('plain')) {
        const cell = (name: string) =>
          row.querySelector(`.commander-${name}`)?.textContent ?? '';
        const named = row.querySelector('.commander-name');
        const around = (part: string) => {
          const content =
            named === null ? 'none' : getComputedStyle(named, part).content;
          return content === 'none' || content === 'normal'
            ? ''
            : content.replaceAll('"', '');
        };
        return {
          name: cell('name'),
          extension: cell('extension'),
          size: cell('size'),
          date: cell('date'),
          drawn: `${around('::before')}${cell('name')}${around('::after')}`,
          classes,
        };
      }
      const side = row.closest('.commander-pane');
      const columns = (name: string) =>
        Number(
          side === null
            ? 0
            : getComputedStyle(side).getPropertyValue(`--commander-${name}`),
        );
      const text = [...row.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join('');
      const [drawn = '', rest = ''] = text.split(String.fromCharCode(9));
      const extension = columns('extension');
      const size = columns('size');
      return {
        name: classes.includes('commander-folder') ? drawn.slice(1, -1) : drawn,
        extension: rest.slice(0, extension).trimEnd(),
        size: rest.slice(extension + 2, extension + 2 + size).trim(),
        date: rest.slice(extension + size + 4).trim(),
        drawn,
        classes,
      };
    }),
  );

export const fileName = ({ name, extension }: ShownRow): string =>
  [name, extension].filter(Boolean).join('.');

export const boxOfRow = async (row: Locator): Promise<void> => {
  const box = await row.boundingBox();
  if (box === null) {
    throw new Error('no row');
  }
  await row.click({ position: { x: 10, y: box.height / 2 } });
};
