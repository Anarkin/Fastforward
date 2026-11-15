export const layouts = ['details', 'thumbnails'] as const;

export type Layout = (typeof layouts)[number];

export type Layouts = Readonly<Record<'left' | 'right', Layout>>;

export const defaultLayouts: Layouts = { left: 'details', right: 'details' };
