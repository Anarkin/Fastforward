import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { firstBytes } from '../../../lib/main/encodingDetection';
import type { EditingAccess } from './editing';
import { saveFile } from './fileSaving';
import { bytesVersion } from '../../../lib/main/fileVersions';
import { codeOf } from '../../../lib/main/reasons';
import type { Saved } from './fileSaving';
import type { TextDefaults } from './textDefaults';
import type { TextEncoding } from '../../../lib/shared/textEncodings';
import type { EndingSource } from '../shared/protocol';

export interface EditingFilesAccess {
  readonly watch: (file: string, onChange: () => void) => () => void;
  readonly codePage: () => Promise<TextEncoding>;
  readonly saveEdited?: (
    file: string,
    bytes: Uint8Array,
    overwriteReadOnly: boolean,
  ) => Promise<Saved>;
  readonly readOnlyFile?: (file: string) => boolean;
  readonly editorDefaults?: (
    file: string,
    asksGit: boolean,
  ) => Promise<TextDefaults>;
  readonly editorSources?: (file: string) => Promise<readonly EndingSource[]>;
  readonly readOnlyCopy: (file: string) => boolean;
  readonly copySaved: (file: string) => void;
}

export function editingFiles(access: EditingFilesAccess): EditingAccess {
  return {
    readFile: (file) => fs.promises.readFile(file),
    readStart: firstBytes,
    statFile: async (file) => {
      try {
        const stat = await fs.promises.stat(file);
        return { folder: stat.isDirectory(), size: stat.size };
      } catch (error) {
        if (codeOf(error) === 'ENOENT') {
          return undefined;
        }
        throw error;
      }
    },
    stampOf: async (file) => {
      try {
        return bytesVersion(await fs.promises.readFile(file));
      } catch (error) {
        return codeOf(error) === 'ENOENT'
          ? undefined
          : `unreadable:${randomUUID()}`;
      }
    },
    watch: (file, onChange) => access.watch(file, onChange),
    saveFile: async (file, bytes, overwriteReadOnly) => {
      const saved = await (
        access.saveEdited ??
        ((edited, written, overwriting) =>
          saveFile(edited, written, {
            overwriteReadOnly: overwriting,
          }))
      )(file, bytes, overwriteReadOnly);
      access.copySaved(file);
      return saved;
    },
    codePage: () => access.codePage(),
    readOnly: (file) =>
      access.readOnlyFile?.(file) === true || access.readOnlyCopy(file),
    ...(access.editorSources !== undefined && {
      endingSources: access.editorSources,
    }),
    ...(access.editorDefaults !== undefined && {
      textDefaults: access.editorDefaults,
    }),
  };
}
