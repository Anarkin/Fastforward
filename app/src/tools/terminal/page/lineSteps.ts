export interface Heading {
  readonly from: number;
  readonly to: number;
  readonly until: number;
}

export interface Stepped {
  readonly by: number;
  readonly heading: Heading | undefined;
}

function underWay(
  heading: Heading | undefined,
  shown: number,
  now: number,
): heading is Heading {
  return (
    heading !== undefined &&
    now < heading.until &&
    shown >= Math.min(heading.from, heading.to) &&
    shown <= Math.max(heading.from, heading.to)
  );
}

export function stepped(
  heading: Heading | undefined,
  { shown, last }: { readonly shown: number; readonly last: number },
  lines: number,
  now: number,
  glide: number,
): Stepped {
  const gliding = underWay(heading, shown, now) ? heading : undefined;
  const to = Math.max(0, Math.min(last, (gliding?.to ?? shown) + lines));
  return {
    by: to - shown,
    heading:
      glide > 0
        ? {
            from: gliding?.from ?? shown,
            to,
            until: gliding?.until ?? now + glide,
          }
        : undefined,
  };
}
