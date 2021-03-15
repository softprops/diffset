import { Minimatch } from "minimatch";
import { Octokit } from "@octokit/rest";

export type Params = {
  base: string;
  head: string;
  owner: string;
  repo: string;
  ref: string;
};

/** produce a collection of named diff sets based on patterns defined in sets */
export const sets = (
  filters: Record<string, string>,
  files: Array<string>
): Record<string, Array<string>> =>
  Array.from(Object.entries(filters)).reduce(
    (filtered, [key, patterns]) =>
      patterns.split(/\r?\n/).reduce((filtered, pattern) => {
        let matcher = new Minimatch(pattern);
        let matched = files.filter((file) => matcher.match(file));
        if (matched.length > 0) {
          filtered[key] = (filtered[key] || []).concat(matched);
        }
        return filtered;
      }, filtered),
    {}
  );

export interface Diff {
  diff(params: Params): Promise<Array<string>>;
}

const isDefined = <T>(s: T | undefined): s is T => {
  return s != undefined;
};
export class GitHubDiff implements Diff {
  readonly github: Octokit;
  constructor(github: Octokit) {
    this.github = github;
  }
  async diff(params: Params): Promise<Array<string>> {
    // if this is a merge to master push
    // base and head will both be the same
    if (params.base === params.head) {
      const commit = await this.github.repos.getCommit(params);
      return (
        commit.data.files
          ?.filter((file) => file.status != "removed")
          .map((file) => file.filename)
          .filter(isDefined) || []
      );
    } else {
      const response = await this.github.repos.compareCommits(params);
      return response.data.files
        .filter((file) => file.status != "removed")
        .map((file) => file.filename);
    }
  }
}
