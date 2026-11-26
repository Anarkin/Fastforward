import { createElement, Fragment, memo } from 'react';
import { columnFocusAttribute } from '../../../../../lib/page/columnFocus';

export const fixtureLine = 20;

interface Drawn {
  readonly count: number;
  readonly placeOf: (
    index: number,
  ) => { readonly top: number; readonly height: number } | undefined;
  readonly pinnedAt: (offset: number) => readonly number[];
}

const RowContent = memo(function RowContent({
  index,
  renderRow,
}: {
  readonly index: number;
  readonly renderRow: (index: number) => React.ReactNode;
}) {
  return renderRow(index);
});

function MockedRows({
  rows,
  renderRow,
  renderCanvas,
  listRef,
  onKeyDown,
}: {
  readonly rows: {
    readonly count: number;
    readonly keyOf: (index: number) => string;
  };
  readonly renderRow: (index: number) => React.ReactNode;
  readonly renderCanvas?: (drawn: Drawn) => React.ReactNode;
  readonly listRef?: React.Ref<HTMLDivElement>;
  readonly onKeyDown?: (
    event: React.KeyboardEvent,
    visible: { readonly first: number; readonly last: number },
  ) => void;
}) {
  const indexes = Array.from({ length: rows.count }, (_, index) => index);
  return createElement(
    'div',
    {
      ref: listRef,
      'data-list': '',
      [columnFocusAttribute]: '',
      tabIndex: 0,
      onKeyDown: (event: React.KeyboardEvent) =>
        onKeyDown?.(event, { first: 0, last: rows.count - 1 }),
    },
    renderCanvas === undefined
      ? indexes.map((index) =>
          createElement(RowContent, { key: index, index, renderRow }),
        )
      : createElement(
          Fragment,
          null,
          indexes.map((index) =>
            createElement('span', {
              key: index,
              'data-line': index,
              'data-key': rows.keyOf(index),
            }),
          ),
          renderCanvas({
            count: rows.count,
            placeOf: (index) =>
              index < rows.count
                ? { top: index * fixtureLine, height: fixtureLine }
                : undefined,
            pinnedAt: () => [],
          }),
        ),
  );
}

export async function withListMock<Module extends object>(
  importOriginal: () => Promise<Module>,
): Promise<Module> {
  return Object.assign({}, await importOriginal(), { VirtualRows: MockedRows });
}
