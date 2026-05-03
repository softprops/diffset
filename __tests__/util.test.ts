import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { intoParams, parseConfig } from '../src/util';

import { assert, describe, it } from 'vitest';

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
    it('omits pull request number when a custom base is configured', () => {
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
          repo: 'repo',
          ref: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        },
      );
    });
    it('includes push event files when configured', () => {
      assert.deepStrictEqual(
        intoParams({
          defaultBranch: 'main',
          githubToken: 'aeiou',
          githubRef: 'refs/heads/main',
          githubRepository: 'owner/repo',
          fileFilters: {},
          pushFiles: [
            { filename: 'added.txt', status: 'added' },
            { filename: 'removed.txt', status: 'removed' },
          ],
          sha: 'b04376c43f66b8beed87abe6e28504781a4e461d',
        }),
        {
          base: 'main',
          changedFiles: [
            { filename: 'added.txt', status: 'added' },
            { filename: 'removed.txt', status: 'removed' },
          ],
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
          base: undefined,
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
          base: undefined,
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
    it('uses push event commit files for default branch pushes', () => {
      const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
      const eventPath = join(eventDir, 'event.json');
      writeFileSync(
        eventPath,
        JSON.stringify({
          commits: [
            {
              added: ['first.txt', 'temporary.txt'],
              modified: ['changed.txt'],
              removed: ['old.txt'],
            },
            {
              added: ['second.txt'],
              modified: ['first.txt'],
              removed: ['temporary.txt'],
            },
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

        assert.deepStrictEqual(config.pushFiles, [
          { filename: 'first.txt', status: 'modified' },
          { filename: 'temporary.txt', status: 'removed' },
          { filename: 'changed.txt', status: 'modified' },
          { filename: 'old.txt', status: 'removed' },
          { filename: 'second.txt', status: 'added' },
        ]);
        assert.deepStrictEqual(intoParams(config), {
          base: 'main',
          changedFiles: [
            { filename: 'first.txt', status: 'modified' },
            { filename: 'temporary.txt', status: 'removed' },
            { filename: 'changed.txt', status: 'modified' },
            { filename: 'old.txt', status: 'removed' },
            { filename: 'second.txt', status: 'added' },
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
    it('ignores push event commit files when custom base is configured', () => {
      const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
      const eventPath = join(eventDir, 'event.json');
      writeFileSync(
        eventPath,
        JSON.stringify({
          commits: [{ added: ['first.txt'] }],
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

        assert.strictEqual(config.pushFiles, undefined);
        assert.strictEqual(intoParams(config).base, 'develop');
      } finally {
        rmSync(eventDir, { force: true, recursive: true });
      }
    });
    it('ignores push event commit files for non-default branch pushes', () => {
      const eventDir = mkdtempSync(join(tmpdir(), 'diffset-'));
      const eventPath = join(eventDir, 'event.json');
      writeFileSync(
        eventPath,
        JSON.stringify({
          commits: [{ added: ['first.txt'] }],
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

        assert.strictEqual(config.pushFiles, undefined);
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
            base: undefined,
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
    it('ignores pull request number when custom base is configured', () => {
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
  });
});
