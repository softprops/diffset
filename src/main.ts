import { debug, setFailed, setOutput, warning } from '@actions/core';
import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/rest';
import { GitHubDiff, sets } from './diff.js';
import { listOutputs } from './output.js';
import { intoParams, parseConfig } from './util.js';

const setListOutput = (name: string, files: Array<string>) => {
  Array.from(Object.entries(listOutputs(name, files))).forEach(([key, value]) => {
    setOutput(key, value);
  });
};

async function run() {
  try {
    const config = parseConfig(process.env);
    const ThrottledOctokit = Octokit.plugin(throttling);
    const differ = new GitHubDiff(
      new ThrottledOctokit({
        auth: config.githubToken,
        throttle: {
          onRateLimit: (retryAfter, options) => {
            warning(`Request quota exhausted for request ${options.method} ${options.url}`);
            if (options.request.retryCount === 0) {
              // only retries once
              warning(`Retrying after ${retryAfter} seconds!`);
              return true;
            }
          },
          onSecondaryRateLimit: (retryAfter, options) => {
            // does not retry, only logs a warning
            warning(`Abuse detected for request ${options.method} ${options.url}`);
          },
        },
      }),
    );
    const diffset = await differ.diff(intoParams(config));
    setListOutput('files', diffset);
    let filterSets = sets(config.fileFilters, diffset);
    Array.from(Object.entries(filterSets)).forEach(([key, matches]) => {
      debug(`files for ${key} ${matches}`);
      setListOutput(key, matches);
    });
  } catch (error) {
    console.log(error);
    setFailed((error as { message: string }).message);
  }
}

run();
