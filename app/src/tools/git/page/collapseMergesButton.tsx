import { CollapseMergesIcon } from '../../../lib/page/icons';
import { labelTip } from '../../../lib/page/tips';
import { strings } from '../../../lib/shared/strings';
import { useGit, useGitActions } from './store';

export function CollapseMergesButton() {
  const collapsed = useGit((state) => state.collapseMerges);
  const { changeCollapseMerges: onCollapse } = useGitActions();
  return (
    <button
      className={`nav-button toggle ${collapsed ? 'active' : ''}`}
      {...labelTip(strings.commits.collapseMerges)}
      aria-pressed={collapsed}
      onClick={() => onCollapse(!collapsed)}
    >
      <CollapseMergesIcon />
    </button>
  );
}
