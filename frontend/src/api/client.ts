import axios from "axios";

// When served from backend (same origin), use "" so API and Socket.IO use current host.
// For dev with Vite on 5173, leave unset to use backend on 1729.
export const apiBaseURL =
  typeof import.meta.env.VITE_API_URL === "string"
    ? import.meta.env.VITE_API_URL
    : "http://localhost:1729";

export const api = axios.create({
  baseURL: apiBaseURL,
  headers: { "Content-Type": "application/json" },
});

export interface FileItem {
  id: number;
  well_id: number;
  well_name: string;
  file_name: string;
  uploaded_at: string | null;
  status: string;
  is_important: boolean;
  processed: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export type FileListFilter = { status?: string; important?: boolean };

export async function fetchFiles(filters?: FileListFilter): Promise<FileItem[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.important === true) params.set("important", "1");
  const url = "/api/files" + (params.toString() ? "?" + params.toString() : "");
  const { data } = await api.get<ApiResponse<FileItem[]>>(url);
  if (!data.success || !Array.isArray(data.data)) return [];
  return data.data;
}

export interface UploadResult {
  uploads: Array<{ well?: unknown; file?: { id: number; [key: string]: unknown }; error?: string; file_name?: string }>;
  count: number;
}

/** Upload one file. Use process: false (default) for fast upload; then call processFile(id) to process. */
export async function uploadFile(
  file: File,
  opts?: { onUploadProgress?: (percent: number) => void; process?: boolean }
): Promise<ApiResponse<UploadResult>> {
  const formData = new FormData();
  formData.append("file", file);
  const url = opts?.process ? "/api/files/upload?process=true" : "/api/files/upload";
  const { data } = await api.post<ApiResponse<UploadResult>>(url, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: opts?.onUploadProgress
      ? (e) => {
          const percent = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
          opts.onUploadProgress!(percent);
        }
      : undefined,
  });
  return data;
}

export async function processFile(fileId: number): Promise<ApiResponse<unknown>> {
  if (typeof fileId !== "number" || !Number.isInteger(fileId)) {
    throw new Error("Invalid file id");
  }
  const url = `/api/files/${fileId}/process`;
  const { data } = await api.post<ApiResponse<unknown>>(url, {});
  return data;
}

export async function updateFile(
  fileId: number,
  payload: { status?: string; is_important?: boolean }
): Promise<ApiResponse<FileItem>> {
  const { data } = await api.patch<ApiResponse<FileItem>>(`/api/files/${fileId}`, payload);
  return data;
}

export async function deleteFilePermanent(fileId: number): Promise<ApiResponse<null>> {
  const { data } = await api.delete<ApiResponse<null>>(`/api/files/${fileId}`);
  return data;
}

export async function bulkUpdateFiles(
  fileIds: number[],
  payload: { status?: string; is_important?: boolean }
): Promise<ApiResponse<{ updated: number }>> {
  const { data } = await api.patch<ApiResponse<{ updated: number }>>("/api/files/bulk", {
    file_ids: fileIds,
    ...payload,
  });
  return data;
}

export async function bulkDeletePermanent(fileIds: number[]): Promise<ApiResponse<{ deleted: number }>> {
  const { data } = await api.post<ApiResponse<{ deleted: number }>>("/api/files/bulk-delete", {
    file_ids: fileIds,
  });
  return data;
}

export async function getDownloadUrl(fileId: number): Promise<string> {
  const { data } = await api.get<ApiResponse<{ download_url: string }>>(
    `/api/files/${fileId}/download`
  );
  if (!data.success || !data.data?.download_url) throw new Error("Download URL not available");
  return data.data.download_url;
}

/** Get distinct curve names for a well. */
export async function getWellCurveNames(wellId: number): Promise<string[]> {
  const { data } = await api.get<ApiResponse<{ curve_names: string[] }>>(
    `/api/wells/${wellId}/curves`
  );
  if (!data.success || !Array.isArray(data.data?.curve_names)) return [];
  return data.data.curve_names;
}

/** Get depth range (min, max) for a well. */
export async function getWellDepthRange(wellId: number): Promise<{ depth_min: number; depth_max: number } | null> {
  const { data } = await api.get<ApiResponse<{ depth_min: number; depth_max: number }>>(
    `/api/wells/${wellId}/depth-range`
  );
  if (!data.success || data.data == null) return null;
  return { depth_min: data.data.depth_min, depth_max: data.data.depth_max };
}

/** Get curve data for visualization: { depth: number[], [curveName]: number[] }. */
export async function getCurveData(
  wellId: number,
  curveNames: string[],
  depthMin: number,
  depthMax: number
): Promise<{ depth: number[]; [key: string]: number[] }> {
  const { data } = await api.post<ApiResponse<{ depth: number[]; [key: string]: number[] }>>(
    "/api/visualization",
    { well_id: wellId, curve_names: curveNames, depth_min: depthMin, depth_max: depthMax }
  );
  if (!data.success || !data.data) throw new Error("Failed to load curve data");
  return data.data;
}

/** AI interpretation: statistics, anomalies, insights for a well/depth/curves. */
export interface AIInterpretResult {
  summary: string;
  anomalies: Array<{ depth: number; curve_name: string; value: number; mean: number; deviation: string }>;
  insights: Array<{
    curve: string;
    statistics: { min: number; max: number; mean: number; std: number; count: number };
    interpretation: string;
  }>;
}

export async function interpretWellLog(
  wellId: number,
  curveNames: string[],
  depthMin: number,
  depthMax: number
): Promise<AIInterpretResult> {
  const { data } = await api.post<ApiResponse<AIInterpretResult>>("/api/ai/interpret", {
    well_id: wellId,
    curve_names: curveNames,
    depth_min: depthMin,
    depth_max: depthMax,
  });
  if (!data.success || !data.data) throw new Error("Interpretation failed");
  return data.data;
}

/** LLM interpretation (Groq): returns statistics + natural-language interpretation. */
export interface AIInterpretLLMResult {
  statistics: AIInterpretResult;
  interpretation: string;
}

export async function interpretWellLogLLM(
  wellId: number,
  wellName: string,
  curveNames: string[],
  depthMin: number,
  depthMax: number
): Promise<AIInterpretLLMResult> {
  const { data } = await api.post<ApiResponse<AIInterpretLLMResult>>("/api/ai/interpret-llm", {
    well_id: wellId,
    well_name: wellName,
    curve_names: curveNames,
    depth_min: depthMin,
    depth_max: depthMax,
  });
  if (!data.success || !data.data) throw new Error("LLM interpretation failed");
  return data.data;
}
