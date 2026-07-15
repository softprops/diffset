import { Octokit } from '@octokit/rest';

import { OctokitGitHubClient } from '../src/github';

import { assert, describe, it, vi } from 'vitest';

describe('OctokitGitHubClient', () => {
  it('maps and paginates the GitHub endpoints used by diff calculation', async () => {
    const requests: Array<{ page: string | null; path: string; perPage: string | null }> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const page = url.searchParams.get('page');
      const perPage = url.searchParams.get('per_page');
      requests.push({ page, path: url.pathname, perPage });

      let body: unknown;
      if (url.pathname.endsWith('/commits/abc123')) {
        body = {
          files:
            page === '1'
              ? [
                  { filename: 'first.ts', status: 'added' },
                  { filename: 'second.ts', status: 'modified' },
                ]
              : [{ filename: 'third.ts', status: 'removed' }],
        };
      } else if (url.pathname.includes('/compare/')) {
        body =
          perPage == undefined
            ? { files: [{ filename: 'compare.ts', status: 'modified' }] }
            : {
                commits: page === '1' ? [{ sha: 'first' }, { sha: 'second' }] : [{ sha: 'third' }],
              };
      } else if (url.pathname.endsWith('/pulls/7/files')) {
        body =
          page === '1'
            ? [
                { filename: 'pull-first.ts', status: 'added' },
                { filename: 'pull-second.ts', status: 'modified' },
              ]
            : [{ filename: 'pull-third.ts', status: 'removed' }];
      } else {
        return new Response('not found', { status: 404 });
      }

      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    const github = new OctokitGitHubClient(new Octokit({ request: { fetch } }));

    const commitFiles = await github.commitFiles({
      owner: 'softprops',
      per_page: 2,
      ref: 'abc123',
      repo: 'diffset',
    });
    const compareCommits = await github.compareCommits({
      base: 'main',
      head: 'feature',
      owner: 'softprops',
      per_page: 2,
      repo: 'diffset',
    });
    const compareFiles = await github.compareFiles({
      base: 'main',
      head: 'feature',
      owner: 'softprops',
      repo: 'diffset',
    });
    const pullFiles = await github.pullFiles({
      owner: 'softprops',
      per_page: 2,
      pull_number: 7,
      repo: 'diffset',
    });

    assert.deepStrictEqual(
      commitFiles.map((file) => file.filename),
      ['first.ts', 'second.ts', 'third.ts'],
    );
    assert.deepStrictEqual(
      compareCommits.map((commit) => commit.sha),
      ['first', 'second', 'third'],
    );
    assert.deepStrictEqual(compareFiles, [{ filename: 'compare.ts', status: 'modified' }]);
    assert.deepStrictEqual(
      pullFiles.map((file) => file.filename),
      ['pull-first.ts', 'pull-second.ts', 'pull-third.ts'],
    );
    assert.deepStrictEqual(requests, [
      { page: '1', path: '/repos/softprops/diffset/commits/abc123', perPage: '2' },
      { page: '2', path: '/repos/softprops/diffset/commits/abc123', perPage: '2' },
      {
        page: '1',
        path: '/repos/softprops/diffset/compare/main...feature',
        perPage: '2',
      },
      {
        page: '2',
        path: '/repos/softprops/diffset/compare/main...feature',
        perPage: '2',
      },
      {
        page: null,
        path: '/repos/softprops/diffset/compare/main...feature',
        perPage: null,
      },
      { page: '1', path: '/repos/softprops/diffset/pulls/7/files', perPage: '2' },
      { page: '2', path: '/repos/softprops/diffset/pulls/7/files', perPage: '2' },
    ]);
  });

  it('uses default pagination and tolerates omitted optional file arrays', async () => {
    const requests: Array<URL> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      requests.push(url);
      const body =
        url.pathname.includes('/compare/') && url.searchParams.has('per_page')
          ? { commits: [] }
          : {};
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    });
    const github = new OctokitGitHubClient(new Octokit({ request: { fetch } }));

    assert.deepStrictEqual(
      await github.commitFiles({
        owner: 'softprops',
        per_page: 100,
        ref: 'abc123',
        repo: 'diffset',
      }),
      [],
    );
    assert.deepStrictEqual(
      await github.compareCommits({
        base: 'main',
        head: 'feature',
        owner: 'softprops',
        repo: 'diffset',
      }),
      [],
    );
    assert.deepStrictEqual(
      await github.compareFiles({
        base: 'main',
        head: 'feature',
        owner: 'softprops',
        repo: 'diffset',
      }),
      [],
    );
    assert.strictEqual(requests[1]?.searchParams.get('per_page'), '100');
  });
});
