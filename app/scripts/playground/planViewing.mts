import * as fs from 'node:fs';
import * as path from 'node:path';
import { encoded, pdf } from './formats.mts';
import { images } from './gitImages.mts';
import { dotnetFiles, rustFiles } from './projectSamples.mts';
import {
  binary,
  decoded,
  diagrams,
  emojiGrid,
  everything,
  imageKinds,
  languages,
  paddedTable,
  png,
  sentence,
  shade,
} from './samples.mts';
import type { PlanBuilder } from './filesPlan.mts';
import {
  limits,
  syntaxLineLimit,
  kib,
  mib,
  appRoot,
  defaultColorGroups,
  lines,
  oneLineOfSize,
  logOfSize,
  codeOfSize,
  markdownOfSize,
  encodingTexts,
  unicodeText,
  realSources,
  orientedJpeg,
  pages,
  oneLine,
  three,
} from './planContents.mts';

export function planViewing(builder: PlanBuilder): void {
  const { items, encodings, file, chunks, folder, section } = builder;
  section(
    'colors',
    'One empty file for every extension of every default color group, a program by its exec bit on macOS and Linux, files on a drive marking every file so, a macOS app, and files no group colors. Turn on Group by color with Ctrl+G.',
  );
  for (const { extensions } of defaultColorGroups()) {
    if (Array.isArray(extensions)) {
      for (const extension of extensions) {
        file(`colors/sample.${extension}`, '');
      }
    }
  }
  file('colors/source.ts', 'export const colored = "by its language";\n');
  file('colors/Makefile', 'all:\n\techo "colored by its whole name"\n');
  file('colors/Dockerfile', 'FROM alpine\n');
  file('colors/program', '#!/bin/sh\necho "a program without an extension"\n', {
    mode: 0o755,
  });
  file('colors/python3.12', '#!/bin/sh\necho "a versioned program"\n', {
    mode: 0o755,
  });
  file(
    'colors/notes-on-a-usb-stick.txt',
    'Every file of a FAT drive can run.\n',
    {
      mode: 0o755,
    },
  );
  file('colors/photo-on-a-usb-stick.jpg', '', { mode: 0o755 });
  file('colors/script-on-a-usb-stick.py', 'print("still Python")\n', {
    mode: 0o755,
  });
  folder('colors/Playground.app');
  file(
    'colors/Playground.app/Contents/Info.plist',
    '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Playground</string></dict></plist>\n',
  );
  file(
    'colors/Playground.app/Contents/MacOS/Playground',
    '#!/bin/sh\necho "Hello from an app bundle"\n',
    { mode: 0o755 },
  );
  for (const plain of [
    'LICENSE',
    'server.key',
    'id_ed25519.pub',
    'core.dll',
    'data.bin',
    'contacts.vcf',
    'font.woff2',
  ]) {
    file(`colors/${plain}`, '');
  }

  section(
    'images',
    'Every image type the viewer previews, animated, transparent, wide, tall, tiny and large ones, a photo in each of the eight orientations its EXIF tag may give, its dark corner moving around in thumbnails with Mod+2, a broken one, an SVG with a script and one too large to preview. Open with F3, 3 for the preview, F to fit or show the real size.',
  );
  for (const { extension, versions } of imageKinds) {
    file(`images/sample.${extension}`, () => versions()[0]);
  }
  file('images/animated.gif', () => decoded(images.animated));
  file('images/transparent.png', () => decoded(images.transparent));
  file('images/wide.png', () =>
    png(1600, 48, (x, y) => [shade(x), shade(y), shade(1 - x)]),
  );
  file('images/tall.png', () =>
    png(48, 1600, (x, y) => [shade(y), shade(x), shade(1 - y)]),
  );
  file('images/tiny.png', () => png(1, 1, () => [220, 40, 40]));
  file('images/large.png', () =>
    png(3000, 2000, (x, y) => [
      shade(x),
      shade(0.5 + 0.5 * Math.sin(x * 20) * y),
      shade(1 - y),
    ]),
  );
  file('images/UPPERCASE.JPG', () => decoded(images.jpg[0]));
  for (let orientation = 1; orientation <= 8; orientation++) {
    file(`images/exif-orientation-${orientation}.jpg`, () =>
      orientedJpeg(orientation),
    );
  }
  file('images/broken.png', 'This is not a PNG at all.\n');
  file(
    'images/scripted.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">\n  <script>alert("never runs")</script>\n  <rect width="96" height="96" fill="#6a6"/>\n</svg>\n',
  );
  items.push({
    kind: 'sparse',
    path: 'images/over-the-image-limit.png',
    size: limits.maxImageSize + 1,
  });

  section(
    'markdown',
    'Markdown with everything the preview renders, Mermaid diagrams, HTML it sanitizes, images next to it, every extension, and files just under and over the size it previews.',
  );
  file(
    'markdown/everything.md',
    everything.replace('../../images/logo.png', 'logo.png'),
  );
  file('markdown/diagrams.md', diagrams);
  file(
    'markdown/sanitized.md',
    '# Sanitized\n\n<script>alert("never runs")</script>\n\n<iframe src="https://example.com"></iframe>\n\n<img src="x" onerror="alert(1)" alt="An image whose handler is dropped">\n\n<a href="javascript:alert(1)">A link whose script is dropped</a>\n\n<p style="color: red">A paragraph whose style is dropped</p>\n',
  );
  file(
    'markdown/images.md',
    '# Images\n\nNext to the file:\n\n![The logo](logo.png)\n\nFrom the web, shown as its alt text:\n\n![A picture on the web](https://example.com/picture.png)\n\nMissing:\n\n![A picture that is not there](missing.png)\n',
  );
  file('markdown/logo.png', () =>
    png(64, 64, (x, y) => [shade(x * 0.2), shade(0.4 + y * 0.3), 204]),
  );
  for (const extension of ['markdown', 'mdown', 'mkd', 'mkdn']) {
    file(
      `markdown/extension.${extension}`,
      `# A .${extension} file\n\nPreviewed like any **Markdown**.\n`,
    );
  }
  chunks(
    'markdown/just-under-the-preview-limit.md',
    limits.maxPreviewBytes - kib,
    () => markdownOfSize(limits.maxPreviewBytes - kib),
  );
  chunks(
    'markdown/over-the-preview-limit.md',
    limits.maxPreviewBytes + kib,
    () => markdownOfSize(limits.maxPreviewBytes + kib),
  );

  section(
    'pdf',
    'A short PDF, one of 300 pages with NEEDLE on page 250 to find with Mod+F, one locked with the password "playground", and a broken one.',
  );
  file('pdf/sample.pdf', () => pdf(pages(3)));
  file('pdf/many-pages.pdf', () => pdf(pages(300, 250)));
  file('pdf/locked.pdf', () => pdf(pages(2), 'playground'));
  file('pdf/broken.pdf', '%PDF-1.4\nThis is not a PDF after all.\n');

  section(
    'syntax',
    'Code in many languages; a .NET solution of C#, F#, Visual Basic, Razor and XAML with its projects, props, settings and resources; a Rust crate with its Cargo files; real sources of Fastforward; files just under and over the size the viewer colors; and lines just under and over the length it colors. Choose another language with L.',
  );
  for (const [name, content] of Object.entries({
    ...languages,
    ...dotnetFiles,
    ...rustFiles,
  })) {
    file(`syntax/${name}`, content);
  }
  for (const source of realSources) {
    file(`syntax/fastforward-${path.basename(source)}`, () =>
      fs.readFileSync(path.join(appRoot, source)),
    );
  }
  chunks(
    'syntax/limit-size-just-under-the-coloring-limit.ts',
    limits.maxColoredBytes - kib,
    () => codeOfSize(limits.maxColoredBytes - kib),
  );
  chunks(
    'syntax/limit-size-over-the-coloring-limit.ts',
    limits.maxColoredBytes + kib,
    () => codeOfSize(limits.maxColoredBytes + kib),
  );
  for (const [name, length] of [
    ['line-just-under-the-coloring-length.ts', syntaxLineLimit - 10],
    ['line-over-the-coloring-length.ts', syntaxLineLimit + 10],
  ] as const) {
    file(
      `syntax/limit-${name}`,
      `export const before = 1;\nexport const long = '${'x'.repeat(length - 24)}';\nexport const after = 2;\n`,
    );
  }

  section(
    'text',
    'Text for the viewer: lines just under and over the 64 KiB it shows whole, the longer ones in rows of 4 KiB, and of 1 and 10 MiB; a Markdown table padded as prettier pads it, with lines of more than a thousand spaces, which once made the viewer slow; emoji and Chinese, Japanese and Korean characters in a grid whose bars line up where widths are counted right; every byte value and a NUL byte for the hex view, 1; and more matches than it counts and a log with one NEEDLE near its end, to find with Mod+F. Show whitespace with `.`.',
  );
  for (const [name, length] of [
    ['long-line-just-under-64-kib.txt', limits.wholeLineBytes - 1],
    ['long-line-just-over-64-kib.txt', limits.wholeLineBytes + 1],
  ] as const) {
    file(
      `text/${name}`,
      () =>
        `short line\n${sentence(1, Math.ceil(length / 4)).slice(0, length)}\nshort line\n`,
    );
  }
  for (const [name, size] of [
    ['one-line-of-1-mib.txt', mib],
    ['one-line-of-10-mib.txt', 10 * mib],
  ] as const) {
    chunks(`text/${name}`, size, () => oneLineOfSize(size));
  }

  section(
    'encodings',
    'A text in every encoding the E menu offers, in a script it is for, with and without a byte order mark. Auto reads the ones without a mark in the code page of the system.',
  );
  for (const [encoding, text] of Object.entries(encodingTexts)) {
    const where = `encodings/${encoding}.txt`;
    const sample = `${encoding}: ${text}\n`;
    const bom = encoding.startsWith('utf-16') ? '\uFEFF' : '';
    file(where, () => encoded(`${bom}${sample}`, encoding));
    encodings.push({ path: where, encoding, text: sample });
  }
  const bomless = `utf-16le without a byte order mark: ${encodingTexts['utf-16le']}\n`;
  file('encodings/utf-16le-without-bom.txt', () =>
    encoded(bomless, 'utf-16le'),
  );
  encodings.push({
    path: 'encodings/utf-16le-without-bom.txt',
    encoding: 'utf-16le',
    text: bomless,
  });
  const withBom = `utf-8 with a byte order mark: ${encodingTexts['utf-8']}\n`;
  file('encodings/utf-8-with-bom.txt', () =>
    encoded(`\uFEFF${withBom}`, 'utf-8'),
  );
  encodings.push({
    path: 'encodings/utf-8-with-bom.txt',
    encoding: 'utf-8',
    text: withBom,
  });

  section(
    'line-endings',
    'Line endings, as the button above a file edited with F4 shows them, Mixed while there is more than one, and its menu converts them: LF, CRLF and CR, files mixing them with most of one or as many of two, the first then taking new lines, and files with no line break, no final one or nothing but line breaks. Each from-folder holds a file with no line break, whose new lines take their ending from where the folder says, as the menu of the button lists; a file made there with Shift+F4 takes it the same way. trim-on-save trims the lines edited and ends the file with a line break once saved with Ctrl+S, leaving the lines not edited as they were.',
  );
  file('line-endings/lf.txt', `${three.join('\n')}\n`);
  file('line-endings/crlf.txt', `${three.join('\r\n')}\r\n`);
  file('line-endings/cr.txt', `${three.join('\r')}\r`);
  file(
    'line-endings/mixed-mostly-lf.txt',
    'lf\ncrlf\r\nlf again\ncr\rlf once more\n',
  );
  file(
    'line-endings/mixed-mostly-crlf.txt',
    'crlf\r\nlf\ncrlf again\r\ncrlf once more\r\n',
  );
  file('line-endings/mixed-tie.txt', 'crlf first\r\nlf\ncrlf\r\nlf\n');
  file('line-endings/no-final-newline.txt', three.join('\n'));
  file('line-endings/no-line-break.txt', 'one line, no line break');
  file('line-endings/empty.txt', '');
  file('line-endings/only-newlines.txt', '\n'.repeat(50));
  file(
    'line-endings/from-editorconfig/.editorconfig',
    'root = true\n\n[*]\nend_of_line = crlf\n',
  );
  file(
    'line-endings/from-editorconfig/one-line.txt',
    oneLine('the .editorconfig beside it'),
  );
  file(
    'line-endings/from-git-attributes/.gitattributes',
    '*.txt text eol=crlf\n',
  );
  file(
    'line-endings/from-git-attributes/one-line.txt',
    oneLine('the eol attribute of git'),
  );
  items.push({ kind: 'repository', path: 'line-endings/from-git-attributes' });
  file(
    'line-endings/from-git-config/one-line.txt',
    oneLine('core.autocrlf of git'),
  );
  items.push({
    kind: 'repository',
    path: 'line-endings/from-git-config',
    config: { 'core.autocrlf': 'true' },
  });
  file(
    'line-endings/from-settings/run.cmd',
    '@echo One line with no line break, so new lines end as editor.files of the settings says for .cmd.',
  );
  file(
    'line-endings/from-settings/one-line.html',
    oneLine('editor.endOfLine of the settings'),
  );
  file(
    'line-endings/trim-on-save/.editorconfig',
    'root = true\n\n[*]\ntrim_trailing_whitespace = true\ninsert_final_newline = true\n',
  );
  file(
    'line-endings/trim-on-save/trailing-spaces.txt',
    'edit this line, its spaces go as it is saved   \nthis line keeps its spaces   \nand this last line gets a line break once edited',
  );

  file('text/whitespace-padded-table.md', paddedTable(1));
  file(
    'text/whitespace-tabs-and-spaces.txt',
    'spaces    between\n\ttab at the start\n    four spaces at the start\ntrailing spaces   \ntrailing tab\t\n\t \tmixed\n',
  );

  file('text/emoji-grid.md', emojiGrid(1));
  file('text/unicode.txt', unicodeText);

  file('text/binary-every-byte.bin', () =>
    Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 256)),
  );
  file('text/binary-nul-byte.txt', Buffer.from('text\0with a NUL byte\n'));
  file('text/binary-random.bin', () => binary(64 * kib, 7));

  file('text/find-more-matches-than-counted.txt', () =>
    lines(limits.maxMatches + 1000, (i) => `needle ${i + 1}`),
  );
  chunks('text/find-log-of-20-mib.log', 20 * mib, () => logOfSize(20 * mib));
}
