const lineHeight = 16;
const pageWidth = 612;
const pageHeight = 792;
const margin = 72;

function escaped(text: string): string {
  return text.replaceAll(/[\\()]/g, (character) => `\\${character}`);
}

function pageContent(lines: readonly string[]): string {
  const shown = lines
    .map(
      (line, index) =>
        `BT /F1 12 Tf ${margin} ${pageHeight - margin - index * lineHeight} Td (${escaped(line)}) Tj ET`,
    )
    .join('\n');
  return `${shown}\n`;
}

export function pdfOf(
  pages: readonly (readonly string[])[],
  id = '0123456789abcdef0123456789abcdef',
): Buffer {
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((page) => `${page} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const [index, lines] of pages.entries()) {
    const content = pageContent(lines);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[index] + 1} 0 R >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
    );
  }
  let body = '%PDF-1.7\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, 'latin1');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}
