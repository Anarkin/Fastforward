import * as fs from 'node:fs';
import type { ThemeColors, ToolSettings } from '../shared/tools';
import { strings } from '../../lib/shared/strings';
import type { TextView } from '../shared/views';
import type { CursorLook } from '../../lib/shared/cursorSettings';
import { isObject } from '../../lib/main/json';

export const themes = ['auto', 'light', 'dark'] as const;

export type Theme = (typeof themes)[number];

interface NoticeSeconds {
  readonly leastSeconds: number;
  readonly mostSeconds: number;
}

export interface Settings {
  readonly tabs: {
    readonly recentFolders: number;
  };
  readonly theme: Theme;
  readonly dateFormat: string;
  readonly scrolling: {
    readonly wheelRows: number;
    readonly smooth: boolean;
    readonly smoothSnap: boolean;
    readonly scrollbarSize: string;
    readonly scrollbarSizeWithMarkers: string;
  };
  readonly tooltips: {
    readonly delayMilliseconds: number;
  };
  readonly notices: {
    readonly info: NoticeSeconds;
    readonly error: NoticeSeconds;
  };
  readonly cursor: CursorLook;
  readonly text: TextView;
  readonly tools: ToolSettings;
  readonly fonts: {
    readonly family: string;
    readonly size: string;
    readonly lineHeight: number;
    readonly monospaceFamily: string;
    readonly monospaceSize: string;
    readonly monospaceLineHeight: number;
  };
  readonly colors: ThemeColors;
}

export function readDefaults(file: string): Settings {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!isObject(parsed)) {
    throw new Error(strings.errors.notObject(file));
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return parsed as unknown as Settings;
}
