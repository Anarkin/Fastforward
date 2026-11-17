import { EditorTool } from '../../../../../tools/editor/main/tool';
import { fakeShell } from '../../commander/main/fakeShell';
import { EditorPage } from './editingFixtures';

export function editor({
  viewedCopies = [],
}: { readonly viewedCopies?: readonly string[] } = {}) {
  const closing = { now: false };
  const saved: string[] = [];
  const viewed: [string, unknown][] = [];
  const compared: string[] = [];
  const tool = new EditorTool({
    watch: () => () => {},
    codePage: () => Promise.resolve('windows-1252'),
    closesBrackets: () => closing.now,
    viewedCopy: (file) => viewedCopies.includes(file),
    readOnlyCopy: (file) => viewedCopies.includes(file),
    copySaved: (file) => {
      saved.push(file);
    },
    viewEdited: (_page, file, start) => {
      viewed.push([file, start]);
      return Promise.resolve();
    },
    compareHistory: (_page, file) => {
      compared.push(file);
      return Promise.resolve();
    },
  });
  const page = new EditorPage();
  const { shell, tabs, notices, edited } = fakeShell(page);
  tool.attach(shell);
  return {
    tool,
    page,
    tabs,
    notices,
    edited,
    closing,
    saved,
    viewed,
    compared,
  };
}
