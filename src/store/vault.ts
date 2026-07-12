// Estado global do vault (zustand) + ações de CRUD.
import { create } from "zustand";
import type { Doc, TreeNode } from "../types";
import { buildTree, loadVault, setLastVault } from "../lib/vault";
import { fsApi } from "../lib/tauri";
import { docToContent, newDoc, slugify } from "../lib/document";
import { reindex } from "../lib/search";
import { loadVaultConfig, saveVaultConfig } from "../lib/vaultConfig";

interface VaultState {
  root: string | null;
  docs: Doc[];
  dirs: string[];
  ignore: string[]; // pastas desabilitadas pelo usuário (persistido no vault)
  favoriteFolders: string[]; // pastas favoritas (persistido no vault)
  docsById: Map<string, Doc>;
  tree: TreeNode[];
  favorites: Doc[];
  selectedId: string | null;
  editingId: string | null;
  draft: Doc | null; // doc novo ainda não gravado em disco
  loading: boolean;
  error: string | null;

  openVault: (root: string) => Promise<void>;
  refresh: () => Promise<void>;
  select: (id: string | null) => void;
  startEditing: (id: string) => void;
  stopEditing: () => void;

  createDoc: (folder: string) => void;
  saveDoc: (doc: Doc) => Promise<void>;
  deleteDoc: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  moveDoc: (id: string, newFolder: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  addLink: (fromId: string, toId: string) => Promise<void>;
  removeLink: (fromId: string, toId: string) => Promise<void>;
  renameDoc: (id: string, newTitle: string) => Promise<void>;
  renameFolder: (oldPath: string, newName: string) => Promise<void>;
  deleteFolder: (path: string) => Promise<void>;
  addIgnore: (path: string) => Promise<void>;
  removeIgnore: (path: string) => Promise<void>;
  toggleFavoriteFolder: (path: string) => Promise<void>;
}

function derive(docs: Doc[]) {
  const docsById = new Map(docs.map((d) => [d.meta.id, d]));
  const tree = buildTree(docs);
  const favorites = docs
    .filter((d) => d.meta.favorite)
    .sort((a, b) => a.meta.title.localeCompare(b.meta.title, "pt-BR"));
  return { docsById, tree, favorites };
}

export const useVault = create<VaultState>((set, get) => ({
  root: null,
  docs: [],
  dirs: [],
  ignore: [],
  favoriteFolders: [],
  docsById: new Map(),
  tree: [],
  favorites: [],
  selectedId: null,
  editingId: null,
  draft: null,
  loading: false,
  error: null,

  openVault: async (root) => {
    set({ loading: true, error: null });
    try {
      const config = await loadVaultConfig(root);
      const { docs, dirs } = await loadVault(root, config.ignore);
      setLastVault(root);
      set({
        root,
        docs,
        dirs,
        ignore: config.ignore,
        favoriteFolders: config.favoriteFolders,
        ...derive(docs),
        loading: false,
      });
      // adia a reindexação para a UI pintar antes (não trava ao trocar pasta).
      setTimeout(() => reindex(docs).catch(() => {}), 0);
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  refresh: async () => {
    const r = get().root;
    if (!r) return;
    try {
      const { docs, dirs } = await loadVault(r, get().ignore);
      set({ docs, dirs, ...derive(docs) });
      setTimeout(() => reindex(docs).catch(() => {}), 0);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  select: (id) => set({ selectedId: id }),
  startEditing: (id) => set({ editingId: id, selectedId: id }),
  // Cancelar/sair da edição: descarta o rascunho (não deixa arquivo órfão).
  stopEditing: () => set({ editingId: null, draft: null }),

  // Cria um rascunho EM MEMÓRIA e abre o editor. Só grava no Salvar.
  createDoc: (folder) => {
    const nd = newDoc(folder, "Novo documento");
    set({ draft: nd, editingId: nd.meta.id, selectedId: nd.meta.id });
  },

  saveDoc: async (doc) => {
    const root = get().root;
    if (!root) return;
    await fsApi.writeDoc(root, doc.path, docToContent(doc));
    set({ draft: null });
    await get().refresh();
  },

  deleteDoc: async (id) => {
    const root = get().root;
    const doc = get().docsById.get(id);
    if (!root || !doc) return;
    await fsApi.removePath(root, doc.path, false);
    await get().refresh();
    set({ selectedId: null, editingId: null });
  },

  toggleFavorite: async (id) => {
    const doc = get().docsById.get(id);
    if (!doc) return;
    await get().saveDoc({ ...doc, meta: { ...doc.meta, favorite: !doc.meta.favorite } });
  },

  moveDoc: async (id, newFolder) => {
    const root = get().root;
    const doc = get().docsById.get(id);
    if (!root || !doc) return;
    const filename = doc.path.split("/").pop() ?? doc.path;
    const dest = newFolder ? `${newFolder}/${filename}` : filename;
    if (dest === doc.path) return;
    await fsApi.renamePath(root, doc.path, dest);
    await get().refresh();
  },

  createFolder: async (path) => {
    const root = get().root;
    if (!root || !path.trim()) return;
    await fsApi.createDir(root, path.trim());
    await get().refresh();
  },

  addLink: async (fromId, toId) => {
    const doc = get().docsById.get(fromId);
    if (!doc || fromId === toId || doc.meta.links.includes(toId)) return;
    await get().saveDoc({ ...doc, meta: { ...doc.meta, links: [...doc.meta.links, toId] } });
  },

  removeLink: async (fromId, toId) => {
    const doc = get().docsById.get(fromId);
    if (!doc) return;
    await get().saveDoc({
      ...doc,
      meta: { ...doc.meta, links: doc.meta.links.filter((l) => l !== toId) },
    });
  },

  // Renomeia o documento: muda o título E o arquivo (slug do novo título).
  renameDoc: async (id, newTitle) => {
    const root = get().root;
    const doc = get().docsById.get(id);
    if (!root || !doc) return;
    const title = newTitle.trim();
    if (!title) return;
    const folder = doc.path.split("/").slice(0, -1).join("/");
    const slug = slugify(title) || doc.meta.id;
    const newPath = folder ? `${folder}/${slug}.md` : `${slug}.md`;
    const updated = { ...doc, meta: { ...doc.meta, title }, path: newPath };
    await fsApi.writeDoc(root, newPath, docToContent(updated));
    if (newPath !== doc.path) await fsApi.removePath(root, doc.path, false);
    await get().refresh();
  },

  // Renomeia uma pasta (mantém o lugar dela na árvore).
  renameFolder: async (oldPath, newName) => {
    const root = get().root;
    if (!root) return;
    const name = newName.trim().replace(/\//g, "");
    if (!name) return;
    const parent = oldPath.split("/").slice(0, -1).join("/");
    const newPath = parent ? `${parent}/${name}` : name;
    if (newPath === oldPath) return;
    await fsApi.renamePath(root, oldPath, newPath);
    await get().refresh();
  },

  // Exclui uma pasta e TUDO dentro dela (recursivo).
  deleteFolder: async (path) => {
    const root = get().root;
    if (!root) return;
    await fsApi.removePath(root, path, true);
    await get().refresh();
    set({ selectedId: null, editingId: null });
  },

  // Desabilita uma pasta (não some do disco, só deixa de ser varrida/exibida).
  // Persistido dentro do vault (.archivum/config.json) — viaja com a pasta.
  addIgnore: async (path) => {
    const root = get().root;
    if (!root) return;
    const list = Array.from(new Set([...get().ignore, path]));
    await saveVaultConfig(root, { ignore: list, favoriteFolders: get().favoriteFolders });
    set({ ignore: list });
    await get().refresh();
  },

  // Reabilita uma pasta antes ignorada.
  removeIgnore: async (path) => {
    const root = get().root;
    if (!root) return;
    const list = get().ignore.filter((p) => p !== path);
    await saveVaultConfig(root, { ignore: list, favoriteFolders: get().favoriteFolders });
    set({ ignore: list });
    await get().refresh();
  },

  // Favorita/desfavorita uma pasta (aparece em destaque na sidebar).
  toggleFavoriteFolder: async (path) => {
    const root = get().root;
    if (!root) return;
    const cur = get().favoriteFolders;
    const list = cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path];
    await saveVaultConfig(root, { ignore: get().ignore, favoriteFolders: list });
    set({ favoriteFolders: list });
  },
}));
