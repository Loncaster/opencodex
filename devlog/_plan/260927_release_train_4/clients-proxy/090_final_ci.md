# Phase 9: final integration and CI

Depends on all selected carries and triage. This phase writes no product code
unless the last `dev` run exposes a lane-owned regression; any repair gets its
own new PABCD work phase and ordinary PR.

## Exact evidence map

- MODIFY `devlog/_plan/260927_release_train_4/clients-proxy/000_plan.md`
  disposition rows when outcomes change. Before: candidate judgments at
  `origin/dev` `24b2f39b77`; after: each row names actual lane PR, merge SHA,
  source PR/issue state, and any residual hold.
- NEW a numbered outcome file under this unit, recording each PR head and
  merge SHA, focused commands and their exits, required CI run IDs/URLs,
  final `dev` run URL, and remaining cross-lane file overlaps.

## Acceptance and proof

Fetch latest `origin/dev`; for every lane PR, retain the exact pre-merge PR
head SHA and required-job run IDs that passed before merge. Separately inspect
the post-merge `dev` workflow on the integrated commit. Missing, skipped,
cancelled, pending, failed, and older-head results do not count as passing.
Compare changed paths
against other lane overlap in the final report. `git status --short` must
contain no unaccounted files, and each source PR/issue closure must point to
the actual integrated SHA.
