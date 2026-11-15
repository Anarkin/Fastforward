import * as path from 'node:path';
import type { Entry } from '../../../../../tools/commander/shared/protocol';
import { pathParts } from '../../../../../lib/shared/pathParts';

export const root = path.resolve('/');
export const at = (...names: string[]) => path.join(root, ...names);

export const folder = (name: string): Entry => ({
  name,
  folder: true,
  link: false,
  hidden: false,
  size: undefined,
  modified: 0,
});

export const file = (name: string): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

export const hiddenIn = (listed: string, ...hidden: string[]) =>
  pathParts(listed).map((part) => hidden.includes(part.path));
