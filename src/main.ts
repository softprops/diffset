import {  parseConfig } from "./util";
import { setFailed, setOutput } from "@actions/core";
import { GitHub } from "@actions/github";
import { env } from "process";
import { fchmod } from "fs";

async function run() {
  try {
    const config = parseConfig(env);
    GitHub.plugin(require("@octokit/plugin-throttling"));
    const gh = new GitHub(config.github_token, {
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
    });
    const [owner, repo] = config.github_repository.split("/");
    const head = "master";
    const base = config.github_ref.replace("refs/tags/", "");
    const commits = await gh.repos.compareCommits({
      base,
      head,
      owner,
      repo
    });
    const diffset = commits.data.files.filter(file => file.status != "removed").map(file => file.filename);
  } catch (error) {
    setFailed(error.message);
  }
}

run();
