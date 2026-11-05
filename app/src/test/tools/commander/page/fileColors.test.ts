import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  colorOfFileNamed,
  fileColorOf,
  fileColorsByExtension,
} from '../../../../tools/commander/page/fileColors';
import type { Entry } from '../../../../tools/commander/shared/protocol';
import { defaultSettings } from '../../../fixtures';

const file = (name: string, extra: Partial<Entry> = {}): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
  ...extra,
});

const defaults = fileColorsByExtension(
  defaultSettings().tools.commander.fileColors,
);
const executable = 'light-dark(#13692c, #5fd068)';
const document = 'light-dark(#874c00, #f0a838)';
const media = 'light-dark(#7a2f9e, #cf98ee)';
const archive = 'light-dark(#00636f, #4fc8d6)';

suite('Commander file colors', () => {
  test('colors green by default the programs, installers and scripts that run when opened, whatever the case of their extension', () => {
    for (const name of [
      'setup.exe',
      'TOOL.COM',
      'node-v24.msi',
      'app.msix',
      'app.appx',
      'tool.AppImage',
      'build.bat',
      'ff.cmd',
      'cleanup.ps1',
      'deploy.sh',
      'legacy.vbs',
      'job.wsf',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), executable, name);
    }
  });

  test('colors gold by default the documents: the prose read in an editor, PDFs, Office and OpenDocument files, ebooks, the Google Drive shortcuts, OneNote and the emails saved', () => {
    for (const name of [
      'README.md',
      'notes.markdown',
      'index.rst',
      'guide.adoc',
      'notes.txt',
      'todo.org',
      'invoice.pdf',
      'letter.docx',
      'old.DOC',
      'budget.xlsx',
      'slides.pptx',
      'draft.odt',
      'book.epub',
      'plan.gdoc',
      'sheet.gsheet',
      'trip.gmap',
      'survey.gform',
      'intranet.gsite',
      'board.gjam',
      'notes.one',
      'reply.eml',
      'outlook.msg',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), document, name);
    }
  });

  test('colors orchid by default the images, photos in camera raw and editor files, audio and video', () => {
    for (const name of [
      'logo.png',
      'IMG_2041.JPG',
      'photo.heic',
      'icon.svg',
      'shot.dng',
      'cover.psd',
      'song.mp3',
      'album.flac',
      'clip.mp4',
      'movie.mkv',
      'call.webm',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), media, name);
    }
  });

  test('colors teal by default the archives and compressed files, the tar ones by their last extension, the disk images and the packages, leaving green the installers', () => {
    for (const name of [
      'backup.zip',
      'tools.7z',
      'old.RAR',
      'project.tar',
      'project.tar.gz',
      'project.tgz',
      'logs.tar.xz',
      'source.tar.zst',
      'server.log.gz',
      'windows.iso',
      'disk.vhdx',
      'macos.dmg',
      'tool.deb',
      'app.jar',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), archive, name);
    }
    assert.strictEqual(fileColorOf(file('setup.msi'), defaults), executable);
  });

  test('leaves plain by default the video extensions TypeScript uses, the subtitles, playlists, fonts and 3D models, the Keynote extension private keys use, data in CSV and the contacts and calendars', () => {
    for (const name of [
      'server.key',
      'export.csv',
      'contacts.vcf',
      'meeting.ics',
      'recording.ts',
      'clip.mts',
      'movie.srt',
      'captions.vtt',
      'mix.m3u',
      'font.woff2',
      'model.glb',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), undefined, name);
    }
  });

  test('leaves plain by default the source, config, libraries, scripts of the Windows Script Host and everything else', () => {
    for (const name of [
      'main.ts',
      'esbuild.config.mts',
      'app.js',
      'package.json',
      'settings.yml',
      '.gitignore',
      'LICENSE',
      'core.dll',
      '.md',
    ]) {
      assert.strictEqual(fileColorOf(file(name), defaults), undefined, name);
    }
  });

  test('leaves folders plain, whatever their name', () => {
    assert.strictEqual(
      fileColorOf(file('tools.exe', { folder: true }), defaults),
      undefined,
    );
  });

  test('takes the extensions of a group with or without their dot and in any case, the first group naming an extension giving its color', () => {
    const colors = fileColorsByExtension([
      { extensions: ['.PNG', 'jpg'], colors: { light: '#a0a', dark: '#f0f' } },
      { extensions: ['png', 'svg'], colors: { light: '#00a', dark: '#00f' } },
    ]);
    assert.strictEqual(
      fileColorOf(file('logo.png'), colors),
      'light-dark(#a0a, #f0f)',
    );
    assert.strictEqual(
      fileColorOf(file('photo.JPG'), colors),
      'light-dark(#a0a, #f0f)',
    );
    assert.strictEqual(
      fileColorOf(file('icon.svg'), colors),
      'light-dark(#00a, #00f)',
    );
  });

  test('colors a file by the extension of its name alone, as the viewer knows no more of it', () => {
    assert.strictEqual(colorOfFileNamed('report.PDF', defaults), document);
    assert.strictEqual(colorOfFileNamed('setup.exe', defaults), executable);
    assert.strictEqual(colorOfFileNamed('.bashrc', defaults), undefined);
    assert.strictEqual(colorOfFileNamed('Makefile', defaults), undefined);
  });
});
