import { GitHub } from "@actions/github";
import { Minimatch } from "minimatch";

export interface Config {
  github_token: string;
  github_ref: string;
  github_repository: string;
}

type Env = { [key: string]: string | undefined };

export const parseConfig = (env: Env): Config => {
  return {
    github_token: env.GITHUB_TOKEN || "",
    github_ref: env.GITHUB_REF || "",
    github_repository: env.GITHUB_REPOSITORY || ""
  };
};

export const sets = (
  sets: Record<string, string>,
  files: Array<string>
): Record<string, Array<string>> => {
  return Array.from(Object.entries(sets)).reduce((filtered, [key, pattern]) => {
    let matcher = new Minimatch(pattern);
    let matched = files.filter(file => matcher.match(file));
    if (matched.length > 0) {
      filtered[key] = matched;
    }
    return filtered;
  }, {});
};

export interface Compare {
  compare(params: {
    base: string;
    head: string;
    owner: string;
    repo: string;
  }): Promise<Array<string>>;
}

export class GitHubCompare implements Compare {
  readonly github: GitHub;
  constructor(github: GitHub) {
    this.github = github;
  }
  async compare(params: {
    base: string;
    head: string;
    owner: string;
    repo: string;
  }): Promise<Array<string>> {
    const response = await this.github.repos.compareCommits(params);
    return response.data.files
      .filter(file => file.status != "removed")
      .map(file => file.filename);
  }
}
