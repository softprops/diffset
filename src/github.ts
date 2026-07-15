import type { Octokit } from '@octokit/rest';

type JsonObject = Record<string, unknown>;

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type ChangedFile = {
  filename?: string;
  previous_filename?: string;
  status?: string;
};

export type ChangedCommit = {
  sha?: string;
};

const isChangedFile = (value: unknown): value is ChangedFile =>
  isJsonObject(value) &&
  (value.filename == undefined || typeof value.filename === 'string') &&
  (value.previous_filename == undefined || typeof value.previous_filename === 'string') &&
  (value.status == undefined || typeof value.status === 'string');

const isChangedCommit = (value: unknown): value is ChangedCommit =>
  isJsonObject(value) && (value.sha == undefined || typeof value.sha === 'string');

const changedFilesFromPage = (data: unknown): Array<ChangedFile> =>
  isJsonObject(data) && Array.isArray(data.files) ? data.files.filter(isChangedFile) : [];

const changedCommitsFromPage = (data: unknown): Array<ChangedCommit> =>
  isJsonObject(data) && Array.isArray(data.commits) ? data.commits.filter(isChangedCommit) : [];

export type CompareRequest = {
  base: string;
  head: string;
  owner: string;
  per_page?: number;
  repo: string;
};

export type CommitRequest = {
  owner: string;
  per_page: number;
  ref: string;
  repo: string;
};

export type PullFilesRequest = {
  owner: string;
  per_page: number;
  pull_number: number;
  repo: string;
};

/** The GitHub operations needed to calculate a diff, independent of Octokit's full surface. */
export interface GitHubClient {
  commitFiles(params: CommitRequest): Promise<Array<ChangedFile>>;
  compareCommits(params: CompareRequest): Promise<Array<ChangedCommit>>;
  compareFiles(params: CompareRequest): Promise<Array<ChangedFile>>;
  pullFiles(params: PullFilesRequest): Promise<Array<ChangedFile>>;
}

/** Adapt Octokit's endpoint and pagination APIs to the small diff-domain interface. */
export class OctokitGitHubClient implements GitHubClient {
  constructor(private readonly octokit: Octokit) {}

  async commitFiles(params: CommitRequest): Promise<Array<ChangedFile>> {
    return this.octokit.paginate(this.octokit.repos.getCommit, params, (response) =>
      changedFilesFromPage(response.data),
    );
  }

  async compareCommits(params: CompareRequest): Promise<Array<ChangedCommit>> {
    return this.octokit.paginate(
      this.octokit.repos.compareCommits,
      { ...params, per_page: params.per_page ?? 100 },
      (response) => changedCommitsFromPage(response.data),
    );
  }

  async compareFiles(params: CompareRequest): Promise<Array<ChangedFile>> {
    const response = await this.octokit.repos.compareCommits(params);
    return response.data.files ?? [];
  }

  async pullFiles(params: PullFilesRequest): Promise<Array<ChangedFile>> {
    return this.octokit.paginate(this.octokit.pulls.listFiles, params, (response) => response.data);
  }
}
