<template>
  <aside class="mjgd_quick_shelve_left">
    <!-- 上品模板 -->
    <section class="mjgd_quick_shelve_upper_template">
      <div class="mjgd_quick_shelve_section_title">
        <span class="mjgd_quick_shelve_section_title_bar"></span>
        <h2>上品模板</h2>
      </div>
      <div class="mjgd_quick_shelve_template_row">
        <select
          v-model="state.selectedTemplateId"
          class="mjgd_quick_shelve_select mjgd_quick_shelve_template_select"
          :disabled="state.templatesLoading"
          @change="onTemplateChange(state.selectedTemplateId)"
        >
          <option v-if="state.templatesLoading" value="">加载中...</option>
          <option v-else-if="!state.templates.length" value="">暂无模板</option>
          <option v-for="tpl in state.templates" :key="tpl.id" :value="tpl.id">{{ tpl.label }}</option>
        </select>
        <button
          type="button"
          class="mjgd_quick_shelve_template_edit_btn"
          title="修改模板"
          @click="openTemplateEditModal"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>
    </section>

    <!-- 店铺多选 -->
    <section class="mjgd_quick_shelve_shop_section">
      <div class="mjgd_quick_shelve_shop_title">
        <div class="mjgd_quick_shelve_shop_title_main">
          <div class="mjgd_quick_shelve_section_title">
            <span class="mjgd_quick_shelve_section_title_bar"></span>
            <h2>店铺选择:</h2>
          </div>
          <div class="mjgd_quick_shelve_shop_title_actions">
            <input
              v-model="state.batchStock"
              class="mjgd_quick_shelve_input mjgd_quick_shelve_batch_stock_input"
              type="number"
              min="0"
            />
            <button type="button" class="mjgd_quick_shelve_btn_apply" @click="applyBatchStock">批量库存预设</button>
          </div>
        </div>
        <div class="mjgd_quick_shelve_shop_check_all">
          <span>全选：</span>
          <label class="mjgd_quick_shelve_check_all_label">
            <input
              type="checkbox"
              :checked="allShopsSelected"
              @change="toggleSelectAllShops(($event.target as HTMLInputElement).checked)"
            />
          </label>
        </div>
      </div>
      <div v-if="state.shopsLoading && !state.shops.length" class="mjgd_quick_shelve_shop_loading">
        正在加载店铺...
      </div>
      <div v-else-if="!state.shops.length" class="mjgd_quick_shelve_shop_loading">
        暂无店铺
      </div>
      <div v-else class="mjgd_quick_shelve_shop_list">
        <div
          v-for="shop in state.shops"
          :key="String(shop.id)"
          class="mjgd_quick_shelve_shop_card"
          :class="{ is_checked: state.selectedShopIds.includes(String(shop.id)) }"
        >
          <div class="mjgd_quick_shelve_shop_head">
            <!-- 旧版 cj_sale 渲染的 .shop-select-card-head 只有 checkbox + label，
                 取消勾选直接点 checkbox 即可。这里不再渲染单独的"移除"按钮，与旧版一致。 -->
            <label class="mjgd_quick_shelve_shop_label">
              <input
                type="checkbox"
                :checked="state.selectedShopIds.includes(String(shop.id))"
                @change="toggleShopSelection(String(shop.id), ($event.target as HTMLInputElement).checked)"
              />
              <span class="mjgd_quick_shelve_shop_name">{{ shop.keyName }}-{{ shop.currencyCode || 'RUB' }}</span>
            </label>
          </div>
          <template v-if="state.selectedShopIds.includes(String(shop.id)) && state.shopWarehouses[String(shop.id)]">
            <div
              v-if="state.shopWarehouses[String(shop.id)].quotaHtml"
              class="mjgd_quick_shelve_shop_quota"
              v-html="state.shopWarehouses[String(shop.id)].quotaHtml"
            />
            <div
              v-else-if="state.shopWarehouses[String(shop.id)].quotaLoading"
              class="mjgd_quick_shelve_shop_quota mjgd_quick_shelve_shop_quota--loading"
            >日创:-- / 日更:-- / 共创:--</div>
            <div class="mjgd_quick_shelve_shop_controls">
              <select
                v-model="state.shopWarehouses[String(shop.id)].warehouseId"
                class="mjgd_quick_shelve_select mjgd_quick_shelve_shop_warehouse"
              >
                <option v-if="!state.shopWarehouses[String(shop.id)].warehouseList.length" value="" disabled>无数据</option>
                <option
                  v-for="wh in state.shopWarehouses[String(shop.id)].warehouseList"
                  :key="wh.warehouse_id"
                  :value="wh.warehouse_id"
                >
                  {{ wh.name }}
                </option>
              </select>
              <div class="mjgd_quick_shelve_shop_stock_stepper">
                <button
                  type="button"
                  class="mjgd_quick_shelve_stepper_btn"
                  @click="adjustShopStock(String(shop.id), -1)"
                >−</button>
                <input
                  v-model.number="state.shopWarehouses[String(shop.id)].stock"
                  class="mjgd_quick_shelve_input mjgd_quick_shelve_shop_stock"
                  type="number"
                  min="0"
                />
                <button
                  type="button"
                  class="mjgd_quick_shelve_stepper_btn"
                  @click="adjustShopStock(String(shop.id), 1)"
                >+</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  adjustShopStock,
  applyBatchStock,
  onTemplateChange,
  quickShelveState as state,
  toggleSelectAllShops,
  toggleShopSelection,
} from '../../../../utils/ozonQuickShelve/quickShelveController'
import { openTemplateEditModal } from '../../../../utils/ozonQuickShelve/templateEditController'

const allShopsSelected = computed(() => {
  if (!state.shops.length) return false
  return state.selectedShopIds.length === state.shops.length
})
</script>
