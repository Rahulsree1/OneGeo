import React, { createContext, useContext, useState, useCallback } from "react";

const STORAGE_KEY = "onegeo_processing";

interface ProcessingState {
  processingFileId: number | null;
  progress: number;
}

const defaultState: ProcessingState = {
  processingFileId: null,
  progress: 0,
};

function loadPersisted(): ProcessingState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const data = JSON.parse(raw) as { processingFileId?: number | null; progress?: number };
    const id = data.processingFileId;
    if (typeof id !== "number" || !Number.isInteger(id)) return defaultState;
    return {
      processingFileId: id,
      progress: typeof data.progress === "number" ? Math.max(0, Math.min(100, data.progress)) : 0,
    };
  } catch {
    return defaultState;
  }
}

function savePersisted(fileId: number | null, progress: number) {
  try {
    if (fileId == null) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ processingFileId: fileId, progress }));
    }
  } catch {
    /* ignore */
  }
}

type SetProcessingState = (fileId: number | null, progress: number) => void;

const ProcessingContext = createContext<{
  processingFileId: number | null;
  progress: number;
  setProcessingState: SetProcessingState;
}>({
  ...defaultState,
  setProcessingState: () => {},
});

export function ProcessingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProcessingState>(() => loadPersisted());

  const setProcessingState = useCallback<SetProcessingState>((fileId, progress) => {
    savePersisted(fileId, progress);
    setState({ processingFileId: fileId, progress });
  }, []);

  return (
    <ProcessingContext.Provider
      value={{
        processingFileId: state.processingFileId,
        progress: state.progress,
        setProcessingState,
      }}
    >
      {children}
    </ProcessingContext.Provider>
  );
}

export function useProcessing() {
  return useContext(ProcessingContext);
}
