import { useEffect } from 'react';
import { titleBarHeight } from '../shared/titleBar';

export function windowTitle(root: string | undefined): string {
  return root === undefined ? 'Fastforward' : `${root} - Fastforward`;
}

function Dot({ cx, color }: { cx: number; color: string }) {
  return (
    <circle
      cx={cx}
      cy="316"
      r="22"
      fill="var(--color-background)"
      stroke={color}
      strokeWidth="14"
    />
  );
}

function AppIcon() {
  const blue = '#4285F4';
  return (
    <svg className="title-bar-icon" viewBox="104 168 310 190" aria-hidden>
      <line
        x1="140"
        y1="316"
        x2="372"
        y2="316"
        stroke="var(--muted-foreground)"
        strokeOpacity="0.35"
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

export function TitleBar({ title }: { title: string }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <header className="title-bar" style={{ height: titleBarHeight }}>
      <div className="title-bar-content">
        <AppIcon />
        <span className="title-bar-text">{title}</span>
      </div>
    </header>
  );
}
