export interface Config {
  githubToken: string;
  githubRef: string;
  githubRepository: string;
  fileFilters: Record<string, string>;
}

type Env = Record<string, string | undefined>;

/** GitHub exposes `with` input fields in the form of env vars prefixed with INPUT_ */
const FileFilter = /INPUT_(\w+)_FILES/;

export const parseConfig = (env: Env): Config => {
  return {
    githubToken: env.GITHUB_TOKEN || "",
    githubRef: env.GITHUB_REF || "",
    githubRepository: env.GITHUB_REPOSITORY || "",
    fileFilters: Array.from(Object.entries(env)).reduce(
      (filters, [key, value]) => {
        if (FileFilter.test(key)) {
          filters[key.toLowerCase().replace("input_", "")] = value;
        }
        return filters;
      },
      {}
    )
  };
};
