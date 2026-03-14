import { debug, setFailed, setOutput, warning } from '@actions/core';
import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/rest';
import { env } from 'process';
import { GitHubDiff, sets } from './diff.js';
import { intoParams, parseConfig } from './util.js';

async function run() {
  try {
    const config = parseConfig(env);
    const ThrottledOctokit = Octokit.plugin(throttling);
    const differ = new GitHubDiff(
      new ThrottledOctokit({
        auth: config.githubToken,
        onRateLimit: (retryAfter, options) => {
          warning(`Request quota exhausted for request ${options.method} ${options.url}`);
          if (options.request.retryCount === 0) {
            // only retries once
            warning(`Retrying after ${retryAfter} seconds!`);
            return true;
          }
        },
        onAbuseLimit: (retryAfter, options) => {
          // does not retry, only logs a warning
          warning(`Abuse detected for request ${options.method} ${options.url}`);
        },
      }),
    );
    const diffset = await differ.diff(intoParams(config));
    setOutput('files', diffset.join(' '));
    let filterSets = sets(config.fileFilters, diffset);
    Array.from(Object.entries(filterSets)).forEach(([key, matches]) => {
      debug(`files for ${key} ${matches}`);
      setOutput(key, matches.join(' '));
    });
  } catch (error) {
    console.log(error);
    setFailed((error as { message: string }).message);
  }
}

run();
