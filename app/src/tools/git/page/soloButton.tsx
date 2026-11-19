import { labelTip } from '../../../lib/page/tips';
import { useGit, useGitActions } from './store';
import { strings } from '../../../lib/shared/strings';
import { SoloIcon } from '../../../lib/page/icons';

export function SoloButton() {
  const solo = useGit((state) => state.solo);
  const applying = useGit((state) => state.tab.applyingSolo);
  const { changeSolo: onSolo } = useGitActions();
  return (
    <button
      className={`nav-button toggle ${solo ? 'active' : ''} ${applying ? 'running' : ''}`}
      {...labelTip(strings.commits.solo)}
      aria-pressed={solo}
      disabled={applying}
      onClick={() => onSolo(!solo)}
    >
      <span className="spin-icon">
        <SoloIcon />
      </span>
    </button>
  );
}
