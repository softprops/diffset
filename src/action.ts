import { debug, setFailed, setOutput, warning } from '@actions/core';
import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/rest';

import { GitHubDiff, sets } from './diff.js';
import type { Diff } from './diff.js';
import { listOutputs } from './output.js';
import { intoParams, parseConfig } from './util.js';

type Warning = typeof warning;

export type ThrottleRequestOptions = {
  method: string;
  request: {
    [option: string]: unknown;
    retryCount?: number;
  };
  url: string;
};

export type ThrottleOptions = {
  onRateLimit: (retryAfter: number, options: ThrottleRequestOptions) => true | undefined;
  onSecondaryRateLimit: (retryAfter: number, options: ThrottleRequestOptions) => undefined;
};

export const createThrottleOptions = (warn: Warning): ThrottleOptions => ({
  onRateLimit: (retryAfter, options) => {
    warn(`Request quota exhausted for request ${options.method} ${options.url}`);
    if (options.request.retryCount === 0) {
      warn(`Retrying after ${retryAfter} seconds!`);
      return true;
    }
  },
  onSecondaryRateLimit: (_retryAfter, options) => {
    warn(`Abuse detected for request ${options.method} ${options.url}`);
  },
});

const createDiff = (githubToken: string, warn: Warning): Diff => {
  const ThrottledOctokit = Octokit.plugin(throttling);
  return new GitHubDiff(
    new ThrottledOctokit({
      auth: githubToken,
      throttle: createThrottleOptions(warn),
    }),
  );
};

export type ActionDependencies = {
  createDiff: typeof createDiff;
  debug: typeof debug;
  logError: (error: unknown) => void;
  setFailed: typeof setFailed;
  setOutput: typeof setOutput;
  warning: Warning;
};

const defaultDependencies: ActionDependencies = {
  createDiff,
  debug,
  logError: console.log,
  setFailed,
  setOutput,
  warning,
};

const setListOutput = (name: string, files: Array<string>, output: typeof setOutput): void => {
  for (const [key, value] of Object.entries(listOutputs(name, files))) {
    output(key, value);
  }
};

export const run = async (
  env: NodeJS.ProcessEnv = process.env,
  dependencies: ActionDependencies = defaultDependencies,
): Promise<void> => {
  try {
    const config = parseConfig(env);
    const differ = dependencies.createDiff(config.githubToken, dependencies.warning);
    const diffset = await differ.diff(intoParams(config));
    setListOutput('files', diffset, dependencies.setOutput);

    for (const [key, matches] of Object.entries(sets(config.fileFilters, diffset))) {
      dependencies.debug(`files for ${key} ${matches}`);
      setListOutput(key, matches, dependencies.setOutput);
    }
  } catch (error) {
    dependencies.logError(error);
    dependencies.setFailed(error instanceof Error ? error.message : String(error));
  }
};
