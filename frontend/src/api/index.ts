export const API_BASE = "http://127.0.0.1:8000/api";

async function request<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `请求失败 (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiGet<T = any>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const q = new URLSearchParams();
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== "") q.set(key, String(val));
    }
  }
  const url = `${path}${q.toString() ? "?" + q : ""}`;
  return request(url);
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  return request(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
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
