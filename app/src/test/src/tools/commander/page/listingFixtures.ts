import type { Entry } from '../../../../../tools/commander/shared/protocol';
import type { Sort } from '../../../../../tools/commander/shared/settings';

export const entry = (name: string, extra: Partial<Entry> = {}): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 0,
  modified: 0,
  ...extra,
});

export const folder = (name: string, extra: Partial<Entry> = {}): Entry =>
  entry(name, { folder: true, size: undefined, ...extra });

export const defaultSort: Sort = {
  column: 'extension',
  descending: false,
  groupByColor: false,
};

export const filterRow = (key: string) => ({
  key,
  entry:
    key === '..'
      ? undefined
      : {
          name: key,
          folder: false,
          link: false,
          hidden: false,
          size: 1,
          modified: 0,
        },
  base: key,
  extension: '',
  repository: false,
});
