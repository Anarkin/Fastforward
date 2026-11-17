export interface PathFacts {
  readonly kind: 'folder' | 'file' | 'inArchive' | 'missing';
  readonly inRepository: boolean;
  readonly gitMissing: boolean;
}
