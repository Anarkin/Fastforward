import { useEffect, useEffectEvent, useState } from 'react';
import { maxColoredBytes } from '../shared/protocol';
import { type TextEncoding } from '../shared/textEncodings';
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
  const { readWholeText, keptViewer, keepViewer } = useCommanderActions();
  const keptOf = ({ tab, version }: Viewing) => {
    const kept = keptViewer(tab).text;
    return kept?.encoding === encoding && kept.version === version
      ? kept.text
      : undefined;
  };
  const [text, setText] = useState(() => keptOf(viewing));
  const keptNow = useEffectEvent(keptOf);
  const keep = useEffectEvent(keepViewer);
  useEffect(() => {
    const { tab, size, version } = viewing;
    if (!wanted || size === undefined || size > maxColoredBytes) {
      return undefined;
    }
    const kept = keptNow(viewing);
    if (kept !== undefined) {
      setText(kept);
      return undefined;
    }
    return readWholeText(tab, encoding, (read) => {
      const whole = wholeText(read);
      keep(tab, { text: { encoding, version, text: whole } });
      setText(whole);
    });
  }, [wanted, viewing, encoding, readWholeText]);
  return text;
}

export function useColors(
  tab: string,
  language: string | undefined,
  encoding: TextEncoding,
  whole: WholeText | undefined,
): ColoredText | undefined {
  const { keptViewer, keepViewer } = useCommanderActions();
  const keptOf = () => {
    const kept = keptViewer(tab).colors;
    return kept !== undefined &&
      kept.language === language &&
      kept.whole === whole
      ? kept
      : undefined;
  };
  const [colored, setColored] = useState(() => keptOf()?.colored);
  const keptNow = useEffectEvent(keptOf);
  const keep = useEffectEvent(keepViewer);
  useEffect(() => {
    if (language === undefined || whole === undefined) {
      return undefined;
    }
    const kept = keptNow();
    if (kept?.done === true) {
      setColored(kept.colored);
      return undefined;
    }
    const plain = coloredText(whole.text, encoding, whole.marked);
    let shown = plain;
    return colorer().colorParts(language, whole.text, (part) => {
      if (part !== undefined) {
        shown = withPart(shown, part);
        keep(tab, {
          colors: { language, whole, colored: shown, done: part.done },
        });
        setColored(shown);
      }
    });
  }, [tab, language, whole, encoding]);
  return language === undefined ? undefined : colored;
}
