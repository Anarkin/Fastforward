import { CommanderTool } from '../../tools/commander/page/tool';
import { TerminalTool } from '../../tools/terminal/page/tool';
import { GitTool } from '../../tools/git/page/tool';
import { activeTabOf, useShell, useShellActions } from './store';

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
      />
      <GitTool
        active={active === 'git'}
        post={channels.git.post}
        listen={channels.git.listen}
      />
    </>
  );
}
