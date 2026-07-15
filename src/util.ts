import { readFileSync } from 'node:fs';

import type { Params } from './diff.js';

export interface Config {
  base?: string;
  defaultBranch?: string;
  fileFilters: Record<string, string>;
  githubRef: string;
  githubRepository: string;
  githubToken: string;
  includeRemoved?: boolean;
  pullBase?: string;
  pullChangedFiles?: number;
  pullHead?: string;
  pullNumber?: number;
  pushBase?: string;
  pushCommitRefs?: Array<string>;
  pushHead?: string;
  sha: string;
}

type Env = Record<string, string | undefined>;

/** GitHub exposes `with` input fields in the form of env vars prefixed with INPUT_ */
const FileFilter = /^INPUT_(\w+)_FILES$/;

type PullReferencePayload = {
  label?: string;
  ref?: string;
  repo?: {
    full_name?: string;
  };
};

type PullRequestPayload = {
  base?: PullReferencePayload;
  changed_files?: number;
  head?: PullReferencePayload;
  number?: number;
};

type GitHubEventPayload = {
  after?: string;
  before?: string;
  commits?: Array<{
    id?: string;
  }>;
  number?: number;
  repository?: {
    default_branch?: string;
  };
  size?: number;
  pull_request?: PullRequestPayload;
};

type JsonObject = Record<string, unknown>;

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const objectValue = (value: unknown): JsonObject | undefined =>
  isJsonObject(value) ? value : undefined;

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const pullReferenceFromJson = (value: unknown): PullReferencePayload | undefined => {
  const object = objectValue(value);
  if (object == undefined) {
    return undefined;
  }

  const reference: PullReferencePayload = {};
  const label = stringValue(object.label);
  const ref = stringValue(object.ref);
  const repoObject = objectValue(object.repo);
  const repoName = stringValue(repoObject?.full_name);
  if (label != undefined) reference.label = label;
  if (ref != undefined) reference.ref = ref;
  if (repoObject != undefined) {
    reference.repo = repoName == undefined ? {} : { full_name: repoName };
  }
  return reference;
};

const pullRequestFromJson = (value: unknown): PullRequestPayload | undefined => {
  const object = objectValue(value);
  if (object == undefined) {
    return undefined;
  }

  const pullRequest: PullRequestPayload = {};
  const base = pullReferenceFromJson(object.base);
  const head = pullReferenceFromJson(object.head);
  const changedFiles = numberValue(object.changed_files);
  const number = numberValue(object.number);
  if (base != undefined) pullRequest.base = base;
  if (head != undefined) pullRequest.head = head;
  if (changedFiles != undefined) pullRequest.changed_files = changedFiles;
  if (number != undefined) pullRequest.number = number;
  return pullRequest;
};

const payloadFromJson = (value: unknown): GitHubEventPayload => {
  const object = objectValue(value);
  if (object == undefined) {
    throw new Error('GitHub event payload must be a JSON object');
  }

  const payload: GitHubEventPayload = {};
  const after = stringValue(object.after);
  const before = stringValue(object.before);
  const eventNumber = numberValue(object.number);
  const size = numberValue(object.size);
  const repositoryObject = objectValue(object.repository);
  const defaultBranch = stringValue(repositoryObject?.default_branch);
  const pullRequest = pullRequestFromJson(object.pull_request);
  const commits = Array.isArray(object.commits)
    ? object.commits.map((commit) => {
        const id = stringValue(objectValue(commit)?.id);
        return id == undefined ? {} : { id };
      })
    : undefined;

  if (after != undefined) payload.after = after;
  if (before != undefined) payload.before = before;
  if (commits != undefined) payload.commits = commits;
  if (eventNumber != undefined) payload.number = eventNumber;
  if (repositoryObject != undefined) {
    payload.repository = defaultBranch == undefined ? {} : { default_branch: defaultBranch };
  }
  if (size != undefined) payload.size = size;
  if (pullRequest != undefined) payload.pull_request = pullRequest;
  return payload;
};

const requiredContext = (value: string | undefined, name: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required GitHub context: ${name}`);
  }
  return normalized;
};

const repositoryParts = (repository: string): [string, string] => {
  const parts = repository.split('/');
  const owner = parts[0]?.trim();
  const repo = parts[1]?.trim();
  if (parts.length !== 2 || !owner || !repo) {
    throw new Error('Invalid GITHUB_REPOSITORY: expected "owner/repo"');
  }
  return [owner, repo];
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
  const [owner, repo] = repositoryParts(config.githubRepository);
  const head = config.pullHead || config.pushHead || cleanRef(config.githubRef);
  const base =
    config.base || config.pullBase || config.pushBase || config.defaultBranch || 'master';
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
  if (config.pushCommitRefs != undefined) {
    params.commitRefs = config.pushCommitRefs;
  }
  if (config.pullNumber != undefined) {
    params.pullNumber = config.pullNumber;
    if (config.pullChangedFiles != undefined) {
      params.pullChangedFiles = config.pullChangedFiles;
    }
  }
  return params;
};

const payloadFromEvent = (env: Env): GitHubEventPayload | undefined => {
  const eventPath = env.GITHUB_EVENT_PATH?.trim();
  if (!eventPath) {
    return undefined;
  }

  let contents: string;
  try {
    contents = readFileSync(eventPath, 'utf8');
  } catch {
    throw new Error('Unable to read GitHub event payload from GITHUB_EVENT_PATH');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(contents);
  } catch {
    throw new Error('Invalid JSON in GitHub event payload from GITHUB_EVENT_PATH');
  }
  return payloadFromJson(payload);
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

const zeroSha = /^0+$/;

// GitHub push payloads contain at most 2,048 commits, so a list at the cap may
// be truncated even when the optional `size` field is absent.
const PushCommitsLimit = 2_048;

const pushRangeFromEvent = (
  env: Env,
  event: GitHubEventPayload | undefined,
  defaultBranch: string | undefined,
  githubRef: string,
  base: string | undefined,
): { pushBase?: string; pushCommitRefs?: Array<string>; pushHead?: string } => {
  if (base != undefined || env.GITHUB_EVENT_NAME !== 'push') {
    return {};
  }

  if (defaultBranch == undefined || cleanRef(githubRef) !== defaultBranch) {
    return {};
  }

  const rawCommits = event?.commits ?? [];
  const commitRefs = rawCommits
    .map((commit) => commit.id)
    .filter((id): id is string => id != undefined && id.length > 0);
  const commitListIsIncomplete =
    rawCommits.length >= PushCommitsLimit ||
    commitRefs.length < rawCommits.length ||
    (event?.size != undefined &&
      (event.size > rawCommits.length || event.size > commitRefs.length));
  if (commitRefs.length > 0 && !commitListIsIncomplete) {
    return { pushCommitRefs: commitRefs };
  }

  if (event?.before != undefined && event.after != undefined && !zeroSha.test(event.before)) {
    return { pushBase: event.before, pushHead: event.after };
  }

  if (commitRefs.length > 0) {
    return { pushCommitRefs: commitRefs };
  }

  return {};
};

export const parseConfig = (env: Env): Config => {
  const githubRepository = requiredContext(env.GITHUB_REPOSITORY, 'GITHUB_REPOSITORY');
  repositoryParts(githubRepository);
  const githubRef = requiredContext(
    env.GITHUB_HEAD_REF?.trim() || env.GITHUB_REF,
    'GITHUB_HEAD_REF or GITHUB_REF',
  );
  const sha = requiredContext(env.GITHUB_SHA, 'GITHUB_SHA');
  const inputBase = env.INPUT_BASE?.trim();
  const base = inputBase ? inputBase : undefined;
  const event = payloadFromEvent(env);
  const defaultBranch = event?.repository?.default_branch;
  const pullRequest = pullRequestFromEvent(env, event);
  const pullBase = pullRequest?.base?.ref;
  const usePullFiles = base == undefined || base === pullBase;
  const configPullBase = base == undefined ? pullBase : undefined;
  const pullNumber = usePullFiles ? pullRequest?.number : undefined;
  const pullChangedFiles = usePullFiles ? pullRequest?.changed_files : undefined;
  const pullHead = pullHeadRef(pullRequest);
  const { pushBase, pushCommitRefs, pushHead } = pushRangeFromEvent(
    env,
    event,
    defaultBranch,
    githubRef,
    base,
  );
  const includeRemoved = env.INPUT_INCLUDE_REMOVED?.trim().toLowerCase() === 'true';
  const fileFilters: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value != undefined && FileFilter.test(key)) {
      fileFilters[key.toLowerCase().replace('input_', '')] = value;
    }
  }

  return {
    githubToken: env['INPUT_TOKEN'] || '',
    githubRef,
    githubRepository,
    ...(base != undefined ? { base } : {}),
    ...(defaultBranch != undefined ? { defaultBranch } : {}),
    fileFilters,
    ...(includeRemoved ? { includeRemoved } : {}),
    ...(configPullBase != undefined ? { pullBase: configPullBase } : {}),
    ...(pullChangedFiles != undefined ? { pullChangedFiles } : {}),
    ...(pullHead != undefined ? { pullHead } : {}),
    ...(pullNumber != undefined ? { pullNumber } : {}),
    ...(pushBase != undefined ? { pushBase } : {}),
    ...(pushCommitRefs != undefined ? { pushCommitRefs } : {}),
    ...(pushHead != undefined ? { pushHead } : {}),
    sha,
  };
};
