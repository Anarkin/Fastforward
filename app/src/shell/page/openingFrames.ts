import {
  appIconColors,
  appIconDrawing,
  folderBackOutline,
} from './appIconDrawing';
import type {
  FromOpeningWorker,
  OpeningContext,
  OpeningPixels,
  ToOpeningWorker,
} from './openingMessages';
import {
  openingPose,
  type OpeningLanding,
  type OpeningPose,
} from './openingMotion';

export interface OpeningScene {
  readonly now: () => number;
  readonly frame: (run: () => void) => void;
  readonly outline: (path: string) => object;
  readonly post: (message: FromOpeningWorker) => void;
}

function paint(
  context: OpeningContext,
  pose: OpeningPose,
  ratio: number,
  outline: (path: string) => object,
): void {
  const { width, height } = context.canvas;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  if (pose.opacity <= 0) {
    return;
  }
  const size = Math.max(1, Math.round(2 * pose.radius * ratio));
  const half = size / 2;
  const corner = (middle: number) =>
    pose.settled ? Math.round(middle * ratio - half) : middle * ratio - half;
  const drawing = appIconDrawing(size);
  context.save();
  context.globalAlpha = pose.opacity;
  context.translate(corner(pose.x), corner(pose.y));
  context.beginPath();
  context.arc(half, half, half, 0, 2 * Math.PI);
  context.clip();
  context.fillStyle = appIconColors.sky;
  context.fillRect(0, 0, size, size);
  context.fillStyle = appIconColors.back;
  context.fill(outline(folderBackOutline(drawing)));
  context.fillStyle = appIconColors.front;
  context.fillRect(0, drawing.frontTop, size, size - drawing.frontTop);
  context.restore();
}

export class OpeningFrames {
  private context: OpeningContext | undefined;
  private pixels: OpeningPixels | undefined;
  private landing: OpeningLanding | undefined;
  private startedAt = 0;
  private done = false;

  constructor(private readonly scene: OpeningScene) {}

  receive(message: ToOpeningWorker): void {
    switch (message.type) {
      case 'start':
        this.start(message.canvas.getContext('2d'), message);
        return;
      case 'resize':
        this.resize(message.pixels);
        return;
      case 'land':
        this.landing = message.landing;
        return;
      default:
        message satisfies never;
    }
  }

  private start(
    context: OpeningContext | null,
    { startedAt, pixels }: { startedAt: number; pixels: OpeningPixels },
  ): void {
    if (context === null) {
      this.end();
      return;
    }
    this.context = context;
    this.startedAt = startedAt;
    this.resize(pixels);
    this.scene.frame(() => this.draw());
  }

  private resize(pixels: OpeningPixels): void {
    this.pixels = pixels;
    if (this.context !== undefined) {
      this.context.canvas.width = pixels.pixelWidth;
      this.context.canvas.height = pixels.pixelHeight;
    }
  }

  private draw(): void {
    const { context, pixels } = this;
    if (context === undefined || pixels === undefined || this.done) {
      return;
    }
    const pose = openingPose(
      this.scene.now() - this.startedAt,
      pixels,
      this.landing,
    );
    const ratio = pixels.width > 0 ? pixels.pixelWidth / pixels.width : 1;
    paint(context, pose, ratio, this.scene.outline);
    if (pose.settled) {
      this.end();
      return;
    }
    this.scene.frame(() => this.draw());
  }

  private end(): void {
    this.done = true;
    this.scene.post({ type: 'done' });
  }
}
