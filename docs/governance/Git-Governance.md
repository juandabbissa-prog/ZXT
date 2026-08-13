# Git Governance

## Branch naming

- REPLAN work uses `sprint/<number>-<topic>` or a task-authorized exact name.
- Fixes use `fix/<topic>`; governance-only work may use `docs/<topic>` or an explicitly authorized branch.
- Never rewrite or rename historical branches merely to match current naming.

## Commit messages

- Use Conventional Commits: `feat:`, `fix:`, `ci:`, `test:`, `docs:`, or `chore:`.
- Each commit has one auditable purpose and contains no credentials or unrelated formatting.

## Pull requests and review

- PRs identify canonical Sprint generation, scope, non-goals, changed files, verification, side effects, and rollback considerations.
- At least one independent reviewer verifies scope, failure propagation, evidence, and Secret safety before merge.
- Required checks must pass; failures cannot be hidden with `continue-on-error`, `|| true`, or equivalent logic.

## Merge

- Merge only after explicit authorization, review approval, and applicable CI evidence.
- Direct development commits to `main` are prohibited.

## Tags and release baseline

- A release tag points only to an reviewed, merged, passing `main` commit.
- Tag creation requires separate authorization and records the immutable commit SHA.
- Existing tags and history are never rewritten as part of REPLAN-S0 governance.
