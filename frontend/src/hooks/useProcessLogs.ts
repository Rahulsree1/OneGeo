import { useState, useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { apiBaseURL } from "../api/client";
import { useProcessing } from "../context/ProcessingContext";

export interface ProcessLogEntry {
  message: string;
  step?: string;
  inserted?: number;
  total?: number;
}

function stepToPercent(step: string | undefined, inserted?: number, total?: number): number | null {
  if (total != null && total > 0 && inserted != null && inserted >= 0) {
    return Math.min(99, 40 + Math.round((50 * inserted) / total));
  }
  switch (step) {
    case "start":
      return 5;
    case "download":
      return 15;
    case "parse":
      return 25;
    case "well":
      return 35;
    case "curves":
    case "insert":
      return 40;
    case "curves_done":
      return 90;
    case "done":
      return 100;
    default:
      return null;
  }
}

// Persist logs per file so they survive navigation (Dashboard → FileManager)
const logsCache: Record<number, ProcessLogEntry[]> = {};

export function useProcessLogs(activeFileId: number | null) {
  const { setProcessingState } = useProcessing();
  const [logs, setLogs] = useState<ProcessLogEntry[]>(() =>
    activeFileId != null ? [...(logsCache[activeFileId] ?? [])] : []
  );
  const socketRef = useRef<Socket | null>(null);
  const intentionalDisconnectRef = useRef(false);

  useEffect(() => {
    if (activeFileId == null) {
      setLogs([]);
      if (socketRef.current) {
        intentionalDisconnectRef.current = true;
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    intentionalDisconnectRef.current = false;
    setLogs([...(logsCache[activeFileId] ?? [])]);
    const socket = io(apiBaseURL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("process_log", (data: { file_id: number; message: string; step?: string; inserted?: number; total?: number }) => {
      if (data.file_id !== activeFileId) return;
      const entry: ProcessLogEntry = { message: data.message, step: data.step, inserted: data.inserted, total: data.total };
      const list = [...(logsCache[activeFileId] ?? []), entry];
      logsCache[activeFileId] = list;
      setLogs(list);
      const pct = stepToPercent(data.step, data.inserted, data.total);
      if (pct != null) setProcessingState(activeFileId, pct);
      if (data.step === "done" || data.step === "error") {
        setTimeout(() => delete logsCache[activeFileId], 2000);
      }
    });

    socket.on("connect_error", () => {
      if (!intentionalDisconnectRef.current) {
        setLogs((prev) => [...prev, { message: "Live log connection unavailable.", step: "error" }]);
      }
    });

    return () => {
      intentionalDisconnectRef.current = true;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [activeFileId, setProcessingState]);

  return { logs };
}
