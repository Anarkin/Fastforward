import { useEffect, useState } from 'react';
import { maxColoredBytes, type TextEncoding } from '../shared/protocol';
import { wholeText, type WholeText } from './textColors';
import type { Viewing } from './commanderState';
import { useCommanderActions } from './store';

export function useWholeText(
  viewing: Viewing,
  wanted: boolean,
  encoding: TextEncoding,
): WholeText | undefined {
  const [text, setText] = useState<WholeText>();
  const { readWholeText } = useCommanderActions();
  useEffect(() => {
    const { tab, size } = viewing;
    if (!wanted || size === undefined || size > maxColoredBytes) {
      return undefined;
    }
    return readWholeText(tab, encoding, (read) => setText(wholeText(read)));
  }, [wanted, viewing, encoding, readWholeText]);
  return text;
}
