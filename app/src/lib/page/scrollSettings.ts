export interface ScrollSettings {
  readonly wheelRows: number;
  readonly smooth: boolean;
}

export const defaultScrolling: ScrollSettings = {
  wheelRows: 1,
  smooth: false,
};

export const sidewaysColumns = 4;
