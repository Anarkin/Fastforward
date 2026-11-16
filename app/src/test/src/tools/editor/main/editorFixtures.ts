import { EditorTool } from '../../../../../tools/editor/main/tool';
import { fakeShell } from '../../commander/main/fakeShell';
import { EditorPage } from './editingFixtures';

export function editor({
  viewedCopies = [],
}: { readonly viewedCopies?: readonly string[] } = {}) {
  const closing = { now: false };
  const iconsLoaded: string[] = [];
  const saved: string[] = [];
  const tool = new EditorTool({
    watch: () => () => {},
    codePage: () => Promise.resolve('windows-1252'),
    closesBrackets: () => closing.now,
    fileIcon: (file) => {
      iconsLoaded.push(file);
      return Promise.resolve(new TextEncoder().encode(`icon of ${file}`));
    },
    viewedCopy: (file) => viewedCopies.includes(file),
    readOnlyCopy: (file) => viewedCopies.includes(file),
    copySaved: (file) => {
      saved.push(file);
    },
  });
  const page = new EditorPage();
  const { shell, tabs, notices, turned, edited } = fakeShell(page);
  tool.attach(shell);
  return {
    tool,
    page,
    tabs,
    notices,
    turned,
    edited,
    closing,
    iconsLoaded,
    saved,
  };
}
