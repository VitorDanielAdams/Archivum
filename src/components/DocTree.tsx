import { useState, type MouseEvent } from "react";
import type { TreeNode } from "../types";
import { useVault } from "../store/vault";
import { useMenu } from "../store/menu";
import { useNav } from "../store/nav";
import { askConfirm } from "../lib/tauri";

// Árvore recursiva de pastas e documentos.
// - arrastar doc -> soltar em pasta = mover
// - botão direito = menu de ações (novo, renomear, excluir, subpasta…)
export function DocTree({ nodes, depth = 0 }: { nodes: TreeNode[]; depth?: number }) {
  return (
    <ul className="tree" style={{ paddingLeft: depth === 0 ? 0 : 10 }}>
      {nodes.map((node) => (
        <TreeItem key={node.type === "doc" ? node.docId : node.path} node={node} depth={depth} />
      ))}
    </ul>
  );
}

function TreeItem({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [tmp, setTmp] = useState(node.name);
  const [subOpen, setSubOpen] = useState(false);
  const [subName, setSubName] = useState("");

  const selectedId = useVault((s) => s.selectedId);
  const moveDoc = useVault((s) => s.moveDoc);
  const favoriteFolders = useVault((s) => s.favoriteFolders);
  const openMenu = useMenu((s) => s.openMenu);
  const goDoc = useNav((s) => s.goDoc);

  // ----- PASTA -----
  const isFavFolder = node.type === "folder" && favoriteFolders.includes(node.path);

  if (node.type === "folder") {
    function abrirMenu(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      const v = useVault.getState();
      openMenu(e.clientX, e.clientY, [
        { label: "Novo documento aqui", onClick: () => v.createDoc(node.path) },
        { label: "Nova subpasta", onClick: () => setSubOpen(true) },
        {
          label: "Renomear pasta",
          onClick: () => {
            setTmp(node.name);
            setRenaming(true);
          },
        },
        {
          label: isFavFolder ? "Desfavoritar pasta" : "★ Favoritar pasta",
          onClick: () => v.toggleFavoriteFolder(node.path),
        },
        { label: "Ignorar pasta (desabilitar)", onClick: () => v.addIgnore(node.path) },
        {
          label: "Excluir pasta",
          danger: true,
          onClick: async () => {
            if (await askConfirm(`Excluir a pasta "${node.name}" e TUDO dentro dela?`)) {
              await v.deleteFolder(node.path);
            }
          },
        },
      ]);
    }

    return (
      <li>
        {renaming ? (
          <RenameInput
            value={tmp}
            onChange={setTmp}
            onCancel={() => setRenaming(false)}
            onConfirm={() => {
              useVault.getState().renameFolder(node.path, tmp);
              setRenaming(false);
            }}
          />
        ) : (
          <button
            className={"tree__row" + (dragOver ? " tree__row--drop" : "")}
            onClick={() => setOpen(!open)}
            onContextMenu={abrirMenu}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const id = e.dataTransfer.getData("text/plain");
              if (id) moveDoc(id, node.path);
            }}
          >
            <span className="tree__chev">{open ? "▾" : "▸"}</span>
            <span className="tree__icon">{isFavFolder ? "⭐" : "📁"}</span>
            <span className="tree__label">{node.name}</span>
          </button>
        )}

        {subOpen && (
          <RenameInput
            value={subName}
            placeholder="nome da subpasta"
            onChange={setSubName}
            onCancel={() => {
              setSubOpen(false);
              setSubName("");
            }}
            onConfirm={() => {
              if (subName.trim()) useVault.getState().createFolder(`${node.path}/${subName.trim()}`);
              setSubOpen(false);
              setSubName("");
            }}
          />
        )}

        {open && <DocTree nodes={node.children} depth={depth + 1} />}
      </li>
    );
  }

  // ----- DOCUMENTO -----
  const selected = node.docId === selectedId;

  function abrirMenuDoc(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const v = useVault.getState();
    const fav = node.docId ? v.docsById.get(node.docId)?.meta.favorite : false;
    openMenu(e.clientX, e.clientY, [
      { label: "Abrir", onClick: () => node.docId && useNav.getState().goDoc(node.docId!) },
      {
        label: "Renomear",
        onClick: () => {
          setTmp(node.name);
          setRenaming(true);
        },
      },
      {
        label: fav ? "Desfavoritar" : "Favoritar",
        onClick: () => node.docId && v.toggleFavorite(node.docId),
      },
      {
        label: "Excluir",
        danger: true,
        onClick: async () => {
          if (node.docId && (await askConfirm(`Excluir "${node.name}"?`))) {
            await v.deleteDoc(node.docId);
          }
        },
      },
    ]);
  }

  if (renaming) {
    return (
      <li>
        <RenameInput
          value={tmp}
          onChange={setTmp}
          onCancel={() => setRenaming(false)}
          onConfirm={() => {
            if (node.docId) useVault.getState().renameDoc(node.docId, tmp);
            setRenaming(false);
          }}
        />
      </li>
    );
  }

  return (
    <li>
      <button
        className={"tree__row" + (selected ? " tree__row--sel" : "")}
        draggable
        onDragStart={(e) => {
          if (node.docId) e.dataTransfer.setData("text/plain", node.docId);
        }}
        onClick={() => node.docId && goDoc(node.docId)}
        onContextMenu={abrirMenuDoc}
      >
        <span className="tree__chev" />
        <span className="tree__icon">📄</span>
        <span className="tree__label">{node.name}</span>
      </button>
    </li>
  );
}

// Campo de edição inline (renomear / nova subpasta).
function RenameInput({
  value,
  placeholder,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      className="tree__rename"
      autoFocus
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Enter") onConfirm();
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}
