import { folderKey } from '../shared/paths';
import { otherSide, type CommanderToHost, type Side } from '../shared/protocol';
import type { StoreApi } from 'zustand';
import type { CommanderActions, CommanderState } from './commanderState';
import { keysMatching } from './listing';
import { baseNameOf } from './naming';
import { shownRowsOf } from './shownRows';

export type DialogActions = Pick<
  CommanderActions,
  | 'askDelete'
  | 'confirmDelete'
  | 'cancelDelete'
  | 'askTransfer'
  | 'confirmTransfer'
  | 'cancelTransfer'
  | 'askNewFolder'
  | 'makeFolder'
  | 'cancelNewFolder'
  | 'askNewFile'
  | 'makeFile'
  | 'cancelNewFile'
  | 'askRename'
  | 'rename'
  | 'cancelRename'
  | 'askGoTo'
  | 'goTo'
  | 'cancelGoTo'
  | 'askMarkPattern'
  | 'markPattern'
  | 'cancelMarkPattern'
  | 'askPack'
  | 'pack'
  | 'cancelPack'
  | 'answerClash'
  | 'stopTransfer'
  | 'hideTransfer'
  | 'elevate'
  | 'closeNoAccess'
>;

export interface StoreParts {
  readonly set: StoreApi<CommanderState>['setState'];
  readonly get: () => CommanderState;
  readonly post: (message: CommanderToHost) => void;
  readonly onTab: (send: (tab: string) => void) => void;
  readonly onPane: (
    side: Side,
    send: (tab: string, folder: string) => void,
  ) => void;
  readonly onDisk: (
    side: Side,
    send: (tab: string, folder: string) => void,
  ) => void;
}

export function dialogActions({
  set,
  get,
  post,
  onTab,
  onPane,
  onDisk,
}: StoreParts): DialogActions {
  return {
    askDelete: (side, names, permanently) =>
      onPane(side, (tab, folder) => {
        const pane = get().view.panes[side];
        const archive = pane?.archive;
        const binOff = !permanently && pane?.binOff === true;
        set({
          deleting: {
            tab,
            side,
            folder,
            names,
            permanently: permanently || binOff || archive !== undefined,
            ...(binOff && { binOff }),
            ...(archive !== undefined && { archive }),
          },
        });
      }),
    confirmDelete: () => {
      const { deleting } = get();
      if (deleting !== undefined) {
        const { tab, side, folder, names, permanently } = deleting;
        set({ deleting: undefined });
        post({ type: 'delete', tab, side, folder, names, permanently });
      }
    },
    cancelDelete: () => set({ deleting: undefined }),
    askTransfer: (side, names, move) =>
      onPane(side, (tab, folder) => {
        const { view } = get();
        const other = view.panes[otherSide(side)];
        if (other === undefined) {
          return;
        }
        const target = other.folder;
        if (other.archive === undefined) {
          set({
            transferring: { tab, side, folder, names, target, move },
          });
          return;
        }
        const key = (name: string) => folderKey(name, view.platform);
        const there = new Set(other.entries.map((entry) => key(entry.name)));
        const existing = names.filter((name) =>
          there.has(key(baseNameOf(name, view.platform))),
        );
        set({
          transferring: {
            tab,
            side,
            folder,
            names,
            target,
            move,
            ...(existing.length > 0 && { existing }),
          },
        });
      }),
    confirmTransfer: (answer = 'replace') => {
      const { transferring } = get();
      if (transferring !== undefined) {
        set({ transferring: undefined });
        const { existing, ...asked } = transferring;
        post({
          type: 'transfer',
          ...asked,
          ...(existing !== undefined && { existing: answer }),
        });
      }
    },
    cancelTransfer: () => set({ transferring: undefined }),
    askNewFolder: (side) =>
      onPane(side, (tab, folder) =>
        set({ makingFolder: { tab, side, folder } }),
      ),
    makeFolder: (name) => {
      const { makingFolder } = get();
      if (makingFolder !== undefined) {
        set({ makingFolder: undefined });
        post({ type: 'newFolder', ...makingFolder, name });
      }
    },
    cancelNewFolder: () => set({ makingFolder: undefined }),
    askNewFile: (side) =>
      onDisk(side, (tab, folder) => set({ makingFile: { tab, side, folder } })),
    makeFile: (name) => {
      const { makingFile } = get();
      if (makingFile !== undefined) {
        set({ makingFile: undefined });
        post({ type: 'newFile', ...makingFile, name });
      }
    },
    cancelNewFile: () => set({ makingFile: undefined }),
    askRename: (side, name) =>
      onPane(side, (tab, folder) =>
        set({ renaming: { tab, side, folder, name } }),
      ),
    rename: (to) => {
      const { renaming, view } = get();
      if (renaming === undefined) {
        return;
      }
      set({ renaming: undefined });
      if (to !== baseNameOf(renaming.name, view.platform)) {
        post({ type: 'rename', ...renaming, to });
      }
    },
    cancelRename: () => set({ renaming: undefined }),
    askGoTo: (side) =>
      onPane(side, (tab, folder) => set({ goingTo: { tab, side, folder } })),
    goTo: (to) => {
      const { goingTo } = get();
      if (goingTo !== undefined) {
        set({ goingTo: undefined });
        post({ type: 'goTo', ...goingTo, to });
      }
    },
    cancelGoTo: () => set({ goingTo: undefined }),
    askMarkPattern: (side, mark, suggested) =>
      onPane(side, (tab, folder) =>
        set({
          markingPattern: {
            tab,
            side,
            folder,
            mark,
            initial: get().lastPattern ?? suggested,
          },
        }),
      ),
    markPattern: (pattern) => {
      const { markingPattern, view } = get();
      if (markingPattern === undefined) {
        return;
      }
      set({ markingPattern: undefined, lastPattern: pattern });
      const { rows } = shownRowsOf(get(), markingPattern.side);
      get().mark(
        markingPattern.side,
        keysMatching(rows, pattern, view.platform),
        markingPattern.mark,
      );
    },
    cancelMarkPattern: () => set({ markingPattern: undefined }),
    askPack: (side, names) =>
      onDisk(side, (tab, folder) => {
        const other = get().view.panes[otherSide(side)];
        const target =
          other !== undefined && other.archive === undefined
            ? other.folder
            : folder;
        set({ packing: { tab, side, folder, names, target } });
      }),
    pack: ({
      archive,
      format,
      level,
      password,
      encryptNames,
      zipCipher,
      volume,
      volumeBytes,
      test,
      replace,
    }) => {
      const { packing, packChoices } = get();
      if (packing === undefined) {
        return;
      }
      set({
        packing: undefined,
        packChoices: {
          format,
          level,
          zipCipher: zipCipher ?? packChoices.zipCipher,
          volume,
          test,
        },
      });
      const { tab, side, folder, names } = packing;
      post({
        type: 'pack',
        tab,
        side,
        folder,
        names,
        archive,
        format,
        level,
        ...(password !== undefined && { password }),
        ...(encryptNames !== undefined && { encryptNames }),
        ...(zipCipher !== undefined && { zipCipher }),
        ...(volumeBytes !== undefined && { volumeBytes }),
        test,
        ...(replace === true && { replace }),
      });
    },
    cancelPack: () => set({ packing: undefined }),
    answerClash: (answer, all) => {
      const { transfer } = get();
      if (transfer?.clash !== undefined) {
        post({
          type: 'answerClash',
          transfer: transfer.id,
          asked: transfer.clash.asked,
          answer,
          all,
        });
      }
    },
    stopTransfer: () => {
      const { transfer } = get();
      if (transfer !== undefined) {
        post({ type: 'stopTransfer', transfer: transfer.id });
      }
    },
    hideTransfer: () => {
      const { transfer } = get();
      if (transfer !== undefined) {
        post({ type: 'hideTransfer', transfer: transfer.id });
      }
    },
    elevate: () => {
      const { noAccess } = get();
      set({ noAccess: undefined });
      if (noAccess !== undefined) {
        onTab((tab) => post({ type: 'elevate', tab, side: noAccess.side }));
      }
    },
    closeNoAccess: () => set({ noAccess: undefined }),
  };
}
