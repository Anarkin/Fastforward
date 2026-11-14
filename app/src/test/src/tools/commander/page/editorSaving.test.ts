import * as assert from 'node:assert';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import { suite, test } from 'vitest';
import {
  savingFixes,
  savingRulesOf,
  sinceSavedField,
} from '../../../../../tools/commander/page/editorSaving';

function editing(
  doc: string,
  rules: {
    readonly trimTrailingWhitespace?: boolean;
    readonly insertFinalNewline?: boolean;
  },
) {
  let state = EditorState.create({
    doc,
    extensions: [sinceSavedField, savingRulesOf(rules)],
  });
  const apply = (spec: TransactionSpec) => {
    state = state.update(spec).state;
  };
  const save = () => {
    const fixes = savingFixes(state);
    if (fixes !== undefined) {
      apply(fixes);
    }
    return state.doc.toString();
  };
  return {
    apply,
    save,
    at: (text: string) => state.doc.toString().indexOf(text),
  };
}

suite('What the editor fixes as it saves', () => {
  test('trims the whitespace at the ends of the lines edited since saved, leaving the others as they were read', () => {
    const { apply, save, at } = editing('one  \ntwo \t\nthree  \n', {
      trimTrailingWhitespace: true,
    });
    apply({ changes: { from: at('two'), insert: 'and ' } });
    apply({
      changes: { from: at('three'), to: at('three') + 5, insert: 'four' },
    });
    assert.strictEqual(save(), 'one  \nand two\nfour\n');
  });

  test('trims nothing more once saved, until a line is edited again', () => {
    const { apply, save, at } = editing('one\ntwo\n', {
      trimTrailingWhitespace: true,
    });
    apply({ changes: { from: at('one') + 3, insert: '  ' } });
    assert.strictEqual(save(), 'one\ntwo\n');
    apply({ changes: { from: at('two') + 3, insert: ' ' } });
    apply({ changes: { from: at('one') + 3, insert: ' ' } });
    assert.strictEqual(save(), 'one\ntwo\n');
  });

  test('ends the file with a line break once its last line is edited, and leaves a last line not edited without one', () => {
    const untouched = editing('one\ntwo', { insertFinalNewline: true });
    untouched.apply({ changes: { from: 0, insert: 'zero\n' } });
    assert.strictEqual(untouched.save(), 'zero\none\ntwo');
    const touched = editing('one\ntwo', { insertFinalNewline: true });
    touched.apply({ changes: { from: touched.at('two'), insert: 'and ' } });
    assert.strictEqual(touched.save(), 'one\nand two\n');
    const ended = editing('one\n', { insertFinalNewline: true });
    ended.apply({ changes: { from: 0, insert: 'a' } });
    assert.strictEqual(ended.save(), 'aone\n');
  });

  test('changes nothing where the .editorconfig asks for neither', () => {
    const { apply, save, at } = editing('one  \ntwo', {});
    apply({ changes: { from: at('two'), insert: 'and ' } });
    apply({ changes: { from: at('one'), insert: 'zero ' } });
    assert.strictEqual(save(), 'zero one  \nand two');
  });
});
