import { alongLine, gliderOf } from '../../../lib/page/glide';
import { holdRest } from '../../../lib/page/scrollSettings';

const onRow = 1e-6;

export interface RowGlider {
  readonly glideBy: (rows: number) => void;
  readonly holdBy: (rows: number) => void;
  readonly hold: () => void;
  readonly holdAt: (part: number) => void;
  readonly letGo: () => void;
  readonly reset: () => void;
  readonly stop: () => void;
}

export function glideRowsOf({
  move,
  shift,
  atStart,
  atEnd,
  settles,
}: {
  readonly move: (by: number) => void;
  readonly shift: (part: number) => void;
  readonly atStart: () => boolean;
  readonly atEnd: () => boolean;
  readonly settles: () => boolean;
}): RowGlider {
  let at = 0;
  let moved = 0;
  let rest: ReturnType<typeof setTimeout> | undefined;
  let held = false;
  const place = (next: number) => {
    const blocked =
      (next < at && atStart()) || (next > at && atEnd()) ? moved : next;
    const whole = Math.floor(blocked + onRow);
    if (whole !== moved) {
      move(whole - moved);
      moved = whole;
    }
    at = Math.max(blocked, whole);
    shift(at - whole < onRow ? 0 : at - whole);
    if (blocked !== next) {
      settle();
    }
    if (glider.target() === undefined && at - moved < onRow) {
      at = 0;
      moved = 0;
    }
  };
  const glider = gliderOf(place, alongLine);
  const settle = glider.settle;
  const glideTo = (to: number) => {
    glider.glideTo(to, at);
  };
  const letGo = () => {
    rest = undefined;
    if (at - moved < onRow) {
      return;
    }
    if (settles()) {
      glideTo(Math.round(at));
    }
  };
  const unrest = () => {
    if (rest !== undefined) {
      clearTimeout(rest);
      rest = undefined;
    }
  };
  return {
    glideBy: (rows) => {
      unrest();
      glideTo(Math.round(glider.target() ?? at) + rows);
    },
    holdBy: (rows) => {
      unrest();
      settle();
      place(at + rows);
      rest = setTimeout(letGo, holdRest);
    },
    hold: () => {
      held = true;
    },
    holdAt: (part) => {
      unrest();
      settle();
      at = moved + Math.max(0, Math.min(1 - onRow, part));
      shift(at - moved < onRow ? 0 : at - moved);
      if (!held) {
        letGo();
      }
    },
    letGo: () => {
      held = false;
      unrest();
      letGo();
    },
    reset: () => {
      held = false;
      unrest();
      settle();
      at = 0;
      moved = 0;
      shift(0);
    },
    stop: () => {
      unrest();
      settle();
    },
  };
}
