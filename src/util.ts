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
