import type { Diff } from '../src/diff';
import {
  createDiff as createProductionDiff,
  createThrottleOptions,
  run,
  type ActionDependencies,
  type ThrottleRequestOptions,
} from '../src/action';
import { GitHubDiff } from '../src/diff';

import { describe, expect, it, vi } from 'vitest';

const env: NodeJS.ProcessEnv = {
  GITHUB_REF: 'refs/heads/feature',
  GITHUB_REPOSITORY: 'softprops/diffset',
  GITHUB_SHA: 'b04376c43f66b8beed87abe6e28504781a4e461d',
  INPUT_TOKEN: 'secret-token',
};

const actionMocks = () => {
  const diff = vi.fn<Diff['diff']>();
  const createDiff = vi.fn<ActionDependencies['createDiff']>().mockReturnValue({ diff });
  const debug = vi.fn<ActionDependencies['debug']>();
  const setFailed = vi.fn<ActionDependencies['setFailed']>();
  const setOutput = vi.fn<ActionDependencies['setOutput']>();
  const dependencies: ActionDependencies = {
    createDiff,
    debug,
    setFailed,
    setOutput,
    warning: vi.fn<ActionDependencies['warning']>(),
  };

  return { createDiff, debug, dependencies, diff, setFailed, setOutput };
};

describe('action', () => {
  it('emits base outputs and passes authentication and diff parameters', async () => {
    const { createDiff, debug, dependencies, diff } = actionMocks();
    diff.mockResolvedValue(['docs/has space.md', 'src/main.ts']);

    await run(env, dependencies);

    expect(createDiff).toHaveBeenCalledWith('secret-token', dependencies.warning);
    expect(diff).toHaveBeenCalledWith({
      base: 'master',
      head: 'feature',
      owner: 'softprops',
      repo: 'diffset',
      ref: 'b04376c43f66b8beed87abe6e28504781a4e461d',
    });
    expect(dependencies.setOutput).toHaveBeenNthCalledWith(
      1,
      'files',
      'docs/has space.md src/main.ts',
    );
    expect(dependencies.setOutput).toHaveBeenNthCalledWith(
      2,
      'files_json',
      '["docs/has space.md","src/main.ts"]',
    );
    expect(JSON.stringify(debug.mock.calls)).not.toContain('secret-token');
  });

  it('creates the production diff implementation without making a request', () => {
    expect(createProductionDiff('', vi.fn())).toBeInstanceOf(GitHubDiff);
  });

  it('emits both base outputs for an empty diff', async () => {
    const { dependencies, diff } = actionMocks();
    diff.mockResolvedValue([]);

    await run(env, dependencies);

    expect(dependencies.setOutput).toHaveBeenNthCalledWith(1, 'files', '');
    expect(dependencies.setOutput).toHaveBeenNthCalledWith(2, 'files_json', '[]');
  });

  it('emits dynamic filter outputs and a debug message', async () => {
    const { dependencies, diff } = actionMocks();
    diff.mockResolvedValue(['docs/guide.md', 'src/main.ts']);

    await run({ ...env, INPUT_MD_FILES: '**/*.md' }, dependencies);

    expect(dependencies.setOutput).toHaveBeenNthCalledWith(3, 'md_files', 'docs/guide.md');
    expect(dependencies.setOutput).toHaveBeenNthCalledWith(4, 'md_files_json', '["docs/guide.md"]');
    expect(dependencies.debug).toHaveBeenCalledWith('files for md_files docs/guide.md');
  });

  it('does not emit dynamic outputs for filters without matches', async () => {
    const { dependencies, diff } = actionMocks();
    diff.mockResolvedValue(['docs/guide.md', 'src/main.ts']);

    await run({ ...env, INPUT_RUST_FILES: '**/*.rs' }, dependencies);

    expect(dependencies.setOutput).toHaveBeenCalledTimes(2);
    expect(dependencies.debug).not.toHaveBeenCalled();
  });

  it('emits multiple dynamic filters in environment insertion order', async () => {
    const { dependencies, diff, setOutput } = actionMocks();
    diff.mockResolvedValue(['README.md', 'src/main.ts']);

    await run(
      {
        ...env,
        INPUT_TS_FILES: '**/*.ts',
        INPUT_MD_FILES: '**/*.md',
      },
      dependencies,
    );

    expect(setOutput.mock.calls.slice(2)).toEqual([
      ['ts_files', 'src/main.ts'],
      ['ts_files_json', '["src/main.ts"]'],
      ['md_files', 'README.md'],
      ['md_files_json', '["README.md"]'],
    ]);
  });

  it.each([
    ['an Error', new Error('boom'), 'boom'],
    ['a string', 'boom', 'boom'],
    ['an object', { reason: 'boom' }, '[object Object]'],
  ])('records failure from %s without emitting outputs', async (_description, error, message) => {
    const { dependencies, diff, setFailed } = actionMocks();
    diff.mockRejectedValue(error);

    await run(env, dependencies);

    expect(setFailed).toHaveBeenCalledOnce();
    expect(setFailed).toHaveBeenCalledWith(message);
    expect(dependencies.setOutput).not.toHaveBeenCalled();
    expect(dependencies.debug).not.toHaveBeenCalled();
    expect(JSON.stringify(setFailed.mock.calls)).not.toContain('secret-token');
  });

  it('reports configuration failures before creating a client', async () => {
    const { createDiff, dependencies, setFailed } = actionMocks();

    await run({ ...env, GITHUB_REPOSITORY: 'invalid' }, dependencies);

    expect(createDiff).not.toHaveBeenCalled();
    expect(setFailed).toHaveBeenCalledOnce();
    expect(setFailed).toHaveBeenCalledWith('Invalid GITHUB_REPOSITORY: expected "owner/repo"');
  });

  it('reports client creation failures once', async () => {
    const { createDiff, dependencies, setFailed } = actionMocks();
    createDiff.mockImplementation(() => {
      throw new Error('client setup failed');
    });

    await run(env, dependencies);

    expect(setFailed).toHaveBeenCalledOnce();
    expect(setFailed).toHaveBeenCalledWith('client setup failed');
    expect(dependencies.setOutput).not.toHaveBeenCalled();
  });

  it('reports a later output failure once after preserving earlier outputs', async () => {
    const { dependencies, diff, setFailed, setOutput } = actionMocks();
    diff.mockResolvedValue(['README.md']);
    setOutput.mockImplementation((name) => {
      if (name === 'md_files_json') {
        throw new Error('output failed');
      }
    });

    await run({ ...env, INPUT_MD_FILES: '*.md' }, dependencies);

    expect(setOutput.mock.calls).toEqual([
      ['files', 'README.md'],
      ['files_json', '["README.md"]'],
      ['md_files', 'README.md'],
      ['md_files_json', '["README.md"]'],
    ]);
    expect(setFailed).toHaveBeenCalledOnce();
    expect(setFailed).toHaveBeenCalledWith('output failed');
  });
});

describe('throttling callbacks', () => {
  const request = (): ThrottleRequestOptions => ({
    method: 'GET',
    url: '/repos/softprops/diffset/compare/main...feature',
  });

  it('warns and retries the first primary rate-limit response', () => {
    const warn = vi.fn<ActionDependencies['warning']>();
    const throttle = createThrottleOptions(warn);

    expect(throttle.onRateLimit(5, request(), undefined, 0)).toBe(true);
    expect(warn.mock.calls).toEqual([
      ['Request quota exhausted for request GET /repos/softprops/diffset/compare/main...feature'],
      ['Retrying after 5 seconds!'],
    ]);
  });

  it.each([1, 2])('warns without retrying primary rate-limit response %s', (retryCount) => {
    const warn = vi.fn<ActionDependencies['warning']>();
    const throttle = createThrottleOptions(warn);

    expect(throttle.onRateLimit(5, request(), undefined, retryCount)).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      'Request quota exhausted for request GET /repos/softprops/diffset/compare/main...feature',
    );
  });

  it('warns without retrying secondary rate-limit responses', () => {
    const warn = vi.fn<ActionDependencies['warning']>();
    const throttle = createThrottleOptions(warn);

    expect(throttle.onSecondaryRateLimit(5, request(), undefined, 0)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'Secondary rate limit detected for request GET /repos/softprops/diffset/compare/main...feature',
    );
  });
});
