import { Octokit } from '@octokit/rest';
import { Minimatch } from 'minimatch';

export type Params = {
  base: string;
  commitRefs?: Array<string>;
  head: string;
  includeRemoved?: boolean;
  owner: string;
  pullChangedFiles?: number;
  pullNumber?: number;
  repo: string;
  ref: string;
};

export type ChangedFile = {
  filename?: string;
  status?: string;
};

/** produce a collection of named diff sets based on patterns defined in sets */
export const sets = (
  filters: Record<string, string>,
  files: Array<string>,
): Record<string, Array<string>> =>
  Array.from(Object.entries(filters)).reduce((filtered, [key, patterns]) => {
    let matches = patterns
      .split(/\r?\n/)
      .map((pattern) => pattern.trim())
      .filter((pattern) => pattern.length > 0)
      .flatMap((pattern) => {
        let matcher = new Minimatch(pattern);
        return files.filter((file) => matcher.match(file));
      });
    let uniqueMatches = Array.from(new Set(matches));
    if (uniqueMatches.length > 0) {
      filtered[key] = uniqueMatches;
    }
    return filtered;
  }, {});

export interface Diff {
  diff(params: Params): Promise<Array<string>>;
}

const isDefined = <T>(s: T | undefined): s is T => {
  return s != undefined;
};

const filenames = (files: Array<ChangedFile> | undefined, includeRemoved = false): Array<string> =>
  files
    ?.filter((file) => includeRemoved || file.status != 'removed')
    .map((file) => file.filename)
    .filter(isDefined) || [];

export class GitHubDiff implements Diff {
  readonly github: Octokit;
  constructor(github: Octokit) {
    this.github = github;
  }
  async diff(params: Params): Promise<Array<string>> {
    if (params.commitRefs != undefined) {
      return filenames(await this.commitFiles(params, params.commitRefs), params.includeRemoved);
    }

    if (params.pullNumber != undefined) {
      try {
        const files = await this.compareFiles(params);
        if (params.pullChangedFiles != undefined && files.length < params.pullChangedFiles) {
          return filenames(await this.pullFiles(params, params.pullNumber), params.includeRemoved);
        }
        return filenames(files, params.includeRemoved);
      } catch {
        return filenames(await this.pullFiles(params, params.pullNumber), params.includeRemoved);
      }
    }

    return filenames(await this.compareFiles(params), params.includeRemoved);
  }

  private async commitFiles(
    params: Params,
    commitRefs: Array<string>,
  ): Promise<Array<ChangedFile>> {
    const files = new Map<string, ChangedFile>();
    for (const ref of commitRefs) {
      const commitFiles = (await this.github.paginate(
        this.github.repos.getCommit,
        {
          owner: params.owner,
          repo: params.repo,
          ref,
          per_page: 100,
        },
        (response) => (response.data as { files?: Array<ChangedFile> }).files || [],
      )) as Array<ChangedFile>;
      commitFiles.forEach((file) => {
        if (file.filename != undefined) {
          files.set(file.filename, file);
        }
      });
    }
    return Array.from(files.values());
  }

  private async pullFiles(params: Params, pullNumber: number): Promise<Array<ChangedFile>> {
    const files = await this.github.paginate(this.github.pulls.listFiles, {
      owner: params.owner,
      repo: params.repo,
      pull_number: pullNumber,
      per_page: 100,
    });
    return files as Array<ChangedFile>;
  }

  private async compareFiles(params: Params): Promise<Array<ChangedFile>> {
    const {
      commitRefs: _commitRefs,
      includeRemoved: _includeRemoved,
      pullChangedFiles: _pullChangedFiles,
      pullNumber: _pullNumber,
      ...compareParams
    } = params;

    // if this is a merge to the base branch
    // base and head will both be the same
    if (compareParams.base === compareParams.head) {
      const files = await this.github.paginate(
        this.github.repos.getCommit,
        {
          owner: compareParams.owner,
          repo: compareParams.repo,
          ref: compareParams.ref,
          per_page: 100,
        },
        (response) => (response.data as { files?: Array<ChangedFile> }).files || [],
      );
      return files as Array<ChangedFile>;
    } else {
      const response = await this.github.repos.compareCommits({
        ...compareParams,
        ref: undefined,
      });
      return response.data.files || [];
    }
  }
}
