import { titleBarHeight } from '../shared/titleBar';
import { useWindowTitle } from './windowTitle';

const tile = '#FFFFFF';

function Dot({ cx, color }: { cx: number; color: string }) {
  return (
    <circle
      cx={cx}
      cy="316"
      r="22"
      fill={tile}
      stroke={color}
      strokeWidth="14"
    />
  );
}

export function AppIcon() {
  const blue = '#4285F4';
  return (
    <svg className="title-bar-icon" viewBox="50 50 412 412" aria-hidden>
      <rect x="50" y="50" width="412" height="412" rx="92" fill={tile} />
      <line
        x1="140"
        y1="316"
        x2="372"
        y2="316"
        stroke="#DADCE0"
        strokeWidth="20"
        strokeLinecap="round"
      />
      <Dot cx={140} color="#EA4335" />
      <Dot cx={218} color="#FBBC04" />
      <Dot cx={296} color="#34A853" />
      <circle cx="372" cy="316" r="34" fill={blue} />
      <path
        d="M140 268 Q 256 118 350 250"
        fill="none"
        stroke={blue}
        strokeWidth="26"
        strokeLinecap="round"
      />
      <polyline
        points="291,231 350,250 350,188"
        fill="none"
        stroke={blue}
        strokeWidth="26"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
