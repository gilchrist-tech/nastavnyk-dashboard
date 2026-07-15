import fs from 'node:fs';

export function updateEnvFile(envPath, updates) {
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = raw.split(/\r?\n/);
  const seen = new Set();

  const updatedLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !(match[1] in updates)) return line;

    const key = match[1];
    seen.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) updatedLines.push(`${key}=${value}`);
  }

  const withoutTrailingBlank = updatedLines.filter((line, index, allLines) => {
    return !(line === '' && index === allLines.length - 1);
  });

  fs.writeFileSync(envPath, `${withoutTrailingBlank.join('\n')}\n`);
}
