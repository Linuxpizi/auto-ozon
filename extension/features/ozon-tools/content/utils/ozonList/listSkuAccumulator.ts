// 列表页急速上架 SKU 累加器
//
// 背景：Ozon 类目/搜索页是虚拟滚动，DOM 里任意时刻只挂载 ~40 个商品瓦片，
// 滚出视口的瓦片会被卸载/回收。旧版插件把每个贴过卡的商品 push 进内存数组 C.skus，
// 打开「急速上架」时从该累加器渲染，所以不受 DOM 当前挂载数量限制。
//
// 新版此前改成打开弹窗时实时扫 DOM（collectListPageSkuRows），于是只能采到当前
// 挂载的 ~40 个。此模块重建等价的常驻累加器：贴卡时（processItem）记录商品，
// 弹窗读取时与实时 DOM 合并去重，恢复旧版「滚过多少就能上架多少」的行为。
//
// 生命周期：与 skuDataCache 一致，登录/登出时清空（见 authSession）。

import type { QuickShelveSkuRow } from '../ozonQuickShelve/types'

// 上限防止超长时间浏览无限膨胀；远高于单页真实商品数，实际相当于「无限制」。
const MAX_ENTRIES = 5000

interface ListSkuRecord {
  sku: string
  title: string
  image: string
  price: string
  sales: string
}

const _acc = new Map<string, ListSkuRecord>()

function normalizeSku(sku: string | number | undefined | null): string {
  return String(sku ?? '').trim()
}

/** 贴卡时记录一个列表商品；同 SKU 重复记录时原地更新，保留原插入顺序（≈ 页面顺序） */
export function recordListSku(entry: {
  sku: string | number
  title?: string
  image?: string
  price?: string
  sales?: string
}): void {
  const sku = normalizeSku(entry.sku)
  if (!sku) return
  const existing = _acc.get(sku)
  if (existing) {
    if (entry.title) existing.title = entry.title
    if (entry.image) existing.image = entry.image
    if (entry.price) existing.price = entry.price
    if (entry.sales) existing.sales = entry.sales
    return
  }
  _acc.set(sku, {
    sku,
    title: entry.title || sku,
    image: entry.image || '',
    price: entry.price || '',
    sales: entry.sales || '',
  })
  while (_acc.size > MAX_ENTRIES) {
    const oldest = _acc.keys().next().value
    if (oldest == null) break
    _acc.delete(oldest)
  }
}

/** 卡片接口返回后补记销量（对齐旧版列表销量列 xl） */
export function updateListSkuSales(sku: string | number, sales: string): void {
  const rec = _acc.get(normalizeSku(sku))
  if (rec && sales) rec.sales = sales
}

/** 取累加的全部列表商品，转成急速上架行；每次返回全新对象，避免弹窗内编辑污染累加器 */
export function getAccumulatedListSkuRows(): QuickShelveSkuRow[] {
  const rows: QuickShelveSkuRow[] = []
  for (const rec of _acc.values()) {
    rows.push({
      sku: rec.sku,
      title: rec.title || rec.sku,
      image: rec.image,
      price: rec.price,
      originalPrice: '',
      salePrice: '',
      goodsNo: '',
      sales: rec.sales || '销量:0',
      createdAt: '',
    })
  }
  return rows
}

/** 登录/登出时清空，避免跨账号残留 */
export function clearListSkuAccumulator(): void {
  _acc.clear()
}
