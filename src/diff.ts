import { Octokit } from '@octokit/rest';
import { Minimatch } from 'minimatch';

export type Params = {
  base: string;
  head: string;
  includeRemoved?: boolean;
  owner: string;
  pullNumber?: number;
  repo: string;
  ref: string;
};

type ChangedFile = {
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
    if (params.pullNumber != undefined) {
      try {
        return await this.compare(params);
      } catch {
        const files = await this.github.paginate(this.github.pulls.listFiles, {
          owner: params.owner,
          repo: params.repo,
          pull_number: params.pullNumber,
        });
        return filenames(files, params.includeRemoved);
      }
    }

    return this.compare(params);
  }

  private async compare(params: Params): Promise<Array<string>> {
    const { includeRemoved, pullNumber: _pullNumber, ...compareParams } = params;

    // if this is a merge to master push
    // base and head will both be the same
    if (compareParams.base === compareParams.head) {
      const commit = await this.github.repos.getCommit(compareParams);
      return filenames(commit.data.files, includeRemoved);
    } else {
      const response = await this.github.repos.compareCommits({
        ...compareParams,
        ref: undefined,
      });
      return filenames(response.data.files, includeRemoved);
    }
  }
}
