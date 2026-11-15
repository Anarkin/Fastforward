import { strings } from '../shared/strings';
import { BackIcon, SearchIcon } from './icons';

export function SearchButton({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      className="nav-button search-button"
      title={title}
      onClick={onClick}
    >
      <SearchIcon />
    </button>
  );
}

export function SearchRow({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="search-row">
      <button
        className="nav-button"
        title={strings.common.close}
        onClick={onClose}
      >
        <BackIcon />
      </button>
      {children}
    </div>
  );
}
