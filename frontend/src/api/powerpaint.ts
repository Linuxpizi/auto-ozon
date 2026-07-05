/**
 * PowerPaint API client — image editing (remove/outpaint/inpaint).
 * Uses multipart FormData (file upload), NOT JSON.
 * Completely independent from ai.ts (ChatGPT-based functions).
 */
import { API_BASE } from "./index";

const PP_PREFIX = "/powerpaint";

async function ppRequest<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${PP_PREFIX}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `PowerPaint 请求失败 (${res.status})`);
  }
  return res.json();
}

/** 查询当前设备状态 (CPU/GPU) */
export async function getDevice(): Promise<{
  device: string;
  dtype: string;
  model_dir: string;
  model_exists: boolean;
  cuda_available: boolean;
}> {
  return ppRequest("/device");
}

/** 去除图片中的物体 (Object Removal) — 需要上传原图 + mask */
export async function removeObject(
  imageFile: File,
  maskFile: File,
  prompt: string = "",
  numInferenceSteps: number = 50,
  guidanceScale: number = 7.5,
): Promise<{
  url: string;
  task: string;
  duration_ms: number;
  device: string;
}> {
  const fd = new FormData();
  fd.append("image", imageFile);
  fd.append("mask", maskFile);
  fd.append("prompt", prompt);
  fd.append("num_inference_steps", String(numInferenceSteps));
  fd.append("guidance_scale", String(guidanceScale));
  return ppRequest("/remove", { method: "POST", body: fd });
}

/** 图片边缘智能扩展 (Outpainting) — 需要上传原图 */
export async function outpaintImage(
  imageFile: File,
  horizontalRatio: number = 0.5,
  verticalRatio: number = 0.5,
  numInferenceSteps: number = 50,
  guidanceScale: number = 7.5,
): Promise<{
  url: string;
  task: string;
  duration_ms: number;
  device: string;
}> {
  const fd = new FormData();
  fd.append("image", imageFile);
  fd.append("horizontal_ratio", String(horizontalRatio));
  fd.append("vertical_ratio", String(verticalRatio));
  fd.append("num_inference_steps", String(numInferenceSteps));
  fd.append("guidance_scale", String(guidanceScale));
  return ppRequest("/outpaint", { method: "POST", body: fd });
}

/** 文本引导区域修复 (Inpainting) — 需要上传原图 + mask + prompt */
export async function inpaintRegion(
  imageFile: File,
  maskFile: File,
  prompt: string,
  numInferenceSteps: number = 50,
  guidanceScale: number = 7.5,
): Promise<{
  url: string;
  task: string;
  duration_ms: number;
  device: string;
}> {
  const fd = new FormData();
  fd.append("image", imageFile);
  fd.append("mask", maskFile);
  fd.append("prompt", prompt);
  fd.append("num_inference_steps", String(numInferenceSteps));
  fd.append("guidance_scale", String(guidanceScale));
  return ppRequest("/inpaint", { method: "POST", body: fd });
}
