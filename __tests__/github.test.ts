import { Octokit } from '@octokit/rest';

import { OctokitGitHubClient } from '../src/github';

import { assert, describe, it, vi } from 'vitest';

const urlFromRequest = (input: string | URL | Request): URL =>
  new URL(typeof input === 'string' || input instanceof URL ? input : input.url);

const jsonResponse = (body: unknown, link?: string): Response =>
  new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      ...(link == undefined ? {} : { link }),
    },
    status: 200,
  });

const nextPageLink = (url: URL): string => {
  const next = new URL(url);
  next.searchParams.set('page', '2');
  return `<${next.toString()}>; rel="next"`;
};

const clientUsing = (fetch: typeof globalThis.fetch): OctokitGitHubClient =>
  new OctokitGitHubClient(new Octokit({ request: { fetch } }));

describe('OctokitGitHubClient', () => {
  it('maps a full commit-file page and stops when there is no next link', async () => {
    const requests: Array<URL> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = urlFromRequest(input);
      requests.push(url);
      if (requests.length > 1) {
        return new Response('unexpected extra page', { status: 500 });
      }
      return jsonResponse({
        files: [
          { filename: 'first.ts', status: 'added' },
          { filename: 'second.ts', status: 'modified' },
        ],
      });
    });

    const files = await clientUsing(fetch).commitFiles({
      owner: 'softprops',
      per_page: 2,
      ref: 'abc123',
      repo: 'diffset',
    });

    assert.deepStrictEqual(
      files.map((file) => file.filename),
      ['first.ts', 'second.ts'],
    );
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0]?.searchParams.get('per_page'), '2');
  });

  it('follows compare-commit next links and stops on a full page without one', async () => {
    const requests: Array<URL> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = urlFromRequest(input);
      requests.push(url);
      if (requests.length === 1) {
        return jsonResponse({ commits: [{ sha: 'first' }, { sha: 'second' }] }, nextPageLink(url));
      }
      if (requests.length === 2) {
        return jsonResponse({ commits: [{ sha: 'third' }, { sha: 'fourth' }] });
      }
      return new Response('unexpected extra page', { status: 500 });
    });

    const commits = await clientUsing(fetch).compareCommits({
      base: 'main',
      head: 'feature',
      owner: 'softprops',
      per_page: 2,
      repo: 'diffset',
    });

    assert.deepStrictEqual(
      commits.map((commit) => commit.sha),
      ['first', 'second', 'third', 'fourth'],
    );
    assert.strictEqual(requests.length, 2);
    assert.strictEqual(requests[1]?.searchParams.get('page'), '2');
  });

  it('accumulates pull-file array responses by following next links', async () => {
    const requests: Array<URL> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = urlFromRequest(input);
      requests.push(url);
      if (requests.length === 1) {
        return jsonResponse(
          [
            { filename: 'pull-first.ts', status: 'added' },
            { filename: 'pull-second.ts', status: 'modified' },
          ],
          nextPageLink(url),
        );
      }
      return jsonResponse([{ filename: 'pull-third.ts', status: 'removed' }]);
    });

    const files = await clientUsing(fetch).pullFiles({
      owner: 'softprops',
      per_page: 2,
      pull_number: 7,
      repo: 'diffset',
    });

    assert.deepStrictEqual(
      files.map((file) => file.filename),
      ['pull-first.ts', 'pull-second.ts', 'pull-third.ts'],
    );
    assert.strictEqual(requests.length, 2);
    assert.strictEqual(requests[1]?.searchParams.get('page'), '2');
  });

  it('keeps compare files as one unpaginated request', async () => {
    const requests: Array<URL> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = urlFromRequest(input);
      requests.push(url);
      return jsonResponse(
        { files: [{ filename: 'compare.ts', status: 'modified' }] },
        nextPageLink(url),
      );
    });

    assert.deepStrictEqual(
      await clientUsing(fetch).compareFiles({
        base: 'main',
        head: 'feature',
        owner: 'softprops',
        repo: 'diffset',
      }),
      [{ filename: 'compare.ts', status: 'modified' }],
    );
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0]?.searchParams.has('per_page'), false);
  });

  it('uses default pagination and tolerates omitted commit and file arrays', async () => {
    const requests: Array<URL> = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = urlFromRequest(input);
      requests.push(url);
      return jsonResponse({});
    });
    const github = clientUsing(fetch);

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
