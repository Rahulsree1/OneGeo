import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  Search,
  Download,
  Folder,
  FileText,
  Loader2,
  X,
  Star,
  Archive,
  Trash2,
  CheckSquare,
  Square,
  Play,
  ScrollText,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  fetchFiles,
  uploadFile,
  getDownloadUrl,
  updateFile,
  deleteFilePermanent,
  bulkUpdateFiles,
  bulkDeletePermanent,
  processFile as processFileApi,
  type FileItem,
  type FileListFilter,
} from "../api/client";
import { useProcessing } from "../context/ProcessingContext";
import { useProcessLogs } from "../hooks/useProcessLogs";
import logo from "../assets/logo.png";

const LAS_ACCEPT = ".las,.las2";

/** Wrap matching substrings (case-insensitive) in a highlight span. */
function highlightMatch(text: string, search: string): React.ReactNode {
  const str = String(text ?? "");
  const q = String(search ?? "").trim();
  if (!q) return str;
  const lower = str.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let partIndex = 0;
  while (i < str.length) {
    const pos = lower.indexOf(needle, i);
    if (pos === -1) {
      if (i < str.length) parts.push(<span key={`t-${partIndex++}`}>{str.slice(i)}</span>);
      break;
    }
    if (pos > i) parts.push(<span key={`t-${partIndex++}`}>{str.slice(i, pos)}</span>);
    parts.push(
      <mark key={`m-${pos}`} className="bg-amber-300 text-slate-900 rounded px-0.5 font-semibold inline">
        {str.slice(pos, pos + needle.length)}
      </mark>
    );
    partIndex++;
    i = pos + needle.length;
  }
  return parts.length === 0 ? str : parts.length === 1 ? parts[0] : <>{parts}</>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type SidebarFilter = "all" | "important" | "archived" | "deleted";

function sidebarToApiFilter(sidebar: SidebarFilter): FileListFilter | undefined {
  if (sidebar === "all") return undefined;
  if (sidebar === "important") return { important: true };
  if (sidebar === "archived") return { status: "archived" };
  if (sidebar === "deleted") return { status: "deleted" };
  return undefined;
}

// --- Snackbar ---
type SnackbarVariant = "success" | "error" | "info";
interface SnackbarItem {
  id: number;
  message: string;
  variant: SnackbarVariant;
}

function SnackbarList({
  items,
  onDismiss,
}: {
  items: SnackbarItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-1.5 max-w-[280px] pointer-events-none">
      <div className="flex flex-col gap-1.5 pointer-events-auto">
        {items.map((s) => (
          <div
            key={s.id}
            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md shadow border text-xs ${
              s.variant === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : s.variant === "error"
                  ? "bg-red-50 border-red-200 text-red-800"
                  : "bg-sky-50 border-sky-200 text-sky-800"
            }`}
          >
            <span className="font-medium truncate">{s.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(s.id)}
              className="p-0.5 rounded hover:bg-black/10 shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Confirm dialog ---
function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  variant,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  variant: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
        <div className="mt-6 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg font-medium ${
              variant === "danger"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Upload modal ---
/** Returns a name not in existing set; adds suffix " (1)", " (2)" etc. and mutates the set. */
function getUniqueFileName(name: string, existing: Set<string>): string {
  const normalized = name.trim() || "file";
  if (!existing.has(normalized)) {
    existing.add(normalized);
    return normalized;
  }
  const lastDot = normalized.lastIndexOf(".");
  const base = lastDot >= 0 ? normalized.slice(0, lastDot) : normalized;
  const ext = lastDot >= 0 ? normalized.slice(lastDot) : "";
  let n = 1;
  let candidate: string;
  do {
    candidate = `${base} (${n})${ext}`;
    n++;
  } while (existing.has(candidate));
  existing.add(candidate);
  return candidate;
}

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  onUploadDone: (fileIdsToProcess?: number[]) => void;
  onSnackbar: (message: string, variant: SnackbarVariant) => void;
  /** Existing file names (e.g. from server) so we add a suffix on duplicate. */
  existingFileNames?: string[];
}

type UploadItemStatus = "pending" | "uploading" | "processing" | "done" | "error";
interface UploadItem {
  file: File;
  name: string;
  status: UploadItemStatus;
  percent?: number;
}

function UploadModal({ open, onClose, onUploadDone, onSnackbar, existingFileNames = [] }: UploadModalProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processAfterUpload, setProcessAfterUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLas = (f: File) =>
    f.name.toLowerCase().endsWith(".las") || f.name.toLowerCase().endsWith(".las2");

  const addFiles = useCallback((list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list).filter(isLas);
    setItems((prev) => {
      const keys = new Set(prev.map((p) => p.name + p.file.size));
      const newOnes: UploadItem[] = files
        .filter((f) => !keys.has(f.name + f.size))
        .map((f) => ({ file: f, name: f.name, status: "pending" as const }));
      return [...prev, ...newOnes];
    });
    setError(null);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const setItemStatus = (index: number, status: UploadItemStatus, percent?: number) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, status, percent } : it))
    );
  };

  const startUpload = async () => {
    if (items.length === 0) {
      setError("Add at least one LAS file.");
      return;
    }
    setError(null);
    setUploading(true);
    let failed = 0;
    const uploadedFileIds: number[] = [];
    const usedNames = new Set(existingFileNames.map((n) => n.trim()).filter(Boolean));
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const uniqueName = getUniqueFileName(it.name, usedNames);
      const fileToUpload = uniqueName !== it.name ? new File([it.file], uniqueName, { type: it.file.type }) : it.file;
      setItemStatus(i, "uploading", 0);
      try {
        const res = await uploadFile(fileToUpload, {
          process: false,
          onUploadProgress: (p) => setItemStatus(i, "uploading", p),
        });
        setItemStatus(i, "done", 100);
        const fileId = res?.data?.uploads?.[0]?.file?.id;
        if (typeof fileId === "number") uploadedFileIds.push(fileId);
      } catch {
        failed += 1;
        setItemStatus(i, "error");
        setError(`Failed to upload ${uniqueName}`);
      }
    }
    setUploading(false);
    onClose();
    setItems([]);
    onUploadDone(processAfterUpload && uploadedFileIds.length > 0 ? uploadedFileIds : undefined);
    if (failed === 0) {
      onSnackbar(
        items.length === 1
          ? processAfterUpload && uploadedFileIds.length > 0
            ? "File uploaded. Processing started."
            : "File uploaded successfully"
          : `${items.length} files uploaded${processAfterUpload && uploadedFileIds.length > 0 ? ". Processing started." : ""}`,
        "success"
      );
    } else if (failed < items.length) {
      onSnackbar(`${items.length - failed} uploaded, ${failed} failed`, "error");
    } else {
      onSnackbar("Upload failed", "error");
    }
  };

  const handleClose = () => {
    if (!uploading) {
      setItems([]);
      setError(null);
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold">Upload LAS files</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-gray-50"
            }`}
          >
            <input
              type="file"
              accept={LAS_ACCEPT}
              multiple
              onChange={onInputChange}
              className="hidden"
              id="modal-file-input"
            />
            <label htmlFor="modal-file-input" className="cursor-pointer block">
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">
                Drag and drop LAS files here, or <span className="text-blue-600 font-medium">browse</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">.las, .las2 — multiple files supported</p>
            </label>
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={processAfterUpload}
                  onChange={(e) => setProcessAfterUpload(e.target.checked)}
                  disabled={uploading}
                  className="rounded border-gray-300"
                />
                Process automatically after upload
              </label>
              <div className="max-h-40 overflow-y-auto space-y-1">
                <p className="text-xs font-medium text-gray-500">{items.length} file(s)</p>
                {items.map((it, i) => (
                  <div
                    key={`${it.name}-${i}`}
                    className="flex items-center gap-2 text-sm bg-gray-50 rounded px-3 py-1.5"
                  >
                    <span className="truncate flex-1 min-w-0">{it.name}</span>
                    {(it.status === "uploading" || it.status === "processing") && (
                      <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full bg-blue-600 transition-all duration-200"
                          style={{ width: `${it.percent ?? 0}%` }}
                        />
                      </div>
                    )}
                    {it.status === "done" && (
                      <span className="text-emerald-600 text-xs shrink-0">Done</span>
                    )}
                    {it.status === "error" && (
                      <span className="text-red-600 text-xs shrink-0">Failed</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      disabled={uploading}
                      className="text-gray-400 hover:text-red-600 shrink-0 disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}
        </div>
        <div className="flex gap-2 px-5 py-4 border-t bg-gray-50">
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={startUpload}
            disabled={uploading || items.length === 0}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FileManager() {
  const WIDTH = 1400;
  const HEIGHT = 700;
  const SCALE = 0.9;

  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [contentTab, setContentTab] = useState<"uploaded" | "processed" | "unprocessed" | "processing">("uploaded");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [snackbars, setSnackbars] = useState<SnackbarItem[]>([]);
  const snackbarIdRef = useRef(0);
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    variant: "danger" | "default";
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", confirmLabel: "", variant: "default", onConfirm: () => {} });

  const { processingFileId, progress, setProcessingState } = useProcessing();
  const { logs } = useProcessLogs(processingFileId);
  const [expandedLogsFileId, setExpandedLogsFileId] = useState<number | null>(null);

  useEffect(() => {
    if (processingFileId == null) setExpandedLogsFileId(null);
  }, [processingFileId]);

  const addSnackbar = useCallback((message: string, variant: SnackbarVariant = "success") => {
    const id = ++snackbarIdRef.current;
    setSnackbars((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setSnackbars((prev) => prev.filter((s) => s.id !== id));
    }, 4500);
  }, []);

  const loadFiles = useCallback(async (): Promise<FileItem[] | undefined> => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFiles(sidebarToApiFilter(sidebarFilter));
      setFiles(data);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files");
      setFiles([]);
      addSnackbar("Failed to load files", "error");
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [sidebarFilter, addSnackbar]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const filteredFiles = files.filter((f) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      f.file_name.toLowerCase().includes(q) ||
      f.well_name.toLowerCase().includes(q)
    );
  });

  const displayedFiles =
    contentTab === "uploaded"
      ? filteredFiles
      : contentTab === "processed"
        ? filteredFiles.filter((f) => f.processed)
        : contentTab === "processing"
          ? (processingFileId != null ? filteredFiles.filter((f) => f.id === processingFileId) : [])
          : filteredFiles.filter((f) => !f.processed && f.id !== processingFileId);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === displayedFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedFiles.map((f) => f.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const optimisticUpdate = useCallback(
    (id: number, patch: Partial<FileItem>) => {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
      );
    },
    []
  );

  const optimisticRemove = useCallback((ids: number[]) => {
    const set = new Set(ids);
    setFiles((prev) => prev.filter((f) => !set.has(f.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const handleDownload = async (id: number) => {
    try {
      const url = await getDownloadUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      addSnackbar("Download failed", "error");
    }
  };

  const handleMarkImportant = async (file: FileItem) => {
    const next = !file.is_important;
    optimisticUpdate(file.id, { is_important: next });
    try {
      await updateFile(file.id, { is_important: next });
      addSnackbar(next ? "Marked as important" : "Removed from important", "success");
    } catch {
      optimisticUpdate(file.id, { is_important: file.is_important });
      addSnackbar("Failed to update", "error");
    }
  };

  const handleArchive = async (file: FileItem) => {
    optimisticRemove([file.id]);
    try {
      await updateFile(file.id, { status: "archived" });
      addSnackbar("Moved to archives", "success");
    } catch {
      loadFiles();
      addSnackbar("Failed to archive", "error");
    }
  };

  const handleDelete = (file: FileItem) => {
    setConfirm({
      open: true,
      title: "Move to trash",
      message: `Move "${file.file_name}" to Deleted? You can restore it from the Deleted section.`,
      confirmLabel: "Move to trash",
      variant: "default",
      onConfirm: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        optimisticRemove([file.id]);
        try {
          await updateFile(file.id, { status: "deleted" });
          addSnackbar("Moved to deleted", "success");
        } catch {
          loadFiles();
          addSnackbar("Failed to delete", "error");
        }
      },
    });
  };

  const handleProcess = async (file: FileItem) => {
    if (file.processed) return;
    if (typeof file.id !== "number") {
      addSnackbar("Invalid file", "error");
      return;
    }
    const fileId = file.id;
    console.log("[FileManager] Process started", { fileId, file_name: file.file_name });
    setProcessingState(fileId, 0);
    try {
      await processFileApi(fileId);
      setProcessingState(fileId, 100);
      console.log("[FileManager] Process completed", { fileId });
      optimisticUpdate(fileId, { processed: true });
      addSnackbar("File processed successfully", "success");
      setTimeout(() => setProcessingState(null, 0), 500);
    } catch (err) {
      setProcessingState(null, 0);
      console.error("[FileManager] Process failed", { fileId, err });
      const msg = err instanceof Error ? err.message : "Processing failed";
      const axiosErr = err && typeof err === "object" && "response" in err
        ? (err as { response?: { status?: number; data?: { message?: string } } }).response
        : null;
      const detail = axiosErr?.data?.message ?? (axiosErr?.status ? `HTTP ${axiosErr.status}` : msg);
      addSnackbar(`Process failed: ${detail}`, "error");
    }
  };

  const handleUploadDone = useCallback(
    async (fileIdsToProcess?: number[]) => {
      const list = await loadFiles();
      if (fileIdsToProcess?.length && list?.length) {
        for (const id of fileIdsToProcess) {
          const file = list.find((f) => f.id === id);
          if (file && !file.processed) handleProcess(file);
        }
      }
    },
    [loadFiles, handleProcess]
  );

  const handleRestore = async (file: FileItem) => {
    optimisticRemove([file.id]);
    try {
      await updateFile(file.id, { status: "active" });
      addSnackbar("Restored", "success");
    } catch {
      loadFiles();
      addSnackbar("Failed to restore", "error");
    }
  };

  const handleDeletePermanent = (file: FileItem) => {
    setConfirm({
      open: true,
      title: "Delete permanently",
      message: `Permanently delete "${file.file_name}"? This cannot be undone.`,
      confirmLabel: "Delete permanently",
      variant: "danger",
      onConfirm: async () => {
        setConfirm((c) => ({ ...c, open: false }));
        optimisticRemove([file.id]);
        try {
          await deleteFilePermanent(file.id);
          addSnackbar("File deleted permanently", "success");
        } catch {
          loadFiles();
          addSnackbar("Failed to delete permanently", "error");
        }
      },
    });
  };

  const runBulk = async (
    action: "delete" | "archive" | "important" | "permanent",
    ids: number[]
  ) => {
    if (ids.length === 0) return;
    const idList = [...ids];
    clearSelection();

    if (action === "permanent") {
      setConfirm({
        open: true,
        title: "Delete permanently",
        message: `Permanently delete ${idList.length} file(s)? This cannot be undone.`,
        confirmLabel: "Delete permanently",
        variant: "danger",
        onConfirm: async () => {
          setConfirm((c) => ({ ...c, open: false }));
          optimisticRemove(idList);
          try {
            const res = await bulkDeletePermanent(idList);
            const deleted = res?.data && typeof res.data === "object" && "deleted" in res.data ? res.data.deleted : 0;
            addSnackbar(
              deleted === idList.length
                ? `${idList.length} file(s) deleted permanently`
                : `Deleted ${deleted} of ${idList.length}`,
              "success"
            );
          } catch {
            loadFiles();
            addSnackbar("Bulk delete failed", "error");
          }
        },
      });
      return;
    }

    if (action === "delete") {
      setConfirm({
        open: true,
        title: "Move to trash",
        message: `Move ${idList.length} file(s) to Deleted?`,
        confirmLabel: "Move to trash",
        variant: "default",
        onConfirm: async () => {
          setConfirm((c) => ({ ...c, open: false }));
          optimisticRemove(idList);
          try {
            await bulkUpdateFiles(idList, { status: "deleted" });
            addSnackbar(`${idList.length} file(s) moved to deleted`, "success");
          } catch {
            loadFiles();
            addSnackbar("Bulk delete failed", "error");
          }
        },
      });
      return;
    }

    if (action === "archive") {
      optimisticRemove(idList);
    } else {
      idList.forEach((id) => optimisticUpdate(id, { is_important: true }));
    }
    try {
      await bulkUpdateFiles(
        idList,
        action === "archive" ? { status: "archived" } : { is_important: true }
      );
      addSnackbar(
        action === "archive"
          ? `${idList.length} file(s) archived`
          : `${idList.length} file(s) marked important`,
        "success"
      );
    } catch {
      loadFiles();
      addSnackbar("Bulk action failed", "error");
    }
  };

  const sidebarItems: { key: SidebarFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "important", label: "Important" },
    { key: "archived", label: "Archives" },
    { key: "deleted", label: "Deleted" },
  ];

  const hasSelection = selectedIds.size > 0;
  const isDeletedView = sidebarFilter === "deleted";
  const navigate = useNavigate();

  const handleFileClick = (file: FileItem, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const processingFileIdForState = processingFileId === file.id ? file.id : undefined;
    navigate(`/dashboard/${file.id}`, { state: { file, processingFileId: processingFileIdForState } });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#bae1cf] via-white to-[#23293c] flex items-center justify-center font-sans antialiased">
      <SnackbarList
        items={snackbars}
        onDismiss={(id) => setSnackbars((p) => p.filter((s) => s.id !== id))}
      />
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel={confirm.confirmLabel}
        variant={confirm.variant}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm((c) => ({ ...c, open: false }))}
      />
      <UploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadDone={handleUploadDone}
        onSnackbar={addSnackbar}
        existingFileNames={files.map((f) => f.file_name)}
      />
      <div
        style={{ transform: `scale(${SCALE})`, transformOrigin: "center" }}
        className="transition-transform duration-300"
      >
        <div
          style={{ width: `${WIDTH}px`, height: `${HEIGHT}px` }}
          className="bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
        >
          <header className="flex items-center justify-between px-6 py-4 border-b">
            <div className="flex items-center gap-6">
              <div
                className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center"
                title="Files"
              >
                <Folder className="w-6 h-6 text-white" />
              </div>
              <div className="relative">
                <Search className="w-5 h-5 text-blue-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  className="pl-10 pr-4 py-2.5 bg-white border-2 border-blue-200 rounded-lg text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 shadow-sm w-80 transition-colors"
                  placeholder="SEARCH..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  title="Search by file name or well name"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* <Settings className="w-5 h-5 text-gray-600 cursor-pointer" title="Settings" />
              <Bell className="w-5 h-5 text-gray-600 cursor-pointer" title="Notifications" />
              <User className="w-8 h-8 bg-gray-300 rounded-full p-1 cursor-pointer" title="Account" /> */}
              <img
                src={logo}
                alt="Logo"
                className="h-10 w-auto object-contain hover:scale-105 transition-transform duration-200 cursor-pointer"
              />
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden">
            <aside className="w-64 border-r p-6 overflow-y-auto">
              <div className="text-xs font-semibold text-gray-500 mb-4">
                FILES
              </div>
              {sidebarItems.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSidebarFilter(key)}
                  title={
                    key === "all"
                      ? "All files"
                      : key === "important"
                        ? "Important files only"
                        : key === "archived"
                          ? "Archived files"
                          : "Deleted files"
                  }
                  className={`w-full text-left px-4 py-2 text-sm rounded-lg ${
                    sidebarFilter === key
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {label}
                </button>
              ))}
              <div
                className="mt-8 bg-blue-600 text-white rounded-full px-4 py-2 text-center text-sm"
                title="Total file count"
              >
                {files.length} file{files.length !== 1 ? "s" : ""}
              </div>
            </aside>

            <main className="flex-1 p-8 overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">YOUR RECENT FILES</h1>
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(true)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg flex gap-2 items-center"
                  title="Upload LAS files"
                >
                  <Upload className="w-4 h-4" />
                  UPLOAD
                </button>
              </div>

              <div className="flex gap-1 border-b mb-4">
                {(
                  [
                    { id: "uploaded", label: "All" },
                    { id: "processed", label: "Processed" },
                    { id: "unprocessed", label: "Unprocessed" },
                    { id: "processing", label: "Processing" },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setContentTab(id)}
                    title={
                      id === "uploaded"
                        ? "All uploaded files"
                        : id === "processed"
                          ? "Processed files only"
                          : id === "unprocessed"
                            ? "Files not yet processed"
                            : "Currently processing"
                    }
                    className={`px-4 py-2 text-sm font-medium rounded-t -mb-px ${
                      contentTab === id
                        ? "bg-white border border-b-0 border-gray-200 text-blue-600"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {hasSelection && (
                <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <span className="text-sm font-medium text-blue-800">
                    {selectedIds.size} selected
                  </span>
                  {!isDeletedView && (
                    <>
                      <button
                        type="button"
                        onClick={() => runBulk("important", [...selectedIds])}
                        className="text-sm px-3 py-1.5 rounded bg-amber-100 text-amber-800 hover:bg-amber-200"
                        title="Mark selected files as important"
                      >
                        Mark important
                      </button>
                      <button
                        type="button"
                        onClick={() => runBulk("archive", [...selectedIds])}
                        className="text-sm px-3 py-1.5 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                        title="Move selected files to Archives"
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        onClick={() => runBulk("delete", [...selectedIds])}
                        className="text-sm px-3 py-1.5 rounded bg-red-100 text-red-800 hover:bg-red-200"
                        title="Move selected files to Deleted"
                      >
                        Move to trash
                      </button>
                    </>
                  )}
                  {isDeletedView && (
                    <button
                      type="button"
                      onClick={() => runBulk("permanent", [...selectedIds])}
                      className="text-sm px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700"
                      title="Permanently delete selected files"
                    >
                      Delete permanently
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700"
                    title="Clear selection"
                  >
                    Clear
                  </button>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-4">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-gray-500 min-h-[280px]">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Loading files...
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedFiles.length === 0 ? (
                    <div className="text-center py-12 px-4 text-gray-500 min-h-[200px] flex flex-col items-center justify-center">
                      {filteredFiles.length === 0
                        ? "No files yet. Upload a LAS file to get started."
                        : contentTab === "uploaded"
                          ? "No files match your search."
                          : contentTab === "processing"
                            ? processingFileId != null
                              ? "Loading processing file…"
                              : "No files currently processing. If you refreshed during processing, the file may still be finishing—check Unprocessed or refresh the list."
                            : `No ${contentTab} files.`}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          type="button"
                          onClick={selectAll}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                          title={
                            selectedIds.size === displayedFiles.length
                              ? "Deselect all"
                              : "Select all"
                          }
                        >
                          {selectedIds.size === displayedFiles.length ? (
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                        <span className="text-xs text-gray-500">
                          {selectedIds.size === displayedFiles.length
                            ? "Deselect all"
                            : "Select all"}
                        </span>
                      </div>
                      {displayedFiles.map((file) => (
                        <React.Fragment key={file.id}>
                          <div
                            className={`flex items-center gap-4 p-4 rounded-2xl bg-white 
shadow-[0_0_16px_rgba(0,0,0,0.08)] 
hover:shadow-[0_6px_20px_rgba(0,0,0,0.12)]
hover:-translate-y-1
transition-all duration-200 ease-out
group ${selectedIds.has(file.id) ? "ring-2 ring-blue-500 bg-blue-50/50" : ""}`}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelect(file.id);
                              }}
                              className="p-1.5 rounded hover:bg-gray-100 shrink-0"
                              title={
                                selectedIds.has(file.id)
                                  ? "Deselect this file"
                                  : "Select this file"
                              }
                            >
                              {selectedIds.has(file.id) ? (
                                <CheckSquare className="w-5 h-5 text-blue-600" />
                              ) : (
                                <Square className="w-5 h-5 text-gray-400" />
                              )}
                            </button>
                            <FileText className="w-5 h-5 text-gray-400 shrink-0" />
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={(e) => handleFileClick(file, e)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleFileClick(
                                    file,
                                    e as unknown as React.MouseEvent,
                                  );
                                }
                              }}
                            >
                              <div className="flex flex-row gap-3">
                                <div className="font-medium truncate">
                                  {highlightMatch(file.file_name, searchQuery)}
                                </div>
                                <div className="text-sm text-black bg-gray-200 rounded-md px-1 py-0.5">
                                  {highlightMatch(file.well_name, searchQuery)}
                                </div>
                              </div>
                              <div className="text-sm text-gray-500 flex items-center gap-2">
                                {formatDate(file.uploaded_at)}
                                {!file.processed && (
                                  <>
                                    <span className="text-amber-600">
                                      Not processed
                                    </span>
                                  </>
                                )}
                                {file.processed && (
                                  <>
                                    <span className="text-green-600">
                                      Processed
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div
                              className="flex gap-2 shrink-0 items-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {!file.processed &&
                                (processingFileId === file.id ? (
                                  <span className="flex items-center gap-2">
                                    <span className="inline-block w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                      <span
                                        className="block h-full bg-blue-600 rounded-full transition-all duration-300"
                                        style={{ width: `${progress}%` }}
                                      />
                                    </span>
                                    <span className="flex items-center gap-1.5 text-sm text-blue-600">
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      {progress}%
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedLogsFileId((prev) =>
                                          prev === file.id ? null : file.id,
                                        );
                                      }}
                                      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700"
                                      title={
                                        expandedLogsFileId === file.id
                                          ? "Hide process logs"
                                          : "Show process logs"
                                      }
                                    >
                                      {expandedLogsFileId === file.id ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      )}
                                      <ScrollText className="w-3.5 h-3.5" />
                                      Logs
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleProcess(file)}
                                    className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg flex gap-2 text-sm font-medium"
                                    title="Process this file (parse LAS and load curves)"
                                  >
                                    <Play className="w-4 h-4" />
                                    Process
                                  </button>
                                ))}
                              <button
                                type="button"
                                onClick={() => handleMarkImportant(file)}
                                title={
                                  file.is_important
                                    ? "Unmark important"
                                    : "Mark important"
                                }
                                className={`p-2 rounded-lg ${
                                  file.is_important
                                    ? "text-amber-500 bg-amber-50"
                                    : "text-gray-400 hover:bg-gray-100"
                                }`}
                              >
                                <Star
                                  className={`w-4 h-4 ${file.is_important ? "fill-current" : ""}`}
                                />
                              </button>
                              {file.status === "active" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleArchive(file)}
                                    title="Archive"
                                    className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"
                                  >
                                    <Archive className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(file)}
                                    title="Delete"
                                    className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              {(file.status === "archived" ||
                                file.status === "deleted") && (
                                <button
                                  type="button"
                                  onClick={() => handleRestore(file)}
                                  className="text-sm text-blue-600 hover:underline"
                                  title="Restore to active list"
                                >
                                  Restore
                                </button>
                              )}
                              {file.status === "deleted" && (
                                <button
                                  type="button"
                                  onClick={() => handleDeletePermanent(file)}
                                  title="Delete permanently"
                                  className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDownload(file.id)}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex gap-2 text-sm"
                                title="Download this file"
                              >
                                <Download className="w-4 h-4" />
                                DOWNLOAD
                              </button>
                            </div>
                          </div>
                          {expandedLogsFileId === file.id &&
                            processingFileId === file.id && (
                              <div className="mt-0 border border-t-0 rounded-b-lg border-gray-200 bg-slate-800 text-slate-200 font-mono text-xs overflow-hidden">
                                <div className="px-3 py-2 border-b border-slate-700 text-slate-400 text-[10px] uppercase tracking-wider flex items-center gap-2">
                                  <ScrollText className="w-3.5 h-3.5" />
                                  Process logs – {file.file_name}
                                </div>
                                <div className="max-h-48 overflow-y-auto p-3 space-y-1">
                                  {logs.length === 0 ? (
                                    <div className="text-slate-500">
                                      Waiting for logs…
                                    </div>
                                  ) : (
                                    logs.map((entry, i) => (
                                      <div
                                        key={i}
                                        className="py-0.5 border-b border-slate-700/80 last:border-0"
                                      >
                                        {entry.message}
                                        {entry.inserted != null &&
                                          entry.total != null &&
                                          entry.total > 0 && (
                                            <span className="text-sky-300 ml-1">
                                              (
                                              {Math.round(
                                                (entry.inserted / entry.total) *
                                                  100,
                                              )}
                                              %)
                                            </span>
                                          )}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                        </React.Fragment>
                      ))}
                    </>
                  )}
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
