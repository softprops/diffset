import type { Octokit } from '@octokit/rest';

export type ChangedFile = {
  filename?: string;
  previous_filename?: string;
  status?: string;
};

export type ChangedCommit = {
  sha?: string;
};

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
    return this.collectPages(params.per_page, async (page) => {
      const response = await this.octokit.repos.getCommit({ ...params, page });
      return response.data.files ?? [];
    });
  }

  async compareCommits(params: CompareRequest): Promise<Array<ChangedCommit>> {
    const perPage = params.per_page ?? 100;
    return this.collectPages(perPage, async (page) => {
      const response = await this.octokit.repos.compareCommits({
        ...params,
        page,
        per_page: perPage,
      });
      return response.data.commits ?? [];
    });
  }

  async compareFiles(params: CompareRequest): Promise<Array<ChangedFile>> {
    const response = await this.octokit.repos.compareCommits(params);
    return response.data.files ?? [];
  }

  async pullFiles(params: PullFilesRequest): Promise<Array<ChangedFile>> {
    return this.collectPages(params.per_page, async (page) => {
      const response = await this.octokit.pulls.listFiles({ ...params, page });
      return response.data;
    });
  }

  private async collectPages<T>(
    perPage: number,
    loadPage: (page: number) => Promise<Array<T>>,
  ): Promise<Array<T>> {
    const results: Array<T> = [];
    for (let page = 1; ; page += 1) {
      const pageResults = await loadPage(page);
      results.push(...pageResults);
      if (pageResults.length < perPage) {
        return results;
      }
    }
  }
}
