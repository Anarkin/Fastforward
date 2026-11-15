import { addNotice } from '../shared/notices';
import type { ToWebview } from '../shared/protocol';
import { menuIn } from './openedMenu';
import { withPopup } from './popups';
import type { ShellSource } from './shellState';

export function received(
  state: ShellSource,
  message: ToWebview,
  noticeId: () => number,
): Partial<ShellSource> {
  switch (message.type) {
    case 'windows':
      return { windows: message.windows };
    case 'tearsOff':
      return { tearsOff: message.allowed };
    case 'tabVisit':
      return { visit: message.visit };
    case 'tabs':
      return {
        tabs: message.tabs,
        active: message.active,
        menu:
          menuIn(state.menu, message.active) === undefined
            ? undefined
            : state.menu,
      };
    case 'dateFormat':
      return { dateFormat: message.format };
    case 'scrolling':
      return {
        scrolling: { wheelRows: message.wheelRows, smooth: message.smooth },
      };
    case 'textView':
      return { textView: message.view };
    case 'imageView':
      return { imageView: message.view };
    case 'notice':
      return {
        notices: addNotice(state.notices, {
          id: noticeId(),
          level: message.level,
          message: message.message,
          shownAt: performance.now(),
        }),
      };
    case 'update':
      return { update: message.status };
    case 'about':
      return { about: message };
    case 'terminalCommand':
      return { installsCommand: message.installable };
    case 'confirmCloseWindow':
      return {
        confirming: {
          kind: 'window',
          ...(message.unsaved !== undefined && { unsaved: message.unsaved }),
        },
        popups: withPopup(state.popups, 'confirm', true),
      };
    case 'confirmQuit':
      return {
        confirming: {
          kind: 'quit',
          ...(message.note !== undefined && { note: message.note }),
          ...(message.unsaved !== undefined && { unsaved: message.unsaved }),
        },
        popups: withPopup(state.popups, 'confirm', true),
      };
    case 'chooseTool':
      return {
        choosing: message,
        popups: withPopup(state.popups, 'openWith', true),
      };
    default:
      return {};
  }
}
