type SystemdHomes = { codexHome: string | null; opencodexHome: string | null };
type SystemdHomeParse = { kind: "parsed"; homes: SystemdHomes } | { kind: "invalid" };

/** Inverse of systemd.ts's generated quoted values, without expanding systemd specifiers. */
function decodeQuoted(value: string): string | undefined {
  let decoded = "";
  for (let index = 0; index < value.length; index++) {
    const char = value[index]!;
    if (char === "%") {
      if (value[++index] !== "%") return undefined;
      decoded += "%";
    } else if (char === "\\") {
      const escaped = value[++index];
      if (escaped === "n") decoded += "\n";
      else if (escaped === "\\" || escaped === '"') decoded += escaped;
      else return undefined;
    } else if (char === '"' || char === "\0") {
      return undefined;
    } else {
      decoded += char;
    }
  }
  return decoded;
}

/** Missing homes are null; unsupported or ambiguous assignments invalidate the entire definition. */
export function parseSystemdUnitHomes(body: string): SystemdHomeParse {
  const homes: SystemdHomes = { codexHome: null, opencodexHome: null };
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^Environment(?:\s|=|$)/.test(line)) continue;
    const directive = /^Environment\s*=\s*(.*)$/.exec(line);
    if (!directive) return { kind: "invalid" };
    const encoded = directive[1]!;
    let assignment: string | undefined;
    if (encoded.startsWith('"') && encoded.endsWith('"')) {
      assignment = decodeQuoted(encoded.slice(1, -1));
    } else if (encoded.length > 0 && !/[\s"'\\%\0]/.test(encoded)) {
      // Older writers emitted one unquoted assignment. Anything needing quoting stays unknown.
      assignment = encoded;
    }
    if (assignment === undefined) return { kind: "invalid" };
    const pair = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(assignment);
    if (!pair) return { kind: "invalid" };
    const name = pair[1]!;
    if (name !== "CODEX_HOME" && name !== "OPENCODEX_HOME") continue;
    const key = name === "CODEX_HOME" ? "codexHome" : "opencodexHome";
    if (homes[key] !== null || pair[2] === "") return { kind: "invalid" };
    homes[key] = pair[2]!;
  }
  return { kind: "parsed", homes };
}
