import { reactive } from 'vue'
import {
  quickShelveState,
  refreshTemplateEditShopData,
  toggleSelectAllShops,
  toggleShopSelection,
} from './quickShelveController'
import {
  fetchAiImageTemplates,
  fetchAntiFollowTemplates,
  searchBrand,
  resolveBrandIdByName,
  type BrandSearchItem,
} from './quickShelveApi'
import type { OzonShopInfo, QuickShelveSubmitFlags, TemplateSelectItem } from './types'
import { showToast } from '../../../utils/toast'

export const templateEditState = reactive({
  visible: false,
  loadingOptions: false,
  shopSearch: '',
  batchStock: '',
  flags: {} as QuickShelveSubmitFlags,
  brandMode: 'original' as 'original' | 'none' | 'custom',
  customBrand: '',
  customBrandId: '',
  aiTemplates: [] as TemplateSelectItem[],
  antiFollowTemplates: [] as TemplateSelectItem[],
  /** 品牌搜索 */
  brandSearchLoading: false,
  brandSearchResults: [] as BrandSearchItem[],
  brandSearchOpen: false,
  /** 批量库存三级弹窗 */
  batchStockModalVisible: false,
  batchStockModalValue: 0,
})

let brandSearchTimer: number | null = null
let brandSearchSeq = 0

function cloneFlags(flags: QuickShelveSubmitFlags): QuickShelveSubmitFlags {
  return JSON.parse(JSON.stringify(flags))
}

async function loadTemplateSelectOptions() {
  templateEditState.loadingOptions = true
  try {
    const [ai, anti] = await Promise.all([
      fetchAiImageTemplates(),
      fetchAntiFollowTemplates(),
    ])
    templateEditState.aiTemplates = ai
    templateEditState.antiFollowTemplates = anti
    applyDefaultTemplateSelections()
  } catch (e) {
    console.warn('[mjgd][quickShelve] 加载模板选项失败', e)
  } finally {
    templateEditState.loadingOptions = false
  }
}

/**
 * 下拉框无「请选择」占位（对齐旧版）：开关开启且未选模板时，默认选中第一项。
 * 否则 Vue 的 v-model 会停留在 null，界面虽显示第一项但提交的模板 ID 为空。
 */
function applyDefaultTemplateSelections() {
  const f = templateEditState.flags
  if (!f) return
  if (!f.aiImage && f.aiTemplateId == null && templateEditState.aiTemplates.length) {
    f.aiTemplateId = templateEditState.aiTemplates[0].id
  }
  if (
    f.antiFollowEnabled === 1 &&
    f.antiFollowTemplateId == null &&
    templateEditState.antiFollowTemplates.length
  ) {
    f.antiFollowTemplateId = Number(templateEditState.antiFollowTemplates[0].id)
  }
}

/** AI 改图开关：勾选=启用（flags.aiImage 反向语义，true 表示不改图），启用后默认选第一项模板 */
export function onAiImageToggle(enabled: boolean) {
  templateEditState.flags.aiImage = !enabled
  applyDefaultTemplateSelections()
}

/** 防跟卖签名开关：启用后默认选第一项签名模板 */
export function onAntiFollowToggle(enabled: boolean) {
  templateEditState.flags.antiFollowEnabled = enabled ? 1 : 0
  applyDefaultTemplateSelections()
}

async function preloadSelectedShopData() {
  // 强制从后端重拉店铺列表 + 已选店铺仓库/额度（保留用户已填库存），刷新后台改动
  await refreshTemplateEditShopData()
}

export function shopDisplayName(shop: OzonShopInfo): string {
  return `${shop.keyName}-${shop.currencyCode || 'RUB'}`
}

export function getFilteredTemplateEditShops(): OzonShopInfo[] {
  const kw = templateEditState.shopSearch.trim().toLowerCase()
  return quickShelveState.shops.filter((shop) => {
    const label = shopDisplayName(shop).toLowerCase()
    return !kw || label.includes(kw)
  })
}

export function getTemplateShopSummary(): { shops: number; warehouses: number } {
  let warehouses = 0
  quickShelveState.selectedShopIds.forEach((shopId) => {
    if (quickShelveState.shopWarehouses[shopId]?.warehouseId) warehouses += 1
  })
  return { shops: quickShelveState.selectedShopIds.length, warehouses }
}

export function isTemplateShopCheckAll(): boolean {
  const total = quickShelveState.shops.length
  return total > 0 && quickShelveState.selectedShopIds.length === total
}

export function isTemplateShopCheckIndeterminate(): boolean {
  const n = quickShelveState.selectedShopIds.length
  const total = quickShelveState.shops.length
  return n > 0 && n < total
}

export function onTemplateShopCheckAll(checked: boolean) {
  void toggleSelectAllShops(checked)
}

export function onTemplateShopToggle(shopId: string, checked: boolean) {
  void toggleShopSelection(shopId, checked)
}

export function removeTemplateShop(shopId: string) {
  void toggleShopSelection(shopId, false)
}

export function adjustTemplateShopStock(shopId: string, delta: number) {
  const cfg = quickShelveState.shopWarehouses[shopId]
  if (!cfg) return
  cfg.stock = Math.max(0, (Number(cfg.stock) || 0) + delta)
}

export function applyTemplateBatchStock() {
  const stock = parseInt(templateEditState.batchStock, 10)
  if (!Number.isFinite(stock) || stock < 0) return
  quickShelveState.selectedShopIds.forEach((shopId) => {
    const cfg = quickShelveState.shopWarehouses[shopId]
    if (cfg) cfg.stock = stock
  })
}

export function hasShopWarehouseSelected(shopId: string): boolean {
  const wid = quickShelveState.shopWarehouses[shopId]?.warehouseId
  return wid != null && wid !== ''
}

/* ---------- 批量库存三级弹窗 ---------- */

export function openBatchStockModal() {
  templateEditState.batchStockModalValue = parseInt(templateEditState.batchStock, 10) || 0
  templateEditState.batchStockModalVisible = true
}

export function closeBatchStockModal() {
  templateEditState.batchStockModalVisible = false
}

export function adjustBatchStockModalValue(delta: number) {
  const next = Math.max(0, (Number(templateEditState.batchStockModalValue) || 0) + delta)
  templateEditState.batchStockModalValue = next
}

export function normalizeBatchStockModalValue() {
  const v = Number(templateEditState.batchStockModalValue)
  if (!Number.isFinite(v) || v < 0) templateEditState.batchStockModalValue = 0
}

/** 确定：仅对已勾选店铺写入；同步外层 batchStock 输入 */
export function confirmBatchStockModal() {
  const v = Math.max(0, Number(templateEditState.batchStockModalValue) || 0)
  templateEditState.batchStock = String(v)
  quickShelveState.selectedShopIds.forEach((shopId) => {
    const cfg = quickShelveState.shopWarehouses[shopId]
    if (cfg) cfg.stock = v
  })
  closeBatchStockModal()
}

/* ---------- 品牌搜索 ---------- */

export function onBrandKeywordInput(keyword: string) {
  templateEditState.customBrand = keyword
  templateEditState.customBrandId = ''
  if (brandSearchTimer != null) {
    window.clearTimeout(brandSearchTimer)
    brandSearchTimer = null
  }
  if (!keyword.trim()) {
    templateEditState.brandSearchResults = []
    templateEditState.brandSearchOpen = false
    return
  }
  brandSearchTimer = window.setTimeout(() => {
    void runBrandSearch(keyword)
  }, 500)
}

async function runBrandSearch(keyword: string) {
  const seq = ++brandSearchSeq
  templateEditState.brandSearchLoading = true
  templateEditState.brandSearchOpen = true
  try {
    const results = await searchBrand(keyword)
    if (seq !== brandSearchSeq) return
    templateEditState.brandSearchResults = results
  } finally {
    if (seq === brandSearchSeq) templateEditState.brandSearchLoading = false
  }
}

export function selectBrandSearchItem(item: BrandSearchItem) {
  templateEditState.customBrand = item.value
  templateEditState.customBrandId = item.id
  templateEditState.brandSearchOpen = false
}

export function closeBrandSearchDropdown() {
  templateEditState.brandSearchOpen = false
}

/* ---------- 打开/关闭/确定 ---------- */

export function openTemplateEditModal() {
  templateEditState.flags = cloneFlags(quickShelveState.submitFlags)
  templateEditState.shopSearch = ''
  templateEditState.batchStock = ''
  if (!templateEditState.flags.brandStatus) {
    templateEditState.brandMode = 'none'
  } else if (templateEditState.flags.brand) {
    templateEditState.brandMode = 'custom'
    templateEditState.customBrand = templateEditState.flags.brand || ''
    templateEditState.customBrandId = templateEditState.flags.brandId || ''
  } else {
    templateEditState.brandMode = 'original'
    templateEditState.customBrand = ''
    templateEditState.customBrandId = ''
  }
  templateEditState.brandSearchResults = []
  templateEditState.brandSearchOpen = false
  templateEditState.visible = true
  void Promise.all([loadTemplateSelectOptions(), preloadSelectedShopData()])
}

export function closeTemplateEditModal() {
  templateEditState.visible = false
}

export async function confirmTemplateEditModal() {
  const f = templateEditState.flags
  if (templateEditState.brandMode === 'none') {
    f.brandStatus = false
    f.brand = null
    f.brandId = null
  } else if (templateEditState.brandMode === 'custom') {
    f.brandStatus = true
    f.brand = templateEditState.customBrand.trim() || null
    f.brandId = templateEditState.customBrandId.trim() || null
    if (f.brand && !f.brandId) {
      const id = await resolveBrandIdByName(f.brand)
      if (id) {
        f.brandId = id
        templateEditState.customBrandId = id
      }
    }
    if (f.brand && !f.brandId) {
      showToast('未能解析自定义品牌，请从下拉列表中选择品牌后再提交', 4000)
      return
    }
  } else {
    f.brandStatus = true
    f.brand = null
    f.brandId = null
  }
  if (f.antiFollowEnabled !== 1) {
    f.antiFollowTemplateId = null
  } else if (f.antiFollowTemplateId != null) {
    f.antiFollowTemplateId = Number(f.antiFollowTemplateId)
  }
  if (f.aiImage) {
    f.aiTemplateId = null
  }
  quickShelveState.submitFlags = cloneFlags(f)
  closeTemplateEditModal()
}
