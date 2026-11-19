import { labelTip } from './tips';
import { SearchIcon } from './icons';

export function SearchButton({
  title,
  keys,
  onClick,
}: {
  title: string;
  keys?: string | undefined;
  onClick: () => void;
}) {
  return (
    <button
      className="nav-button search-button"
      {...labelTip(title, { keys })}
      onClick={onClick}
    >
      <SearchIcon />
    </button>
  );
}
