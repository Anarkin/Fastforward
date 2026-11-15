import { useEffect, useState } from 'react';
import { maxColoredBytes, type TextEncoding } from '../shared/protocol';
import { colorer } from '../../../lib/page/syntax';
import {
  coloredText,
  wholeText,
  withPart,
  type ColoredText,
  type WholeText,
} from './textColors';
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

export function useColors(
  language: string | undefined,
  encoding: TextEncoding,
  whole: WholeText | undefined,
): ColoredText | undefined {
  const [colored, setColored] = useState<ColoredText>();
  useEffect(() => {
    if (language === undefined || whole === undefined) {
      return undefined;
    }
    const plain = coloredText(whole.text, encoding, whole.marked);
    return colorer().colorParts(language, whole.text, (part) => {
      if (part !== undefined) {
        setColored((shown) =>
          withPart(shown?.lines === plain.lines ? shown : plain, part),
        );
      }
    });
  }, [language, whole, encoding]);
  return language === undefined ? undefined : colored;
}
