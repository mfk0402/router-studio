import { useState, useCallback } from 'react';
import type { FileEntry } from '../../shared/types';
import { useApp } from '../store/appStore';
import { extToLanguage } from '../lib/fileUtils';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import { toast } from './ToastContainer';

interface FileTreeProps {
  node: FileEntry;
  depth: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: FileEntry;
}

export default function FileTree({ node, depth }: FileTreeProps) {
  const [open, setOpen] = useState(depth <= 0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const openTab = useApp((s) => s.openTab);
  const pushLog = useApp((s) => s.pushLog);
  const setFileTree = useApp((s) => s.setFileTree);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, targetNode: FileEntry) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, node: targetNode });
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const refreshTree = useCallback(async () => {
    const tree = await window.api.fs.listFiles();
    setFileTree(tree);
  }, [setFileTree]);

  const getContextMenuItems = useCallback(
    (targetNode: FileEntry): ContextMenuItem[] => {
      const items: ContextMenuItem[] = [];

      if (!targetNode.isDirectory) {
        items.push({
          label: 'Open',
          icon: '📄',
          action: async () => {
            try {
              const content = await window.api.fs.readFile(targetNode.relativePath);
              openTab({
                relativePath: targetNode.relativePath,
                name: targetNode.name,
                language: extToLanguage(targetNode.name),
                content,
                original: content,
                dirty: false,
              });
            } catch (e) {
              pushLog('error', `Open failed: ${(e as Error).message}`);
            }
          },
        });
        items.push({ divider: true, label: '' });
      }

      items.push({
        label: 'Copy Path',
        icon: '📋',
        action: () => {
          navigator.clipboard.writeText(targetNode.relativePath);
          toast.success('Copied to clipboard', targetNode.relativePath);
        },
      });

      items.push({
        label: 'Copy Name',
        icon: '📝',
        action: () => {
          navigator.clipboard.writeText(targetNode.name);
          toast.success('Copied to clipboard', targetNode.name);
        },
      });

      items.push({ divider: true, label: '' });

      if (targetNode.isDirectory) {
        items.push({
          label: 'New File...',
          icon: '➕',
          action: async () => {
            const name = prompt('File name:');
            if (!name) return;
            const path = targetNode.relativePath === '.' 
              ? name 
              : `${targetNode.relativePath}/${name}`;
            try {
              await window.api.fs.createFile(path);
              await refreshTree();
              toast.success('File created', path);
            } catch (e) {
              toast.error('Failed to create file', (e as Error).message);
            }
          },
        });
      }

      items.push({
        label: 'Rename...',
        icon: '✏️',
        action: async () => {
          const newName = prompt('New name:', targetNode.name);
          if (!newName || newName === targetNode.name) return;
          const parentDir = targetNode.relativePath.includes('/')
            ? targetNode.relativePath.slice(0, targetNode.relativePath.lastIndexOf('/'))
            : '';
          const newPath = parentDir ? `${parentDir}/${newName}` : newName;
          try {
            await window.api.fs.renameFile(targetNode.relativePath, newPath);
            await refreshTree();
            toast.success('Renamed', `${targetNode.name} → ${newName}`);
          } catch (e) {
            toast.error('Failed to rename', (e as Error).message);
          }
        },
      });

      items.push({ divider: true, label: '' });

      items.push({
        label: 'Delete',
        icon: '🗑️',
        danger: true,
        action: async () => {
          const confirmed = confirm(`Delete "${targetNode.name}"? This cannot be undone.`);
          if (!confirmed) return;
          try {
            await window.api.fs.deleteFile(targetNode.relativePath);
            await refreshTree();
            toast.success('Deleted', targetNode.relativePath);
          } catch (e) {
            toast.error('Failed to delete', (e as Error).message);
          }
        },
      });

      return items;
    },
    [openTab, pushLog, refreshTree],
  );

  if (node.isDirectory) {
    return (
      <div>
        {depth === 0 ? null : (
          <button
            onClick={() => setOpen((o) => !o)}
            onContextMenu={(e) => handleContextMenu(e, node)}
            className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
            style={{ paddingLeft: depth * 10 + 4 }}
            title={node.relativePath}
          >
            <span className="inline-block w-3 text-center">{open ? '▾' : '▸'}</span>
            <span className="truncate text-fg">{node.name}</span>
          </button>
        )}
        {open &&
          node.children?.map((c) => (
            <FileTree key={c.relativePath} node={c} depth={depth + 1} />
          ))}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={getContextMenuItems(contextMenu.node)}
            onClose={closeContextMenu}
          />
        )}
      </div>
    );
  }

  const handleOpen = async () => {
    try {
      const content = await window.api.fs.readFile(node.relativePath);
      openTab({
        relativePath: node.relativePath,
        name: node.name,
        language: extToLanguage(node.name),
        content,
        original: content,
        dirty: false,
      });
    } catch (e) {
      pushLog('error', `Open failed: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        onContextMenu={(e) => handleContextMenu(e, node)}
        className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
        style={{ paddingLeft: depth * 10 + 18 }}
        title={node.relativePath}
      >
        <span className="truncate">{node.name}</span>
      </button>
      {contextMenu && contextMenu.node === node && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.node)}
          onClose={closeContextMenu}
        />
      )}
    </>
  );
}
