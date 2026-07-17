/**
 * 智能去水印 — 本地视觉服务（/vision/Watermark）对接 CleanPixel
 */
import axios, { type AxiosResponse } from 'axios';
import { API_CONFIG, apiService, type ApiResponse } from '../../utils/api';
import { hasExtensionMessaging } from '../../utils/runtime';
import { proxyFetch } from '../../utils/proxyFetch';
/** BFF 前缀，注意大小写 Watermark */
const WATERMARK_API = `${API_CONFIG.LOCAL_VISION_BASE_URL}/vision/Watermark`;

export interface WatermarkSessionData {
  session_id: string;
  width: number;
  height: number;
  format: string;
  expires_in?: number;
}

export interface InpaintPatchResult {
  blob: Blob;
  bbox: { x: number; y: number; w: number; h: number };
  session: WatermarkSessionData | null;
}

function unwrapRuoYi<T>(res: ApiResponse<T> | null | undefined): T {
  if (!res || res.code !== 200) {
    throw new Error((res && res.msg) || '请求失败');
  }
  return res.data as T;
}

function tryParseErrorBody(data: unknown): Record<string, unknown> | null {
  if (!data) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (data instanceof ArrayBuffer) {
    try {
      const text = new TextDecoder('utf-8').decode(new Uint8Array(data));
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function tryParseErrorDetail(data: unknown): string {
  const j = tryParseErrorBody(data);
  if (j) {
    return String(j.detail || j.msg || '');
  }
  if (typeof data === 'string') return data;
  return '';
}

function isSessionExpiredResponse(res: AxiosResponse<ArrayBuffer>): boolean {
  if (!res || res.status !== 410) return false;
  const body = tryParseErrorBody(res.data);
  return !!(body && body.code === 'SESSION_EXPIRED');
}

async function postInpaintRaw(sessionId: string, body: { mask: object }) {
  // inpaint 需读 X-Patch-Bbox 自定义响应头，专用 proxyFetch binary 代理
  if (hasExtensionMessaging()) {
    return postInpaintViaBackground(sessionId, body);
  }
  return axios<ArrayBuffer>({
    baseURL: API_CONFIG.LOCAL_VISION_BASE_URL,
    url: `/vision/Watermark/sessions/${encodeURIComponent(sessionId)}/inpaint`,
    method: 'post',
    data: body,
    responseType: 'arraybuffer',
    validateStatus: () => true,
    timeout: 300000,
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
    },
  });
}

/** 经 background 代理 inpaint，绕过 CORS 对自定义响应头的屏蔽 */
async function postInpaintViaBackground(
  sessionId: string,
  body: { mask: object },
): Promise<AxiosResponse<ArrayBuffer>> {
  const url = `${API_CONFIG.LOCAL_VISION_BASE_URL}/vision/Watermark/sessions/${encodeURIComponent(sessionId)}/inpaint`;
  const result = await proxyFetch(url, {
    method: 'POST',
    body,
    preset: 'local_auth',
    responseType: 'binary',
    exposeHeaders: ['X-Patch-Bbox'],
  });

  const status = result.status || 500;
  let arrayBuffer: ArrayBuffer = new ArrayBuffer(0);
  if (result.body && typeof result.body === 'string') {
    const binary = atob(result.body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    arrayBuffer = bytes.buffer;
  }

  const bboxHeader = result.headers['X-Patch-Bbox'] || result.headers['x-patch-bbox'] || '';
  return {
    status,
    data: arrayBuffer,
    statusText: String(status),
    headers: {
      'x-patch-bbox': bboxHeader,
      'content-type': result.contentType || 'image/png',
    },
    config: {} as any,
  };
}

function parsePatchFromSuccess(res: AxiosResponse<ArrayBuffer>): Omit<InpaintPatchResult, 'session'> {
  const headers = res.headers || {};
  const bboxRaw = headers['x-patch-bbox'] || headers['X-Patch-Bbox'];
  if (!bboxRaw) {
    throw new Error(
      '响应缺少 X-Patch-Bbox（多为 CORS 未暴露该响应头，请后端配置 Access-Control-Expose-Headers: X-Patch-Bbox）'
    );
  }
  const parts = String(bboxRaw)
    .split(',')
    .map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw new Error('无效的 X-Patch-Bbox');
  }
  const [x, y, w, h] = parts;
  const ctHeader = headers['content-type'] || headers['Content-Type'] || 'image/png';
  const mime = String(ctHeader).split(';')[0].trim() || 'image/png';
  const blob = new Blob([res.data], { type: mime });
  return { blob, bbox: { x, y, w, h } };
}

/** 建立会话：multipart 上传原图（apiService.request 已走 background 代理） */
export async function createWatermarkSession(file: File): Promise<WatermarkSessionData> {
  const fd = new FormData();
  fd.append('image', file);
  const res = await apiService.request<ApiResponse<WatermarkSessionData>>(
    `${WATERMARK_API}/sessions`,
    {
      method: 'POST',
      data: fd,
      timeout: 120000,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return unwrapRuoYi(res);
}

/** 增量修图：Body 为 `{ mask }` */
export async function inpaintWatermark(
  sessionId: string,
  mask: object,
  getRecoveryFile?: () => Promise<File | null>
): Promise<InpaintPatchResult> {
  const body = { mask };
  let res = await postInpaintRaw(sessionId, body);
  // 会话过期：重建会话后重试一次
  if (isSessionExpiredResponse(res) && typeof getRecoveryFile === 'function') {
    const file = await getRecoveryFile();
    if (!file) {
      throw new Error('会话已过期，无法获取恢复图片，请重新上传');
    }
    const session = await createWatermarkSession(file);
    res = await postInpaintRaw(session.session_id, body);
    if (res.status !== 200) {
      throw new Error(tryParseErrorDetail(res.data) || `修图失败 (${res.status})`);
    }
    const patch = parsePatchFromSuccess(res);
    return { ...patch, session };
  }

  if (res.status === 410) {
    throw new Error(tryParseErrorDetail(res.data) || '会话已过期，请重新上传图片');
  }

  if (res.status === 403) {
    throw new Error(tryParseErrorDetail(res.data) || '本地服务拒绝请求或可用额度不足，请检查本地服务配置');
  }

  if (res.status !== 200) {
    throw new Error(tryParseErrorDetail(res.data) || `修图失败 (${res.status})`);
  }

  const patch = parsePatchFromSuccess(res);
  return { ...patch, session: null };
}

/** 删除会话 */
export function deleteWatermarkSession(sessionId: string | null | undefined): Promise<void> {
  if (!sessionId) return Promise.resolve();
  return apiService
    .request(`${WATERMARK_API}/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
    .then(() => { })
    .catch(() => { });
}

/** 健康检查 */
export function fetchWatermarkHealth(): Promise<Record<string, unknown> | null> {
  return apiService
    .request<ApiResponse<Record<string, unknown>>>(`${WATERMARK_API}/health`, { method: 'GET' })
    .then((res) => unwrapRuoYi(res));
}

/** 从 canvas 当前状态重建会话 */
export async function recreateSessionFromCanvas(
  canvas: HTMLCanvasElement,
  filename = 'image.png'
): Promise<WatermarkSessionData> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('无法导出画布');
  }
  const file = new File([blob], filename, { type: 'image/png' });
  return createWatermarkSession(file);
}
