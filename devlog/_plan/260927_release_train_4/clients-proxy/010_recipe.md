# Phase 1: management API test recipe (#6051)

Depends on `000_plan.md`; docs-only carry, then one ordinary PR. The source PR
adds `.agents/skills/testing-opencodex-management-api/SKILL.md` with a
disposable-home setup and correct Lab requests. It needs a repository entry
point before another agent can reliably discover it.

## Exact change map

- NEW `.agents/skills/testing-opencodex-management-api/SKILL.md`: carry the
  source recipe after verifying every command and path against current
  management routes. Preserve its disposable OS account/home, container, or
  VM prerequisite; redirect client homes and disable integrations before a
  smoke. `OPENCODEX_HOME` alone does not isolate client writes. Keep explicit
  token read, bounded process cleanup, and authorization before live-provider
  requests. No secret values or real account identifiers enter examples.
- MODIFY `AGENTS.md` near the Commands and `skills/ocx/` guidance: add one
  contributor-facing link to the test recipe. Before: only the runtime-control
  `skills/ocx/` reference is discoverable. After: code-change agents can find
  the isolated management API test procedure without treating it as a user
  operating skill.
- MODIFY this unit's outcome document after validation with the carried source
  SHA, attribution, and exact command results.

## Acceptance and proof

Read the recipe's executable examples against the CLI parser and management
route signatures. Run a smoke only in a disposable OS account/home,
container, or VM with redirected client homes and integrations disabled;
otherwise record it as unrun and leave request behavior to CI. `rg` of the
final linked paths and `bun run
privacy:scan` observe the docs. A docs-only CI skip is recorded as skipped, not
as a passing suite. PR template Summary/Verification/Checklist, source author
credit, exact-head required checks, and post-merge `dev` CI still apply.
