import { GitHub } from "@actions/github";
import { Minimatch } from "minimatch";

export type Params = {
  base: string;
  head: string;
  owner: string;
  repo: string;
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
        let matched = files.filter(file => matcher.match(file));
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

export class GitHubDiff implements Diff {
  readonly github: GitHub;
  constructor(github: GitHub) {
    this.github = github;
  }
  async diff(params: Params): Promise<Array<string>> {
    const response = await this.github.repos.compareCommits(params);
    return response.data.files
      .filter(file => file.status != "removed")
      .map(file => file.filename);
  }
}
