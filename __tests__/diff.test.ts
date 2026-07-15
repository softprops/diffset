import { GitHubDiff, sets, type Params } from '../src/diff';
import type {
  ChangedCommit,
  ChangedFile,
  CommitRequest,
  CompareRequest,
  GitHubClient,
  PullFilesRequest,
} from '../src/github';

import { assert, describe, expect, it } from 'vitest';

const params: Params = {
  base: 'master',
  head: 'feature',
  owner: 'owner',
  repo: 'repo',
  ref: 'abc123',
};

const fakeGithub = ({
  commitPages,
  commitPagesByRef = {},
  commitFiles = [],
  compareError,
  compareCommitError,
  compareCommitPages = [],
  compareFiles = [],
  commitError,
  pullFiles = [],
  pullError,
}: {
  commitPages?: Array<Array<ChangedFile>>;
  commitPagesByRef?: Record<string, Array<Array<ChangedFile>>>;
  commitFiles?: Array<ChangedFile>;
  commitError?: Error;
  compareCommitError?: Error;
  compareError?: Error;
  compareCommitPages?: Array<Array<ChangedCommit>>;
  compareFiles?: Array<ChangedFile>;
  pullError?: Error;
  pullFiles?: Array<ChangedFile>;
}) => {
  const calls: {
    commitFiles: Array<CommitRequest>;
    compareCommits: Array<CompareRequest>;
    compareFiles: Array<CompareRequest>;
    pullFiles: Array<PullFilesRequest>;
  } = {
    commitFiles: [],
    compareCommits: [],
    compareFiles: [],
    pullFiles: [],
  };
  const github: GitHubClient = {
    commitFiles: async (request) => {
      calls.commitFiles.push(request);
      if (commitError != undefined) {
        throw commitError;
      }
      return (commitPagesByRef[request.ref] ?? commitPages ?? [commitFiles]).flat();
    },
    compareCommits: async (request) => {
      calls.compareCommits.push(request);
      if (compareCommitError != undefined) {
        throw compareCommitError;
      }
      return compareCommitPages.flat();
    },
    compareFiles: async (request) => {
      calls.compareFiles.push(request);
      if (compareError != undefined) {
        throw compareError;
      }
      return compareFiles;
    },
    pullFiles: async (request) => {
      calls.pullFiles.push(request);
      if (pullError != undefined) {
        throw pullError;
      }
      return pullFiles;
    },
  };
  return { calls, github };
};

describe('diff', () => {
  describe('GitHubDiff', () => {
    it('generates diff based on the compare api', async () => {
      const { calls, github } = fakeGithub({
        compareFiles: [
          { status: 'added', filename: 'added.txt' },
          { status: 'modified', filename: 'changed.txt' },
          { status: 'removed', filename: 'removed.txt' },
        ],
      });

      const response = await new GitHubDiff(github).diff(params);

      assert.deepStrictEqual(response, ['added.txt', 'changed.txt']);
      assert.deepStrictEqual(calls.compareFiles, [
        { base: 'master', head: 'feature', owner: 'owner', repo: 'repo' },
      ]);
    });

    it('includes removed files when requested', async () => {
      const { github } = fakeGithub({
        compareFiles: [
          { status: 'added', filename: 'added.txt' },
          { status: 'removed', filename: 'removed.txt' },
        ],
      });

      const response = await new GitHubDiff(github).diff({
        ...params,
        includeRemoved: true,
      });

      assert.deepStrictEqual(response, ['added.txt', 'removed.txt']);
    });

    it('generates diff based on pushed commit refs', async () => {
      const { calls, github } = fakeGithub({
        commitPagesByRef: {
          first: [
            [
              { status: 'added', filename: 'first.txt' },
              { status: 'added', filename: 'temporary.txt' },
            ],
          ],
          second: [
            [
              { status: 'modified', filename: 'first.txt' },
              { status: 'removed', filename: 'temporary.txt' },
              { status: 'added', filename: 'second.txt' },
            ],
          ],
        },
      });

      const response = await new GitHubDiff(github).diff({
        ...params,
        commitRefs: ['first', 'second'],
      });

      assert.deepStrictEqual(response, ['first.txt', 'second.txt']);
      assert.deepStrictEqual(calls.commitFiles, [
        { owner: 'owner', repo: 'repo', ref: 'first', per_page: 100 },
        { owner: 'owner', repo: 'repo', ref: 'second', per_page: 100 },
      ]);
    });

    it('removes superseded paths when pushed commits rename files', async () => {
      const { github } = fakeGithub({
        commitPagesByRef: {
          first: [[{ status: 'modified', filename: 'docs/old.md' }]],
          second: [
            [
              {
                status: 'renamed',
                filename: 'docs/new.md',
                previous_filename: 'docs/old.md',
              },
            ],
          ],
        },
      });

      const response = await new GitHubDiff(github).diff({
        ...params,
        commitRefs: ['first', 'second'],
      });

      assert.deepStrictEqual(response, ['docs/new.md']);
    });

    it('includes removed files from pushed commit refs when requested', async () => {
      const { github } = fakeGithub({
        commitPagesByRef: {
          first: [[{ status: 'added', filename: 'from-event.txt' }]],
          second: [[{ status: 'removed', filename: 'deleted.txt' }]],
        },
      });

      const response = await new GitHubDiff(github).diff({
        ...params,
        includeRemoved: true,
        commitRefs: ['first', 'second'],
      });

      assert.deepStrictEqual(response, ['from-event.txt', 'deleted.txt']);
    });

    it('generates diff based on the paginated commit api for same-ref pushes', async () => {
      const { calls, github } = fakeGithub({
        commitPages: [
          [
            { status: 'added', filename: 'added.txt' },
            { status: 'removed', filename: 'removed.txt' },
          ],
          [{ status: 'modified', filename: 'changed.txt' }, { status: 'modified' }],
        ],
      });
      const sameRefParams = { ...params, head: 'master' };

      const response = await new GitHubDiff(github).diff(sameRefParams);

      assert.deepStrictEqual(response, ['added.txt', 'changed.txt']);
      assert.deepStrictEqual(calls.compareFiles, []);
      assert.deepStrictEqual(calls.commitFiles, [
        { owner: 'owner', repo: 'repo', ref: 'abc123', per_page: 100 },
      ]);
    });

    it('keeps pull request diffs on the compare api when it succeeds', async () => {
      const { calls, github } = fakeGithub({
        compareFiles: [
          { status: 'added', filename: 'src/main.ts' },
          { status: 'removed', filename: 'src/old.ts' },
        ],
      });

      const response = await new GitHubDiff(github).diff({
        ...params,
        base: 'main',
        head: 'fork:feature',
        pullChangedFiles: 2,
        pullNumber: 123,
      });

      assert.deepStrictEqual(response, ['src/main.ts']);
      assert.deepStrictEqual(calls.compareFiles, [
        { base: 'main', head: 'fork:feature', owner: 'owner', repo: 'repo' },
      ]);
      assert.deepStrictEqual(calls.pullFiles, []);
    });

    it('falls back to pull request files when compare output is truncated', async () => {
      const { calls, github } = fakeGithub({
        compareFiles: [{ status: 'added', filename: 'src/main.ts' }],
        pullFiles: [
          { status: 'added', filename: 'src/main.ts' },
          { status: 'removed', filename: 'src/old.ts' },
          { status: 'modified', filename: 'src/other.ts' },
        ],
      });

      const response = await new GitHubDiff(github).diff({
        ...params,
        pullChangedFiles: 3,
        pullNumber: 123,
      });

      assert.deepStrictEqual(response, ['src/main.ts', 'src/other.ts']);
      assert.deepStrictEqual(calls.compareFiles, [
        { base: 'master', head: 'feature', owner: 'owner', repo: 'repo' },
      ]);
      assert.deepStrictEqual(calls.pullFiles, [
        { owner: 'owner', repo: 'repo', pull_number: 123, per_page: 100 },
      ]);
    });

    it('includes removed files from truncated pull request fallback when requested', async () => {
      const { github } = fakeGithub({
        compareFiles: [{ status: 'added', filename: 'src/main.ts' }],
        pullFiles: [
          { status: 'added', filename: 'src/main.ts' },
          { status: 'removed', filename: 'src/old.ts' },
        ],
      });

      const response = await new GitHubDiff(github).diff({
        ...params,
        includeRemoved: true,
        pullChangedFiles: 2,
        pullNumber: 123,
      });

      assert.deepStrictEqual(response, ['src/main.ts', 'src/old.ts']);
    });

    it('falls back to pull request files when changed file count is unavailable and compare may be truncated', async () => {
      const compareFiles = Array.from({ length: 300 }, (_, index) => ({
        status: 'added',
        filename: `src/file-${index}.ts`,
      }));
      const { calls, github } = fakeGithub({
        compareFiles,
        pullFiles: [
          { status: 'added', filename: 'src/main.ts' },
          { status: 'removed', filename: 'src/old.ts' },
          { status: 'modified', filename: 'src/other.ts' },
        ],
      });

      const response = await new GitHubDiff(github).diff({
        ...params,
        pullNumber: 123,
      });

      assert.deepStrictEqual(response, ['src/main.ts', 'src/other.ts']);
      assert.deepStrictEqual(calls.pullFiles, [
        { owner: 'owner', repo: 'repo', pull_number: 123, per_page: 100 },
      ]);
    });

    it('falls back to commit files when compare output may be truncated without a pull request', async () => {
      const compareFiles = Array.from({ length: 300 }, (_, index) => ({
        status: 'added',
        filename: `src/file-${index}.ts`,
      }));
      const { calls, github } = fakeGithub({
        compareFiles,
        compareCommitPages: [[{ sha: 'first' }, { sha: 'second' }], [{ sha: 'third' }]],
        commitPagesByRef: {
          first: [[{ status: 'added', filename: 'src/first.ts' }]],
          second: [[{ status: 'removed', filename: 'src/temporary.ts' }]],
          third: [[{ status: 'modified', filename: 'src/third.ts' }]],
        },
      });

      const response = await new GitHubDiff(github).diff(params);

      assert.deepStrictEqual(response, ['src/first.ts', 'src/third.ts']);
      assert.deepStrictEqual(calls.compareCommits, [
        { base: 'master', head: 'feature', owner: 'owner', repo: 'repo', per_page: 100 },
      ]);
      assert.deepStrictEqual(calls.commitFiles, [
        { owner: 'owner', repo: 'repo', ref: 'first', per_page: 100 },
        { owner: 'owner', repo: 'repo', ref: 'second', per_page: 100 },
        { owner: 'owner', repo: 'repo', ref: 'third', per_page: 100 },
      ]);
    });

    it('falls back to pull request files when compare fails', async () => {
      const { calls, github } = fakeGithub({
        compareError: new Error('not found'),
        pullFiles: [
          { status: 'added', filename: 'src/main.ts' },
          { status: 'removed', filename: 'src/old.ts' },
        ],
      });

      const response = await new GitHubDiff(github).diff({
        ...params,
        pullNumber: 123,
      });

      assert.deepStrictEqual(response, ['src/main.ts']);
      assert.deepStrictEqual(calls.compareFiles, [
        { base: 'master', head: 'feature', owner: 'owner', repo: 'repo' },
      ]);
      assert.deepStrictEqual(calls.pullFiles, [
        { owner: 'owner', repo: 'repo', pull_number: 123, per_page: 100 },
      ]);
    });

    it.each([
      ['matches', 1, 1],
      ['is larger than', 2, 1],
      ['is empty with', 0, 0],
    ])(
      'keeps compare files when their count %s the known pull request count',
      async (_description, compareCount, pullChangedFiles) => {
        const compareFiles = Array.from({ length: compareCount }, (_, index) => ({
          filename: `src/file-${index}.ts`,
          status: 'modified',
        }));
        const { calls, github } = fakeGithub({
          compareFiles,
          pullFiles: [{ filename: 'unexpected.ts', status: 'added' }],
        });

        const response = await new GitHubDiff(github).diff({
          ...params,
          pullChangedFiles,
          pullNumber: 123,
        });

        assert.deepStrictEqual(
          response,
          compareFiles.map((file) => file.filename),
        );
        assert.deepStrictEqual(calls.pullFiles, []);
      },
    );

    it('keeps 299 compare files when the pull request count is unavailable', async () => {
      const compareFiles = Array.from({ length: 299 }, (_, index) => ({
        filename: `src/file-${index}.ts`,
        status: 'modified',
      }));
      const { calls, github } = fakeGithub({ compareFiles });

      const response = await new GitHubDiff(github).diff({ ...params, pullNumber: 123 });

      assert.strictEqual(response.length, 299);
      assert.deepStrictEqual(calls.pullFiles, []);
    });

    it('keeps fallback compare files when paginated commits have no usable SHAs', async () => {
      const compareFiles = Array.from({ length: 300 }, (_, index) => ({
        filename: `src/file-${index}.ts`,
        status: index === 299 ? 'removed' : 'modified',
      }));
      const { calls, github } = fakeGithub({
        compareCommitPages: [[{}, {}]],
        compareFiles,
      });

      const response = await new GitHubDiff(github).diff(params);

      assert.strictEqual(response.length, 299);
      assert.deepStrictEqual(calls.commitFiles, []);
    });

    it('keeps fallback compare files when commit-list pagination fails', async () => {
      const compareFiles = Array.from({ length: 300 }, (_, index) => ({
        filename: `src/file-${index}.ts`,
        status: 'modified',
      }));
      const { github } = fakeGithub({
        compareCommitError: new Error('commit list failed'),
        compareFiles,
      });

      const response = await new GitHubDiff(github).diff(params);

      assert.strictEqual(response.length, 300);
    });

    it('keeps fallback compare files when commit-file pagination fails', async () => {
      const compareFiles = Array.from({ length: 300 }, (_, index) => ({
        filename: `src/file-${index}.ts`,
        status: 'modified',
      }));
      const { github } = fakeGithub({
        commitError: new Error('commit files failed'),
        compareCommitPages: [[{ sha: 'first' }]],
        compareFiles,
      });

      const response = await new GitHubDiff(github).diff(params);

      assert.strictEqual(response.length, 300);
    });

    it('propagates a pull-files fallback failure without retrying it', async () => {
      const { calls, github } = fakeGithub({
        compareFiles: [{ filename: 'partial.ts', status: 'modified' }],
        pullError: new Error('pull files failed'),
      });

      await expect(
        new GitHubDiff(github).diff({
          ...params,
          pullChangedFiles: 2,
          pullNumber: 123,
        }),
      ).rejects.toThrow('pull files failed');
      assert.strictEqual(calls.pullFiles.length, 1);
    });

    it('deduplicates pushed commit refs and ignores entries without filenames', async () => {
      const { calls, github } = fakeGithub({
        commitPagesByRef: {
          first: [
            [
              { filename: 'src/known.ts' },
              { status: 'modified' },
              { filename: 'src/unrecognized.ts', status: 'unexpected' },
            ],
          ],
        },
      });

      const response = await new GitHubDiff(github).diff({
        ...params,
        commitRefs: ['first', 'first'],
      });

      assert.deepStrictEqual(response, ['src/known.ts', 'src/unrecognized.ts']);
      assert.strictEqual(calls.commitFiles.length, 1);
    });

    it.each([
      [
        'add then remove',
        [[{ filename: 'file.ts', status: 'added' }], [{ filename: 'file.ts', status: 'removed' }]],
        [],
      ],
      [
        'remove then recreate',
        [[{ filename: 'file.ts', status: 'removed' }], [{ filename: 'file.ts', status: 'added' }]],
        ['file.ts'],
      ],
      [
        'rename then remove',
        [
          [
            {
              filename: 'new.ts',
              previous_filename: 'old.ts',
              status: 'renamed',
            },
          ],
          [{ filename: 'new.ts', status: 'removed' }],
        ],
        [],
      ],
    ] satisfies Array<[string, Array<Array<ChangedFile>>, Array<string>]>)(
      'applies last-state semantics for %s',
      async (_description, pages, expected) => {
        const { github } = fakeGithub({
          commitPagesByRef: { first: [pages[0] ?? []], second: [pages[1] ?? []] },
        });

        const response = await new GitHubDiff(github).diff({
          ...params,
          commitRefs: ['first', 'second'],
        });

        assert.deepStrictEqual(response, expected);
      },
    );
  });
  describe('sets', () => {
    it('returns a map of filtered files based on simple patterns', () => {
      const result = sets({ md_files: '**/*.md' }, ['foo/bar.md', 'baz.md', 'foo.js']);
      assert.deepStrictEqual(result, {
        md_files: ['foo/bar.md', 'baz.md'],
      });
    });
    it("returns no map entries for files that don't match", () => {
      const result = sets({ rust_files: '**/*.rs' }, ['foo/bar.md', 'baz.md', 'foo.js']);
      assert.deepStrictEqual(result, {});
    });
    it('returns a map of filtered files based on multi-line patterns', () => {
      const result = sets({ jvm_files: '**/*.java\n**/*.scala' }, [
        'src/main/java/com/foo/Bar.java',
        'src/main/scala/com/foo/Baz.scala',
      ]);
      assert.deepStrictEqual(result, {
        jvm_files: ['src/main/java/com/foo/Bar.java', 'src/main/scala/com/foo/Baz.scala'],
      });
    });
    it('ignores blank patterns and deduplicates matches', () => {
      const result = sets({ ts_files: '**/*.ts\n\n src/**/*.ts ' }, [
        'src/main.ts',
        'src/util.ts',
        'README.md',
      ]);
      assert.deepStrictEqual(result, {
        ts_files: ['src/main.ts', 'src/util.ts'],
      });
    });
    it('applies negated patterns as ordered excludes', () => {
      const result = sets({ ts_files: '**/*.ts\n!**/*.test.ts' }, [
        'src/main.ts',
        'src/main.test.ts',
        'README.md',
      ]);
      assert.deepStrictEqual(result, {
        ts_files: ['src/main.ts'],
      });
    });
    it('returns no matches for negation-only patterns', () => {
      const result = sets({ ts_files: '!**/*.test.ts' }, [
        'src/main.ts',
        'src/main.test.ts',
        'README.md',
      ]);
      assert.deepStrictEqual(result, {});
    });
    it('allows later patterns to re-include excluded files', () => {
      const result = sets({ ts_files: '**/*.ts\n!**/*.test.ts\nsrc/main.test.ts' }, [
        'src/main.test.ts',
        'src/main.ts',
        'README.md',
      ]);
      assert.deepStrictEqual(result, {
        ts_files: ['src/main.test.ts', 'src/main.ts'],
      });
    });

    it('handles CRLF, whitespace, duplicate paths, spaces, Unicode, and independent filters', () => {
      const result = sets(
        {
          docs_files: ' **/*.md\r\n!docs/private/**\r\ndocs/private/公開.md ',
          dotfiles: '**/.*/**',
        },
        [
          'docs/guide with space.md',
          'docs/private/secret.md',
          'docs/private/公開.md',
          '.github/workflows/main.yml',
          'docs/guide with space.md',
        ],
      );

      assert.deepStrictEqual(result, {
        docs_files: ['docs/guide with space.md', 'docs/private/公開.md'],
        dotfiles: ['.github/workflows/main.yml'],
      });
    });

    it('returns no named sets for empty filters or empty file lists', () => {
      assert.deepStrictEqual(sets({}, ['README.md']), {});
      assert.deepStrictEqual(sets({ md_files: '**/*.md' }, []), {});
    });

    it('ignores a standalone negation marker', () => {
      assert.deepStrictEqual(sets({ md_files: '!\n**/*.md' }, ['README.md']), {
        md_files: ['README.md'],
      });
    });
  });
});
