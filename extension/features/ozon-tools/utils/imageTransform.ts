/** 图片处理中心单张图：原图 url + 当前展示 transformUrl + 处理历史栈 */
export interface ImageTransformItem {
  url: string;
  transformUrl: string;
  transformHistory?: string[];
}

/** 懒初始化历史栈，避免旧数据无字段时 push 报错 */
export function ensureTransformHistory(item: ImageTransformItem): string[] {
  if (!item.transformHistory) {
    item.transformHistory = [];
  }
  return item.transformHistory;
}

/**
 * 写回新展示 URL 前将当前 transformUrl 入栈，供「还原上一步」弹出
 */
export function applyTransformUrl(item: ImageTransformItem, newUrl: string): boolean {
  const next = String(newUrl || "").trim();
  if (!next || next === item.transformUrl) return false;
  ensureTransformHistory(item).push(item.transformUrl);
  item.transformUrl = next;
  return true;
}

/**
 * 单步还原：优先弹出历史栈；栈空且非原图时回退到 url（兼容无栈旧数据）
 */
export function revertTransformUrlOneStep(item: ImageTransformItem): boolean {
  const history = item.transformHistory;
  if (history && history.length > 0) {
    item.transformUrl = history.pop()!;
    return true;
  }
  if (item.transformUrl !== item.url) {
    item.transformUrl = item.url;
    return true;
  }
  return false;
}
