<h1 align="center">
  diffset
</h1>

<p align="center">
   A GitHub Action for producing lists of files that changed between branches
</p>

<div align="center">
  <a href="https://github.com/softprops/diffset/actions">
		<img src="https://github.com/softprops/diffset/workflows/Main/badge.svg"/>
	</a>
</div>

<br />

## ⚡ why bother

The goal of a workflow is to do its work as quickly as possible. A core feature of GitHub actions enables this called [path filtering](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/workflow-syntax-for-github-actions#onpushpull_requestpaths)

Many command line tools accept a list of files as inputs to limit the amount of work they need to do. Diffset is a tool that targets the usecase of maximally efficient workflows where such tools are in use so that you can apply them to only the things that changed. Save yourself some time and [money](https://help.github.com/en/github/setting-up-and-managing-billing-and-payments-on-github/about-billing-for-github-actions#about-billing-for-github-actions).

✨ Doing less is faster than doing more ✨

## 🤸 Usage

The typical setup for diffset involves adding job step using `softprops/diffset@v3`.

This will collect a list of files that have changed and export them to an output named `files`. It retrieves this list of files from the GitHub api and as such it will need your repositories `GITHUB_TOKEN` secret.

```diff
name: Main

on: push

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
+     - name: Diffset
+       id: diffset
+       uses: softprops/diffset@v3
      - name: Print Diffset
        env:
          DIFFSET_FILES_JSON: ${{ steps.diffset.outputs.files_json }}
        shell: bash
        run: |
          mapfile -t diffset_files < <(jq -r '.[]' <<< "${DIFFSET_FILES_JSON}")
          if [ "${#diffset_files[@]}" -gt 0 ]; then
            ls -al "${diffset_files[@]}"
          fi
```

### 💅 Customizing

The default behavior of diff is to simply introduce an output named `files` which is the set of changed files in your branch. In other cases certain workflows may benefit from skipping jobs when a class of files are not changed.

#### Custom diff sets

Diffset also allows you to create filters for named sets of files to avoid doing unessessary work within your pipeline and produces an named output for those sets of files when they changed. These named sets of files can include multiple patterns for any given set to allow for maximum flexibility.

```diff
name: Main

on: push

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Diffset
        id: diffset
        uses: softprops/diffset@v3
+       env:
+         INPUT_SPECIAL_FILES: |
+           src/special/**/*.ts
+           src/or-these/**/*.ts
      - name: Print Special Files
        env:
          DIFFSET_OUTPUTS: ${{ toJSON(steps.diffset.outputs) }}
        shell: bash
        run: |
          special_files_json="$(jq -r '.special_files_json // "[]"' <<< "${DIFFSET_OUTPUTS}")"
          mapfile -t special_files < <(jq -r '.[]' <<< "${special_files_json}")
          if [ "${#special_files[@]}" -gt 0 ]; then
            ls -al "${special_files[@]}"
          fi
      - name: Other work
        run: echo "..."
```

#### Custom base branch

Diffset uses the repository default branch from the workflow event as a basis of comparison by default, falling back to "master" when the event does not include one. If you want a different base branch you can use the `steps.with` key to provide a custom `base`

```diff
name: Main

on: push

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Diffset
        id: diffset
        uses: softprops/diffset@v3
+       with:
+         base: develop
      - name: Other work
        env:
          DIFFSET_FILES_JSON: ${{ steps.diffset.outputs.files_json }}
        shell: bash
        run: |
          mapfile -t diffset_files < <(jq -r '.[]' <<< "${DIFFSET_FILES_JSON}")
          if [ "${#diffset_files[@]}" -gt 0 ]; then
            ls -al "${diffset_files[@]}"
          fi
```

#### inputs

The following declared inputs are optional as `step.with` keys. Dynamic file
filters can also be provided as `INPUT_*_FILES` environment variables, which
keeps local workflow linting tools from warning about undeclared inputs.

This action supports dynamically named inputs which will result in dynamically named outputs.
Specifically this action accepts any inputs with a suffix of `_files`

| Name              | Type    | Description                                                       |
| ----------------- | ------- | ----------------------------------------------------------------- |
| `*_files`         | string  | A file pattern to filter changed files                            |
| `base`            | string  | Base branch for comparison. Defaults to the repository default branch |
| `include_removed` | boolean | Include removed files in diff outputs. Defaults to `false`        |

Removed files are excluded from outputs by default because deleted paths usually cannot be passed to tools after checkout.

For least-privilege workflows, `permissions: contents: read` is enough for normal compare diffs. Large pull requests may also need `pull-requests: read` when diffset falls back to the Pulls API to avoid truncated file lists.

#### outputs

The following outputs can be accessed via `${{ steps.<step-id>.outputs }}` from this action

This action supports dynamically named inputs which will result in dynamically named outputs.
Specifically this action yields outputs based on inputs named with a suffix of `_files`

| Name            | Type   | Description                                                                |
| --------------- | ------ | -------------------------------------------------------------------------- |
| `files`         | string | A space delimited list of changed files                                    |
| `files_json`    | string | A JSON array of changed files                                              |
| `*_files`       | string | A space delimited list of files that changed that matched an input pattern |
| `*_files_json`  | string | A JSON array of files that changed that matched an input pattern           |

The JSON outputs are preferred when passing file paths to shell commands because
they preserve filenames containing spaces. The space-delimited outputs remain
available for compatibility.

### 💁‍♀️ pro tips

In more complicated workflows you may find that simply cloning your repository takes a succfiently long about of time. In these cases you can opt to generate a diffset first, then checkout only if needed.

```diff
name: Main

on: push

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - name: Diffset
        id: diffset
        uses: softprops/diffset@v3
+       env:
+         INPUT_SPECIAL_FILES: |
+           src/special/**/*.ts
+           src/or-these/**/*.ts
+      - name: Check Special Files
+        id: special_files
+        env:
+          DIFFSET_OUTPUTS: ${{ toJSON(steps.diffset.outputs) }}
+        shell: bash
+        run: |
+          special_files_json="$(jq -r '.special_files_json // "[]"' <<< "${DIFFSET_OUTPUTS}")"
+          if [ "${special_files_json}" = "[]" ]; then
+            echo "changed=false" >> "${GITHUB_OUTPUT}"
+          else
+            echo "changed=true" >> "${GITHUB_OUTPUT}"
+          fi
      - name: Checkout
+       if: steps.special_files.outputs.changed == 'true'
        uses: actions/checkout@v6
```

Doug Tangren (softprops) 2019-2021

.
