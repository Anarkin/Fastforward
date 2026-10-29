import { useEffect } from 'react';
import { strings } from '../../shared/strings';
import { titleBarHeight } from '../shared/titleBar';

export function windowTitle(root: string | undefined, app: string): string {
  return root === undefined ? app : strings.app.windowTitle(root, app);
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

export function AppIcon() {
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

interface Pixel {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, width: number, height: number): void;
  getImageData(
    x: number,
    y: number,
    width: number,
    height: number,
  ): { readonly data: ArrayLike<number> };
}

export function windowButtonColor(
  color: string,
  pixel: Pixel | null = new OffscreenCanvas(1, 1).getContext('2d'),
): string {
  if (!pixel) {
    return color;
  }
  pixel.fillStyle = color;
  pixel.fillRect(0, 0, 1, 1);
  const { data } = pixel.getImageData(0, 0, 1, 1);
  return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${data[3] / 255})`;
}

export function useWindowTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
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
