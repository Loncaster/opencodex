#!/usr/bin/env bash
# Prove a built ocx loads its embedded @napi-rs/keyring binding when launched from a directory
# that has no node_modules anywhere above it (#6139).
#
# It starts the binary on private HOME, CODEX_HOME and OPENCODEX_HOME roots and a free loopback
# port, then asks that runtime for a provider's keychain status and requires
# keychainBindingLoaded: true. The OS answer itself is not judged: an unavailable keychain session
# is a legitimate answer from a loaded binding, while a binding that cannot load is the packaging
# defect this guards. With a private HOME macOS has reported no default keychain, failing before
# any write; if a keychain is found, the probe writes, reads back and deletes one throwaway entry.
# No credential is stored. Every wait is bounded.
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

run_ocx provider keychain openai status --json > "$scratch/keychain.json" 2> "$scratch/keychain.log" &
status_pid=$!
for _ in $(seq 1 60); do
  kill -0 "$status_pid" 2> /dev/null || break
  sleep 0.5
done
if kill -0 "$status_pid" 2> /dev/null; then
  kill "$status_pid" 2> /dev/null || true
  echo 'ocx provider keychain status did not answer within 30 seconds' >&2
  exit 1
fi
wait "$status_pid" || { cat "$scratch/keychain.log" >&2; echo 'ocx provider keychain status failed' >&2; exit 1; }
python3 - "$scratch/keychain.json" <<'PY'
import json, pathlib, sys
value = json.loads(pathlib.Path(sys.argv[1]).read_text())
reason = str(value.get("keychainUnavailableReason", ""))
if value.get("keychainBindingLoaded") is not True:
    raise SystemExit(f"ocx could not load its keychain binding: {reason or value}")
answer = "available" if value.get("keychainAvailable") is True else f"unavailable here ({reason.splitlines()[0] if reason else 'no reason'})"
print(f"PASS: ocx loaded its keychain binding; the OS keychain is {answer}")
PY
