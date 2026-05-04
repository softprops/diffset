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
  previous_filename?: string;
  status?: string;
};

type ChangedCommit = {
  sha?: string;
};

const CompareFilesLimit = 300;

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
      .reduce((matches, pattern) => {
        const negate = pattern.startsWith('!');
        const expression = negate ? pattern.substring(1).trim() : pattern;
        if (expression.length === 0) {
          return matches;
        }

        let matcher = new Minimatch(expression);
        files
          .filter((file) => matcher.match(file))
          .forEach((file) => {
            if (negate) {
              matches.delete(file);
            } else {
              matches.add(file);
            }
          });
        return matches;
      }, new Set<string>());
    let uniqueMatches = Array.from(matches);
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
        if (params.pullChangedFiles == undefined && this.mayHaveTruncatedCompare(params, files)) {
          return filenames(await this.pullFiles(params, params.pullNumber), params.includeRemoved);
        }
        return filenames(files, params.includeRemoved);
      } catch {
        return filenames(await this.pullFiles(params, params.pullNumber), params.includeRemoved);
      }
    }

    const files = await this.compareFiles(params);
    if (this.mayHaveTruncatedCompare(params, files)) {
      try {
        return filenames(await this.compareCommitFiles(params, files), params.includeRemoved);
      } catch {
        return filenames(files, params.includeRemoved);
      }
    }
    return filenames(files, params.includeRemoved);
  }

  private mayHaveTruncatedCompare(params: Params, files: Array<ChangedFile>): boolean {
    return params.base !== params.head && files.length >= CompareFilesLimit;
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
        if (file.previous_filename != undefined) {
          files.delete(file.previous_filename);
        }
        if (file.filename != undefined) {
          files.set(file.filename, file);
        }
      });
    }
    return Array.from(files.values());
  }

  private async compareCommitFiles(
    params: Params,
    fallbackFiles: Array<ChangedFile>,
  ): Promise<Array<ChangedFile>> {
    const commitRefs = await this.compareCommitRefs(params);
    if (commitRefs.length === 0) {
      return fallbackFiles;
    }
    return this.commitFiles(params, commitRefs);
  }

  private async compareCommitRefs(params: Params): Promise<Array<string>> {
    const compareParams = this.compareParams(params);
    const commits = (await this.github.paginate(
      this.github.repos.compareCommits,
      {
        ...compareParams,
        ref: undefined,
        per_page: 100,
      },
      (response) => (response.data as { commits?: Array<ChangedCommit> }).commits || [],
    )) as Array<ChangedCommit>;
    return commits.map((commit) => commit.sha).filter(isDefined);
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
    const compareParams = this.compareParams(params);

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

  private compareParams(
    params: Params,
  ): Omit<Params, 'commitRefs' | 'includeRemoved' | 'pullChangedFiles' | 'pullNumber'> {
    const {
      commitRefs: _commitRefs,
      includeRemoved: _includeRemoved,
      pullChangedFiles: _pullChangedFiles,
      pullNumber: _pullNumber,
      ...compareParams
    } = params;
    return compareParams;
  }
}
