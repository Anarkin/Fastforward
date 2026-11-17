const maxMarkedRows = 200;

export function markedRowStarts(
  length: number,
  rows: number,
  rowOf: (offset: number) => number,
): number[] | undefined {
  return rows > maxMarkedRows ? undefined : rowStarts(length, rows, rowOf);
}

export function rowStarts(
  length: number,
  rows: number,
  rowOf: (offset: number) => number,
): number[] {
  const read = new Map<number, number>();
  const rowAt = (offset: number) => {
    let row = read.get(offset);
    if (row === undefined) {
      row = rowOf(offset);
      read.set(offset, row);
    }
    return row;
  };
  const starts = [0];
  for (let row = 1; row < rows; row++) {
    const previous = starts[row - 1];
    const stride =
      row > 1 ? previous - starts[row - 2] : Math.ceil(length / rows);
    starts.push(
      firstOnRow(
        row,
        previous + 1,
        length,
        Math.min(previous + Math.max(1, stride), length),
        rowAt,
      ),
    );
  }
  return starts;
}

function firstOnRow(
  row: number,
  from: number,
  to: number,
  estimate: number,
  rowAt: (offset: number) => number,
): number {
  let low = from;
  let high = to;
  if (estimate >= to || rowAt(estimate) >= row) {
    high = Math.min(estimate, to);
    for (let gap = 1; high - gap >= from; gap *= 2) {
      if (rowAt(high - gap) < row) {
        low = high - gap + 1;
        break;
      }
      high -= gap;
    }
  } else {
    low = estimate + 1;
    for (let gap = 1; low + gap - 1 < to; gap *= 2) {
      const probe = low + gap - 1;
      if (rowAt(probe) >= row) {
        high = probe;
        break;
      }
      low = probe + 1;
    }
  }
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rowAt(middle) >= row) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}
