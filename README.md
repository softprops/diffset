<h1 align="center">
  diffset
</h1>

<p align="center">
   A GitHub Action for producing list of files that changed between branches
</p>

<div align="center">
  <a href="https://github.com/softprops/diffset/actions">
		<img src="https://github.com/softprops/diffset/workflows/Main/badge.svg"/>
	</a>
</div>

<br />

## 🤸 Usage

A typical usage involves adding job step using `softprops/diffset@master`

This will collect a list of files that have changed and export them to an output named `files`

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
+       uses: softprops/diffset@master
+       env:
+         GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Print Diffset
        run: echo "Files changed were ${{ steps.diffset.outputs.files }}"
```

### 💅 Customizing

#### inputs

The following are optional as `step.with` keys

This action supports dynamically named inputs which will result in dynamically named outputs.
Specifically this uses any inputs with a suffix of `_files`

| Name        | Type    | Description                                                     |
|-------------|---------|-----------------------------------------------------------------|
| `*_files`   | string  | A file pattern to filter changed files                          |


#### outputs

The following outputs can be accessed via `${{ steps.<step-id>.outputs }}` from this action

This action supports dynamically named inputs which will result in dynamically named outputs.
Specifically this uses any inputs with a suffix of `_files`

| Name        | Type    | Description                                                     |
|-------------|---------|-----------------------------------------------------------------|
| `*_files`   | string  | A space delimited list of files that changed that matched an input pattern |


#### environment variables

The following are *required* as `step.env` keys

| Name           | Description                          |
|----------------|--------------------------------------|
| `GITHUB_TOKEN` | GITHUB_TOKEN as provided by `secrets`|

Doug Tangren (softprops) 2019
