import { Params } from "./diff";
import { escape } from "querystring";

export interface Config {
  githubToken: string;
  githubRef: string;
  githubRepository: string;
  base?: string | undefined;
  fileFilters: Record<string, string>;
  sha: string;
}

type Env = Record<string, string | undefined>;

/** GitHub exposes `with` input fields in the form of env vars prefixed with INPUT_ */
const FileFilter = /INPUT_(\w+)_FILES/;

export const intoParams = (config: Config): Params => {
  const [owner, repo] = config.githubRepository.split("/", 2);
  const head = escape(config.githubRef.substring(11));
  const base = escape(config.base || "master");
  const ref = config.sha;
  return {
    base,
    head,
    owner,
    repo,
    ref,
  };
};

export const parseConfig = (env: Env): Config => {
  return {
    githubToken: env.GITHUB_TOKEN || "",
    githubRef: env.GITHUB_REF || "",
    githubRepository: env.GITHUB_REPOSITORY || "",
    base: env.INPUT_BASE,
    fileFilters: Array.from(Object.entries(env)).reduce(
      (filters, [key, value]) => {
        if (FileFilter.test(key)) {
          filters[key.toLowerCase().replace("input_", "")] = value;
        }
        return filters;
      },
      {}
    ),
    sha: env.GITHUB_SHA || "",
  };
};
