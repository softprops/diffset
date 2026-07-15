import { listOutputs } from '../src/output';

import { assert, describe, it } from 'vitest';

describe('output', () => {
  it('formats legacy and JSON outputs for changed files', () => {
    assert.deepStrictEqual(listOutputs('files', ['docs/has space.md', 'src/main.ts']), {
      files: 'docs/has space.md src/main.ts',
      files_json: '["docs/has space.md","src/main.ts"]',
    });
  });

  it('formats matching JSON output names for dynamic file sets', () => {
    assert.deepStrictEqual(listOutputs('special_files', ['src/special/main.ts']), {
      special_files: 'src/special/main.ts',
      special_files_json: '["src/special/main.ts"]',
    });
  });

  it('round-trips arbitrary filenames through JSON outputs', () => {
    const files = [
      'docs/has space.md',
      'docs/has\ttab.md',
      'docs/has"quote.md',
      'docs/has\\backslash.md',
      'docs/公開.md',
      '-leading-dash',
      'docs/[glob]*?.md',
      'docs/has\nnewline.md',
    ];

    const outputs = listOutputs('files', files);

    assert.deepStrictEqual(JSON.parse(outputs.files_json ?? ''), files);
  });

  it('emits compatibility and JSON outputs for an empty list', () => {
    assert.deepStrictEqual(listOutputs('files', []), {
      files: '',
      files_json: '[]',
    });
  });
});
