---
name: changeset-release
description: >-
  Cut and verify a release for a Changesets-based package: write the changeset,
  branch/commit/push, open a PR, wait for CI, merge, then handle the Changesets
  "version packages" PR and confirm the publish actually landed on npm. Use this
  whenever the user wants to release, ship, publish, cut a release, bump a
  version, or "get this on npm" for a repo that uses Changesets + a GitHub
  Actions release workflow — even if they don't say "changeset" explicitly. Also
  use it to diagnose a stuck release (a version PR that never opened, a publish
  job that ran but npm shows the old version, main's version trailing npm).
---

# Changeset release

This automates the full path from "my change is ready" to "the new version is live
on npm" for a repo that releases with [Changesets](https://github.com/changesets/changesets)
driven by a GitHub Actions workflow. It exists because that path has a non-obvious
shape — **two** merges, not one — and because the only honest definition of "done"
is the registry showing the new version, not a green workflow.

## The shape you must understand first

Changesets + a `release.yml` that runs on push to `main` works in **two phases**:

1. **Your feature PR** carries a changeset file. When it merges to `main`, the
   release workflow runs and — because an unreleased changeset is present — the
   Changesets bot opens a **second PR** (titled like `chore: version packages`).
   It does **not** publish yet. That PR bumps `version` in `package.json` and
   writes `CHANGELOG.md`, consuming the changeset.
2. **The version PR** is the one that actually ships. When *it* merges, the
   release workflow runs again, now finds no pending changeset, and runs
   `changeset publish` → npm.

So a release is **branch → feature PR → merge → (bot opens version PR) → merge
version PR → publish**. Forgetting the second merge is the most common "why didn't
it publish?" — the workflow is green, the version PR is just sitting there unmerged.

## Before doing anything: orient to the repo

Don't assume any one repo's exact setup. Confirm the moving parts, because the
commands depend on them:

- **Changesets present?** `ls .changeset/config.json`. If absent, this skill
  doesn't apply — stop and tell the user.
- **Release mechanism?** Read `.github/workflows/*.yml` for a `changesets/action`
  step. Note its `publish:` command (`changeset publish` / `npm publish` / `bun
  publish`), its `version:` command, and the version-PR `title`/`commit` (default
  `chore: version packages`). Note the release workflow's **filename** — you'll
  select its runs by it.
- **Package manager + checks?** Read `package.json` scripts and the CI workflow so
  you know what "green" means (test, build, typecheck, lint, coverage, memory…).
  Note: local git hooks (husky `pre-commit`/`pre-push`) often run only a *subset*
  (e.g. just `bun test`), so run the **full** CI check set yourself in pre-flight —
  don't trust the hooks to have covered typecheck/build/memory.
- **gh auth?** `gh auth status`. PR/merge steps need it.
- **Branch protection?** `gh api repos/<owner>/<repo>/branches/main/protection`.
  If it 404s ("not protected"), GitHub will **not** block a merge on red/pending
  CI — your gate in step 5 is then the *only* thing preventing a broken merge from
  publishing. Know this before you start.
- **Bump type?** Decide `patch` / `minor` / `major` from the change (semver:
  bugfix → patch, backward-compatible feature → minor, breaking → major). When
  unsure, ask the user rather than guessing — the bump is their call.

## Procedure

Run this as a sequence of gates. Each gate must *actually* pass — verified by an
exit code, not by eyeballing printed output — before the next. This workflow has
irreversible, outward-facing steps (a public npm publish), so confirm rather than
barrel ahead.

### 1. Pre-flight — green locally first

Run the repo's full check set locally (the same things CI runs — including the
ones local hooks skip) plus the build. A red local run means CI will fail too; fix
before opening anything. Don't push work you haven't seen pass.

### 2. Write the changeset

Create `.changeset/<short-kebab-name>.md`:

```markdown
---
"<package-name>": minor
---

<One or two sentences describing the change from a consumer's point of view —
this becomes the CHANGELOG entry. Lead with what changed for users, not how.>
```

Match the style of existing entries (`git show <commit>:.changeset/<file>`). Use
the real package name from `package.json` and the bump type you decided.

### 3. Branch, commit, push

If on the default branch, branch first (`feat/…`, `fix/…`, `build/…`). Stage the
change + the changeset, commit with a Conventional Commits message (the repo may
enforce commitlint), and push with `-u`.

### 4. Open the feature PR

`gh pr create` with a Conventional-Commits title and a body covering what changed,
why, scope decisions, and how it was verified. Capture the PR number.

### 5. Gate: CI must actually pass — and abort if it doesn't

Let the exit status drive the decision; do not merge on printed text alone:

```bash
gh pr checks <PR> --watch --fail-fast   # blocks until checks finish; non-zero exit = a check failed
```

`gh pr checks` exit codes: **0** = all passed, **8** = none registered yet,
**other** = a check failed. If it returns 8 immediately, checks haven't been
created — wait ~20s and retry until they register, then watch. **Only an exit of 0
clears this gate.** Because `gh pr merge` will merge even with CI red/pending when
`main` has no branch protection (you checked this above), a non-zero result is a
hard stop: fix, re-push, re-watch — never merge red.

### 6. Merge the feature PR

Only after step 5 returned 0: `gh pr merge <PR> --merge` (or the repo's
convention — squash/rebase; whichever, the `.changeset/*.md` must reach `main`).
Capture the merge commit SHA — you'll need it to find the right run:

```bash
gh pr merge <PR> --merge
SHA=$(gh pr view <PR> --json mergeCommit --jq '.mergeCommit.oid')
git fetch origin   # refresh refs after the merge — no branch switch, no merge into the current branch
```

### 7. Wait for the version PR to appear

Select the release run **by the merge SHA**, not by recency — CI and the release
workflow both fire on the same push, and queued/concurrent release runs
(`cancel-in-progress: false`) mean `--limit 1` can watch the wrong one. The bot
opens the PR as a *separate* step after the run, so poll for it rather than
checking once:

```bash
RUN=$(gh run list --workflow=<release.yml> --json databaseId,headSha \
        --jq ".[] | select(.headSha==\"$SHA\") | .databaseId" | head -1)
gh run watch "$RUN" --exit-status

for i in $(seq 1 10); do
  gh pr list --state open --search 'in:title "version packages"' --json number,title \
    | grep -q version && break
  sleep 15
done
gh pr list --state open --search 'in:title "version packages"' --json number,title
```

If after the loop there's still no version PR, the feature PR merged **without** a
changeset on `main`, or the release run failed — check the run logs and that your
`.changeset/*.md` actually landed on `main`.

### 8. Verify the bump, then merge the version PR

Inspect the bot PR's diff — confirm `version` bumped by the expected amount and the
CHANGELOG entry is right (`gh pr diff <versionPR>`). Then merge it. **This is the
merge that publishes** — treat it as the point of no return; confirm with the user
if anything looks off. Capture its merge SHA and sync again:

```bash
gh pr merge <versionPR> --merge
VSHA=$(gh pr view <versionPR> --json mergeCommit --jq '.mergeCommit.oid')
git fetch origin
```

### 9. Wait for the publish run

Select the release run triggered by the version-PR merge, by `VSHA`, and watch it:

```bash
RUN=$(gh run list --workflow=<release.yml> --json databaseId,headSha \
        --jq ".[] | select(.headSha==\"$VSHA\") | .databaseId" | head -1)
gh run watch "$RUN" --exit-status
```

### 10. Gate: confirm it's actually on npm

A green publish job is **not** proof. Verify against the registry:

```bash
npm view <package>@<version> version dist-tags
```

For a gold-standard check, install the published version fresh in a temp dir and
exercise the headline change — proves the artifact a consumer downloads actually
works, not just that a tarball uploaded. Only after the registry confirms the new
version should you report the release as done.

## Reporting

State the outcome plainly with evidence: PR numbers, the version bump (`X → Y`),
the publish run result, and the `npm view` confirmation. If you ran a post-publish
smoke test, say what you checked. If a step is still pending (e.g. the publish run
is mid-flight), say so — don't claim "published" before npm shows it.

## Common failure modes

- **Workflow green but nothing published** → the version PR is unmerged. Merge it
  (step 8). This is phase 2 of the dance.
- **`main`'s version trails npm / a changeset is still sitting on `main`** → the
  version PR for that changeset hasn't been merged yet (or local `main` is just
  stale — `git pull` first to be sure). Find the open `version packages` PR and
  merge it; if none exists, the release run that should have opened it failed.
- **No version PR ever appeared** → the feature PR merged without a changeset, or
  the release workflow failed. Check run logs and that `.changeset/<file>.md`
  reached `main`.
- **Watched the wrong run / it finished suspiciously fast** → `--limit 1` grabbed
  a CI run or a stale release run. Re-select by `headSha` (steps 7/9).
- **`gh pr checks` exits 8 forever** → checks haven't been created; confirm CI
  triggers on `pull_request` and the branch actually pushed.
- **Publish job succeeds, `npm view` shows old version** → auth/registry/provenance
  (OIDC) issue in the publish step, or it republished an existing version. Read the
  publish run logs; check the `publish:` command and npm token / `id-token`
  permission.
- **Lifecycle scripts fail in `bun pm pack`/publish locally** (e.g. a `prepare`
  husky hook) → use `--ignore-scripts` for local inspection only; CI does the real
  publish.

## Guardrails

- Don't open or merge anything until the user has signalled they want to release
  (this skill triggering ≠ permission to publish). The feature-PR steps are
  reversible; **merging the version PR and publishing are not** — confirm before
  those.
- The CI gate (step 5) is enforced by *you*, not necessarily by GitHub — if `main`
  isn't branch-protected, a non-zero `gh pr checks` is the only thing standing
  between a red build and a public release. Honor it.
- Never report "released" without the `npm view` confirmation in hand.
- If the repo isn't Changesets-based, or there's no release workflow, stop and
  surface that — don't improvise a manual `npm publish` unless the user explicitly
  asks for it.
