#!/usr/bin/env bash
# Prove a built ocx loads its embedded @napi-rs/keyring binding when launched from a directory
# that has no node_modules anywhere above it (#6139).
#
# It starts the binary on private HOME, CODEX_HOME and OPENCODEX_HOME roots and a free loopback
# port, then asks that runtime for a provider's keychain status. With a private HOME macOS finds
# no default keychain, so the probe answers from the OS without touching any real keychain; no
# credential is stored. Only a module-load failure fails the check: an unavailable keychain
# session is a legitimate answer from a loaded binding, while a missing or unloadable binding is
# the packaging defect this guards.
set -euo pipefail

ocx="${1:?usage: verify-sidecar-keyring.sh /path/to/ocx}"
case "$ocx" in /*) ;; *) ocx="$PWD/$ocx" ;; esac
[[ -x "$ocx" ]] || { echo "Not an executable: $ocx" >&2; exit 1; }

scratch="$(mktemp -d "${TMPDIR:-/tmp}/ocx-keyring-check.XXXXXX")"
pid=""
cleanup() {
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  rm -rf "$scratch"
}
trap cleanup EXIT
mkdir "$scratch/home" "$scratch/codex" "$scratch/opencodex" "$scratch/cwd"
port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"

run_ocx() {
  (cd "$scratch/cwd" && HOME="$scratch/home" CODEX_HOME="$scratch/codex" OPENCODEX_HOME="$scratch/opencodex" "$ocx" "$@")
}

run_ocx start --port "$port" > "$scratch/start.log" 2>&1 &
pid=$!
for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$port/healthz" > /dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS "http://127.0.0.1:$port/healthz" > /dev/null || { cat "$scratch/start.log" >&2; echo 'ocx did not become healthy' >&2; exit 1; }

run_ocx provider keychain openai status --json > "$scratch/keychain.json"
python3 - "$scratch/keychain.json" <<'PY'
import json, pathlib, re, sys
value = json.loads(pathlib.Path(sys.argv[1]).read_text())
if value.get("keychainAvailable") is True:
    print("PASS: ocx loaded its keychain binding and the OS keychain answered")
    raise SystemExit(0)
reason = str(value.get("keychainUnavailableReason", ""))
if re.search(r"Cannot find module|native binding|ERR_DLOPEN|dlopen|Team IDs", reason):
    raise SystemExit(f"ocx could not load its keychain binding: {reason}")
print(f"PASS: ocx loaded its keychain binding; the OS keychain itself is unavailable here ({reason})")
PY
