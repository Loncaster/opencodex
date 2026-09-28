# macOS signed-in desktop quota gate: design decision

Status: proposed; #6196 remains blocked on a supported desktop integration contract.
Date: 2026-09-28. This is a read-only source/evidence assessment, not a native-client result.
Baseline: `09f8e5ebfee1cf594181dfa8e29befa0bae7e06e` (`dev`).

## Decision log

- Purpose: allow the original desktop composer to submit an independently funded
  provider turn while retaining signed-in account features and honest quota display.
- Constraints: the reported macOS build obtains authoritative gate data through its
  bundled Rust app-server. Chromium PAC configuration does not own that transport.
  No supported desktop app-server replacement/selection contract was established.
- Alternatives: upstream provider-aware composer admission; a supported app-server
  adapter contract; a separate client. Compare these below.
- Choice: upstream provider-aware admission, with a narrowly scoped OpenCodex route
  capability if the app cannot classify the effective inference lane itself.
- Why: it separates account identity from inference entitlement without modifying
  signed app contents, moving account credentials, or misrepresenting account quota.
- Tradeoff: requires upstream desktop cooperation; an OpenCodex-only release cannot
  honestly promise this fix today. A companion client is not requirement-equivalent.

## Evidence and scope

1. [#6196](https://github.com/lidge-jun/opencodex/issues/6196) reports macOS 27 arm64,
   app 26.924.22138/build 11645 and OpenCodex 2.68.0. After approximately 20 hours,
   PAC intercept ports had no established connections while bundled app-server owned
   relevant connections. Logs attribute usage streaming and reqwest errors to it.
   These are reporter observations, not independently repeated measurements here.
2. [#5947](https://github.com/lidge-jun/opencodex/pull/5947), reviewed head
   `eb6953b8c78497931147966791f9bf804f953398`, is open. Its launch routing is Chromium
   host-resolver/PAC configuration. `src/chatgpt/desktop-unblock/rewrite.ts:43-55`
   selects usage/conversation responses; lines 94-163 alter quota gate fields only
   after traffic arrives. Its body explicitly lacks live app validation. A successful
   curl CONNECT/TLS exercise establishes relay plumbing, not app transport coverage.
3. [#6079](https://github.com/lidge-jun/opencodex/pull/6079), reviewed head
   `4c6f745eb6dbc1dc9df95b2a5c34e75099655797`, is an open Windows-only draft. Its body
   separately documents Electron net.fetch attribution on Windows 26.924.2738.0 and
   the macOS limitation. `usage-policy.ts:26-48` controls two WHAM booleans, not the
   selected provider. Conversation initialization passes unchanged. Natural-exhaustion
   recovery is still unverified. `runtime-ownership.ts:15-27` binds exact PAC URL to
   a process-local runtime generation; this is useful lifecycle precedent, not a macOS fix.
4. Baseline `src/codex/desktop-app/darwin.ts:25-66,174-195,249-260` discovers the
   bundle by identifier/realpath, scopes processes to the current uid, and relaunches
   with `open -b`. It carries no app-server transport override. The measured topology
   in `devlog/_plan/260913_cross_platform_desktop_app_restart/001_platform_topology.md`
   places app-server at `Contents/Resources/codex`. Killing it alone can cause respawn.
5. `src/codex/shim-templates.ts:30-50,152-163` treats app-server as an internal command
   and execs the saved CLI launcher. It is not evidence of intercepting the separately
   bundled desktop executable. `src/codex/inject/config-toml.ts:32-44` also records
   desktop 26.924 rewriting model-provider config; a static config file is not proof
   of the running app's provider or authoritative quota-cache consumer.
6. [Official App Server auth documentation](https://learn.chatgpt.com/docs/app-server#auth-endpoints)
   defines `account/rateLimits/read`, corresponding updates, and account state. It
   does not establish a desktop gate override or a supported bundled-server swap.
   [Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
   defines provider auth/base URL independently. That does not prove the signed-in
   desktop composer honors provider-specific quota admission. All contract names
   proposed below are design placeholders, not existing OpenAI APIs or CLI flags.

## Alternatives

| Option | Mechanism | Requirement fit / decision |
| --- | --- | --- |
| A: upstream provider-aware admission | Desktop/bundled app-server keep authentic quota reads; composer applies ChatGPT quota only to routes funded by that account | Recommended. No credential interception or bundle changes; needs upstream support |
| B: supported external app-server adapter | Only if upstream documents a desktop endpoint/executable hook, app explicitly selects an adapter exposing a separate route-admission capability | Conditional. Must retain native auth ownership and prove every gate consumer uses the contract; no hook established today |
| C: separate OpenCodex composer/client | A supported app-server client submits independent-provider turns outside the native composer | Implementable separately, but not a #6196 fix: native composer and feature parity are hard requirements |

Do not implement B by replacing bundle resources, patching ASAR, re-signing the app,
injecting dylibs, copying tokens, installing a CA, or redirecting ChatGPT base URLs.
`HTTPS_PROXY`/CONNECT without TLS termination can change routing but cannot change
encrypted gate data. PAC/host-resolver switches do not establish Rust transport
coverage. An older app version is neither an architectural fix nor a supported rollback plan.

## Recommended architecture and ownership

Keep two planes independent:

- Account plane: native signed app -> bundled app-server -> OpenAI account services.
  OAuth, usage JSON/stream, plugins, marketplace and sync stay native. Do not rewrite
  quota or infer unlimited capacity from a missing account response.
- Inference plane: selected thread/model -> resolved execution route -> OpenCodex
  provider request. Desktop admission uses the effective route, not a model name,
  UI selection alone, global provider setting, or account-wide boolean.

Proposed upstream contract: a provider-aware admission result scoped to thread,
model, route revision and expiry. Return `independent`, `chatgpt`, `mixed`, or
`unknown`, plus a structured reason. This is funding scope, not an assurance that a
turn succeeds. Preserve all non-quota policy, auth, workspace and spend restrictions.

If OpenCodex needs to describe dynamic routes, add an opt-in capability module
outside the core hot path. It returns a bounded, short-lived route lease with
opaque request/thread binding, model id, config revision, provider/account generation,
funding scope, expiry and runtime generation. Never return ChatGPT credentials,
account ids or raw account-service responses. The existing native quota RPCs are unchanged.

On send, the app-server validates the same lease and the proxy revalidates it before
dispatch. A route lease must constrain the actual fallback graph: an independently
funded turn cannot silently fall back to the exhausted signed-in ChatGPT lane.
Mixed or unresolved routes retain native admission until a supported exact route is
selected. Invalidated leases are rejected/replanned, never used as a reason to
falsify account state. This also prevents a check/send race when the model changes.

The composer shows the authentic exhausted account gauge while allowing only the
eligible independent route. Selecting a native ChatGPT model immediately restores
the native quota restriction. No synthetic `account/rateLimits/updated` notification
is emitted. Conversation restrictions must have upstream typed quota provenance;
unknown `blocked_features` or `limits_progress` entries remain enforced.

## macOS lifecycle and local endpoint contract

- Ship no modifications inside the signed/notarized app bundle. Verify the actual
  installed bundle id, canonical path, build, signing identity and app-server
  parent/uid/start identity during eventual operator-approved macOS qualification.
  Existing bundle-id checks alone are not signing/notarization proof.
- A new capability must be positively negotiated by the native consumer. A second
  client connected to app-server cannot change the original desktop's quota cache
  merely by reading it. If upstream offers no suitable hook, report unsupported.
- Prefer app-owned inherited IPC for B. For any loopback capability endpoint, bind
  only loopback and require an authenticated launch/session capability with exact
  endpoint and fresh runtime generation. Port reachability, matching URL shape and
  a persisted connection file do not establish ownership. Reject foreign origins,
  unexpected hosts, stale generations and cross-user clients before parsing payloads.
  Do not put bearer capabilities in argv, URLs or logs. Same-user arbitrary-code
  resistance is not claimed by ordinary filesystem tokens.
- Start/stop/update/account switch revokes all route leases before releasing sockets.
  Bind session authorization to installed build and provider/config generation; a
  restarted process at the same port is a new owner. No automatic adoption by URL.
- Keep this opt-in and lazy. Baseline provider-only installs must start no new timer,
  listener or optional subsystem. Reuse composition-root activation/cleanup seams.
- Ordinary LaunchServices launch and app update must be tested separately from managed
  restart. Do not assume shell environment reaches GUI children. No auto-restart or
  forced stop during observation; require operator approval with an active GUI session.

## Failure behavior and rollback

- Unsupported app/build, unknown contract/schema, ownership failure or stale lease:
  native behavior; explicit unsupported/stale diagnostic, never reported recovered.
- Proxy unavailable: independent route is unavailable with draft retained. Do not
  silently send the same prompt through ChatGPT, duplicate a turn, or retry a write.
- Account logout/switch, config edit, model switch, sleep/wake or SSE reconnect:
  invalidate affected admission state and recompute; late events cannot revive it.
- Native quota changes remain visible and cannot overwrite independent-route state;
  independent-route state cannot enter the actual quota cache or account pool capacity.
- Rollback disables the capability and revokes leases, preserving native login,
  sessions, user config and original app bundle. Back up only explicitly changed
  owned settings with private permissions; restore by revision/ownership match,
  not whole-file replacement over newer user edits. No trust-store rollback is needed.

## Validation plan (not executed)

1. Pure contracts: known/unknown funding; mixed fallback graphs; route revision and
   expiry; model/thread/account switches; stale late events; unknown restrictions;
   no quota-cache mutation. Static config is never treated as consumer evidence.
2. Integration: supported consumer handshake, readiness before publication, exact
   endpoint/generation ownership, foreign/stale/replaced listener, stop/start at same
   port, crash/reconnect, bounded frames/timeouts and cancellation. Assert off mode
   starts no optional resources and account/auth traffic remains native.
3. Actual macOS UAT on the reported build and each intended supported replacement:
   identify bundle/signature/build and source process/socket, capture sanitized
   consumer-side admission receipt, naturally exhaust the account, select a known
   independent provider in the original composer, send, and prove provider completion.
   CLI/curl success, open stream counts and synthetic exhausted snapshots are insufficient.
4. Negative UAT: native ChatGPT remains quota blocked; mixed fallback cannot consume
   that lane; auth/workspace/spend restrictions survive. Verify login, plugins,
   skills, marketplace, sync, attachments and IME remain functional separately.
5. Lifecycle UAT: managed restart, ordinary quit/open, sleep/wake, reboot, app update,
   proxy crash/stop, same-port replacement and rollback. Record source head, package
   hash, app/OS/architecture, permissions and actual-user identity for each result.

Future tests run only in disposable HOME/CODEX_HOME/OPENCODEX_HOME. No build, tests,
app launch, account request, quota exhaustion, runtime mutation or deployment was
performed for this document.

## Rollout and priorities

Phase 0: approve this design and obtain upstream contract ownership; observation
only, with no unsupported interception. Phase 1: implement/verify route admission
and native consumer together under a disabled-by-default flag. Phase 2: explicit
macOS operator UAT and complete lifecycle receipts. Phase 3: opt-in release only for
qualified build/contract pairs; unknown updates disable the capability until qualified.
Do not merge #5947 or #6079 as evidence that this macOS issue is solved.

- P0 design rejection: any approach requiring credential interception, bundle/signing
  circumvention, fabricated entitlement or bypass of non-quota account restrictions.
  This is a design boundary, not a claimed discovered vulnerability.
- P1: no supported native consumer hook; no provider-scoped authoritative gate;
  fallback/check-send races; unproven preservation of signed-in features; absence of
  actual exhausted-account original-composer UAT. These block a fix claim/release.
- P2: stale runtime ownership, restart/update drift, stream/cache ordering, incomplete
  permissions/rollback evidence and diagnostics confusing plumbing with recovery.
  These are required lifecycle acceptance criteria, not reasons to widen interception.
