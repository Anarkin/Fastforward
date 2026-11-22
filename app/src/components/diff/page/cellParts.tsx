import type { RefCallback } from 'react';
import { rowPlace } from '../../../lib/page/rowPlace';
import { emptySide, sideSnaps } from './codeSnap';
import type { FillerRun } from './fillers';

export function CellRuler({
  split,
  numbers,
}: {
  readonly split: boolean;
  readonly numbers: number;
}) {
  return (
    <div className="virtual-row diff-row diff-ruler" aria-hidden>
      {split ? (
        <div className="split-line">
          {[0, 1].map((side) => (
            <div
              key={side}
              className="diff-line split-side"
              style={sideSnaps[side]}
            >
              <span className="number" />
              <span className="split-code" />
            </div>
          ))}
        </div>
      ) : (
        <div className="diff-line">
          {Array.from({ length: numbers }, (_, index) => (
            <span key={index} className="number" />
          ))}
          <span className="split-code" />
        </div>
      )}
    </div>
  );
}

export function CellHosts({
  panes,
  host,
}: {
  readonly panes: number;
  readonly host: (pane: number) => RefCallback<HTMLDivElement>;
}) {
  return Array.from({ length: panes }, (_, pane) => (
    <div key={pane} className="diff-cells cell-rows" ref={host(pane)} />
  ));
}

export function Fillers({ runs }: { readonly runs: readonly FillerRun[] }) {
  return runs.map(({ side, top, height }) => (
    <div
      key={`${side}:${top}`}
      className="virtual-row diff-row split-row diff-filler"
      style={rowPlace(top, height)}
    >
      <div className="split-line note-line">
        {[0, 1].map((each) =>
          each === side ? (
            <div
              key={each}
              className="split-side filler"
              style={emptySide(each, top)}
            />
          ) : (
            <div key={each} className="split-side" />
          ),
        )}
      </div>
    </div>
  ));
}
