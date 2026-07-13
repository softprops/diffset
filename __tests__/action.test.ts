import type { Diff } from '../src/diff';
import {
  createThrottleOptions,
  run,
  type ActionDependencies,
  type ThrottleRequestOptions,
} from '../src/action';

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
  const dependencies: ActionDependencies = {
    createDiff,
    debug,
    logError: vi.fn<ActionDependencies['logError']>(),
    setFailed: vi.fn<ActionDependencies['setFailed']>(),
    setOutput: vi.fn<ActionDependencies['setOutput']>(),
    warning: vi.fn<ActionDependencies['warning']>(),
  };

  return { createDiff, debug, dependencies, diff };
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
    expect(dependencies.logError).not.toHaveBeenCalled();
    expect(JSON.stringify(debug.mock.calls)).not.toContain('secret-token');
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

  it.each([
    ['an Error', new Error('boom')],
    ['a non-Error value', 'boom'],
  ])('records failure from %s without emitting outputs', async (_description, error) => {
    const { dependencies, diff } = actionMocks();
    diff.mockRejectedValue(error);

    await run(env, dependencies);

    expect(dependencies.logError).toHaveBeenCalledWith(error);
    expect(dependencies.setFailed).toHaveBeenCalledWith('boom');
    expect(dependencies.setOutput).not.toHaveBeenCalled();
    expect(dependencies.debug).not.toHaveBeenCalled();
  });
});

describe('throttling callbacks', () => {
  const request = (retryCount: number): ThrottleRequestOptions => ({
    method: 'GET',
    url: '/repos/softprops/diffset/compare/main...feature',
    request: { retryCount },
  });

  it('warns and retries the first primary rate-limit response', () => {
    const warn = vi.fn<ActionDependencies['warning']>();
    const throttle = createThrottleOptions(warn);

    expect(throttle.onRateLimit(5, request(0))).toBe(true);
    expect(warn.mock.calls).toEqual([
      ['Request quota exhausted for request GET /repos/softprops/diffset/compare/main...feature'],
      ['Retrying after 5 seconds!'],
    ]);
  });

  it('warns without retrying later primary rate-limit responses', () => {
    const warn = vi.fn<ActionDependencies['warning']>();
    const throttle = createThrottleOptions(warn);

    expect(throttle.onRateLimit(5, request(1))).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      'Request quota exhausted for request GET /repos/softprops/diffset/compare/main...feature',
    );
  });

  it('warns without retrying secondary rate-limit responses', () => {
    const warn = vi.fn<ActionDependencies['warning']>();
    const throttle = createThrottleOptions(warn);

    expect(throttle.onSecondaryRateLimit(5, request(0))).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'Abuse detected for request GET /repos/softprops/diffset/compare/main...feature',
    );
  });
});
