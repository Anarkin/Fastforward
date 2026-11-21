import { useId } from 'react';
import { usePixelRatio } from '../../lib/page/imageSizes';
import {
  appIconColors,
  appIconDrawing,
  folderBackOutline,
} from './appIconDrawing';

const titleBarIconSize = 20;

export function AppIcon({
  className = 'title-bar-icon',
  size = titleBarIconSize,
}: {
  className?: string;
  size?: number;
}) {
  const disc = useId();
  const ratio = usePixelRatio();
  const drawing = appIconDrawing(Math.round(size * ratio));
  const half = drawing.size / 2;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${drawing.size} ${drawing.size}`}
      aria-hidden
    >
      <defs>
        <mask id={disc}>
          <circle cx={half} cy={half} r={half} fill="#FFFFFF" />
        </mask>
      </defs>
      <g mask={`url(#${disc})`}>
        <rect
          width={drawing.size}
          height={drawing.size}
          fill={appIconColors.sky}
        />
        <path d={folderBackOutline(drawing)} fill={appIconColors.back} />
        <rect
          y={drawing.frontTop}
          width={drawing.size}
          height={drawing.size - drawing.frontTop}
          fill={appIconColors.front}
        />
      </g>
    </svg>
  );
}
