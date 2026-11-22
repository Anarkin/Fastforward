import { flag, record, type Infer } from '../../lib/shared/schema';

const textViewSchema = record({
  wordWrap: flag(),
  showWhitespace: flag(),
  highlightSyntax: flag(),
  highlightOccurrences: flag(),
  cells: flag(),
});

export type TextView = Infer<typeof textViewSchema>;

export function isTextView(value: unknown): value is TextView {
  return textViewSchema.decode(value) !== undefined;
}

const imageViewSchema = record({ realSize: flag() });

export type ImageView = Infer<typeof imageViewSchema>;

export function isImageView(value: unknown): value is ImageView {
  return imageViewSchema.decode(value) !== undefined;
}
