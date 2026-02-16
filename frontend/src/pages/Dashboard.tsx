import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { processFile, fetchFiles } from "../api/client";
import type { FileItem } from "../api/client";
import { Loader2, Play, ArrowLeft, X } from "lucide-react";
import Analysis from "../components/Analysis";
import Statistics from "../components/Statistics";
import AIInterpretation from "../components/AIInterpretation";
import Reports from "../components/Reports";
import { useProcessing } from "../context/ProcessingContext";
import { useProcessLogs } from "../hooks/useProcessLogs";
import logo from "../assets/logo.png";

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { fileId: fileIdParam } = useParams<{ fileId: string }>();
  const fileIdFromUrl = fileIdParam != null ? parseInt(fileIdParam, 10) : undefined;
  const fileFromState = location.state?.file as FileItem | undefined;
  const { processingFileId, progress, setProcessingState } = useProcessing();

  const [file, setFile] = useState<FileItem | undefined>(fileFromState);
  const [snackbar, setSnackbar] = useState<{ message: string; error: boolean } | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const lastFetchedFileIdRef = useRef<number | null>(null);

  // Tabs config
  const TABS = [
    { id: "analysis", label: "Visualization" },
    { id: "statistics", label: "Statistics" },
    { id: "ai", label: "AI Interpretation" },
    { id: "reports", label: "Analysis & Reports" },
  ];

  // SIZE CONTROL VARIABLE
  const TOGGLE_SIZE = "medium   "; // change: "xs" | "small" | "medium" | "large"

  // Size styles map
  const SIZE_STYLES = {
    xs: {
      container: "p-0.5",
      button: "px-3 py-0.5 text-xs",
      headerPadding: "py-2",
    },
    small: {
      container: "p-0.5",
      button: "px-4 py-1 text-sm",
      headerPadding: "py-3",
    },
    medium: {
      container: "p-1",
      button: "px-6 py-2 text-sm",
      headerPadding: "py-4",
    },
    large: {
      container: "p-1",
      button: "px-8 py-2.5 text-base",
      headerPadding: "py-6",
    },
  };

  const styles = SIZE_STYLES[TOGGLE_SIZE.trim() as keyof typeof SIZE_STYLES] ?? SIZE_STYLES.medium;

  const [viewMode, setViewMode] = useState(TABS[0].id);

  React.useEffect(() => {
    if (fileFromState && (!fileIdFromUrl || fileFromState.id === fileIdFromUrl)) setFile(fileFromState);
  }, [fileFromState, fileIdFromUrl]);

  // Load file by ID from URL when opened directly (e.g. refresh or shared link)
  useEffect(() => {
    if (fileIdFromUrl == null || !Number.isInteger(fileIdFromUrl)) {
      lastFetchedFileIdRef.current = null;
      return;
    }
    const current = file ?? fileFromState;
    if (current?.id === fileIdFromUrl) {
      lastFetchedFileIdRef.current = fileIdFromUrl;
      return;
    }
    let cancelled = false;
    setLoadingFile(true);
    fetchFiles()
      .then((list) => {
        if (cancelled) return;
        const found = list.find((f) => f.id === fileIdFromUrl);
        setFile(found ?? undefined);
        lastFetchedFileIdRef.current = fileIdFromUrl;
      })
      .catch(() => {
        if (!cancelled) setFile(undefined);
        if (!cancelled) lastFetchedFileIdRef.current = fileIdFromUrl;
      })
      .finally(() => {
        if (!cancelled) setLoadingFile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fileIdFromUrl, file, fileFromState]);

  const displayFile = file ?? fileFromState;
  const isProcessed = displayFile?.processed ?? false;
  const hasFetchedForUrl =
    fileIdFromUrl == null || lastFetchedFileIdRef.current === fileIdFromUrl;
  const showFileLoading =
    loadingFile || (fileIdFromUrl != null && displayFile == null && !hasFetchedForUrl);

  const showProcessingUI = Boolean(displayFile?.id && processingFileId === displayFile.id && !isProcessed);
  const activeLogFileId = showProcessingUI ? displayFile?.id ?? null : null;
  const { logs } = useProcessLogs(activeLogFileId);

  // Mark file as processed when progress hits 100% or we see a "done" log (updates even if process was started from FileManager)
  useEffect(() => {
    if (!displayFile?.id || displayFile.processed) return;
    if (processingFileId !== displayFile.id) return;
    const done = progress === 100 || logs.some((e) => e.step === "done");
    if (done) {
      setFile((prev) => (prev?.id === displayFile.id ? { ...prev, processed: true } : prev));
      setViewMode("analysis");
    }
  }, [progress, processingFileId, displayFile?.id, displayFile?.processed, logs]);

  const showSnackbar = useCallback((message: string, error: boolean) => {
    setSnackbar({ message, error });
    setTimeout(() => setSnackbar(null), 4500);
  }, []);

  const handleProcess = async () => {
    if (!displayFile?.id || isProcessed) return;
    const fileId = displayFile.id;
    console.log("[Dashboard] Process started", { fileId, file_name: displayFile.file_name });
    setProcessingState(fileId, 0);
    try {
      await processFile(fileId);
      setProcessingState(fileId, 100);
      console.log("[Dashboard] Process completed", { fileId });
      setFile((prev) => (prev ? { ...prev, processed: true } : prev));
      setViewMode("analysis");
      setTimeout(() => setProcessingState(null, 0), 500);
    } catch (err) {
      setProcessingState(null, 0);
      console.error("[Dashboard] Process failed", { fileId, err });
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string }; status?: number } }).response?.data?.message
          : null;
      showSnackbar(msg || (err instanceof Error ? err.message : "Processing failed"), true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col font-sans antialiased">
      {/* Snackbar */}
      {snackbar && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center justify-between gap-3 px-4 py-2 rounded-lg shadow border max-w-sm ${
            snackbar.error
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          <span className="text-sm font-medium">{snackbar.message}</span>
          <button
            type="button"
            onClick={() => setSnackbar(null)}
            className="p-1 rounded hover:bg-black/10"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className={`max-w-7xl mx-auto px-0 ${styles.headerPadding}`}>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                navigate("/", {
                  state:
                    showProcessingUI && displayFile?.id
                      ? { processingFileId: displayFile.id }
                      : undefined,
                })
              }
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm px-3 py-2 rounded-lg hover:bg-slate-100 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
              title="Return to File Manager"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to files
            </button>
            <div
              className={`inline-flex rounded-full bg-slate-100 ${styles.container}`}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setViewMode(tab.id)}
                  title={
                    tab.id === "analysis"
                      ? "Curve visualization"
                      : tab.id === "statistics"
                        ? "Deterministic statistics"
                        : tab.id === "ai"
                          ? "AI interpretation (Groq LLM)"
                          : "Analysis & reports"
                  }
                  className={`
                    ${styles.button}
                    rounded-full font-medium transition-all duration-200
                    ${viewMode === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <img
              src={logo}
              alt="Logo"
              className="h-10 w-auto object-contain hover:scale-105 transition-transform duration-200 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        className={`px-4 py-4 min-h-[320px] ${displayFile && isProcessed ? "flex-1 min-h-0 flex flex-col" : "flex items-center justify-center flex-1"}`}
      >
        {!displayFile ? (
          <div className="text-center text-slate-600 min-h-[240px] flex flex-col items-center justify-center">
            {showFileLoading ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-slate-400" />
                <p className="text-lg">Loading file...</p>
              </>
            ) : fileIdFromUrl != null ? (
              <>
                <p className="text-lg">File not found.</p>
                <p className="text-sm mt-2">
                  The file may have been deleted or the link is invalid.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="mt-4 px-4 py-2 bg-slate-200 rounded-lg text-slate-800 hover:bg-slate-300"
                  title="Open File Manager"
                >
                  Go to File Manager
                </button>
              </>
            ) : (
              <>
                <p className="text-lg">No file selected.</p>
                <p className="text-sm mt-2">
                  Click a file in File Manager to open it here.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="mt-4 px-4 py-2 bg-slate-200 rounded-lg text-slate-800 hover:bg-slate-300"
                  title="Open File Manager"
                >
                  Go to File Manager
                </button>
              </>
            )}
          </div>
        ) : isProcessed ? (
          <div className="flex flex-col flex-1 min-h-0 relative">
            <div
              className={`flex flex-col flex-1 min-h-0 ${viewMode !== "analysis" ? "hidden" : ""}`}
              aria-hidden={viewMode !== "analysis"}
            >
              <Analysis
                wellId={displayFile.well_id}
                wellName={displayFile.well_name}
              />
            </div>
            <div
              className={`flex flex-col flex-1 min-h-0 ${viewMode !== "statistics" ? "hidden" : ""}`}
              aria-hidden={viewMode !== "statistics"}
            >
              <Statistics
                wellId={displayFile.well_id}
                wellName={displayFile.well_name}
              />
            </div>
            <div
              className={`flex flex-col flex-1 min-h-0 ${viewMode !== "ai" ? "hidden" : ""}`}
              aria-hidden={viewMode !== "ai"}
            >
              <AIInterpretation
                wellId={displayFile.well_id}
                wellName={displayFile.well_name}
              />
            </div>
            <div
              className={`flex flex-col flex-1 min-h-0 ${viewMode !== "reports" ? "hidden" : ""}`}
              aria-hidden={viewMode !== "reports"}
            >
              <Reports
                wellId={displayFile.well_id}
                wellName={displayFile.well_name}
                fileName={displayFile.file_name}
              />
            </div>
          </div>
        ) : showProcessingUI ? (
          <div className="text-center w-full max-w-md">
            <p className="text-lg text-slate-700 mb-4">
              <div className="flex flex-row gap-3 justify-center">
                <div className="font-large truncate">
                  {displayFile.file_name}
                </div>
                <div className="text-sm text-black bg-gray-200 rounded-lg px-2 py-1">
                  {displayFile.well_name}
                </div>
              </div>
            </p>
            <p className="text-slate-600 font-medium mb-3">Processing...</p>
            <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-slate-500 mt-2">
              {progress < 100 ? `${Math.min(progress, 99)}%` : "Complete"}
            </p>
            {logs.length > 0 && (
              <div className="mt-4 text-left w-full max-h-40 overflow-y-auto rounded-lg bg-slate-800 text-slate-200 p-3 font-mono text-xs">
                <div className="text-slate-400 mb-1.5 text-[10px] uppercase tracking-wider">
                  Live logs
                </div>
                {logs.map((entry, i) => (
                  <div
                    key={i}
                    className="py-0.5 border-b border-slate-700 last:border-0"
                  >
                    {entry.message}
                    {entry.inserted != null && entry.total != null && (
                      <span className="text-sky-300 ml-1">
                        ({Math.round((entry.inserted / entry.total) * 100)}%)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <p className="text-lg text-slate-700 mb-6">
              <div className="flex flex-row gap-3">
                <div className="font-medium truncate">
                  {displayFile.file_name}
                </div>
                <div className="text-sm text-black bg-gray-200 rounded-md px-1 py-0.5">
                  {displayFile.well_name}
                </div>
              </div>
            </p>
            <button
              type="button"
              onClick={handleProcess}
              disabled={showProcessingUI}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-70 text-white px-8 py-4 rounded-xl text-lg font-medium shadow-lg"
              title="Process LAS file to enable analysis and visualization"
            >
              {showProcessingUI ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Process this file
                </>
              )}
            </button>
            <p className="text-sm text-slate-500 mt-4">
              Process the LAS file to enable analysis and visualization.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
