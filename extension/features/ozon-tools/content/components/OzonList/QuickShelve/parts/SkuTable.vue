<template>
  <div class="mjgd_quick_shelve_table_section">
    <!-- 旧版逻辑：表格区始终可见，变体加载中在表格上方显示进度条；
         加载完成且无 SKU 时表格内显示 "暂无可上架的 SKU" -->
    <VariantLoadProgress v-if="state.skuLoading || progressActive" />

    <div class="mjgd_quick_shelve_table_wrap">
      <table class="mjgd_quick_shelve_table">
        <!-- 列宽：勾选 4% + 序号 4% + SKU 34% + 货号 19% + 售价 12% + 实际售价 20% + 操作 7% -->
        <colgroup>
          <col class="col-check" style="width: 4%" />
          <col class="col-seq" style="width: 4%" />
          <col class="col-info" style="width: 34%" />
          <col class="col-goodsno" style="width: 19%" />
          <col class="col-saleprice" style="width: 12%" />
          <col class="col-nowprice" style="width: 20%" />
          <col class="col-action" style="width: 7%" />
        </colgroup>
        <thead>
          <tr>
            <th class="col-check" style="width: 4%">
              <label class="mjgd_quick_shelve_table_check_label">
                <input
                  ref="selectAllCheckboxRef"
                  type="checkbox"
                  :checked="allVisibleSelected"
                  @change="onSelectAllVisibleChange"
                />
              </label>
            </th>
            <th class="col-seq" style="width: 4%">序号</th>
            <th class="col-info" style="width: 34%">SKU信息</th>
            <th class="col-goodsno" style="width: 19%">
              <span class="mjgd_quick_shelve_th_label_group">
                货号
                <span class="mjgd_quick_shelve_th_tooltip_icon">
                  ?
                  <span class="mjgd_quick_shelve_th_tooltip_content">货号为商品的唯一标识，OZON平台规定不可重复</span>
                </span>
                <button type="button" class="mjgd_quick_shelve_th_prefix_btn" @click="openGoodsNoPrefixModal">修改前缀</button>
              </span>
            </th>
            <th class="col-saleprice" style="width: 12%">售价</th>
            <th class="col-nowprice" style="width: 20%">{{ priceColumnTitle }}</th>
            <th class="col-action" style="width: 7%">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="state.skuLoading && !pagedRows.length">
            <td colspan="7" class="mjgd_quick_shelve_table_empty">正在拉取变体数据，请稍候…</td>
          </tr>
          <tr v-else-if="!pagedRows.length">
            <td colspan="7" class="mjgd_quick_shelve_table_empty">暂无可上架的 SKU</td>
          </tr>
          <tr v-for="(row, idx) in pagedRows" :key="row.sku" class="mjgd_quick_shelve_row">
            <td class="col-check">
              <label class="mjgd_quick_shelve_table_check_label">
                <input
                  type="checkbox"
                  :checked="isSkuRowSelected(row.sku)"
                  @change="onSkuRowSelectionChange(row.sku, $event)"
                />
              </label>
            </td>
            <td class="col-seq">{{ rowIndex(idx) }}</td>
            <td class="col-info">
              <div class="mjgd_quick_shelve_sku_info">
                <img
                  v-if="row.image"
                  :src="resolveThumbImageUrl(row.image)"
                  alt=""
                  class="mjgd_quick_shelve_thumb"
                  title="点击查看大图"
                  @click="openThumbPreview(row.image)"
                />
                <div class="mjgd_quick_shelve_sku_info_text">
                  <div class="mjgd_quick_shelve_sku_sales_line">
                    <span class="mjgd_quick_shelve_sku_sales">{{ row.sales || row.title || '--' }}</span>
                    <!-- 对齐旧版 sku-row-current-badge：详情页时给当前商品 SKU 加"当前款"标识 -->
                    <span
                      v-if="isDetail && currentDetailSku && String(row.sku) === currentDetailSku"
                      class="mjgd_quick_shelve_sku_current_badge"
                    >当前款</span>
                  </div>
                  <div class="mjgd_quick_shelve_sku_main">
                    <span class="mjgd_quick_shelve_sku_id">SKU:{{ row.sku }}</span>
                    <span class="mjgd_quick_shelve_sku_time">时间:{{ row.createdAt || '--' }}</span>
                  </div>
                </div>
              </div>
            </td>
            <td class="col-goodsno">
              <input v-model="row.goodsNo" class="mjgd_quick_shelve_input mjgd_quick_shelve_row_input" />
            </td>
            <td class="col-saleprice">
              <input
                v-model="row.salePrice"
                class="mjgd_quick_shelve_input mjgd_quick_shelve_row_input"
                placeholder="输入售价"
              />
            </td>
            <td class="col-nowprice">
              <div class="mjgd_quick_shelve_price_quad">
                <div class="mjgd_quick_shelve_price_quad_item">
                  <span
                    class="mjgd_quick_shelve_price_quad_val mjgd_quick_shelve_price_quad_val--now"
                    :class="{ is_selected: isPriceSourceHighlighted('now') }"
                  >
                    {{ priceQuadsBySku[row.sku]?.now ?? '--' }}
                  </span>
                  <span class="mjgd_quick_shelve_price_quad_label">现价</span>
                </div>
                <div class="mjgd_quick_shelve_price_quad_item">
                  <span
                    class="mjgd_quick_shelve_price_quad_val mjgd_quick_shelve_price_quad_val--original"
                    :class="{ is_selected: isPriceSourceHighlighted('original') }"
                  >
                    {{ priceQuadsBySku[row.sku]?.original ?? '--' }}
                  </span>
                  <span class="mjgd_quick_shelve_price_quad_label">原价</span>
                </div>
                <div class="mjgd_quick_shelve_price_quad_item">
                  <span
                    class="mjgd_quick_shelve_price_quad_val mjgd_quick_shelve_price_quad_val--actual"
                    :class="{ is_selected: isPriceSourceHighlighted('actual') }"
                  >
                    {{ priceQuadsBySku[row.sku]?.actual ?? '--' }}
                  </span>
                  <span class="mjgd_quick_shelve_price_quad_label">实际售价</span>
                </div>
                <div class="mjgd_quick_shelve_price_quad_item">
                  <span
                    class="mjgd_quick_shelve_price_quad_val mjgd_quick_shelve_price_quad_val--recommend"
                    :class="{ is_selected: isPriceSourceHighlighted('recommend') }"
                  >
                    {{ priceQuadsBySku[row.sku]?.recommend ?? '--' }}
                  </span>
                  <span class="mjgd_quick_shelve_price_quad_label">推荐售价</span>
                </div>
              </div>
            </td>
            <td class="col-action">
              <button type="button" class="mjgd_quick_shelve_delete_btn" @click="removeSkuRow(row.sku)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <SkuPagination v-if="totalPages > 1" />
    <div class="mjgd_quick_shelve_copy_row">
      <button type="button" class="mjgd_quick_shelve_copy_btn" @click="copyQuickShelveSkuPrice">
        复制SKU,价格
        <span class="mjgd_quick_shelve_copy_tip" data-tip="仅复制本页已勾选的 SKU；未自定义价格时复制商品现价，填写后复制自定义价格">!</span>
      </button>
      <button type="button" class="mjgd_quick_shelve_copy_btn" @click="copyQuickShelveSkuOnly">复制SKU<span class="mjgd_quick_shelve_copy_tip" data-tip="仅复制本页已勾选的 SKU">!</span></button>
      <button type="button" class="mjgd_quick_shelve_copy_btn" @click="copyQuickShelvePriceOnly">复制价格<span class="mjgd_quick_shelve_copy_tip" data-tip="仅复制本页已勾选 SKU 的售价；未填写售价的行复制为「价格未设置」">!</span></button>
    </div>

    <!-- SKU 信息图片点击预览（对齐旧版 .sku_row_img → showImageModal） -->
    <Teleport to="body">
      <div
        v-if="previewImage"
        class="mjgd_plugin_overlay is_tier_inner mjgd_quick_shelve_thumb_preview"
        @click.self="closeThumbPreview"
      >
        <div class="mjgd_quick_shelve_thumb_preview_box">
          <button type="button" class="mjgd_quick_shelve_thumb_preview_close" @click="closeThumbPreview">×</button>
          <img :src="previewImage" alt="" class="mjgd_quick_shelve_thumb_preview_img" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  allVisibleSkuRowsSelected,
  copyQuickShelvePriceOnly,
  copyQuickShelveSkuOnly,
  copyQuickShelveSkuPrice,
  getQuickShelvePagedRows,
  getQuickShelveTotalPages,
  isSkuRowSelected,
  openGoodsNoPrefixModal,
  quickShelveState as state,
  removeSkuRow,
  someVisibleSkuRowsSelected,
  toggleSelectAllVisibleSkuRows,
  toggleSkuRowSelection,
} from '../../../../utils/ozonQuickShelve/quickShelveController'
import { computeRowPriceQuad, resolveRowPriceUnit } from '../../../../utils/ozonQuickShelve/priceSourceResolver'
import type { QuickShelvePriceSource } from '../../../../utils/ozonQuickShelve/types'
import { resolveOzonPageType } from '../../../../utils/ozonList/ozonPageContext'
import { extractDetailPageSku } from '../../../../utils/ozonList/detailPageContext'
import { convertOzonImagePath } from '../../../../../utils/imageProcessor'
import VariantLoadProgress from './VariantLoadProgress.vue'
import SkuPagination from './SkuPagination.vue'

const PAGE_SIZE = 100

const selectAllCheckboxRef = ref<HTMLInputElement | null>(null)
const allVisibleSelected = allVisibleSkuRowsSelected

const pagedRows = computed(() => getQuickShelvePagedRows())
const totalPages = computed(() => getQuickShelveTotalPages())
const isDetail = computed(() => resolveOzonPageType() === 'detail')
const currentDetailSku = computed(() => {
  if (!state.visible || !isDetail.value) return ''
  return extractDetailPageSku() || ''
})

const progressActive = computed(
  () => state.variantLoadProgress.total > 0 && state.variantLoadProgress.current < state.variantLoadProgress.total,
)

/** 表头币种：随商城展示币种（₽ / $ / ¥）切换 */
const priceColumnTitle = computed(() => {
  const PRICE_SOURCE_LABEL: Record<QuickShelvePriceSource, string> = {
    now: '现价',
    original: '原价',
    actual: '实际售价',
    recommend: '推荐售价',
  }

  const label = PRICE_SOURCE_LABEL[state.priceSource] || '实际售价'
  const rows = pagedRows.value
  for (let i = 0; i < rows.length; i++) {
    const unit = resolveRowPriceUnit(rows[i])
    if (unit) return `${label}(${unit})`
  }
  return `${label}(₽)`
})

const priceQuadsBySku = computed(() => {
  const ctx = {
    currentDetailSku: currentDetailSku.value,
    isDetail: isDetail.value,
  }
  const map: Record<string, ReturnType<typeof computeRowPriceQuad>> = {}
  for (const row of pagedRows.value) {
    map[row.sku] = computeRowPriceQuad(row, ctx)
  }
  return map
})

function isPriceSourceHighlighted(source: QuickShelvePriceSource): boolean {
  return state.priceSource === source
}

function checkboxChecked(event: Event): boolean {
  return event.currentTarget instanceof HTMLInputElement && event.currentTarget.checked
}

function onSelectAllVisibleChange(event: Event) {
  toggleSelectAllVisibleSkuRows(checkboxChecked(event))
}

function onSkuRowSelectionChange(sku: string, event: Event) {
  toggleSkuRowSelection(sku, checkboxChecked(event))
}

watch(
  [allVisibleSelected, someVisibleSkuRowsSelected],
  () => {
    const el = selectAllCheckboxRef.value
    if (!el) return
    el.indeterminate = someVisibleSkuRowsSelected.value && !allVisibleSelected.value
  },
  { immediate: true },
)

function rowIndex(idx: number) {
  return (state.skuPage - 1) * PAGE_SIZE + idx + 1
}

const previewImage = ref('')
/** 列表/详情 SKU 图统一用 wc300，对齐旧版 crawler.js 的 sku_row_img */
function resolveThumbImageUrl(src: string): string {
  const s = String(src || '').trim()
  if (!s) return ''
  // 仅展示加速：Ozon 国外图投影到国内 CDN；row.image 原值不变，提交后台仍用原始地址
  return convertOzonImagePath(s.replace(/\/wc\d+\//, '/wc300/'))
}
function openThumbPreview(src: string) {
  const url = resolveThumbImageUrl(src)
  if (url) previewImage.value = url
}
function closeThumbPreview() {
  previewImage.value = ''
}
function onPreviewKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeThumbPreview()
}
watch(previewImage, (src) => {
  if (src) document.addEventListener('keydown', onPreviewKeydown)
  else document.removeEventListener('keydown', onPreviewKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onPreviewKeydown))
</script>
