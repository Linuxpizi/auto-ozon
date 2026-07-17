<template>
  <section class="mjgd_tpl_edit_card mjgd_tpl_edit_card--shop">
    <header class="mjgd_tpl_edit_card_head">
      <span class="mjgd_tpl_edit_card_title">店铺与库存设置</span>
      <span class="mjgd_tpl_edit_shop_summary">
        已选 <em>{{ shopSummary.shops }}</em> 店铺, <em>{{ shopSummary.warehouses }}</em> 仓库
      </span>
      <button type="button" class="mjgd_tpl_edit_stock_open_btn" @click="openBatchStockModal">库存</button>
    </header>

    <div class="mjgd_tpl_edit_shop_search_wrap">
      <input
        v-model="state.shopSearch"
        class="mjgd_tpl_edit_input mjgd_tpl_edit_shop_search"
        type="text"
        placeholder="搜索店铺..."
      />
      <label class="mjgd_tpl_edit_shop_checkall">
        <input
          type="checkbox"
          :checked="checkAll"
          :ref="bindCheckAllIndeterminate"
          @change="onTemplateShopCheckAll(($event.target as HTMLInputElement).checked)"
        />
        <span>全选</span>
      </label>
    </div>

    <div v-if="!shelveState.shops.length" class="mjgd_tpl_edit_shop_empty">
      暂无店铺，请先在急速上架中加载店铺列表
    </div>
    <div v-else class="mjgd_tpl_edit_shop_list">
      <div
        v-for="shop in filteredShops"
        :key="String(shop.id)"
        class="mjgd_tpl_edit_shop_row"
        :class="{ is_checked: shelveState.selectedShopIds.includes(String(shop.id)) }"
      >
        <div class="mjgd_tpl_edit_shop_row_head">
          <input
            type="checkbox"
            :checked="shelveState.selectedShopIds.includes(String(shop.id))"
            @change="onTemplateShopToggle(String(shop.id), ($event.target as HTMLInputElement).checked)"
          />
          <span class="mjgd_tpl_edit_shop_icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 9.5L12 4l9 5.5V20a1 1 0 0 1-1 1h-4v-7H8v7H4a1 1 0 0 1-1-1V9.5z"
                stroke="#4085fb"
                stroke-width="1.6"
                fill="rgba(64,133,251,0.12)"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <span class="mjgd_tpl_edit_shop_name">{{ shopDisplayName(shop) }}</span>
          <span
            v-if="shelveState.selectedShopIds.includes(String(shop.id)) && hasShopWarehouseSelected(String(shop.id))"
            class="mjgd_tpl_edit_shop_wh_count"
          >1仓库</span>
          <button
            v-if="shelveState.selectedShopIds.includes(String(shop.id))"
            type="button"
            class="mjgd_tpl_edit_shop_remove"
            @click="removeTemplateShop(String(shop.id))"
          >移除</button>
        </div>

        <div
          v-if="shelveState.selectedShopIds.includes(String(shop.id)) && shelveState.shopWarehouses[String(shop.id)]"
          class="mjgd_tpl_edit_shop_body"
        >
          <div
            v-if="shelveState.shopWarehouses[String(shop.id)].quotaHtml"
            class="mjgd_tpl_edit_shop_meta"
            v-html="shelveState.shopWarehouses[String(shop.id)].quotaHtml"
          />
          <div v-else class="mjgd_tpl_edit_shop_meta is_loading">
            额度加载中<span class="mjgd_tpl_edit_loading_dots">...</span>
          </div>
          <div class="mjgd_tpl_edit_shop_controls">
            <select
              v-model="shelveState.shopWarehouses[String(shop.id)].warehouseId"
              class="mjgd_tpl_edit_select"
            >
              <option v-if="!shelveState.shopWarehouses[String(shop.id)].warehouseList.length" value="" disabled>
                无数据
              </option>
              <option
                v-for="wh in shelveState.shopWarehouses[String(shop.id)].warehouseList"
                :key="wh.warehouse_id"
                :value="wh.warehouse_id"
              >
                {{ wh.name }}
              </option>
            </select>
            <div class="mjgd_tpl_edit_stock_wrap">
              <button
                type="button"
                class="mjgd_tpl_edit_stock_btn"
                @click="adjustTemplateShopStock(String(shop.id), -1)"
              >−</button>
              <input
                v-model.number="shelveState.shopWarehouses[String(shop.id)].stock"
                class="mjgd_tpl_edit_stock_input"
                type="number"
                min="0"
              />
              <button
                type="button"
                class="mjgd_tpl_edit_stock_btn"
                @click="adjustTemplateShopStock(String(shop.id), 1)"
              >+</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { quickShelveState as shelveState } from '../../../../utils/ozonQuickShelve/quickShelveController'
import {
  adjustTemplateShopStock,
  getFilteredTemplateEditShops,
  getTemplateShopSummary,
  hasShopWarehouseSelected,
  isTemplateShopCheckAll,
  isTemplateShopCheckIndeterminate,
  onTemplateShopCheckAll,
  onTemplateShopToggle,
  openBatchStockModal,
  removeTemplateShop,
  shopDisplayName,
  templateEditState as state,
} from '../../../../utils/ozonQuickShelve/templateEditController'

const filteredShops = computed(() => getFilteredTemplateEditShops())
const shopSummary = computed(() => getTemplateShopSummary())
const checkAll = computed(() => isTemplateShopCheckAll())

function bindCheckAllIndeterminate(el: unknown) {
  if (!(el instanceof HTMLInputElement)) return
  el.indeterminate = isTemplateShopCheckIndeterminate()
}
</script>
