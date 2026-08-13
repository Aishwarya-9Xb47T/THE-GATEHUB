import { useState, useRef, useEffect, useMemo, KeyboardEvent, MouseEvent } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FileImage, MoreVertical, Trash, Edit, Download, FilePlus, FolderPlus, Upload, Loader2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, apiFormData } from '@/lib/api';
import { withUploadAuth } from '@/lib/courseMediaUrls';
import { useToastStore } from '@/store/toastStore';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LuModeToggle } from '@/components/lu-authoring/LuModeToggle';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';

const fileTreeExpandedKey = (projectId: string) => `lu-filetree-expanded:${projectId}`;

export interface FileNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  content?: string | null;
  s3Url?: string | null;
}

interface TreeItem extends FileNode {
  children?: TreeItem[];
}

// Ensure virtual folder nodes exist for nested paths without explicit folder records
function withVirtualFolders(files: FileNode[]): FileNode[] {
  const paths = new Set(files.map((f) => f.path));
  const extras: FileNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    parts.pop();
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : `/${part}`;
      if (!paths.has(acc)) {
        paths.add(acc);
        extras.push({
          id: `virtual:${acc}`,
          name: part,
          path: acc,
          isFolder: true,
        });
      }
    }
  }
  return extras.length ? [...files, ...extras] : files;
}

// Convert flat path array to nested tree
function buildFileTree(files: FileNode[]): TreeItem[] {
  const root: TreeItem[] = [];
  const map: Record<string, TreeItem> = {};
  const enriched = withVirtualFolders(files);

  const sorted = [...enriched].sort((a, b) => {
     if (a.isFolder === b.isFolder) return a.name.localeCompare(b.name);
     return a.isFolder ? -1 : 1; // Folders first
  });

  sorted.forEach(file => { map[file.path] = { ...file, children: file.isFolder ? [] : undefined }; });

  sorted.forEach(file => {
    const parts = file.path.split('/').filter(Boolean);
    if (parts.length > 1) {
      parts.pop();
      const parentPath = '/' + parts.join('/');
      const parent = map[parentPath];
      if (parent && parent.children) {
        if (!parent.children.some((c) => c.path === file.path)) {
          parent.children.push(map[file.path]);
        }
      } else {
        root.push(map[file.path]);
      }
    } else {
      if (!root.some((r) => r.path === file.path)) {
        root.push(map[file.path]);
      }
    }
  });

  return root;
}

// File / Folder Icons
const getIcon = (node: TreeItem) => {
  if (node.isFolder) return <Folder className="w-4 h-4 text-emerald-400" />;
  const lPath = node.path.toLowerCase();
  if (lPath.endsWith('.tex')) return <FileText className="w-4 h-4 text-emerald-500" />;
  if (lPath.match(/\.(png|jpg|jpeg|gif|svg)$/)) return <FileImage className="w-4 h-4 text-blue-400" />;
  return <File className="w-4 h-4 text-slate-400" />;
};

interface TreeNodeProps {
  node: TreeItem;
  level: number;
  activeId: string | null;
  expandedFolders: Set<string>;
  toggleFolder: (id: string) => void;
  onSelect: (f: FileNode) => void;
  onContextMenu: (e: MouseEvent, node: TreeItem) => void;
  renameNodeId: string | null;
  onRenameSubmit: (id: string, newName: string) => void;
  onRenameCancel: () => void;
}

function TreeNode({ node, level, activeId, expandedFolders, toggleFolder, onSelect, onContextMenu, renameNodeId, onRenameSubmit, onRenameCancel }: TreeNodeProps) {
  const [editName, setEditName] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const isOpen = expandedFolders.has(node.id);

  const isActive = activeId === node.id;
  const isEditing = renameNodeId === node.id;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (editName.trim() && editName.trim() !== node.name) {
        onRenameSubmit(node.id, editName.trim());
      } else {
        onRenameCancel();
      }
    }
    if (e.key === 'Escape') {
      setEditName(node.name);
      onRenameCancel();
    }
  };

  const handleBlur = () => {
    if (editName.trim() && editName.trim() !== node.name) {
      onRenameSubmit(node.id, editName.trim());
    } else {
      onRenameCancel();
    }
  };

  const renderContent = () => {
    if (isEditing) {
      return (
        <input
          ref={inputRef}
          className="flex-1 bg-slate-900 border border-blue-500 rounded px-1 text-sm outline-none text-white h-5"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={(e) => e.stopPropagation()}
        />
      );
    }
    return <span className="truncate flex-1">{node.name}</span>;
  };

  return (
    <div>
      <div 
        className={cn(
          "flex items-center gap-1.5 py-1 px-2 cursor-pointer hover:bg-slate-800/70 text-slate-300 transition-colors text-sm group select-none",
          isActive && !isEditing && "bg-[#094771] text-white font-medium"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        role="button"
        tabIndex={0}
        aria-expanded={node.isFolder ? isOpen : undefined}
        aria-label={node.isFolder ? `${isOpen ? "Collapse" : "Expand"} folder ${node.name}` : `Open file ${node.name}`}
        onClick={() => {
          if (node.isFolder) toggleFolder(node.id);
          else onSelect(node);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (node.isFolder) toggleFolder(node.id);
            else onSelect(node);
          }
          if (node.isFolder && e.key === "ArrowRight" && !isOpen) {
            e.preventDefault();
            toggleFolder(node.id);
          }
          if (node.isFolder && e.key === "ArrowLeft" && isOpen) {
            e.preventDefault();
            toggleFolder(node.id);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, node);
        }}
      >
        <div className="w-4 h-4 flex items-center justify-center shrink-0">
          {node.isFolder && (
            isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          )}
        </div>
        {getIcon(node)}
        {renderContent()}
        {!isEditing && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center pr-1 shrink-0 bg-transparent text-slate-400 hover:text-white" onClick={(e) => { e.stopPropagation(); onContextMenu(e, node); }}>
            <MoreVertical className="w-3.5 h-3.5" aria-label={`More actions for ${node.name}`} />
          </div>
        )}
      </div>
      
      {isOpen && node.children?.map(child => (
        <TreeNode 
          key={child.id} 
          node={child} 
          level={level + 1} 
          activeId={activeId} 
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          renameNodeId={renameNodeId}
          onRenameSubmit={onRenameSubmit}
          onRenameCancel={onRenameCancel}
        />
      ))}
    </div>
  );
}

interface FileTreeProps {
  projectId: string;
  files: FileNode[];
  activeFileId: string | null;
  onSelectFile: (file: FileNode) => void;
  onRefresh: () => void;
  /** LU authoring: show mode bar with exit to Learning Mode */
  luDeveloperMode?: boolean;
  onSetLuDeveloperMode?: (enabled: boolean) => void;
}

export function FileTree({
  projectId,
  files,
  activeFileId,
  onSelectFile,
  onRefresh,
  luDeveloperMode,
  onSetLuDeveloperMode,
}: FileTreeProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const tree = useMemo(() => buildFileTree(files), [files]);
  
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem(fileTreeExpandedKey(projectId));
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
    return new Set<string>();
  });

  const persistExpanded = (next: Set<string>) => {
    try {
      sessionStorage.setItem(fileTreeExpandedKey(projectId), JSON.stringify([...next]));
    } catch { /* ignore */ }
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistExpanded(next);
      return next;
    });
  };

  const activeNode = files.find((f) => f.id === activeFileId) || null;
  const defaultParentPath = (() => {
    if (!activeNode) return "/";
    if (activeNode.isFolder) return activeNode.path;
    const parts = activeNode.path.split("/").filter(Boolean);
    parts.pop();
    return parts.length ? `/${parts.join("/")}` : "/";
  })();
  
  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node: TreeItem | null } | null>(null);
  
  // Inline actions
  const [renameNodeId, setRenameNodeId] = useState<string | null>(null);
  const [createNode, setCreateNode] = useState<{ isFolder: boolean, parentPath: string } | null>(null);
  const [createName, setCreateName] = useState("");
  const [nodeToDelete, setNodeToDelete] = useState<TreeItem | null>(null);
  const [uploadTargetPath, setUploadTargetPath] = useState("/");

  const addToast = useToastStore((s) => s.add);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expandedFolders.size === 0) {
      const initialExpanded = new Set<string>();
      files.filter(f => f.isFolder).forEach(f => initialExpanded.add(f.id));
      setExpandedFolders(initialExpanded);
      persistExpanded(initialExpanded);
    }
  }, [files]);

  useEffect(() => {
    if (createNode && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [createNode]);

  // Handle outside click for context menu
  useEffect(() => {
    const hideContext = () => setContextMenu(null);
    document.addEventListener("click", hideContext);
    return () => document.removeEventListener("click", hideContext);
  }, []);

  const handleContextMenu = (e: MouseEvent, node: TreeItem) => {
    setContextMenu({ x: e.pageX, y: e.pageY, node });
  };

  // --- API Handlers ---
  const handleUploadFiles = async (uploadFiles: FileList, targetPath = uploadTargetPath) => {
    setIsUploading(true);
    let allSuccess = true;
    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      const formData = new FormData();
      formData.append("file", file);
      const normalizedTarget = targetPath.endsWith("/") ? targetPath.slice(0, -1) : targetPath;
      const destPath = normalizedTarget && normalizedTarget !== "/"
        ? `${normalizedTarget}/${file.name}`
        : `/${file.name}`;
      formData.append("path", destPath);
      
      const { error } = await apiFormData<{success: boolean}>(`/latex-projects/${projectId}/files/upload`, formData);
      if (error) {
        addToast({ title: `Failed to upload ${file.name}`, description: error, variant: "destructive" });
        allSuccess = false;
      }
    }
    
    setIsUploading(false);
    if (allSuccess && uploadFiles.length > 0) {
      addToast({ title: "Upload successful", variant: "success" });
    }
    onRefresh();
  };

  const handleCreateSubmit = async () => {
    if (!createNode || !createName.trim()) {
      setCreateNode(null);
      return;
    }

    const { isFolder, parentPath } = createNode;
    const name = createName.trim();
    const newPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;

    const { error } = await api<{ success: boolean; file: FileNode }>(`/latex-projects/${projectId}/files/create`, {
      method: 'POST',
      body: { name, path: newPath, isFolder }
    });

    if (error) {
      addToast({ title: "Failed to create", description: error, variant: "destructive" });
    } else {
      addToast({ title: `${isFolder ? 'Folder' : 'File'} created`, variant: "success" });
    }
    
    setCreateNode(null);
    setCreateName("");
    onRefresh();
  };

  const handleRenameSubmit = async (id: string, newName: string) => {
    const node = files.find(f => f.id === id);
    setRenameNodeId(null);
    
    if (!node) return;
    
    // Compute new path
    const parts = node.path.split('/');
    parts.pop();
    const parentPath = parts.join('/') || '';
    const newPath = `${parentPath}/${newName}`;

    const { error } = await api<{ success: boolean }>(`/latex-projects/${projectId}/files/rename`, {
      method: 'PATCH',
      body: { fileId: id, newName, newPath }
    });

    if (error) {
      addToast({ title: "Rename failed", description: error, variant: "destructive" });
    } else {
      addToast({ title: "Renamed successfully", variant: "success" });
      onRefresh();
    }
  };

  const handleDelete = async () => {
    if (!nodeToDelete) return;
    const node = nodeToDelete;
    
    const { error } = await api<{ success: boolean }>(`/latex-projects/${projectId}/files/delete?fileId=${node.id}`, {
      method: 'DELETE'
    });

    if (error) {
      addToast({ title: "Delete failed", description: error, variant: "destructive" });
    } else {
      addToast({ title: "Deleted securely", variant: "success" });
      onRefresh();
    }
    setNodeToDelete(null);
  };

  const handleMove = async (node: TreeItem, newParentPath: string) => {
    const newPath = newParentPath === "/" ? `/${node.name}` : `${newParentPath}/${node.name}`;
    const { error } = await api<{ success: boolean }>(`/latex-projects/${projectId}/files/move`, {
      method: "PATCH",
      body: { fileId: node.id, newPath },
    });
    if (error) {
      addToast({ title: "Move failed", description: error, variant: "destructive" });
    } else {
      addToast({ title: "Moved successfully", variant: "success" });
      onRefresh();
    }
  };

  const handleDownload = (node: TreeItem) => {
    if (node.s3Url) {
      window.open(withUploadAuth(node.s3Url), '_blank');
    } else if (node.content) {
      const blob = new Blob([node.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = node.name;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // --- Drag & Drop Handlers ---
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleUploadFiles(e.dataTransfer.files);
    }
  };

  return (
    <div 
      className={cn(
        "h-full bg-[#181818] flex flex-col font-sans select-none overflow-hidden relative border-r border-slate-800 transition-colors",
        isDragging && "bg-slate-800/80 ring-2 ring-inset ring-blue-500"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {luDeveloperMode && onSetLuDeveloperMode && (
        <LuModeToggle developerMode={luDeveloperMode} onSetDeveloperMode={onSetLuDeveloperMode} compact />
      )}
      {/* Upload Progress Overlay */}
      {isUploading && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center flex-col gap-3">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-sm font-medium text-emerald-400">Uploading files...</p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between py-2 px-3 border-b border-slate-800 shrink-0 bg-[#252526]">
        <span className="font-semibold text-xs tracking-wider uppercase text-slate-400">Files</span>
        <div className="flex items-center gap-0.5">
          <button onClick={() => void onRefresh()} className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" title="Refresh explorer" aria-label="Refresh explorer">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => { setUploadTargetPath(defaultParentPath); setCreateNode({ isFolder: false, parentPath: defaultParentPath }); }} className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" title="New File" aria-label="Create new file">
            <FilePlus className="w-4 h-4" />
          </button>
          <button onClick={() => setCreateNode({ isFolder: true, parentPath: defaultParentPath })} className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" title="New Folder" aria-label="Create new folder">
            <FolderPlus className="w-4 h-4" />
          </button>
          <button onClick={() => { setUploadTargetPath(defaultParentPath); fileInputRef.current?.click(); }} className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60" title="Upload File" aria-label="Upload file">
            <Upload className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <input 
        type="file" 
        multiple 
        className="hidden" 
        ref={fileInputRef} 
        onChange={(e) => {
          if (e.target.files) handleUploadFiles(e.target.files);
          // reset input so same file can be uploaded again
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
      />

      <div className="flex-1 overflow-y-auto py-2 file-tree-scroll" role="tree" aria-label="Project files" onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.pageX, y: e.pageY, node: null }) }}>
        {tree.map(node => (
          <TreeNode 
            key={node.id} 
            node={node} 
            level={0} 
            activeId={activeFileId} 
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            onSelect={onSelectFile}
            onContextMenu={handleContextMenu}
            renameNodeId={renameNodeId}
            onRenameSubmit={handleRenameSubmit}
            onRenameCancel={() => setRenameNodeId(null)}
          />
        ))}

        {/* Inline Create Input */}
        {createNode && (
          <div className="flex items-center gap-1.5 py-1 px-2 text-sm pl-8">
            <div className="w-4 h-4 flex items-center justify-center shrink-0" />
            {createNode.isFolder ? <Folder className="w-4 h-4 text-emerald-400" /> : <File className="w-4 h-4 text-slate-400" />}
            <input
              ref={createInputRef}
              className="flex-1 bg-slate-900 border border-blue-500 rounded px-1 text-sm outline-none text-white h-5"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSubmit();
                if (e.key === 'Escape') { setCreateNode(null); setCreateName(""); }
              }}
              onBlur={handleCreateSubmit}
              placeholder={createNode.isFolder ? "folder name" : "file.tex"}
            />
          </div>
        )}

        {tree.length === 0 && !createNode && (
          <div className="text-center text-xs text-slate-500 py-6 px-4 flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-slate-700 mx-auto" />
            <p>Drag and drop files here to upload</p>
          </div>
        )}
      </div>

      {/* Context Menu floating absolutely fixed to page */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-[#252526] border border-slate-700 rounded-md shadow-xl py-1 w-48 text-sm"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node ? (
            <>
              {contextMenu.node.isFolder && (
                <>
                  <button
                    className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                    onClick={() => {
                      setCreateNode({ isFolder: false, parentPath: contextMenu.node!.path });
                      setContextMenu(null);
                    }}
                  >
                    <FilePlus className="w-4 h-4" /> New File Here
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                    onClick={() => {
                      setCreateNode({ isFolder: true, parentPath: contextMenu.node!.path });
                      setContextMenu(null);
                    }}
                  >
                    <FolderPlus className="w-4 h-4" /> New Folder Here
                  </button>
                  <button
                    className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                    onClick={() => {
                      setUploadTargetPath(contextMenu.node!.path);
                      fileInputRef.current?.click();
                      setContextMenu(null);
                    }}
                  >
                    <Upload className="w-4 h-4" /> Upload Here
                  </button>
                  <div className="h-px bg-slate-700 my-1 mx-2" />
                </>
              )}
              {!contextMenu.node.isFolder && contextMenu.node.path.includes("/") && (
                <button
                  className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                  onClick={() => {
                    handleMove(contextMenu.node!, "/");
                    setContextMenu(null);
                  }}
                >
                  <Folder className="w-4 h-4" /> Move to Root
                </button>
              )}
              <button
                className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                onClick={() => {
                  void navigator.clipboard.writeText(contextMenu.node!.path);
                  addToast({ title: "Path copied", description: contextMenu.node!.path, variant: "success" });
                  setContextMenu(null);
                }}
              >
                <Copy className="w-4 h-4" /> Copy Path
              </button>
              {!contextMenu.node.isFolder && contextMenu.node.s3Url && (
                <button
                  className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                  onClick={() => {
                    window.open(withUploadAuth(contextMenu.node!.s3Url!), "_blank");
                    setContextMenu(null);
                  }}
                >
                  <ExternalLink className="w-4 h-4" /> Open Externally
                </button>
              )}
              <button 
                className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                onClick={() => { setRenameNodeId(contextMenu.node!.id); setContextMenu(null); }}
                disabled={contextMenu.node.id.startsWith("virtual:")}
              >
                <Edit className="w-4 h-4" /> Rename
              </button>
              <button 
                className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                onClick={() => { handleDownload(contextMenu.node!); setContextMenu(null); }}
              >
                <Download className="w-4 h-4" /> Download
              </button>
              <div className="h-px bg-slate-700 my-1 mx-2" />
              <button 
                className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-red-500 hover:text-white flex items-center gap-2"
                onClick={() => { setNodeToDelete(contextMenu.node!); setContextMenu(null); }}
                disabled={contextMenu.node.id.startsWith("virtual:")}
              >
                <Trash className="w-4 h-4" /> Delete
              </button>
            </>
          ) : (
            <>
              <button 
                className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                onClick={() => { setCreateNode({ isFolder: false, parentPath: '/' }); setContextMenu(null); }}
              >
                <FilePlus className="w-4 h-4" /> New File
              </button>
              <button 
                className="w-full text-left px-3 py-1.5 text-slate-300 hover:bg-blue-600 hover:text-white flex items-center gap-2"
                onClick={() => { setCreateNode({ isFolder: true, parentPath: '/' }); setContextMenu(null); }}
              >
                <FolderPlus className="w-4 h-4" /> New Folder
              </button>
            </>
          )}
        </div>
      )}
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!nodeToDelete} onOpenChange={(open) => !open && setNodeToDelete(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete {nodeToDelete?.isFolder ? "Folder" : "File"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">{nodeToDelete?.name}</span>? 
              {nodeToDelete?.isFolder && " This will delete all files and folders inside it."}
              <br/><br/>This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setNodeToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
