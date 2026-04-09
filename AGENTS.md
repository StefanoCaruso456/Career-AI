# Career AI Working Rules

## Publish At Finish
Unless the user explicitly says not to publish or wants local-only changes, finish every completed code task in this repository with this workflow:

1. Show the exact git commands before running them.
2. Stage only the files relevant to the task.
3. Commit.
4. Push.
5. Create or update a pull request against `main`.
6. Merge the pull request into `main` when the work is complete and the repository allows the merge.
7. Include the branch name, commit SHA, and pull request URL in the final response.

## Branch Discipline
- If the current branch already has a merged pull request, create a new `codex/<topic>` branch from `origin/main` before making new repo changes.
- If unrelated files are modified and scope is ambiguous, stop and confirm before staging.
- If checks, review requirements, or conflicts block the merge to `main`, explain the blocker clearly instead of claiming the work is fully merged.
- Never quietly leave completed repo changes unpublished.
