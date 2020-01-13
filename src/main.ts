import { parseConfig, intoParams } from "./util";
import { GitHubDiff, sets } from "./diff";
import { setFailed, setOutput, debug, warning } from "@actions/core";
import { GitHub } from "@actions/github";
import { env } from "process";

async function run() {
  try {
    const config = parseConfig(env);
    GitHub.plugin(require("@octokit/plugin-throttling"));
    const differ = new GitHubDiff(
      new GitHub(config.githubToken, {
        onRateLimit: (retryAfter, options) => {
          warning(
            `Request quota exhausted for request ${options.method} ${options.url}`
          );
          if (options.request.retryCount === 0) {
            // only retries once
            warning(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onAbuseLimit: (retryAfter, options) => {
          // does not retry, only logs a warning
          warning(
            `Abuse detected for request ${options.method} ${options.url}`
          );
        }
      })
    );
    const diffset = await differ.diff(intoParams(config));
    setOutput("files", diffset.join(" "));
    let filterSets = sets(config.fileFilters, diffset);
    Array.from(Object.entries(filterSets)).forEach(([key, matches]) => {
      debug(`files for ${key} ${matches}`);
      setOutput(key, matches.join(" "));
    });
  } catch (error) {
    setFailed(error.message);
  }
}

run();
