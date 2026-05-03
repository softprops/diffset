import { readFileSync } from 'node:fs';

import { ChangedFile, Params } from './diff.js';
export interface Config {
  defaultBranch?: string;
  githubToken: string;
  githubRef: string;
  githubRepository: string;
  base?: string | undefined;
  fileFilters: Record<string, string>;
  includeRemoved?: boolean;
  pullBase?: string;
  pullChangedFiles?: number;
  pullHead?: string;
  pullNumber?: number;
  pushFiles?: Array<ChangedFile>;
  sha: string;
}

type Env = Record<string, string | undefined>;

/** GitHub exposes `with` input fields in the form of env vars prefixed with INPUT_ */
const FileFilter = /^INPUT_(\w+)_FILES$/;

type GitHubEventPayload = {
  commits?: Array<{
    added?: Array<string>;
    modified?: Array<string>;
    removed?: Array<string>;
  }>;
  number?: number;
  repository?: {
    default_branch?: string;
  };
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
    changed_files?: number;
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
  const base = config.base || config.pullBase || config.defaultBranch || 'master';
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
  if (config.pushFiles != undefined) {
    params.changedFiles = config.pushFiles;
  }
  if (config.pullNumber != undefined && config.base == undefined) {
    params.pullNumber = config.pullNumber;
    if (config.pullChangedFiles != undefined) {
      params.pullChangedFiles = config.pullChangedFiles;
    }
  }
  return params;
};

const payloadFromEvent = (env: Env): GitHubEventPayload | undefined => {
  if (env.GITHUB_EVENT_PATH == undefined) {
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) as GitHubEventPayload;
  } catch {
    return undefined;
  }
};

const pullRequestFromEvent = (
  env: Env,
  event: GitHubEventPayload | undefined,
): GitHubEventPayload['pull_request'] | undefined => {
  if (!env.GITHUB_EVENT_NAME?.startsWith('pull_request')) {
    return undefined;
  }

  return event?.pull_request ?? (event?.number != undefined ? { number: event.number } : undefined);
};

const pullHeadRef = (pullRequest: GitHubEventPayload['pull_request']): string | undefined => {
  if (pullRequest?.head?.repo?.full_name != pullRequest?.base?.repo?.full_name) {
    return pullRequest?.head?.label;
  }
  return pullRequest?.head?.ref;
};

const pushFilesFromEvent = (
  env: Env,
  event: GitHubEventPayload | undefined,
  defaultBranch: string | undefined,
  githubRef: string,
  base: string | undefined,
): Array<ChangedFile> | undefined => {
  if (base != undefined || env.GITHUB_EVENT_NAME !== 'push') {
    return undefined;
  }

  if (defaultBranch == undefined || cleanRef(githubRef) !== defaultBranch) {
    return undefined;
  }

  if (event?.commits == undefined || event.commits.length === 0) {
    return undefined;
  }

  const files = new Map<string, string>();
  event.commits.forEach((commit) => {
    commit.added?.forEach((filename) => files.set(filename, 'added'));
    commit.modified?.forEach((filename) => files.set(filename, 'modified'));
    commit.removed?.forEach((filename) => files.set(filename, 'removed'));
  });

  if (files.size === 0) {
    return undefined;
  }

  return Array.from(files.entries()).map(([filename, status]) => ({ filename, status }));
};

export const parseConfig = (env: Env): Config => {
  const inputBase = env.INPUT_BASE?.trim();
  const base = inputBase ? inputBase : undefined;
  const event = payloadFromEvent(env);
  const defaultBranch = event?.repository?.default_branch;
  const githubRef = env.GITHUB_HEAD_REF || env.GITHUB_REF || '';
  const pullRequest = pullRequestFromEvent(env, event);
  const pullNumber = base == undefined ? pullRequest?.number : undefined;
  const pullBase = base == undefined ? pullRequest?.base?.ref : undefined;
  const pullChangedFiles = base == undefined ? pullRequest?.changed_files : undefined;
  const pullHead = pullHeadRef(pullRequest);
  const pushFiles = pushFilesFromEvent(env, event, defaultBranch, githubRef, base);
  const includeRemoved = env.INPUT_INCLUDE_REMOVED?.trim().toLowerCase() === 'true';

  return {
    githubToken: env['INPUT_TOKEN'] || '',
    githubRef,
    githubRepository: env.GITHUB_REPOSITORY || '',
    base,
    ...(defaultBranch != undefined ? { defaultBranch } : {}),
    fileFilters: Array.from(Object.entries(env)).reduce((filters, [key, value]) => {
      if (value != undefined && FileFilter.test(key)) {
        filters[key.toLowerCase().replace('input_', '')] = value;
      }
      return filters;
    }, {}),
    ...(includeRemoved ? { includeRemoved } : {}),
    ...(pullBase != undefined ? { pullBase } : {}),
    ...(pullChangedFiles != undefined ? { pullChangedFiles } : {}),
    ...(pullHead != undefined ? { pullHead } : {}),
    ...(pullNumber != undefined ? { pullNumber } : {}),
    ...(pushFiles != undefined ? { pushFiles } : {}),
    sha: env.GITHUB_SHA || '',
  };
};
