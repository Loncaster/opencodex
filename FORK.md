# JEV fork updates

The fork's default `fork-maintenance` branch contains only this automation. The isolated
JEV patch is commit `8d23aa7b5126c86f499ad42506be203f83d03099`; the upstream pull request
targets `dev` and does not contain fork automation.

`Update JEV fork` checks the latest stable upstream release daily. It cherry-picks the patch,
runs typecheck, the focused JEV/outbound regressions, privacy and architecture checks, and builds
the documentation and GUI. Only successful validation creates `jev-release/<upstream-tag>-<patch-revision>`.
Conflicts or failed checks stop the run without publishing a source branch. Existing release
branches are left intact. If upstream incorporates the feature, review and retire the patch
instead of suppressing a cherry-pick conflict.

Manual launch from this fork:

```sh
gh workflow run update-jev-fork.yml --ref fork-maintenance
```

Each successful run retains the assembled npm package and its `source-commit.txt` for 30 days
in `validated-jev-release`. Package installation is a separate explicit action; this workflow
neither publishes to npm nor changes any running proxy.

The validation job has read-only repository permission. A separate job publishes the validated
Git bundle with write permission and never executes candidate source code. Actions are pinned
to immutable revisions. The workflow runs only on a fork's default branch.
