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
});
