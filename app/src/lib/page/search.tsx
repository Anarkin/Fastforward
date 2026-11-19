import { labelTip } from './tips';
import { SearchIcon } from './icons';

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
      {...labelTip(title)}
      onClick={onClick}
    >
      <SearchIcon />
    </button>
  );
}
