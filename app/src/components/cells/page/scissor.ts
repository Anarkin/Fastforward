export interface Scissor {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function scissorOf(
  clip: number,
  clipTop: number,
  width: number,
  height: number,
): Scissor | undefined {
  const left = clip > 0 ? Math.min(clip, width) : 0;
  const top = clipTop > 0 ? Math.min(clipTop, height) : 0;
  return left > 0 || top > 0
    ? { x: left, y: top, width: width - left, height: height - top }
    : undefined;
}
