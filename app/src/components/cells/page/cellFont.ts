import { useCallback, useMemo, useState } from 'react';
import { useCellTable, type CellTable } from '../../../lib/page/cellTable';
import { fontDotLook, type DotLook } from '../../../lib/page/dotLook';
import { textWidths, type TextWidths } from '../../../lib/page/textWidths';
import type { CellFont } from './cellLook';

interface CellFontMeasured {
  readonly font: CellFont;
  readonly onFont: (char: number, family: string, spacing: number) => void;
  readonly table: CellTable | undefined;
  readonly widths: TextWidths | undefined;
  readonly dotLook: DotLook | undefined;
}

export function useCellFont(): CellFontMeasured {
  const [font, setFont] = useState<CellFont>({
    char: 0,
    family: '',
    spacing: 0,
  });
  const onFont = useCallback(
    (char: number, family: string, spacing: number) =>
      setFont((last) =>
        last.char === char && last.family === family && last.spacing === spacing
          ? last
          : { char, family, spacing },
      ),
    [],
  );
  const table = useCellTable();
  const widths = useMemo(
    () =>
      font.char > 0 && table !== undefined
        ? textWidths(font.char, font.family, font.spacing, table)
        : undefined,
    [font, table],
  );
  const dotLook = useMemo(
    () => fontDotLook(font.family, font.char, 1 / devicePixelRatio),
    [font],
  );
  return { font, onFont, table, widths, dotLook };
}
