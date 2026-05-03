import { GitHubDiff, Params, sets } from '../src/diff';

import { assert, describe, it } from 'vitest';

type TestFile = { filename?: string; status?: string };
type CommitResponse = { data: { files?: Array<TestFile> } };
type PaginateMap = (response: CommitResponse) => Array<TestFile>;

const params: Params = {
  base: 'master',
  head: 'feature',
  owner: 'owner',
  repo: 'repo',
  ref: 'abc123',
};

const fakeGithub = ({
  commitPages,
  commitFiles = [],
  compareError,
  compareFiles = [],
  pullFiles = [],
}: {
  commitPages?: Array<Array<TestFile>>;
  commitFiles?: Array<TestFile>;
  compareError?: Error;
  compareFiles?: Array<TestFile>;
  pullFiles?: Array<TestFile>;
}) => {
  const calls: Record<string, unknown> = {};
  const getCommit = async (request: unknown) => {
    calls.getCommit = request;
    return { data: { files: commitFiles } };
  };
  const compareCommits = async (request: unknown) => {
    calls.compareCommits = request;
    if (compareError != undefined) {
      throw compareError;
    }
    return { data: { files: compareFiles } };
  };
  const listFiles = () => undefined;
  const github = {
    repos: {
      getCommit,
      compareCommits,
    },
    pulls: {
      listFiles,
    },
    paginate: async (endpoint: unknown, request: unknown, map?: PaginateMap) => {
      calls.paginateEndpoint = endpoint;
      calls.paginate = request;
      if (endpoint === getCommit) {
        const pages = commitPages || [commitFiles];
        if (map != undefined) {
          return pages.flatMap((files) => map({ data: { files } }));
        }
        return pages.flat();
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

    it('uses provided changed files without calling the GitHub APIs', async () => {
      const { calls, github } = fakeGithub({});

      const response = await new GitHubDiff(github as never).diff({
        ...params,
        changedFiles: [
          { status: 'added', filename: 'from-event.txt' },
          { status: 'removed', filename: 'deleted.txt' },
        ],
      });

      assert.deepStrictEqual(response, ['from-event.txt']);
      assert.deepStrictEqual(calls, {});
    });

    it('includes removed provided changed files when requested', async () => {
      const { github } = fakeGithub({});

      const response = await new GitHubDiff(github as never).diff({
        ...params,
        includeRemoved: true,
        changedFiles: [
          { status: 'added', filename: 'from-event.txt' },
          { status: 'removed', filename: 'deleted.txt' },
        ],
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

      const response = await new GitHubDiff(github as never).diff(sameRefParams);

      assert.deepStrictEqual(response, ['added.txt', 'changed.txt']);
      assert.strictEqual(calls.getCommit, undefined);
      assert.strictEqual(calls.paginateEndpoint, github.repos.getCommit);
      assert.deepStrictEqual(calls.paginate, {
        owner: 'owner',
        repo: 'repo',
        ref: 'abc123',
        per_page: 100,
      });
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
        pullChangedFiles: 2,
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

    it('falls back to pull request files when compare output is truncated', async () => {
      const { calls, github } = fakeGithub({
        compareFiles: [{ status: 'added', filename: 'src/main.ts' }],
        pullFiles: [
          { status: 'added', filename: 'src/main.ts' },
          { status: 'removed', filename: 'src/old.ts' },
          { status: 'modified', filename: 'src/other.ts' },
        ],
      });

      const response = await new GitHubDiff(github as never).diff({
        ...params,
        pullChangedFiles: 3,
        pullNumber: 123,
      });

      assert.deepStrictEqual(response, ['src/main.ts', 'src/other.ts']);
      assert.deepStrictEqual(calls.compareCommits, {
        ...params,
        ref: undefined,
      });
      assert.strictEqual(calls.paginateEndpoint, github.pulls.listFiles);
      assert.deepStrictEqual(calls.paginate, {
        owner: 'owner',
        repo: 'repo',
        pull_number: 123,
        per_page: 100,
      });
    });

    it('includes removed files from truncated pull request fallback when requested', async () => {
      const { github } = fakeGithub({
        compareFiles: [{ status: 'added', filename: 'src/main.ts' }],
        pullFiles: [
          { status: 'added', filename: 'src/main.ts' },
          { status: 'removed', filename: 'src/old.ts' },
        ],
      });

      const response = await new GitHubDiff(github as never).diff({
        ...params,
        includeRemoved: true,
        pullChangedFiles: 2,
        pullNumber: 123,
      });

      assert.deepStrictEqual(response, ['src/main.ts', 'src/old.ts']);
    });

    it('does not infer truncation when pull request changed file count is unavailable', async () => {
      const compareFiles = Array.from({ length: 300 }, (_, index) => ({
        status: 'added',
        filename: `src/file-${index}.ts`,
      }));
      const { calls, github } = fakeGithub({ compareFiles });

      const response = await new GitHubDiff(github as never).diff({
        ...params,
        pullNumber: 123,
      });

      assert.deepStrictEqual(
        response,
        compareFiles.map((file) => file.filename),
      );
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
        per_page: 100,
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
