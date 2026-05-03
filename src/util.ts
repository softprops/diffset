import { readFileSync } from 'node:fs';

import { Params } from './diff.js';
export interface Config {
  githubToken: string;
  githubRef: string;
  githubRepository: string;
  base?: string | undefined;
  fileFilters: Record<string, string>;
  includeRemoved?: boolean;
  pullBase?: string;
  pullHead?: string;
  pullNumber?: number;
  sha: string;
}

type Env = Record<string, string | undefined>;

/** GitHub exposes `with` input fields in the form of env vars prefixed with INPUT_ */
const FileFilter = /^INPUT_(\w+)_FILES$/;

type GitHubEventPayload = {
  number?: number;
  pull_request?: {
    base?: {
      ref?: string;
      repo?: {
        full_name?: string;
      };
    };
    head?: {
      label?: string;
      ref?: string;
      repo?: {
        full_name?: string;
      };
    };
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
  const head = config.pullHead || cleanRef(config.githubRef);
  const base = config.base || config.pullBase || 'master';
  const ref = config.sha;
  const params: Params = {
    base,
    head,
    owner,
    repo,
    ref,
  };
  if (config.includeRemoved) {
    params.includeRemoved = true;
  }
  if (config.pullNumber != undefined && config.base == undefined) {
    params.pullNumber = config.pullNumber;
  }
  return params;
};

const pullRequestFromEvent = (env: Env): GitHubEventPayload['pull_request'] | undefined => {
  if (!env.GITHUB_EVENT_NAME?.startsWith('pull_request') || env.GITHUB_EVENT_PATH == undefined) {
    return undefined;
  }

  try {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) as GitHubEventPayload;
    return event.pull_request ?? (event.number != undefined ? { number: event.number } : undefined);
  } catch {
    return undefined;
  }
};

const pullHeadRef = (pullRequest: GitHubEventPayload['pull_request']): string | undefined => {
  if (pullRequest?.head?.repo?.full_name != pullRequest?.base?.repo?.full_name) {
    return pullRequest?.head?.label;
  }
  return pullRequest?.head?.ref;
};

export const parseConfig = (env: Env): Config => {
  const inputBase = env.INPUT_BASE?.trim();
  const base = inputBase ? inputBase : undefined;
  const pullRequest = pullRequestFromEvent(env);
  const pullNumber = base == undefined ? pullRequest?.number : undefined;
  const pullBase = base == undefined ? pullRequest?.base?.ref : undefined;
  const pullHead = pullHeadRef(pullRequest);
  const includeRemoved = env.INPUT_INCLUDE_REMOVED?.trim().toLowerCase() === 'true';

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
    ...(includeRemoved ? { includeRemoved } : {}),
    ...(pullBase != undefined ? { pullBase } : {}),
    ...(pullHead != undefined ? { pullHead } : {}),
    ...(pullNumber != undefined ? { pullNumber } : {}),
    sha: env.GITHUB_SHA || '',
  };
};
