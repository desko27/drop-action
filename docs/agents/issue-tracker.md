# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on `desko27/drop-action`.

## How agents operate it

- **Local / `gh` CLI available**: use `gh` for all operations.
  - Create: `gh issue create --title "..." --body "..."` (heredoc for multi-line bodies).
  - Read: `gh issue view <number> --comments`.
  - List: `gh issue list --state open --json number,title,body,labels,comments`.
  - Comment: `gh issue comment <number> --body "..."`.
  - Labels: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
  - Close: `gh issue close <number> --comment "..."`.
- **Web / agent sessions (no `gh`)**: use the GitHub MCP tools (`mcp__github__*`) —
  `issue_write` to create/update, `issue_read` / `list_issues` to read,
  `add_issue_comment` to comment. These are the only GitHub access in that
  environment.

Infer the repo from `git remote -v` when using `gh`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read the issue with `gh issue view <number> --comments` (or `issue_read` via MCP).
