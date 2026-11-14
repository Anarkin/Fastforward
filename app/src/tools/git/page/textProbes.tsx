import { memo, useCallback, useRef } from 'react';
import { wrapColumns } from '../../../lib/page/wordWrap';
import { watchDevicePixels } from '../../../lib/page/devicePixels';
import { fontOf, spacingOf } from '../../../lib/page/textWidths';
import type { Edges } from './diffScrolling';
import { uniformHeight, type WrapColumns } from './rowMeasures';
import { sideSnaps, wordPadding } from './textLayout';

const wrapSample = '0'.repeat(100);

function measureWrapColumns(probe: HTMLElement): WrapColumns {
  const [left = Infinity, right = left] = Array.from(
    probe.querySelectorAll<HTMLElement>('.code'),
    (code) => {
      const style = getComputedStyle(code);
      const sample = code.firstElementChild;
      return wrapColumns(
        code.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        sample ? sample.getBoundingClientRect().width / wrapSample.length : 0,
      );
    },
  );
  return { left, right };
}

export const WrapProbe = memo(function WrapProbe({
  split,
  numbers,
  onColumns,
}: {
  split: boolean;
  numbers: number;
  onColumns: (columns: WrapColumns) => void;
}) {
  const observe = useCallback(
    (probe: HTMLDivElement) => {
      const measure = () => onColumns(measureWrapColumns(probe));
      measure();
      const observer = new ResizeObserver(measure);
      for (const element of probe.querySelectorAll('.code, .wrap-sample')) {
        observer.observe(element);
      }
      return () => observer.disconnect();
    },
    [onColumns],
  );
  const code = (
    <span className="code">
      <span className="wrap-sample">{wrapSample}</span>
    </span>
  );
  return (
    <div className="wrap-probe" aria-hidden ref={observe}>
      {split ? (
        <div className="split-line">
          {[0, 1].map((side) => (
            <div
              key={side}
              className="diff-line split-side"
              style={sideSnaps[side]}
            >
              <span className="number" />
              <span className="split-code">{code}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="diff-line">
          {Array.from({ length: numbers }, (_, index) => (
            <span key={index} className="number" />
          ))}
          {code}
        </div>
      )}
    </div>
  );
});

function lineHeightOf(line: HTMLElement): number {
  const height = parseFloat(getComputedStyle(line).lineHeight);
  return height > 0 ? height : uniformHeight;
}

export const TextProbe = memo(function TextProbe({
  onMeasure,
}: {
  onMeasure: (
    charWidth: number,
    font: string,
    padding: Edges,
    scale: number,
    lineHeight: number,
    spacing: number,
  ) => void;
}) {
  const sample = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const observe = useCallback(
    (line: HTMLDivElement) => {
      const probe = sample.current;
      const after = text.current;
      if (!probe || !after) {
        return undefined;
      }
      const measure = () =>
        onMeasure(
          probe.getBoundingClientRect().width / wrapSample.length,
          fontOf(probe),
          wordPadding(
            line.getBoundingClientRect(),
            after.getBoundingClientRect(),
            devicePixelRatio,
          ),
          devicePixelRatio,
          lineHeightOf(line),
          spacingOf(probe),
        );
      measure();
      const stopWatching = watchDevicePixels(measure);
      const observer = new ResizeObserver(measure);
      observer.observe(probe);
      return () => {
        observer.disconnect();
        stopWatching();
      };
    },
    [onMeasure],
  );
  return (
    <div className="wrap-probe" aria-hidden>
      <div className="diff-line" ref={observe}>
        <span className="code">
          <span className="wrap-sample" ref={sample}>
            {wrapSample}
          </span>
          <span ref={text}>{wrapSample}</span>
        </span>
      </div>
    </div>
  );
});
