export const API_BASE = "http://127.0.0.1:9000/api";
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");
const DEFAULT_TIMEOUT_MS = 300_000;

export function assetUrl(path: string): string {
  if (!path) return path;
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  if (path.startsWith("/static/")) return `${API_ORIGIN}${path}`;
  return path;
}

function resolveRequestTimeout(options?: RequestInit): number {
  const headers = new Headers(options?.headers || undefined);
  const raw = headers.get("X-Request-Timeout-Ms");
  headers.delete("X-Request-Timeout-Ms");
  if (options) options.headers = headers;
  const parsed = raw ? Number(raw) : DEFAULT_TIMEOUT_MS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

async function request<T = any>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = resolveRequestTimeout(options);
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: options?.signal || controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `请求失败 (${res.status})`);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`请求超时：服务端或上游 AI 超过 ${Math.round(timeoutMs / 1000)} 秒未响应，请稍后重试`);
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function apiGet<T = any>(path: string, params?: Record<string, string | number | undefined | null>): Promise<T> {
  const q = new URLSearchParams();
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== "") q.set(key, String(val));
    }
  }
  const url = `${path}${q.toString() ? "?" + q : ""}`;
  return request(url);
}

export async function apiPost<T = any>(path: string, body?: any, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers || undefined);
  if (body) headers.set("Content-Type", "application/json");
  return request(path, {
    ...options,
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiPut<T = any>(path: string, body: any): Promise<T> {
  return request(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiDelete(path: string): Promise<void> {
  await request(path, { method: "DELETE" });
}

export async function apiUpload<T = any>(path: string, file: File): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);
  return request(path, {
    method: "POST",
    body: formData,
  });
}

export const apiUrl = (path: string) => `${API_BASE}${path}`;

export async function apiDownload(path: string, filename: string, params?: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== "") q.set(key, String(val));
    }
  }
  const url = `${API_BASE}${path}${q.toString() ? "?" + q : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}
