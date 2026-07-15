import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { intoParams, parseConfig } from '../src/util';

import { assert, describe, expect, it } from 'vitest';

const githubEnv = {
  GITHUB_REF: 'refs/heads/feature',
  GITHUB_REPOSITORY: 'softprops/diffset',
  GITHUB_SHA: 'b04376c43f66b8beed87abe6e28504781a4e461d',
};

const withEventContents = <T>(contents: string, callback: (eventPath: string) => T): T => {
  const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
  const eventPath = join(eventDir, 'event.json');
  writeFileSync(eventPath, contents);
  try {
    return callback(eventPath);
  } finally {
    rmSync(eventDir, { force: true, recursive: true });
  }
};

const withEvent = <T>(payload: unknown, callback: (eventPath: string) => T): T =>
  withEventContents(JSON.stringify(payload), callback);

const BeforeSha = '1111111111111111111111111111111111111111';
const AfterSha = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const ZeroSha = '0000000000000000000000000000000000000000';

const pushCommits = (count: number): Array<{ id: string }> =>
  Array.from({ length: count }, (_, index) => ({
    id: (index + 1).toString(16).padStart(40, '0'),
  }));

const CappedPushCommits = pushCommits(2_048);
const CappedPushCommitRefs = CappedPushCommits.map((commit) => commit.id);

const pushParams = (
  payload: Record<string, unknown>,
  envOverrides: Record<string, string | undefined> = {},
) =>
  withEvent({ repository: { default_branch: 'main' }, ...payload }, (eventPath) =>
    intoParams(
      parseConfig({
        ...githubEnv,
        GITHUB_EVENT_NAME: 'push',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: AfterSha,
        ...envOverrides,
      }),
    ),
  );

const pushSelection = (params: ReturnType<typeof pushParams>) => ({
  base: params.base,
  ...(params.commitRefs == undefined ? {} : { commitRefs: params.commitRefs }),
  head: params.head,
});

describe('util', () => {
  describe('infoParams', () => {
    it('transforms a config into diff params for heads', () => {
      assert.deepStrictEqual(
        intoParams({
          githubToken: 'aeiou',
          githubRef: 'refs/heads/branch',
          githubRepository: 'owner/repo',
          fileFilters: {},
          sha: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        }),
        {
          base: 'master',
          head: 'branch',
          owner: 'owner',
          repo: 'repo',
          ref: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        },
      );
    });
    it('includes pull request number when no custom base is configured', () => {
      assert.deepStrictEqual(
        intoParams({
          defaultBranch: 'trunk',
          githubToken: 'aeiou',
          githubRef: 'refs/pull/123/merge',
          githubRepository: 'owner/repo',
          fileFilters: {},
          pullBase: 'main',
          pullChangedFiles: 2,
          pullHead: 'fork:branch',
          pullNumber: 123,
          sha: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        }),
        {
          base: 'main',
          head: 'fork:branch',
          owner: 'owner',
          pullChangedFiles: 2,
          pullNumber: 123,
          repo: 'repo',
          ref: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        },
      );
    });
    it('includes removed files when configured', () => {
      assert.deepStrictEqual(
        intoParams({
          githubToken: 'aeiou',
          githubRef: 'refs/heads/branch',
          githubRepository: 'owner/repo',
          fileFilters: {},
          includeRemoved: true,
          sha: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        }),
        {
          base: 'master',
          head: 'branch',
          includeRemoved: true,
          owner: 'owner',
          repo: 'repo',
          ref: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        },
      );
    });
    it('includes pull request number when it is configured', () => {
      assert.deepStrictEqual(
        intoParams({
          defaultBranch: 'main',
          githubToken: 'aeiou',
          githubRef: 'refs/pull/123/merge',
          githubRepository: 'owner/repo',
          base: 'develop',
          fileFilters: {},
          pullChangedFiles: 2,
          pullHead: 'contributor:feature',
          pullNumber: 123,
          sha: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        }),
        {
          base: 'develop',
          head: 'contributor:feature',
          owner: 'owner',
          pullChangedFiles: 2,
          pullNumber: 123,
          repo: 'repo',
          ref: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        },
      );
    });
    it('includes pushed commit refs when configured', () => {
      assert.deepStrictEqual(
        intoParams({
          defaultBranch: 'main',
          githubToken: 'aeiou',
          githubRef: 'refs/heads/main',
          githubRepository: 'owner/repo',
          fileFilters: {},
          pushCommitRefs: ['1111111', '2222222'],
          sha: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        }),
        {
          base: 'main',
          commitRefs: ['1111111', '2222222'],
          head: 'main',
          owner: 'owner',
          repo: 'repo',
          ref: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        },
      );
    });
  });
  describe('parseConfig', () => {
    it('parses configuration from env', () => {
      assert.deepStrictEqual(
        parseConfig({
          GITHUB_REF: 'head/refs/test',
          GITHUB_REPOSITORY: 'softprops/diffset',
          GITHUB_SHA: 'b04376c43f66b8beed87abe6e28504781a4e461d',
          INPUT_TOKEN: 'aeiou',
          INPUT_FOO_FILES: '*.foo',
          INPUT_INCLUDE_REMOVED: 'true',
          INPUT_BAR: 'ignored',
        }),
        {
          githubRef: 'head/refs/test',
          githubRepository: 'softprops/diffset',
          githubToken: 'aeiou',
          fileFilters: {
            foo_files: '*.foo',
          },
          includeRemoved: true,
          sha: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        },
      );
    });
    it('parses configuration from env including custom base', () => {
      assert.deepStrictEqual(
        parseConfig({
          GITHUB_REF: 'head/refs/test',
          GITHUB_REPOSITORY: 'softprops/diffset',
          GITHUB_SHA: 'b04376c43f66b8beed87abe6e28504781a4e461d',
          INPUT_TOKEN: 'aeiou',
          INPUT_FOO_FILES: '*.foo',
          INPUT_BASE: 'develop',
          INPUT_BAR: 'ignored',
        }),
        {
          githubRef: 'head/refs/test',
          githubRepository: 'softprops/diffset',
          githubToken: 'aeiou',
          base: 'develop',
          fileFilters: {
            foo_files: '*.foo',
          },
          sha: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        },
      );
    });
    it('uses repository default branch from the event payload', () => {
      const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
      const eventPath = join(eventDir, 'event.json');
      writeFileSync(eventPath, JSON.stringify({ repository: { default_branch: 'main' } }));

      try {
        const config = parseConfig({
          GITHUB_EVENT_NAME: 'push',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REF: 'refs/heads/feature',
          GITHUB_REPOSITORY: 'softprops/diffset',
          GITHUB_SHA: 'b04376c43f66b8beed87abe6e28504781a4e461d',
          INPUT_TOKEN: 'aeiou',
        });

        assert.deepStrictEqual(config, {
          githubRef: 'refs/heads/feature',
          githubRepository: 'softprops/diffset',
          githubToken: 'aeiou',
          defaultBranch: 'main',
          fileFilters: {},
          sha: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        });
        assert.deepStrictEqual(intoParams(config), {
          base: 'main',
          head: 'feature',
          owner: 'softprops',
          repo: 'diffset',
          ref: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        });
      } finally {
        rmSync(eventDir, { force: true, recursive: true });
      }
    });
    it('prefers custom base over repository default branch', () => {
      const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
      const eventPath = join(eventDir, 'event.json');
      writeFileSync(eventPath, JSON.stringify({ repository: { default_branch: 'main' } }));

      try {
        const config = parseConfig({
          GITHUB_EVENT_NAME: 'push',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REF: 'refs/heads/feature',
          GITHUB_REPOSITORY: 'softprops/diffset',
          GITHUB_SHA: 'b04376c43f66b8beed87abe6e28504781a4e461d',
          INPUT_BASE: 'develop',
          INPUT_TOKEN: 'aeiou',
        });

        assert.strictEqual(config.base, 'develop');
        assert.strictEqual(config.defaultBranch, 'main');
        assert.strictEqual(intoParams(config).base, 'develop');
      } finally {
        rmSync(eventDir, { force: true, recursive: true });
      }
    });
    it('uses pushed commit refs for default branch pushes', () => {
      const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
      const eventPath = join(eventDir, 'event.json');
      writeFileSync(
        eventPath,
        JSON.stringify({
          commits: [
            { id: '1111111111111111111111111111111111111111' },
            { id: '2222222222222222222222222222222222222222' },
          ],
          repository: { default_branch: 'main' },
        }),
      );

      try {
        const config = parseConfig({
          GITHUB_EVENT_NAME: 'push',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'softprops/diffset',
          GITHUB_SHA: 'b04376c43f66b8beed87abe6e28504781a4e461d',
          INPUT_TOKEN: 'aeiou',
        });

        assert.deepStrictEqual(config.pushCommitRefs, [
          '1111111111111111111111111111111111111111',
          '2222222222222222222222222222222222222222',
        ]);
        assert.deepStrictEqual(intoParams(config), {
          base: 'main',
          commitRefs: [
            '1111111111111111111111111111111111111111',
            '2222222222222222222222222222222222222222',
          ],
          head: 'main',
          owner: 'softprops',
          repo: 'diffset',
          ref: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        });
      } finally {
        rmSync(eventDir, { force: true, recursive: true });
      }
    });
    it('uses push before and after when commit refs are unavailable', () => {
      const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
      const eventPath = join(eventDir, 'event.json');
      writeFileSync(
        eventPath,
        JSON.stringify({
          before: '1111111111111111111111111111111111111111',
          after: '2222222222222222222222222222222222222222',
          repository: { default_branch: 'main' },
        }),
      );

      try {
        const config = parseConfig({
          GITHUB_EVENT_NAME: 'push',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'softprops/diffset',
          GITHUB_SHA: '2222222222222222222222222222222222222222',
          INPUT_TOKEN: 'aeiou',
        });

        assert.deepStrictEqual(intoParams(config), {
          base: '1111111111111111111111111111111111111111',
          head: '2222222222222222222222222222222222222222',
          owner: 'softprops',
          repo: 'diffset',
          ref: '2222222222222222222222222222222222222222',
        });
      } finally {
        rmSync(eventDir, { force: true, recursive: true });
      }
    });
    it('ignores pushed commit refs when custom base is configured', () => {
      const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
      const eventPath = join(eventDir, 'event.json');
      writeFileSync(
        eventPath,
        JSON.stringify({
          commits: [{ id: '1111111111111111111111111111111111111111' }],
          repository: { default_branch: 'main' },
        }),
      );

      try {
        const config = parseConfig({
          GITHUB_EVENT_NAME: 'push',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REF: 'refs/heads/main',
          GITHUB_REPOSITORY: 'softprops/diffset',
          GITHUB_SHA: 'b04376c43f66b8beed87abe6e28504781a4e461d',
          INPUT_BASE: 'develop',
          INPUT_TOKEN: 'aeiou',
        });

        assert.strictEqual(config.pushCommitRefs, undefined);
        assert.strictEqual(intoParams(config).base, 'develop');
      } finally {
        rmSync(eventDir, { force: true, recursive: true });
      }
    });
    it('ignores pushed commit refs for non-default branch pushes', () => {
      const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
      const eventPath = join(eventDir, 'event.json');
      writeFileSync(
        eventPath,
        JSON.stringify({
          commits: [{ id: '1111111111111111111111111111111111111111' }],
          repository: { default_branch: 'main' },
        }),
      );

      try {
        const config = parseConfig({
          GITHUB_EVENT_NAME: 'push',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REF: 'refs/heads/feature',
          GITHUB_REPOSITORY: 'softprops/diffset',
          GITHUB_SHA: 'b04376c43f66b8beed87abe6e28504781a4e461d',
          INPUT_TOKEN: 'aeiou',
        });

        assert.strictEqual(config.pushCommitRefs, undefined);
      } finally {
        rmSync(eventDir, { force: true, recursive: true });
      }
    });
    it('parses pull request number from the GitHub event payload', () => {
      const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
      const eventPath = join(eventDir, 'event.json');
      writeFileSync(
        eventPath,
        JSON.stringify({
          repository: { default_branch: 'trunk' },
          pull_request: {
            base: {
              ref: 'main',
              repo: { full_name: 'softprops/diffset' },
            },
            head: {
              label: 'contributor:feature',
              ref: 'feature',
              repo: { full_name: 'contributor/diffset' },
            },
            changed_files: 2,
            number: 123,
          },
        }),
      );

      try {
        assert.deepStrictEqual(
          parseConfig({
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_REF: 'refs/pull/123/merge',
            GITHUB_REPOSITORY: 'softprops/diffset',
            GITHUB_SHA: 'b04376c43f66b8beed87abe6e28504781a4e461d',
            INPUT_TOKEN: 'aeiou',
            INPUT_FOO_FILES: '*.foo',
          }),
          {
            githubRef: 'refs/pull/123/merge',
            githubRepository: 'softprops/diffset',
            githubToken: 'aeiou',
            defaultBranch: 'trunk',
            fileFilters: {
              foo_files: '*.foo',
            },
            pullBase: 'main',
            pullChangedFiles: 2,
            pullHead: 'contributor:feature',
            pullNumber: 123,
            sha: 'b04376c43f66b8beed87abe6e28504781a4e461d',
          },
        );
      } finally {
        rmSync(eventDir, { force: true, recursive: true });
      }
    });
    it('keeps pull request number when custom base matches pull request base', () => {
      const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
      const eventPath = join(eventDir, 'event.json');
      writeFileSync(
        eventPath,
        JSON.stringify({
          pull_request: {
            base: {
              ref: 'main',
              repo: { full_name: 'softprops/diffset' },
            },
            head: {
              label: 'contributor:feature',
              ref: 'feature',
              repo: { full_name: 'contributor/diffset' },
            },
            changed_files: 2,
            number: 123,
          },
        }),
      );

      try {
        const config = parseConfig({
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_REF: 'refs/pull/123/merge',
          GITHUB_REPOSITORY: 'softprops/diffset',
          GITHUB_SHA: 'b04376c43f66b8beed87abe6e28504781a4e461d',
          INPUT_TOKEN: 'aeiou',
          INPUT_BASE: 'main',
        });

        assert.deepStrictEqual(config, {
          githubRef: 'refs/pull/123/merge',
          githubRepository: 'softprops/diffset',
          githubToken: 'aeiou',
          base: 'main',
          fileFilters: {},
          pullChangedFiles: 2,
          pullHead: 'contributor:feature',
          pullNumber: 123,
          sha: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        });
        assert.deepStrictEqual(intoParams(config), {
          base: 'main',
          head: 'contributor:feature',
          owner: 'softprops',
          pullChangedFiles: 2,
          pullNumber: 123,
          repo: 'diffset',
          ref: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        });
      } finally {
        rmSync(eventDir, { force: true, recursive: true });
      }
    });
    it('ignores pull request number when custom base differs from pull request base', () => {
      const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
      const eventPath = join(eventDir, 'event.json');
      writeFileSync(
        eventPath,
        JSON.stringify({
          pull_request: {
            base: {
              ref: 'main',
              repo: { full_name: 'softprops/diffset' },
            },
            head: {
              label: 'contributor:feature',
              ref: 'feature',
              repo: { full_name: 'contributor/diffset' },
            },
            number: 123,
          },
        }),
      );

      try {
        assert.deepStrictEqual(
          parseConfig({
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_REF: 'refs/pull/123/merge',
            GITHUB_REPOSITORY: 'softprops/diffset',
            GITHUB_SHA: 'b04376c43f66b8beed87abe6e28504781a4e461d',
            INPUT_TOKEN: 'aeiou',
            INPUT_BASE: 'develop',
          }),
          {
            githubRef: 'refs/pull/123/merge',
            githubRepository: 'softprops/diffset',
            githubToken: 'aeiou',
            base: 'develop',
            fileFilters: {},
            pullHead: 'contributor:feature',
            sha: 'b04376c43f66b8beed87abe6e28504781a4e461d',
          },
        );
      } finally {
        rmSync(eventDir, { force: true, recursive: true });
      }
    });

    it.each([
      [undefined, 'Missing required GitHub context: GITHUB_REPOSITORY'],
      ['', 'Missing required GitHub context: GITHUB_REPOSITORY'],
      ['owner', 'Invalid GITHUB_REPOSITORY: expected "owner/repo"'],
      ['/repo', 'Invalid GITHUB_REPOSITORY: expected "owner/repo"'],
      ['owner/', 'Invalid GITHUB_REPOSITORY: expected "owner/repo"'],
      ['owner/repo/extra', 'Invalid GITHUB_REPOSITORY: expected "owner/repo"'],
    ])('rejects invalid repository context %s', (repository, message) => {
      expect(() => parseConfig({ ...githubEnv, GITHUB_REPOSITORY: repository })).toThrow(message);
    });

    it('rejects missing ref and SHA context independently', () => {
      expect(() =>
        parseConfig({
          GITHUB_REPOSITORY: 'softprops/diffset',
          GITHUB_SHA: githubEnv.GITHUB_SHA,
        }),
      ).toThrow('Missing required GitHub context: GITHUB_HEAD_REF or GITHUB_REF');
      expect(() =>
        parseConfig({
          GITHUB_REF: githubEnv.GITHUB_REF,
          GITHUB_REPOSITORY: 'softprops/diffset',
        }),
      ).toThrow('Missing required GitHub context: GITHUB_SHA');
    });

    it('trims required context and tag refs before producing API parameters', () => {
      const config = parseConfig({
        GITHUB_REF: ' refs/tags/v4.0.0 ',
        GITHUB_REPOSITORY: ' softprops/diffset ',
        GITHUB_SHA: ` ${githubEnv.GITHUB_SHA} `,
      });

      assert.deepStrictEqual(intoParams(config), {
        base: 'master',
        head: 'v4.0.0',
        owner: 'softprops',
        repo: 'diffset',
        ref: githubEnv.GITHUB_SHA,
      });
    });

    it('reports unreadable and invalid event payloads precisely', () => {
      expect(() =>
        parseConfig({ ...githubEnv, GITHUB_EVENT_PATH: '/missing/diffset-event.json' }),
      ).toThrow('Unable to read GitHub event payload from GITHUB_EVENT_PATH');
      withEventContents('{invalid', (eventPath) => {
        expect(() => parseConfig({ ...githubEnv, GITHUB_EVENT_PATH: eventPath })).toThrow(
          'Invalid JSON in GitHub event payload from GITHUB_EVENT_PATH',
        );
      });
      withEvent([], (eventPath) => {
        expect(() => parseConfig({ ...githubEnv, GITHUB_EVENT_PATH: eventPath })).toThrow(
          'GitHub event payload must be a JSON object',
        );
      });
    });

    it.each([
      {
        expected: { base: 'main', commitRefs: [BeforeSha, AfterSha], head: 'main' },
        name: 'uses valid commit refs below the payload cap when size is absent',
        payload: {
          after: AfterSha,
          before: BeforeSha,
          commits: [{ id: BeforeSha }, { id: AfterSha }],
        },
      },
      {
        expected: { base: BeforeSha, head: AfterSha },
        name: 'uses the push range at the payload cap when size is absent',
        payload: { after: AfterSha, before: BeforeSha, commits: CappedPushCommits },
      },
      {
        expected: { base: 'main', commitRefs: CappedPushCommitRefs, head: 'main' },
        name: 'retains capped commit refs for a new-ref push',
        payload: { after: AfterSha, before: ZeroSha, commits: CappedPushCommits },
      },
      {
        expected: { base: BeforeSha, head: AfterSha },
        name: 'uses the range when a raw commit entry has no usable ID',
        payload: {
          after: AfterSha,
          before: BeforeSha,
          commits: [{ id: BeforeSha }, {}, { id: AfterSha }],
        },
      },
      {
        expected: { base: BeforeSha, head: AfterSha },
        name: 'uses the range when size exceeds the raw commit count',
        payload: { after: AfterSha, before: BeforeSha, commits: [{ id: BeforeSha }], size: 2 },
      },
      {
        expected: { base: 'main', commitRefs: [BeforeSha, AfterSha], head: 'main' },
        name: 'uses commit refs when size matches a valid list below the cap',
        payload: {
          after: AfterSha,
          before: BeforeSha,
          commits: [{ id: BeforeSha }, { id: AfterSha }],
          size: 2,
        },
      },
      {
        expected: { base: BeforeSha, head: AfterSha },
        name: 'uses the range for an empty commit list',
        payload: { after: AfterSha, before: BeforeSha, commits: [] },
      },
      {
        expected: { base: 'main', head: 'main' },
        name: 'keeps same-ref behavior for an empty new-ref push',
        payload: { after: AfterSha, before: ZeroSha, commits: [] },
      },
      {
        env: { INPUT_BASE: 'develop' },
        expected: { base: 'develop', head: 'main' },
        name: 'lets a custom base bypass push range selection',
        payload: { after: AfterSha, before: BeforeSha, commits: CappedPushCommits },
      },
      {
        env: { GITHUB_REF: 'refs/heads/feature' },
        expected: { base: 'main', head: 'feature' },
        name: 'lets a non-default branch bypass push range selection',
        payload: { after: AfterSha, before: BeforeSha, commits: CappedPushCommits },
      },
    ])('$name', ({ env, expected, payload }) => {
      assert.deepStrictEqual(pushSelection(pushParams(payload, env)), expected);
    });

    it('supports pull_request_target and a top-level pull request number', () => {
      withEvent({ number: 123, repository: { default_branch: 'main' } }, (eventPath) => {
        const config = parseConfig({
          ...githubEnv,
          GITHUB_EVENT_NAME: 'pull_request_target',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_HEAD_REF: 'feature',
          GITHUB_REF: 'refs/heads/main',
        });

        assert.deepStrictEqual(intoParams(config), {
          base: 'main',
          head: 'feature',
          owner: 'softprops',
          pullNumber: 123,
          repo: 'diffset',
          ref: githubEnv.GITHUB_SHA,
        });
      });
    });

    it('uses a same-repository pull request branch instead of its owner label', () => {
      withEvent(
        {
          pull_request: {
            base: { ref: 'main', repo: { full_name: 'softprops/diffset' } },
            head: {
              label: 'softprops:feature',
              ref: 'feature',
              repo: { full_name: 'softprops/diffset' },
            },
            number: 123,
          },
        },
        (eventPath) => {
          const config = parseConfig({
            ...githubEnv,
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_REF: 'refs/pull/123/merge',
          });

          assert.deepStrictEqual(intoParams(config), {
            base: 'main',
            head: 'feature',
            owner: 'softprops',
            pullNumber: 123,
            repo: 'diffset',
            ref: githubEnv.GITHUB_SHA,
          });
        },
      );
    });

    it('ignores malformed optional pull request reference objects', () => {
      withEvent(
        {
          repository: { default_branch: 'main' },
          pull_request: { base: 'main', head: [], number: 123 },
        },
        (eventPath) => {
          const config = parseConfig({
            ...githubEnv,
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_HEAD_REF: 'feature',
            GITHUB_REF: 'refs/pull/123/merge',
          });

          assert.deepStrictEqual(intoParams(config), {
            base: 'main',
            head: 'feature',
            owner: 'softprops',
            pullNumber: 123,
            repo: 'diffset',
            ref: githubEnv.GITHUB_SHA,
          });
        },
      );
    });
  });
});
