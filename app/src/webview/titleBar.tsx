import { useEffect } from 'react';
import { titleBarHeight } from '../shared/titleBar';

export function windowTitle(root: string | undefined): string {
  return root === undefined ? 'Fastforward' : `${root} - Fastforward`;
}

export function TitleBar({ title }: { title: string }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <header className="title-bar" style={{ height: titleBarHeight }}>
      <div className="title-bar-content">
        <img className="title-bar-icon" src="icon.png" alt="" />
        <span className="title-bar-text">{title}</span>
      </div>
    </header>
  );
}
