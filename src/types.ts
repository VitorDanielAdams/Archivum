// Tipos centrais do Archivum (lado TypeScript).

// Metadados de um documento (vêm do frontmatter YAML do .md).
export interface DocMeta {
  id: string; // ULID estável; sobrevive a mover/renomear
  title: string;
  type?: string; // categoria livre (ex.: "mediator-request")
  tags: string[];
  favorite: boolean;
  links: string[]; // ids de docs relacionados
  created?: string; // ISO
  updated?: string; // ISO
}

// Documento completo: metadados + caminho no vault + corpo markdown.
export interface Doc {
  meta: DocMeta;
  path: string; // relativo ao vault, ex.: "mediators/get-balance.md"
  body: string; // markdown sem o frontmatter
}

// Nó da árvore da sidebar (pasta ou documento).
export interface TreeNode {
  name: string;
  path: string; // caminho da pasta, ou caminho do doc
  type: "folder" | "doc";
  docId?: string; // preenchido quando type === "doc"
  children: TreeNode[];
}
