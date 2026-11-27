import { useEffect, useEffectEvent, type RefObject } from 'react';
import { SignTips } from '../../../components/cells/page/signTips';
import { tipSource } from '../../../lib/page/tips';
import { strings } from '../../../lib/shared/strings';
import type { Board } from '../shared/board';
import { cellAt } from './boardPaint';
import { signAt } from './nodeSigns';
import type { Drawn } from './surface';

export function useSignTips(
  body: RefObject<HTMLElement | null>,
  board: Board | undefined,
  drawn: RefObject<Drawn | undefined>,
): void {
  const tipAt = useEffectEvent(
    (tips: SignTips, x: number, y: number): Element | undefined => {
      const known = drawn.current;
      const at =
        known === undefined
          ? undefined
          : cellAt({ clientX: x, clientY: y }, known);
      const kind =
        known === undefined || at === undefined || board === undefined
          ? undefined
          : signAt(board, known.unit, at);
      if (known === undefined || at === undefined || kind === undefined) {
        tips.clear();
        return undefined;
      }
      return tips.at(`${at.column}:${at.row}`, strings.canvas.nodeKinds[kind], {
        left: known.left + (at.column - known.origin.column) * known.cell.width,
        top: known.top + (at.row - known.origin.row) * known.cell.height,
        width: known.cell.width,
        height: known.cell.height,
      });
    },
  );

  useEffect(
    () =>
      body.current === null
        ? undefined
        : tipsFrom(body.current, (tips, x, y) => tipAt(tips, x, y)),
    [body],
  );
}

function tipsFrom(
  element: HTMLElement,
  tipAt: (tips: SignTips, x: number, y: number) => Element | undefined,
): () => void {
  const tips = new SignTips(element.ownerDocument);
  element.setAttribute(tipSource, '');
  element.tipUnder = (x, y) => tipAt(tips, x, y);
  return () => {
    tips.clear();
    element.tipUnder = undefined;
    element.removeAttribute(tipSource);
  };
}
