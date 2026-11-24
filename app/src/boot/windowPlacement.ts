export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function visibleBounds(
  saved: unknown,
  workAreas: readonly Bounds[],
): Bounds | undefined {
  if (!isBounds(saved)) {
    return undefined;
  }
  const minimum = 100;
  const overlaps = workAreas.map((area) => {
    const across =
      Math.min(saved.x + saved.width, area.x + area.width) -
      Math.max(saved.x, area.x);
    const down =
      Math.min(saved.y + saved.height, area.y + area.height) -
      Math.max(saved.y, area.y);
    return { area, across, down };
  });
  const [mostly] = overlaps
    .filter(({ across, down }) => across >= minimum && down >= minimum)
    .toSorted((a, b) => b.across * b.down - a.across * a.down);
  if (mostly === undefined) {
    return undefined;
  }
  const bounds = {
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
  };
  const corners = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ] as const;
  const shown = corners.every(([x, y]) =>
    workAreas.some(
      (area) =>
        x >= area.x &&
        x <= area.x + area.width &&
        y >= area.y &&
        y <= area.y + area.height,
    ),
  );
  return shown ? bounds : fitted(bounds, mostly.area);
}

function fitted(bounds: Bounds, area: Bounds): Bounds {
  const width = Math.min(bounds.width, area.width);
  const height = Math.min(bounds.height, area.height);
  return {
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - height),
    width,
    height,
  };
}

function isBounds(value: unknown): value is Bounds {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record: Record<string, unknown> = { ...value };
  return ['x', 'y', 'width', 'height'].every(
    (key) => typeof record[key] === 'number' && Number.isFinite(record[key]),
  );
}

const cascadeStep = 32;

function cascadedSpan(
  start: number,
  size: number,
  low: number,
  high: number,
): { readonly at: number; readonly size: number } {
  const span = Math.min(size, high - low);
  const next = start + cascadeStep;
  if (next + span <= high) {
    return { at: next, size: span };
  }
  return start === low
    ? { at: next, size: Math.max(high - next, 0) }
    : { at: low, size: span };
}

export function cascaded(from: Bounds, area: Bounds): Bounds {
  const across = cascadedSpan(from.x, from.width, area.x, area.x + area.width);
  const down = cascadedSpan(from.y, from.height, area.y, area.y + area.height);
  return { x: across.at, y: down.at, width: across.size, height: down.size };
}

export function firstWindowSize(workArea: Bounds): {
  readonly width: number;
  readonly height: number;
} {
  return {
    width: Math.min(1400, workArea.width),
    height: Math.min(900, workArea.height),
  };
}

interface WindowState {
  isMinimized(): boolean;
  isMaximized(): boolean;
}

export function restoresMaximized(
  window: WindowState,
  initially: boolean,
): () => boolean {
  let maximized = initially;
  return () => {
    if (!window.isMinimized()) {
      maximized = window.isMaximized();
    }
    return maximized;
  };
}
