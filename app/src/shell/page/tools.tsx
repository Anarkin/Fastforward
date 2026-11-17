import { CommanderTool } from '../../tools/commander/page/tool';
import { TerminalTool } from '../../tools/terminal/page/tool';
import { GitTool } from '../../tools/git/page/tool';
import { ViewerTool } from '../../tools/viewer/page/tool';
import { EditorTool } from '../../tools/editor/page/tool';
import { DiffTool } from '../../tools/diff/page/tool';
import { activeTabOf } from './selectors';
import { useShell, useShellActions } from './store';

export function ToolViews() {
  const active = useShell((state) => activeTabOf(state)?.tool);
  const { channels } = useShellActions();
  return (
    <>
      <TerminalTool
        active={active === 'terminal'}
        post={channels.terminal.post}
        listen={channels.terminal.listen}
      />
      <CommanderTool
        active={active === 'commander'}
        post={channels.commander.post}
        listen={channels.commander.listen}
        dropFiles={channels.commander.dropFiles}
        views={channels.commander.views}
      />
      <GitTool
        active={active === 'git'}
        post={channels.git.post}
        listen={channels.git.listen}
        views={channels.git.views}
      />
      <ViewerTool
        active={active === 'viewer'}
        post={channels.viewer.post}
        listen={channels.viewer.listen}
        views={channels.viewer.views}
      />
      <EditorTool
        active={active === 'editor'}
        post={channels.editor.post}
        listen={channels.editor.listen}
        views={channels.editor.views}
      />
      <DiffTool
        active={active === 'diff'}
        post={channels.diff.post}
        listen={channels.diff.listen}
        views={channels.diff.views}
      />
    </>
  );
}
