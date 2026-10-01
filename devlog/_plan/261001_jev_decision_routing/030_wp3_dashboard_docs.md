# 030 wp3: dashboard, i18n, docs

## GUI

- NEW `gui/src/components/combo-workspace-jev-decision.tsx`: `ComboJevDecisionSection` replaces `JevDecisionFields` (moved out of `combo-workspace-controls.tsx`). Radio group: TypeSafe / System One-compatible server / opencodex model. Server: existing provider select (with discovery hints from `/api/combos/decision-discovery`). Model: select over a separate `decisionModels` inventory (enabled routable models; jev combos and the combo itself excluded). Shared timeout input. `Test` button → `POST /api/combos/decision-test` with the draft, shows ok/gate/latency, cancels on selection change. Saved combos show a compact recent summary from `/api/usage?jev=1&comboId=&range=7d` (decisions, applied %, avg latency, per-backend).
- MODIFY `gui/src/combo-workspace-data.ts`: `ComboItem.decisionModel`; `parseComboList`, `draftEquals`, `toPutBody` (explicit null for the inactive selector), `validateComboDraft` (model required for model method, not self/jev), `jevDecisionSummary` shows the model.
- MODIFY `gui/src/jev-decision-service.ts`: `jevDecisionModelOptions(...)`, `jevDecisionMethod(item)`.
- MODIFY detail panel / add modal / ComboWorkspace / Combos page to pass `apiBase`, `decisionModels`, combos.
- MODIFY `gui/src/components/jev-stats-panel.tsx`: per-backend row.
- i18n: new keys in `en.ts` and the other nine locales; generalize "decision service" wording where it now covers models.
- Tests: `gui/tests/jev-decision-fields.test.tsx`, `tests/gui/combo-workspace-jev-decision.test.ts`, `gui/tests/jev-stats-panel.test.tsx`.

## Docs

- `docs-site/src/content/docs/guides/combos.md`: JEV section → "Decision method" with the three backends, model example (`ollama/qwen3:4b`), OpenCode zen as a System One row example, recursion rule, timeout, stats, CLI/API.
- `docs-site/.../reference/configuration/routing.md` field table: `decisionModel`. CLI reference `--decision-model`.
- `structure/providers-and-adapters.md` JEV contract, `structure/runtime.md` combo dispatch, management/usage owners for the new routes and backend aggregation; `bun run structure:check`.
- `skills/ocx` surface regenerate if the capability registry changes.

## Accept

`cd gui && bun test tests && bun run lint && bun run lint:i18n && bun run build`; root `tests/gui`; `bun run structure:check`; `bun run skill:surface:check`; screenshot of the section captured for the PR.

