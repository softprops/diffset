import { Minimatch } from 'minimatch';

import type { ChangedFile, CompareRequest, GitHubClient } from './github.js';

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

const CompareFilesLimit = 300;

/** produce a collection of named diff sets based on patterns defined in sets */
export const sets = (
  filters: Record<string, string>,
  files: Array<string>,
): Record<string, Array<string>> => {
  const filtered: Record<string, Array<string>> = {};
  const uniqueFiles = Array.from(new Set(files));

  for (const [key, patterns] of Object.entries(filters)) {
    const matches = patterns
      .split(/\r?\n/)
      .map((pattern) => pattern.trim())
      .filter((pattern) => pattern.length > 0)
      .reduce((matches, pattern) => {
        const negate = pattern.startsWith('!');
        const expression = negate ? pattern.substring(1).trim() : pattern;
        if (expression.length === 0) {
          return matches;
        }

        const matcher = new Minimatch(expression);
        uniqueFiles
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
    const orderedMatches = uniqueFiles.filter((file) => matches.has(file));
    if (orderedMatches.length > 0) {
      filtered[key] = orderedMatches;
    }
  }

  return filtered;
};

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
  readonly github: GitHubClient;
  constructor(github: GitHubClient) {
    this.github = github;
  }
  async diff(params: Params): Promise<Array<string>> {
    if (params.commitRefs != undefined) {
      return filenames(await this.commitFiles(params, params.commitRefs), params.includeRemoved);
    }

    if (params.pullNumber != undefined) {
      let files: Array<ChangedFile>;
      try {
        files = await this.compareFiles(params);
      } catch {
        return filenames(await this.pullFiles(params, params.pullNumber), params.includeRemoved);
      }
      if (params.pullChangedFiles != undefined && files.length < params.pullChangedFiles) {
        return filenames(await this.pullFiles(params, params.pullNumber), params.includeRemoved);
      }
      if (params.pullChangedFiles == undefined && this.mayHaveTruncatedCompare(params, files)) {
        return filenames(await this.pullFiles(params, params.pullNumber), params.includeRemoved);
      }
      return filenames(files, params.includeRemoved);
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
    for (const ref of new Set(commitRefs)) {
      const commitFiles = await this.github.commitFiles({
        owner: params.owner,
        repo: params.repo,
        ref,
        per_page: 100,
      });
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
    const commits = await this.github.compareCommits({
      ...this.compareRequest(params),
      per_page: 100,
    });
    return commits.map((commit) => commit.sha).filter(isDefined);
  }

  private async pullFiles(params: Params, pullNumber: number): Promise<Array<ChangedFile>> {
    return this.github.pullFiles({
      owner: params.owner,
      repo: params.repo,
      pull_number: pullNumber,
      per_page: 100,
    });
  }

  private async compareFiles(params: Params): Promise<Array<ChangedFile>> {
    const compareParams = this.compareRequest(params);

    // if this is a merge to the base branch
    // base and head will both be the same
    if (compareParams.base === compareParams.head) {
      return this.github.commitFiles({
        owner: params.owner,
        repo: params.repo,
        ref: params.ref,
        per_page: 100,
      });
    }
    return this.github.compareFiles(compareParams);
  }

  private compareRequest(params: Params): CompareRequest {
    return {
      base: params.base,
      head: params.head,
      owner: params.owner,
      repo: params.repo,
    };
  }
}
