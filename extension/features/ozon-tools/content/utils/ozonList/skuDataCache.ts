// 全局 SKU 数据缓存（对齐旧版 C.goodsSaleData）
// 每张卡片走 loadSkuData 时把 Ozon Page1/Page2 的可验证指标落到这里，
// 后续消费者优先查缓存，避免重复请求。公开响应没有的经营指标保持 undefined。
//
// 与旧版差异：
//   - 旧版用数组 push，靠 SKU 比对取数；新版直接用 Map<sku, data> O(1) 查
//   - 上限 200 条，超出按插入顺序剔除（Map 默认插入序），防止长时间浏览膨胀

import type { OzonSkuCardData } from './types'

const MAX_ENTRIES = 200
const _cache = new Map<string, OzonSkuCardData>()

function normalizeSku(sku: string | number | undefined | null): string {
  return String(sku ?? '').trim()
}

/** 卡片接口成功后写入；同 SKU 重复写会刷新到末尾，自动起到 LRU 效果 */
export function cacheSkuData(sku: string | number, data: OzonSkuCardData): void {
  const key = normalizeSku(sku)
  if (!key || !data) return
  if (_cache.has(key)) _cache.delete(key)
  _cache.set(key, data)
  while (_cache.size > MAX_ENTRIES) {
    const oldest = _cache.keys().next().value
    if (oldest == null) break
    _cache.delete(oldest)
  }
}

/** 急速上架等消费者用：拿不到返回 null */
export function getCachedSkuData(sku: string | number): OzonSkuCardData | null {
  return _cache.get(normalizeSku(sku)) || null
}

/** 登出时调用：清干净，避免下次别的账号拿到上次数据 */
export function clearSkuDataCache(): void {
  _cache.clear()
}
