import { parseConfig, GitHubCompare, sets } from "./util";
import { setFailed, setOutput } from "@actions/core";
import { GitHub } from "@actions/github";
import { env } from "process";
import { Minimatch } from "minimatch";

async function run() {
  try {
    const config = parseConfig(env);
    GitHub.plugin(require("@octokit/plugin-throttling"));
    const compare = new GitHubCompare(
      new GitHub(config.github_token, {
        onRateLimit: (retryAfter, options) => {
          console.warn(
            `Request quota exhausted for request ${options.method} ${options.url}`
          );
          if (options.request.retryCount === 0) {
            // only retries once
            console.log(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onAbuseLimit: (retryAfter, options) => {
          // does not retry, only logs a warning
          console.warn(
            `Abuse detected for request ${options.method} ${options.url}`
          );
        }
      })
    );
    const [owner, repo] = config.github_repository.split("/", 2);
    const head = config.github_ref.replace("refs/tags/", "");
    const base = "master";
    const diffset = await compare.compare({
      base,
      head,
      owner,
      repo
    });
    setOutput("files", diffset.join(" "));
    let filerSets = sets(
      {
        md_files: "**/*.md"
      },
      diffset
    );
    Array.from(Object.entries(sets)).forEach(([key, matches]) => {
      console.log(`files for ${key} ${matches}`);
      setOutput(key, matches.join(" "));
    });
  } catch (error) {
    setFailed(error.message);
  }
}

run();
