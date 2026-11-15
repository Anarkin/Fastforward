import * as fs from 'node:fs';
import { fileVersion } from '../shared/files';
import { firstBytes } from './encodingDetection';
import type { EditingAccess } from './editing';
import { saveFile } from './fileSaving';
import { codeOf } from './reasons';
import type { ArchiveCopies } from './archiveCopies';
import type { CommanderAccess } from './commanderAccess';

export type EditingFilesAccess = Pick<
  CommanderAccess,
  | 'watch'
  | 'saveEdited'
  | 'codePage'
  | 'readOnlyFile'
  | 'editorSources'
  | 'editorDefaults'
>;

type EditedCopies = Pick<
  ArchiveCopies,
  'copyOf' | 'editedCopies' | 'editedCopySaved'
>;

export function editingFiles(
  access: EditingFilesAccess,
  copies: () => EditedCopies,
): EditingAccess {
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
        return fileVersion(await fs.promises.stat(file));
      } catch (error) {
        if (codeOf(error) === 'ENOENT') {
          return undefined;
        }
        throw error;
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
      copies().editedCopySaved(file);
      return saved;
    },
    codePage: () => access.codePage(),
    readOnly: (file) =>
      access.readOnlyFile?.(file) === true ||
      (copies().copyOf(file) !== undefined && !copies().editedCopies.has(file)),
    ...(access.editorSources !== undefined && {
      endingSources: access.editorSources,
    }),
    ...(access.editorDefaults !== undefined && {
      textDefaults: access.editorDefaults,
    }),
  };
}
