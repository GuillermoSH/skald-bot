/** Para las pruebas: pasa el SNBT de buildTellraw a JSON (pone comillas a los campos). */
export function snbtToJson(snbt: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < snbt.length; i++) {
    const ch = snbt[i] ?? "";
    if (inString) {
      out += ch;
      if (ch === "\\") out += snbt[++i] ?? "";
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    const m = /^[a-z_]+(?=:)/.exec(snbt.slice(i));
    if (m && /[{,]$/.test(out)) {
      out += `"${m[0]}"`;
      i += m[0].length - 1;
      continue;
    }
    out += ch;
  }
  return JSON.parse(out);
}
