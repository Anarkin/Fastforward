export interface ScrollSettings {
  readonly wheelRows: number;
  readonly smooth: boolean;
  readonly smoothSnap: boolean;
}

export const defaultScrolling: ScrollSettings = {
  wheelRows: 1,
  smooth: false,
  smoothSnap: true,
};

export const sidewaysColumns = 4;

export const holdRest = 120;
