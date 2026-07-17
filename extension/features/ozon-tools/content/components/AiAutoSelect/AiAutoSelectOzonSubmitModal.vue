<template>
  <div v-if="visible" class="mjgd_ai_auto_select_ozon_overlay mjgd_plugin_overlay is_nested is_tier_nested" @click.self="handleCancel">
    <div class="mjgd_ai_auto_select_ozon_modal">
      <div class="mjgd_ai_auto_select_ozon_title"><span class="mjgd_ai_auto_select_ozon_title_icon">↑</span>上架至Ozon</div>
      <div class="mjgd_ai_auto_select_ozon_shop_section">
        <div class="mjgd_ai_auto_select_ozon_shop_header">
          <span class="mjgd_ai_auto_select_ozon_shop_title">选择店铺 <span class="is_required">*</span></span>
          <span class="mjgd_ai_auto_select_ozon_shop_desc">勾选上架店铺并设置仓库库存</span>
          <label v-if="shopSelectAllVisible" class="mjgd_ai_auto_select_ozon_shop_select_all"><input type="checkbox" :checked="shopSelectAllChecked" @change="handleShopSelectAll" /><span>全选</span></label>
        </div>
        <AiAutoSelectShopPanel ref="shop_panel_ref" v-model:selected-shops="selectedShopIds" v-model:shop-warehouse-inventory="shopWarehouseInventory" :columns-per-row="3" max-grid-height="320px" @available-shops-change="availableShopIds = $event" @shop-list-loading="shopListLoading = $event" />
      </div>
      <div class="mjgd_ai_auto_select_ozon_footer">
        <button type="button" class="mjgd_ai_auto_select_ozon_btn_cancel" @click="handleCancel">取消</button>
        <button type="button" class="mjgd_ai_auto_select_ozon_btn_confirm" :disabled="submitting || !selectedShopIds.length" @click="handleConfirm">{{ submitting ? '上架中...' : '确定上架' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AiAutoSelectShopPanel from './AiAutoSelectShopPanel.vue'
import { showToast } from '../../../utils/toast'
import type { ShopWarehouseInventoryMap } from '../../utils/aiAutoSelect/types'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm', payload: {
    selectedShopIds: number[]
    shopWarehouseInventory: Record<number, { warehouseId: number | null; quantity: number }>
  }): void
  (e: 'cancel'): void
}>()

const shop_panel_ref = ref<InstanceType<typeof AiAutoSelectShopPanel> | null>(null)
const selectedShopIds = ref<number[]>([])
const shopWarehouseInventory = ref<ShopWarehouseInventoryMap>({})
const availableShopIds = ref<number[]>([])
const shopListLoading = ref(false)
const submitting = ref(false)

const shopSelectAllVisible = computed(() => !shopListLoading.value && availableShopIds.value.length > 0)

const shopSelectAllChecked = computed(() => {
  if (!availableShopIds.value.length) return false
  return availableShopIds.value.every((id) => selectedShopIds.value.includes(id))
})

function handleShopSelectAll() {
  if (shopSelectAllChecked.value) {
    selectedShopIds.value = []
  } else {
    selectedShopIds.value = [...availableShopIds.value]
  }
}

function handleCancel() {
  emit('cancel')
}

function handleConfirm() {
  if (!selectedShopIds.value.length) {
    showToast('请至少选择一个店铺', 3000)
    return
  }
  submitting.value = true
  emit('confirm', {
    selectedShopIds: [...selectedShopIds.value],
    shopWarehouseInventory: { ...shopWarehouseInventory.value },
  })
  submitting.value = false
}

watch(
  () => props.visible,
  async (open) => {
    if (open) {
      selectedShopIds.value = []
      shopWarehouseInventory.value = {}
      availableShopIds.value = []
      await nextTick()
      await shop_panel_ref.value?.fetchShopList()
    }
  },
)
</script>

<style scoped lang="scss">
.mjgd_ai_auto_select_ozon_overlay {
  display: flex;
  align-items: center;
  justify-content: center;
}

.mjgd_ai_auto_select_ozon_modal {
  width: 780px;
  max-width: 94vw;
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  box-sizing: border-box;
}

.mjgd_ai_auto_select_ozon_title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mjgd_ai_auto_select_ozon_title_icon {
  color: #2563eb;
}

.mjgd_ai_auto_select_ozon_shop_section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mjgd_ai_auto_select_ozon_shop_header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.mjgd_ai_auto_select_ozon_shop_title {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.mjgd_ai_auto_select_ozon_shop_desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.mjgd_ai_auto_select_ozon_shop_select_all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-shrink: 0;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
}

.is_required {
  color: #ef4444;
}

.mjgd_ai_auto_select_ozon_footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.mjgd_ai_auto_select_ozon_btn_cancel {
  padding: 8px 16px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
}

.mjgd_ai_auto_select_ozon_btn_confirm {
  padding: 8px 20px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.mjgd_ai_auto_select_ozon_btn_confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
