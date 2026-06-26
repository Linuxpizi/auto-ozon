import type { PluginSettings, StoredProduct } from './types'
import { DEFAULT_SETTINGS } from './types'

const SETTINGS_KEY = 'plugin_settings'
const PRODUCTS_KEY = 'scraped_products'

/** 获取插件设置 */
export async function getSettings(): Promise<PluginSettings> {
  const result = await browser.storage.local.get(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) }
}

/** 保存插件设置 */
export async function saveSettings(settings: PluginSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings })
}

/** 获取所有采集记录 */
export async function getProducts(): Promise<StoredProduct[]> {
  const result = await storage.local.get(PRODUCTS_KEY)
  return (result[PRODUCTS_KEY] as StoredProduct[]) || []
}

/** 保存采集记录（新增，自动去重） */
export async function addProduct(product: StoredProduct): Promise<boolean> {
  const products = await getProducts()
  const exists = products.some(
    (p) => p.platform === product.platform && p.sourceId === product.sourceId,
  )
  if (exists) return false
  products.unshift(product)
  await storage.local.set({ [PRODUCTS_KEY]: products })
  return true
}

/** 批量保存采集记录 */
export async function addProducts(newProducts: StoredProduct[]): Promise<number> {
  const products = await getProducts()
  const existingKeys = new Set(products.map((p) => `${p.platform}:${p.sourceId}`))
  let added = 0
  for (const p of newProducts) {
    const key = `${p.platform}:${p.sourceId}`
    if (!existingKeys.has(key)) {
      products.unshift(p)
      existingKeys.add(key)
      added++
    }
  }
  await browser.storage.local.set({ [PRODUCTS_KEY]: products })
  return added
}

/** 删除采集记录 */
export async function removeProduct(id: string): Promise<void> {
  const products = await getProducts()
  const filtered = products.filter((p) => p.id !== id)
  await browser.storage.local.set({ [PRODUCTS_KEY]: filtered })
}

/** 清空所有采集记录 */
export async function clearProducts(): Promise<void> {
  await browser.storage.local.set({ [PRODUCTS_KEY]: [] })
}

/** 标记记录为已同步 */
export async function markSynced(ids: string[]): Promise<void> {
  const products = await getProducts()
  for (const p of products) {
    if (ids.includes(p.id)) p.synced = true
  }
  await browser.storage.local.set({ [PRODUCTS_KEY]: products })
}

/** 获取未同步记录数 */
export async function getUnsyncedCount(): Promise<number> {
  const products = await getProducts()
  return products.filter((p) => !p.synced).length
}
