import { GitHubDiff, Params, sets } from '../src/diff';

import { assert, describe, it } from 'vitest';

const params: Params = {
  base: 'master',
  head: 'feature',
  owner: 'owner',
  repo: 'repo',
  ref: 'abc123',
};

const fakeGithub = ({
  commitFiles = [],
  compareError,
  compareFiles = [],
  pullFiles = [],
}: {
  commitFiles?: Array<{ filename?: string; status?: string }>;
  compareError?: Error;
  compareFiles?: Array<{ filename?: string; status?: string }>;
  pullFiles?: Array<{ filename?: string; status?: string }>;
}) => {
  const calls: Record<string, unknown> = {};
  const listFiles = () => undefined;
  const github = {
    repos: {
      getCommit: async (request: unknown) => {
        calls.getCommit = request;
        return { data: { files: commitFiles } };
      },
      compareCommits: async (request: unknown) => {
        calls.compareCommits = request;
        if (compareError != undefined) {
          throw compareError;
        }
        return { data: { files: compareFiles } };
      },
    },
    pulls: {
      listFiles,
    },
    paginate: async (endpoint: unknown, request: unknown) => {
      calls.paginateEndpoint = endpoint;
      calls.paginate = request;
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

      const response = await new GitHubDiff(github as never).diff(params);

      assert.deepStrictEqual(response, ['added.txt', 'changed.txt']);
      assert.deepStrictEqual(calls.compareCommits, {
        ...params,
        ref: undefined,
      });
    });

    it('includes removed files when requested', async () => {
      const { github } = fakeGithub({
        compareFiles: [
          { status: 'added', filename: 'added.txt' },
          { status: 'removed', filename: 'removed.txt' },
        ],
      });

      const response = await new GitHubDiff(github as never).diff({
        ...params,
        includeRemoved: true,
      });

      assert.deepStrictEqual(response, ['added.txt', 'removed.txt']);
    });

    it('generates diff based on the commit api for same-ref pushes', async () => {
      const { calls, github } = fakeGithub({
        commitFiles: [
          { status: 'added', filename: 'added.txt' },
          { status: 'removed', filename: 'removed.txt' },
          { status: 'modified' },
        ],
      });
      const sameRefParams = { ...params, head: 'master' };

      const response = await new GitHubDiff(github as never).diff(sameRefParams);

      assert.deepStrictEqual(response, ['added.txt']);
      assert.deepStrictEqual(calls.getCommit, sameRefParams);
    });

    it('keeps pull request diffs on the compare api when it succeeds', async () => {
      const { calls, github } = fakeGithub({
        compareFiles: [
          { status: 'added', filename: 'src/main.ts' },
          { status: 'removed', filename: 'src/old.ts' },
        ],
      });

      const response = await new GitHubDiff(github as never).diff({
        ...params,
        base: 'main',
        head: 'fork:feature',
        pullNumber: 123,
      });

      assert.deepStrictEqual(response, ['src/main.ts']);
      assert.deepStrictEqual(calls.compareCommits, {
        ...params,
        base: 'main',
        head: 'fork:feature',
        ref: undefined,
      });
      assert.strictEqual(calls.paginate, undefined);
    });

    it('falls back to pull request files when compare fails', async () => {
      const { calls, github } = fakeGithub({
        compareError: new Error('not found'),
        pullFiles: [
          { status: 'added', filename: 'src/main.ts' },
          { status: 'removed', filename: 'src/old.ts' },
        ],
      });

      const response = await new GitHubDiff(github as never).diff({
        ...params,
        pullNumber: 123,
      });

      assert.deepStrictEqual(response, ['src/main.ts']);
      assert.deepStrictEqual(calls.compareCommits, {
        ...params,
        ref: undefined,
      });
      assert.strictEqual(calls.paginateEndpoint, github.pulls.listFiles);
      assert.deepStrictEqual(calls.paginate, {
        owner: 'owner',
        repo: 'repo',
        pull_number: 123,
      });
    });
  });
  describe('sets', () => {
    it('returns a map of filtered files based on simple patterns', () => {
      const result = sets({ md_files: '**/*.md' }, ['foo/bar.md', 'baz.md', 'foo.js']);
      assert.deepStrictEqual(result, {
        md_files: ['foo/bar.md', 'baz.md'],
      });
    });
    it("returns yields no map entries for files that don't match", () => {
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
  });
});
