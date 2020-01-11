<h1 align="center">
  diffset
</h1>

<p align="center">
   A GitHub Action for producing list of files that changed between branches
</p>

<div align="center">
  <img src="demo.png"/>
</div>

<div align="center">
  <a href="https://github.com/softprops/diffset/actions">
		<img src="https://github.com/softprops/diffset/actions/workflows/Main/badge.svg"/>
	</a>
</div>

<br />

## 🤸 Usage


### 💅 Customizing

#### inputs

The following are optional as `step.with` keys

| Name        | Type    | Description                                                     |
|-------------|---------|-----------------------------------------------------------------|


#### outputs

The following outputs can be accessed via `${{ steps.<step-id>.outputs }}` from this action

| Name        | Type    | Description                                                     |
|-------------|---------|-----------------------------------------------------------------|


#### environment variables

The following are *required* as `step.env` keys

| Name           | Description                          |
|----------------|--------------------------------------|
| `GITHUB_TOKEN` | GITHUB_TOKEN as provided by `secrets`|

Doug Tangren (softprops) 2019
