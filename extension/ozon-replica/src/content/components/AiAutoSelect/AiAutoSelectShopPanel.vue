<template>
  <div class="mjgd_ai_auto_select_shop_panel">
    <div v-if="selectedShops.length" class="mjgd_ai_auto_select_shop_summary">已选 {{ selectedShops.length }} 个店铺 · {{ selectedWarehouseCount }} 个仓库</div>
    <div v-if="shopListLoading" class="mjgd_ai_auto_select_shop_empty">店铺加载中...</div>
    <div v-else-if="!shops.length" class="mjgd_ai_auto_select_shop_empty">暂无店铺</div>
    <div v-else class="mjgd_ai_auto_select_shop_grid" :style="gridStyle">
      <div v-for="shop in shops" :key="shop.id" class="mjgd_ai_auto_select_shop_card" :class="{ is_selected: selectedShops.includes(shop.id) }">
        <div class="mjgd_ai_auto_select_shop_card_head">
          <label class="mjgd_ai_auto_select_shop_card_label">
            <input type="checkbox" :checked="selectedShops.includes(shop.id)" @change="handleToggleShop(shop.id)" />
            <span class="mjgd_ai_auto_select_shop_card_name">{{ shop.name }}</span>
          </label>
        </div>
        <template v-if="selectedShops.includes(shop.id)">
          <div class="mjgd_ai_auto_select_shop_quota_list">
            <span class="mjgd_ai_auto_select_shop_quota_item"><span class="mjgd_ai_auto_select_shop_quota_label">今日可创建：</span><span class="mjgd_ai_auto_select_shop_quota_value">{{ getQuotaDisplay(shop.id, 'daily_create') }}</span></span>
            <span class="mjgd_ai_auto_select_shop_quota_item"><span class="mjgd_ai_auto_select_shop_quota_label">今日可更新：</span><span class="mjgd_ai_auto_select_shop_quota_value">{{ getQuotaDisplay(shop.id, 'daily_update') }}</span></span>
            <span class="mjgd_ai_auto_select_shop_quota_item"><span class="mjgd_ai_auto_select_shop_quota_label">共计可创建：</span><span class="mjgd_ai_auto_select_shop_quota_value">{{ getQuotaDisplay(shop.id, 'total') }}</span></span>
          </div>
          <div class="mjgd_ai_auto_select_shop_card_controls">
            <select class="mjgd_ai_auto_select_shop_extra_select" :value="warehouseSelectValue(shop.id)" @change="onWarehouseSelectChange(shop.id, $event)">
              <option value="" v-if="warehouseSelectPlaceholder(shop.id)">{{ warehouseSelectPlaceholder(shop.id) }}</option>
              <option v-for="w in warehousesForShop(shop.id)" :key="w.warehouse_id" :value="String(w.warehouse_id)">Ozon仓库名称：{{ w.name }}</option>
            </select>
            <div class="mjgd_ai_auto_select_shop_stock_stepper">
              <button type="button" class="mjgd_ai_auto_select_shop_stepper_btn" @click="adjustShopStock(shop.id, -1)">−</button>
              <input type="text" inputmode="numeric" class="mjgd_ai_auto_select_shop_extra_input" :value="getShopStockQuantity(shop.id)" @input="onShopStockInput(shop.id, $event)" />
              <button type="button" class="mjgd_ai_auto_select_shop_stepper_btn" @click="adjustShopStock(shop.id, 1)">+</button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getShopList } from '../../../utils/aiApi'
import { apiService } from '../../../utils/api'
import { fetchShopRecordQuotaData, formatQuotaRemainLimit } from '../../utils/ozonQuickShelve/quickShelveApi'
import type { ShopRecordQuotaData } from '../../utils/ozonQuickShelve/types'
import type { ShopWarehouseInventoryMap } from '../../utils/aiAutoSelect/types'

type ShopRow = { id: number; name: string }
type OzonWarehouseRow = { warehouse_id: number; name: string }
type QuotaField = 'daily_create' | 'daily_update' | 'total'

const props = defineProps<{
  selectedShops: number[]
  shopWarehouseInventory: ShopWarehouseInventoryMap
  /** 店铺网格每行列数，不传则按容器宽度自适应 */
  columnsPerRow?: number
  /** 店铺网格最大高度，超出后内部滚动 */
  maxGridHeight?: string
}>()

const emit = defineEmits<{
  (e: 'update:selectedShops', value: number[]): void
  (e: 'update:shopWarehouseInventory', value: ShopWarehouseInventoryMap): void
  (e: 'available-shops-change', shopIds: number[]): void
  (e: 'shop-list-loading', loading: boolean): void
}>()

const shops = ref<ShopRow[]>([])
const shopListLoading = ref(false)
const shopQuotaMap = ref<Record<number, { data: ShopRecordQuotaData | null; loading: boolean }>>({})
const shopWarehouseMap = ref<Record<number, OzonWarehouseRow[]>>({})
const warehouseLoadingIds = ref<Set<number>>(new Set())

const selectedShops = computed({
  get: () => props.selectedShops,
  set: (val) => emit('update:selectedShops', val),
})

const shopWarehouseInventory = computed({
  get: () => props.shopWarehouseInventory,
  set: (val) => emit('update:shopWarehouseInventory', val),
})

const selectedWarehouseCount = computed(() => {
  return selectedShops.value.filter((shopId) => {
    const row = shopWarehouseInventory.value[shopId]
    return row?.warehouseId != null
  }).length
})

// 固定列数时平铺店铺；未指定时沿用自适应两列布局
const gridStyle = computed(() => {
  const style: Record<string, string> = {
    maxHeight: props.maxGridHeight || '320px',
  }
  if (props.columnsPerRow && props.columnsPerRow > 0) {
    style.gridTemplateColumns = `repeat(${props.columnsPerRow}, minmax(0, 1fr))`
  }
  return style
})

function warehousesForShop(shopId: number): OzonWarehouseRow[] {
  return shopWarehouseMap.value[shopId] ?? []
}

function warehouseSelectValue(shopId: number): string {
  const id = shopWarehouseInventory.value[shopId]?.warehouseId
  return id != null ? String(id) : ''
}

function getShopStockQuantity(shopId: number): number {
  return shopWarehouseInventory.value[shopId]?.quantity ?? 0
}

function warehouseSelectPlaceholder(shopId: number): string {
  if (warehouseLoadingIds.value.has(shopId)) return '加载中...'
  const list = warehousesForShop(shopId)
  if (!list.length && shopId in shopWarehouseMap.value) return '暂无仓库'
  const shopName = shops.value.find((s) => s.id === shopId)?.name?.trim() || '该店铺'
  if (warehouseSelectValue(shopId) === '') return `请选择${shopName}的仓库`
  return ''
}

function getQuotaDisplay(shopId: number, field: QuotaField): string {
  const entry = shopQuotaMap.value[shopId]
  if (!entry || entry.loading) return '--/--'
  if (!entry.data) return '--/--'
  return formatQuotaRemainLimit(entry.data[field])
}

function handleToggleShop(shopId: number) {
  if (selectedShops.value.includes(shopId)) {
    selectedShops.value = selectedShops.value.filter((id) => id !== shopId)
  } else {
    selectedShops.value = [...selectedShops.value, shopId]
  }
}

function onWarehouseSelectChange(shopId: number, e: Event) {
  const val = (e.target as HTMLSelectElement).value
  const wid = val === '' ? null : Number(val)
  const prev = shopWarehouseInventory.value[shopId] ?? { warehouseId: null, quantity: 0 }
  shopWarehouseInventory.value = { ...shopWarehouseInventory.value, [shopId]: { ...prev, warehouseId: wid } }
}

function onShopStockInput(shopId: number, e: Event) {
  const raw = (e.target as HTMLInputElement).value
  const num = Math.max(0, parseInt(raw, 10) || 0)
  const prev = shopWarehouseInventory.value[shopId] ?? { warehouseId: null, quantity: 0 }
  shopWarehouseInventory.value = { ...shopWarehouseInventory.value, [shopId]: { ...prev, quantity: num } }
}

function adjustShopStock(shopId: number, delta: number) {
  const prev = shopWarehouseInventory.value[shopId] ?? { warehouseId: null, quantity: 0 }
  const quantity = Math.max(0, (prev.quantity ?? 0) + delta)
  shopWarehouseInventory.value = { ...shopWarehouseInventory.value, [shopId]: { ...prev, quantity } }
}

function applyDefaultWarehouseForShop(shopId: number) {
  const list = warehousesForShop(shopId)
  if (list.length === 0) return
  const inv = shopWarehouseInventory.value[shopId]
  if (inv?.warehouseId == null || !list.some((w) => w.warehouse_id === inv.warehouseId)) {
    shopWarehouseInventory.value = {
      ...shopWarehouseInventory.value,
      [shopId]: { warehouseId: list[0].warehouse_id, quantity: inv?.quantity ?? 0 },
    }
  }
}

async function fetchShopQuotaForShop(shopId: number) {
  const cached = shopQuotaMap.value[shopId]
  if (cached?.data && !cached.loading) return
  shopQuotaMap.value = { ...shopQuotaMap.value, [shopId]: { data: cached?.data ?? null, loading: true } }
  try {
    const data = await fetchShopRecordQuotaData(shopId)
    shopQuotaMap.value = { ...shopQuotaMap.value, [shopId]: { data, loading: false } }
  } catch {
    shopQuotaMap.value = { ...shopQuotaMap.value, [shopId]: { data: null, loading: false } }
  }
}

async function fetchWarehousesForShop(shopId: number) {
  if (Object.prototype.hasOwnProperty.call(shopWarehouseMap.value, shopId)) {
    applyDefaultWarehouseForShop(shopId)
    return
  }
  if (warehouseLoadingIds.value.has(shopId)) return
  warehouseLoadingIds.value = new Set([...warehouseLoadingIds.value, shopId])
  try {
    const res = await apiService.getWarehouse(shopId)
    let list: OzonWarehouseRow[] = []
    if (res.code === 200) {
      const raw = (res as { data?: { result?: OzonWarehouseRow[] } | OzonWarehouseRow[] }).data
      const resolved = raw && typeof raw === 'object' && 'result' in raw ? (raw as { result?: OzonWarehouseRow[] }).result : raw
      list = Array.isArray(resolved) ? resolved : []
    }
    shopWarehouseMap.value = { ...shopWarehouseMap.value, [shopId]: list }
    applyDefaultWarehouseForShop(shopId)
  } catch {
    shopWarehouseMap.value = { ...shopWarehouseMap.value, [shopId]: [] }
  } finally {
    const next = new Set(warehouseLoadingIds.value)
    next.delete(shopId)
    warehouseLoadingIds.value = next
  }
}

async function fetchShopList() {
  if (shopListLoading.value) return
  shopListLoading.value = true
  try {
    const res = await getShopList()
    if (res?.code === 200 && Array.isArray(res.data)) {
      shops.value = res.data.map((item: { id: number; keyName?: string }) => ({
        id: item.id,
        name: item.keyName || `店铺${item.id}`,
      }))
    }
  } catch (error) {
    console.warn('[AiAutoSelectShopPanel] fetch shops failed', error)
  } finally {
    shopListLoading.value = false
  }
}

/** 启动选品前校验：返回错误文案，通过则返回 null */
function validateSelection(): string | null {
  // 不校验仓库和库存
  // for (const shopId of selectedShops.value) {
  //   const row = shopWarehouseInventory.value[shopId]
  //   const warehouseLoaded = Object.prototype.hasOwnProperty.call(shopWarehouseMap.value, shopId)
  //   const hasWarehouseOptions = warehousesForShop(shopId).length > 0
  //   if (warehouseLoaded && hasWarehouseOptions && (row == null || row.warehouseId == null)) {
  //     const shopName = shops.value.find((shop) => shop.id === shopId)?.name || `店铺${shopId}`
  //     return `请先为${shopName}选择仓库`
  //   }
  // }
  return null
}

watch(
  shops,
  (list) => {
    emit('available-shops-change', list.map((shop) => shop.id))
  },
  { immediate: true },
)

watch(
  shopListLoading,
  (loading) => {
    emit('shop-list-loading', loading)
  },
  { immediate: true },
)

watch(
  selectedShops,
  (ids) => {
    const inv = { ...shopWarehouseInventory.value }
    ids.forEach((id) => {
      if (!(id in inv)) inv[id] = { warehouseId: null, quantity: 0 }
      void fetchWarehousesForShop(id)
      void fetchShopQuotaForShop(id)
    })
    Object.keys(inv).forEach((k) => {
      const num = Number(k)
      if (!ids.includes(num)) delete inv[num]
    })
    shopWarehouseInventory.value = inv
  },
  { immediate: true, deep: true },
)

defineExpose({ validateSelection, fetchShopList })
</script>

<style scoped lang="scss">
.mjgd_ai_auto_select_shop_panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mjgd_ai_auto_select_shop_summary {
  padding: 8px 12px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 6px;
  font-size: 13px;
  color: #047857;
}

.mjgd_ai_auto_select_shop_empty {
  padding: 24px;
  text-align: center;
  color: #909399;
  font-size: 14px;
  background: #f7f9fb;
  border-radius: 8px;
}

.mjgd_ai_auto_select_shop_grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(max(200px, calc((100% - 36px) / 2)), 1fr));
  gap: 10px 12px;
  overflow-y: auto;
  padding: 12px;
  background: #ffffff;
  border-radius: 8px;
  box-sizing: border-box;
}

.mjgd_ai_auto_select_shop_card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 10px 12px;
  background: #ffffff;
  box-sizing: border-box;
  transition: border-color 0.2s, background 0.2s;
  min-width: 0;

  &.is_selected {
    border-color: #2563eb;
    background: #eff6ff;
  }
}

.mjgd_ai_auto_select_shop_card_head {
  display: flex;
  align-items: center;
  min-width: 0;
}

.mjgd_ai_auto_select_shop_card_label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  cursor: pointer;
}

.mjgd_ai_auto_select_shop_card_name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #303133;
  font-weight: 500;
}

.mjgd_ai_auto_select_shop_quota_list {
  margin-top: 8px;
  padding-left: 22px;
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
  font-size: 11px;
  line-height: 1.4;
}

.mjgd_ai_auto_select_shop_quota_item {
  margin-right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  white-space: nowrap;
}

.mjgd_ai_auto_select_shop_quota_label {
  color: #606266;
}

.mjgd_ai_auto_select_shop_quota_value {
  color: #da4b28;
  font-weight: 600;
}

.mjgd_ai_auto_select_shop_card_controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-left: 22px;
  min-width: 0;
}

.mjgd_ai_auto_select_shop_extra_select {
  width: auto;
  min-width: 0;
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
  background: #fff;
}

.mjgd_ai_auto_select_shop_stock_stepper {
  display: inline-flex;
  align-items: center;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.mjgd_ai_auto_select_shop_stepper_btn {
  width: 20px;
  height: 30px;
  padding: 0;
  border: none;
  background: #f5f7fa;
  color: #606266;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
}

.mjgd_ai_auto_select_shop_extra_input {
  width: 40px;
  height: 30px;
  padding: 0 4px;
  border: none;
  border-left: 1px solid #dcdfe6;
  border-right: 1px solid #dcdfe6;
  text-align: center;
  font-size: 13px;
  outline: none;
}
</style>
