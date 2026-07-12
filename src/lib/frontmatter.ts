// Parse/serialização de frontmatter YAML em arquivos .md.
// Usa js-yaml (seguro no browser). Evitamos gray-matter porque ele depende de
// Buffer do Node e dá problema no bundle do Vite.
import yaml from "js-yaml";

export interface ParsedDoc {
  data: Record<string, unknown>;
  body: string;
}

// Bloco frontmatter no início:  ---\n ...yaml... \n---\n  (resto = corpo)
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontmatter(content: string): ParsedDoc {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) return { data: {}, body: content };
  let data: Record<string, unknown> = {};
  try {
    data = (yaml.load(match[1]) as Record<string, unknown>) ?? {};
  } catch {
    data = {};
  }
  return { data, body: match[2] ?? "" };
}

export function buildContent(data: Record<string, unknown>, body: string): string {
  // lineWidth -1 = não quebra linhas longas (mantém URLs/exemplos intactos).
  const yamlStr = yaml.dump(data, { lineWidth: -1, noRefs: true }).trimEnd();
  const cleanBody = body.replace(/^\s+/, "");
  return `---\n${yamlStr}\n---\n\n${cleanBody}\n`;
}
