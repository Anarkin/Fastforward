export interface Entry {
  readonly name: string;
  readonly folder: boolean;
  readonly link: boolean;
  readonly hidden: boolean;
  readonly size: number | undefined;
  readonly modified: number | undefined;
}
