import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { vi } from 'vitest';
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

export const rested = () => vi.advanceTimersByTime(preloadDelay);
