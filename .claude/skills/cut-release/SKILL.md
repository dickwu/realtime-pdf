---
name: cut-release
description: >-
  End-to-end release runbook for the Realtime PDF Tauri/macOS desktop app. Bumps the version across
  src-tauri/tauri.conf.json, src-tauri/Cargo.toml, Cargo.lock and package.json, commits as
  `chore(release): bump version to vX.Y.Z`, tags and pushes to trigger the GitHub Actions build,
  then uses the gh CLI to watch that build and finishes by verifying `brew upgrade --cask realtime-pdf`
  installs the new version locally. Use this whenever the user wants to release, ship, publish, tag,
  cut, or version-bump this app — e.g. "cut a release", "release v0.1.15", "ship the next version",
  "do a patch release", "publish a new build", "bump and tag the release" — even if they don't
  literally say the word "release". This is the canonical release process for this repo; prefer it
  over generic release/ship tooling.
---

# Cut a Release — Realtime PDF

This app releases by **pushing a `vX.Y.Z` git tag**. That tag, and nothing else, triggers
`.github/workflows/release.yml`, which does all the heavy lifting on GitHub's runners:

1. Builds signed macOS bundles for both Apple Silicon (`aarch64`) and Intel (`x86_64`).
2. Publishes a GitHub Release with the two DMGs, the updater `.app.tar.gz` + `.sig` files, and
   `latest.json` (the in-app updater reads `releases/latest/download/latest.json`).
3. Regenerates the Homebrew cask in `dickwu/homebrew-tap` with the new version and SHA256 sums.

So your job locally is small and deliberate: **bump → commit → tag → push**, then **watch the build
with `gh`** and **confirm `brew upgrade` pulls it**. You are not building binaries on your machine.

Because a pushed tag publishes a public release and rewrites a public tap — both awkward to walk
back — treat the push in Step 5 as the point of no return and get the preflight right first.

## Step 1 — Preflight

Confirm the repo is in a releasable state. Don't skip this; the tag you push builds whatever is on
that commit.

```bash
git rev-parse --abbrev-ref HEAD     # expect: main
git status --short                  # expect: clean (commit/stash anything unrelated first)
git fetch origin && git status -sb  # expect: up to date with origin/main (push real work first)
git log --oneline "$(git describe --tags --abbrev=0)"..HEAD   # the changes this release ships
```

If that last command prints nothing, there's nothing new to release since the latest tag — stop and
confirm with the user before inventing a version.

Then run the same checks CI and the README trust, so you find breakage now rather than 10 minutes
into a runner build:

```bash
bun install
bun run test                                    # = `vitest run`. NOT `bun test`, which runs Bun's
                                                # native runner and fails on Vitest's `vi.*` APIs.
bunx tsc --noEmit
cargo check --manifest-path src-tauri/Cargo.toml
```

## Step 2 — Choose the version

The current shipped version is whatever `src-tauri/tauri.conf.json` says (that is the source of
truth tauri-action uses). Read it, don't guess:

```bash
node -p "require('./src-tauri/tauri.conf.json').version"
```

Default to a **patch** bump (`0.1.14 → 0.1.15`) — every release so far has been a patch within
`0.1.x`. Use minor/major only when the user asks or the changes clearly warrant it. Confirm the
target version with the user if there's any ambiguity, since the tag is hard to retract.

Make sure the tag is free before you commit to it:

```bash
git tag -l "vX.Y.Z"                              # local — expect empty
git ls-remote --tags origin "refs/tags/vX.Y.Z"   # remote — expect empty
```

## Step 3 — Bump the version

Use the bundled script — it edits all four files deterministically and matches the historical
one-line-per-file change, so you avoid hand-editing JSON/TOML/lockfiles:

```bash
bun .claude/skills/cut-release/scripts/bump-version.mjs 0.1.15   # or: patch | minor | major
```

It updates `tauri.conf.json` + `Cargo.toml` (required), the `realtime-pdf` entry in `Cargo.lock`,
and `package.json` (cosmetic — see the note below), then prints the resolved version on its last
line. Eyeball the result before committing:

```bash
git diff -- src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock package.json
```

You should see exactly the version strings change. The tag you push next must equal the
`tauri.conf.json` version with a `v` prefix — if they disagree, tauri-action names the release after
`tauri.conf.json` and the DMG/updater versions won't line up with your tag.

> **Why package.json is only cosmetic:** it's a `private` package, its version isn't consumed by
> Tauri and isn't recorded in `bun.lock`, so historically it was never bumped and drifted behind.
> The script syncs it purely so anyone reading `package.json` sees the truth. If you ever choose to
> leave it out, that's fine functionally — `tauri.conf.json` is what ships.

## Step 4 — Commit

Match the existing history exactly — every release commit is `chore(release): bump version to
vX.Y.Z`. Consistent messages keep `git log --grep "chore(release)"` a clean release ledger.

```bash
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock package.json
git commit -m "chore(release): bump version to v0.1.15"
git push origin main
```

Push the commit to `main` first (above) so the tag points at a commit that already exists on the
remote branch.

## Step 5 — Tag and push (this is the trigger)

```bash
git tag v0.1.15
git push origin v0.1.15
```

The moment that tag lands on the remote, `release.yml` starts. There is no separate "create release"
step — CI does it. (Do **not** run `gh release create` yourself; that would make an empty release
with no binaries and skip the tap update, fighting the workflow.)

## Step 6 — Watch the build with gh

The build matrix (two macOS targets) plus the tap job takes a while. Follow it live and let the exit
status gate the next step:

```bash
sleep 8   # give GitHub a moment to register the run
RUN_ID=$(gh run list --workflow=release.yml --event push --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

`--exit-status` returns non-zero if any job fails. But `gh run watch` long-polls for many minutes and
can itself die on a transient network blip (`can't assign requested address`), so don't treat its exit
code as the final word — and never append another command after it on the same line, or that command's
exit code masks the watch's. Confirm the real outcome explicitly:

```bash
gh run view "$RUN_ID" --json status,conclusion,jobs \
  --jq '{conclusion, jobs: [.jobs[] | {name, conclusion}]}'
```

Expect `conclusion: success` for the run and for all three jobs (`publish-tauri` ×2 +
`update-homebrew-tap`). If anything failed, read its log and see **Troubleshooting**:

```bash
gh run view "$RUN_ID" --log-failed
```

## Step 7 — Verify the GitHub release

Confirm the release exists and carries the full asset set — both DMGs, both updater bundles + their
`.sig`, and `latest.json` (without `latest.json` the in-app updater can't see the release):

```bash
gh release view v0.1.15 --json name,isDraft,isPrerelease,assets \
  --jq '{name, isDraft, isPrerelease, assets: [.assets[].name]}'
```

Expect `isDraft: false`, `isPrerelease: false`, and asset names like
`Realtime.PDF_0.1.15_aarch64.dmg`, `Realtime.PDF_0.1.15_x64.dmg`,
`Realtime.PDF_aarch64.app.tar.gz(.sig)`, `Realtime.PDF_x64.app.tar.gz(.sig)`, `latest.json`.

## Step 8 — Verify the Homebrew upgrade (the finish line)

The `update-homebrew-tap` job rewrites the cask only after the binaries publish, so a green run
(Step 6) already means the tap was pushed and your local tap clone's tracking ref was updated. Now
upgrade the installed app:

```bash
# One-time per machine: Homebrew refuses a third-party tap until trusted. It's your own tap — safe:
brew trust dickwu/tap

# HOMEBREW_NO_AUTO_UPDATE skips brew's pre-flight `brew update`, which can crash on a known
# cache-store bug — and is unneeded here since CI already pushed the cask your local clone tracks.
HOMEBREW_NO_AUTO_UPDATE=1 brew upgrade --cask realtime-pdf

# Confirm BOTH the cask record and the actual installed bundle read the new version:
brew list --cask --versions realtime-pdf                                                       # realtime-pdf 0.1.15
defaults read "/Applications/Realtime PDF.app/Contents/Info.plist" CFBundleShortVersionString  # 0.1.15
```

Done: a tagged release is live, the GitHub Release has signed bundles + `latest.json` for in-app
updates, and `brew upgrade --cask realtime-pdf` installs it. Report the version, the release URL
(`gh release view v0.1.15 --json url --jq .url`), and the confirmed brew version back to the user.

## Troubleshooting

- **`Refusing to load cask ... from untrusted tap`.** Homebrew's third-party-tap security policy.
  Trust your own tap once with `brew trust dickwu/tap` (or `brew trust --cask
  dickwu/tap/realtime-pdf`), then retry the upgrade.

- **`brew update` crashes** (Ruby error in `cache_store.rb` / `update-report.rb`). A known Homebrew
  bug, unrelated to the release. You don't need it: CI already pushed the cask, so upgrade with
  `HOMEBREW_NO_AUTO_UPDATE=1 brew upgrade --cask realtime-pdf`. To refresh only this tap without the
  global update, `git -C "$(brew --repository dickwu/tap)" pull`.

- **`brew upgrade` says "already up to date" but you expect the new version.** The local tap clone is
  behind. Refresh just it — `git -C "$(brew --repository dickwu/tap)" pull` — then check the cask
  source: `grep version "$(brew --repository dickwu/tap)/Casks/realtime-pdf.rb"`. If the tap itself
  still shows the old version, open the `update-homebrew-tap` job log (`gh run view "$RUN_ID" --log`)
  — it may have failed on `TAP_GITHUB_TOKEN` (an expired/missing token can't push to the tap).

- **Release published but the cask never updated.** `publish-tauri` succeeded while
  `update-homebrew-tap` failed. The release is still valid (DMG + in-app updater work); you can
  re-run just the tap job with `gh run rerun "$RUN_ID" --failed`, or fix the cask in the tap repo by
  hand.

- **macOS "app is damaged / unidentified developer" after install.** Expected for an
  ad-hoc-signed build; clear the quarantine bit:
  `sudo xattr -d com.apple.quarantine "/Applications/Realtime PDF.app"`.

- **In-app updater doesn't offer the update.** It reads `releases/latest/download/latest.json`, so
  the release must be the *latest, non-draft, non-prerelease* one and must include `latest.json`.
  Re-check Step 7. Signing is handled by `TAURI_SIGNING_PRIVATE_KEY` in CI — a signature mismatch
  means the updater pubkey in `tauri.conf.json` no longer matches the signing key.

- **Tag/version mismatch.** If you pushed a tag that doesn't match `tauri.conf.json`, the safest fix
  is to delete the tag (`git push origin :refs/tags/vX.Y.Z` and `git tag -d vX.Y.Z`), correct the
  version, and re-tag. Only do this before anyone has installed the release.

- **CI Rust/build failure.** Reproduce locally with `cargo check --manifest-path src-tauri/Cargo.toml`
  and `bunx tauri build --debug --no-bundle`. Fix on `main`, then move the tag to the new commit (or
  bump to the next patch and re-release — cleaner than moving a public tag).

## Reference: the pipeline at a glance

| Stage | Where | What |
|-------|-------|------|
| Trigger | local | push `vX.Y.Z` tag |
| Build + publish | `release.yml` → `publish-tauri` | `tauri-action` builds aarch64 + x86_64, signs updater artifacts, creates the GitHub Release |
| Homebrew | `release.yml` → `update-homebrew-tap` | downloads DMGs, computes SHA256, rewrites `dickwu/homebrew-tap` `Casks/realtime-pdf.rb`, pushes |
| In-app update | runtime | app polls `releases/latest/download/latest.json`, verifies minisign signature, self-replaces |
| Local upgrade | your machine | `brew update && brew upgrade --cask realtime-pdf` |

Secrets the workflow depends on (set in repo settings, not something you provide locally):
`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `TAP_GITHUB_TOKEN`,
plus the default `GITHUB_TOKEN`.
