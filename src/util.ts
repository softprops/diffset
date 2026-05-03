import { readFileSync } from 'node:fs';

import { Params } from './diff.js';
export interface Config {
  githubToken: string;
  githubRef: string;
  githubRepository: string;
  base?: string | undefined;
  fileFilters: Record<string, string>;
  pullNumber?: number;
  sha: string;
}

type Env = Record<string, string | undefined>;

/** GitHub exposes `with` input fields in the form of env vars prefixed with INPUT_ */
const FileFilter = /^INPUT_(\w+)_FILES$/;

type GitHubEventPayload = {
  number?: number;
  pull_request?: {
    number?: number;
  };
};

const cleanRef = (ref: string): string => {
  if (ref.indexOf('refs/heads/') === 0) {
    return ref.substring(11);
  }
  if (ref.indexOf('refs/tags/') === 0) {
    return ref.substring(10);
  }
  return ref;
};
export const intoParams = (config: Config): Params => {
  const [owner, repo] = config.githubRepository.split('/', 2);
  const head = cleanRef(config.githubRef);
  const base = config.base || 'master';
  const ref = config.sha;
  const params: Params = {
    base,
    head,
    owner,
    repo,
    ref,
  };
  if (config.pullNumber != undefined && config.base == undefined) {
    params.pullNumber = config.pullNumber;
  }
  return params;
};

const pullNumberFromEvent = (env: Env): number | undefined => {
  if (!env.GITHUB_EVENT_NAME?.startsWith('pull_request') || env.GITHUB_EVENT_PATH == undefined) {
    return undefined;
  }

  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) as GitHubEventPayload;
    const pullNumber = event.pull_request?.number ?? event.number;
    return Number.isInteger(pullNumber) ? pullNumber : undefined;
  } catch {
    return undefined;
  }
};

export const parseConfig = (env: Env): Config => {
  const base = env.INPUT_BASE?.trim() ? env.INPUT_BASE : undefined;
  const pullNumber = base == undefined ? pullNumberFromEvent(env) : undefined;

  return {
    githubToken: env['INPUT_TOKEN'] || '',
    githubRef: env.GITHUB_HEAD_REF || env.GITHUB_REF || '',
    githubRepository: env.GITHUB_REPOSITORY || '',
    base,
    fileFilters: Array.from(Object.entries(env)).reduce((filters, [key, value]) => {
      if (value != undefined && FileFilter.test(key)) {
        filters[key.toLowerCase().replace('input_', '')] = value;
      }
      return filters;
    }, {}),
    ...(pullNumber != undefined ? { pullNumber } : {}),
    sha: env.GITHUB_SHA || '',
  };
};
