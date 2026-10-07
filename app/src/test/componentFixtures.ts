import * as assert from 'node:assert';
import { mock } from 'node:test';
import { isValidElement } from 'react';
import { preloadDelay } from '../webview/tabBar';
import { FileRow } from '../webview/tree';

export interface RowProps {
  className: string;
  onClick: () => void;
}

export function clickFile(row: React.ReactElement) {
  assert.strictEqual(row.type, FileRow);
  assert.ok(isValidElement<Parameters<typeof FileRow>[0]>(row));
  const drawn = FileRow(row.props);
  assert.ok(isValidElement<RowProps>(drawn));
  drawn.props.onClick();
}

export const rested = () => mock.timers.tick(preloadDelay);
