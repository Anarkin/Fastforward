import { titleBarHeight } from '../shared/titleBar';
import { useWindowTitle } from './windowTitle';
import { AppIcon } from './appIcon';

export function TitleBar({
  title,
  menu,
}: {
  title: string;
  menu?: React.ReactNode;
}) {
  useWindowTitle(title);
  return (
    <header className="title-bar" style={{ height: titleBarHeight }}>
      <div className="title-bar-content">
        <AppIcon />
        {menu}
        <span className="title-bar-text">{title}</span>
      </div>
    </header>
  );
}
