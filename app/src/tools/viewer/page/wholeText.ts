import { useEffect, useEffectEvent } from 'react';
import { maxColoredBytes } from '../../../components/syntax/shared/colorLimit';
import { type TextEncoding } from '../../../components/encodings/shared/textEncodings';
import { colorer } from '../../../components/syntax/page/colorer';
import {
  coloredText,
  wholeText,
  withPart,
  type ColoredText,
  type WholeText,
} from './textColors';
import type { Viewing } from './viewing';
import { useViewer, useViewerActions } from './store';

export const previewEncoding = (
  viewing: Pick<Viewing, 'detected'>,
): TextEncoding => viewing.detected ?? 'utf-8';

export function useWholeText(
  viewing: Viewing,
  wanted: boolean,
  encoding: TextEncoding,
): WholeText | undefined {
  const { readWholeText, keepViewer } = useViewerActions();
  const kept = useViewer((state) => state.caches.get(viewing.tab)?.text);
  const text =
    kept?.encoding === encoding && kept.version === viewing.version
      ? kept.text
      : undefined;
  const readAlready = useEffectEvent(() => text !== undefined);
  const keep = useEffectEvent(keepViewer);
  useEffect(() => {
    const { tab, size, version } = viewing;
    if (
      !wanted ||
      size === undefined ||
      size > maxColoredBytes ||
      readAlready()
    ) {
      return undefined;
    }
    return readWholeText(tab, encoding, (read) =>
      keep(tab, { text: { encoding, version, text: wholeText(read) } }),
    );
  }, [wanted, viewing, encoding, readWholeText]);
  return text;
}

export function useColors(
  tab: string,
  language: string | undefined,
  encoding: TextEncoding,
  whole: WholeText | undefined,
): ColoredText | undefined {
  const { keepViewer } = useViewerActions();
  const kept = useViewer((state) => state.caches.get(tab)?.colors);
  const ours =
    kept !== undefined && kept.language === language && kept.whole === whole
      ? kept
      : undefined;
  const coloredAlready = useEffectEvent(() => ours?.done === true);
  const keep = useEffectEvent(keepViewer);
  useEffect(() => {
    if (language === undefined || whole === undefined || coloredAlready()) {
      return undefined;
    }
    const plain = coloredText(whole.text, encoding, whole.marked);
    let shown = plain;
    return colorer().colorParts(language, plain.code, (part) => {
      if (part !== undefined) {
        shown = withPart(shown, part);
        keep(tab, {
          colors: { language, whole, colored: shown, done: part.done },
        });
      }
    });
  }, [tab, language, whole, encoding]);
  return ours?.colored;
}
