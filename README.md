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

The typical setup for diffset involves adding job step using `softprops/diffset@v1`.

This will collect a list of files that have changed and export them to an output named `files`. It retrieves this list of files from the GitHub api and as such it will need your repositories `GITHUB_TOKEN` secret.

```diff
name: Main

on: push

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v2
+     - name: Diffset
+       id: diffset
+       uses: softprops/diffset@v1
+       env:
+         GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Print Diffset
        run: ls -al ${{ steps.diffset.outputs.files }}
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
        uses: actions/checkout@v2
      - name: Diffset
        id: diffset
        uses: softprops/diffset@v1
+       with:
+         special_files: |
+           src/special/**/*.ts
+           src/or-these/**/*.ts
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Print Special Files
        if: diffset.outputs.special_files
        run: ls -al ${{ steps.diffset.outputs.special_files }}
      - name: Other work
        run: echo "..."
```

#### Custom base branch

Most GitHub repositories use a default "master" branch. Diffset uses this as a basis of comparison by default. If you use a different base branch you can use the `steps.with` key to provide a custom `base`

```diff
name: Main

on: push

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v2
      - name: Diffset
        id: diffset
        uses: softprops/diffset@v1
+       with:
+         base: develop
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Other work
        run: ls -al ${{ steps.diffset.outputs.files }}
```

#### inputs

The following are optional as `step.with` keys

This action supports dynamically named inputs which will result in dynamically named outputs.
Specifically this action accepts any inputs with a suffix of `_files`

| Name        | Type    | Description                                                     |
|-------------|---------|-----------------------------------------------------------------|
| `*_files`   | string  | A file pattern to filter changed files                          |
| `base`      | string  | Base branch for comparison. Defaults to "master"                |


#### outputs

The following outputs can be accessed via `${{ steps.<step-id>.outputs }}` from this action

This action supports dynamically named inputs which will result in dynamically named outputs.
Specifically this action yields outputs based on inputs named with a suffix of `_files`

| Name        | Type    | Description                                                     |
|-------------|---------|-----------------------------------------------------------------|
| `*_files`   | string  | A space delimited list of files that changed that matched an input pattern |


#### environment variables

The following are *required* as `step.env` keys

| Name           | Description                          |
|----------------|--------------------------------------|
| `GITHUB_TOKEN` | GITHUB_TOKEN as provided by `secrets`|


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
        uses: softprops/diffset@v1
       with:
         special_files: |
           src/special/**/*.ts
           src/or-these/**/*.ts
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Checkout
+       if: diffset.outputs.special_files
        uses: actions/checkout@v2
```

Doug Tangren (softprops) 2019
