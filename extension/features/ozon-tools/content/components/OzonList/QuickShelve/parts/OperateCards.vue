<template>
  <div class="mjgd_quick_shelve_operate_row">
    <!-- 卡片①：售价设置 -->
    <section class="mjgd_quick_shelve_operate_card mjgd_quick_shelve_operate_card--currency">
      <div class="mjgd_quick_shelve_operate_card_head">
        <div class="mjgd_quick_shelve_operate_card_head_left">
          <svg class="mjgd_quick_shelve_operate_card_icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="6" width="18" height="12" rx="2" stroke="#409eff" stroke-width="1.5"/>
            <path d="M7 10h10M7 14h6" stroke="#409eff" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span class="mjgd_quick_shelve_operate_card_title">售价设置</span>
        </div>
        <button type="button" class="mjgd_quick_shelve_exchange_link" @click="openExchangeRateModal">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="#409eff" stroke-width="1.5"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#409eff" stroke-width="1.5"/>
          </svg>
          汇率
        </button>
      </div>

      <div class="mjgd_quick_shelve_price_settings_body">
        <span class="mjgd_quick_shelve_price_settings_label">
          价格设置
          <span class="mjgd_quick_shelve_th_tooltip_icon mjgd_quick_shelve_price_currency_help">
            ?
            <span class="mjgd_quick_shelve_th_tooltip_content">若选择的价格币种与Ozon店铺后台币种不一致时，系统不会自动换算，可能导致上架商品的价格有误，建议价格设置切换为Ozon店铺币种进行上架</span>
          </span>
        </span>
        <div class="mjgd_quick_shelve_currency_group">
          <button
            v-for="opt in CURRENCY_OPTS"
            :key="opt.value"
            type="button"
            class="mjgd_quick_shelve_currency_btn"
            :class="{ is_active: state.priceCurrency === opt.value }"
            @click="applyCurrencyToSkuRows(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>

        <span class="mjgd_quick_shelve_price_settings_label">
          价格选择
          <span class="mjgd_quick_shelve_th_tooltip_icon mjgd_quick_shelve_price_source_help">
            ?
            <span class="mjgd_quick_shelve_th_tooltip_content">选择需要查看和修改的价格类型。<br />现价为绿标价格，<br />原价为划线价格，<br />实际售价按"(黑标价格-绿标价格)x2.25+黑标价格"计算，<br />推荐售价为实际售价的95%。<br />可以在偏好设置->计算器配置内修改公式。</span>
          </span>
        </span>
        <div class="mjgd_quick_shelve_price_source_group">
          <button
            v-for="opt in PRICE_SOURCE_OPTS"
            :key="opt.value"
            type="button"
            class="mjgd_quick_shelve_currency_btn"
            :class="{ is_active: state.priceSource === opt.value }"
            @click="applyPriceSourceToSkuRows(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </section>

    <!-- 卡片②：价格调整 -->
    <section class="mjgd_quick_shelve_operate_card mjgd_quick_shelve_operate_card--price">
      <div class="mjgd_quick_shelve_operate_card_head">
        <div class="mjgd_quick_shelve_operate_card_head_left">
          <svg class="mjgd_quick_shelve_operate_card_icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 5a2 2 0 012-2h4l2 3h8a2 2 0 012 2v2H3V5z" stroke="#409eff" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M3 10h18v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9z" stroke="#409eff" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
          <span class="mjgd_quick_shelve_operate_card_title">价格调整</span>
        </div>
      </div>
      <div class="mjgd_quick_shelve_price_group">
        <select v-model="state.priceOpType" class="mjgd_quick_shelve_select mjgd_quick_shelve_price_op_select">
          <option value="fixed">固定值</option>
          <option value="add">统一增加</option>
          <option value="sub">统一减少</option>
          <option value="mul">统一乘</option>
          <option value="div">统一除以</option>
        </select>
        <input
          v-model="state.priceOpValue"
          class="mjgd_quick_shelve_input mjgd_quick_shelve_price_op_input"
          placeholder="数值"
        />
        <span class="mjgd_quick_shelve_th_tooltip_icon">
          ?
          <span class="mjgd_quick_shelve_th_tooltip_content">统一增加减少输入%自动识别</span>
        </span>
        <button type="button" class="mjgd_quick_shelve_btn_apply" @click="applyBatchPrice">批量改价</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  applyBatchPrice,
  applyCurrencyToSkuRows,
  applyPriceSourceToSkuRows,
  quickShelveState as state,
} from '../../../../utils/ozonQuickShelve/quickShelveController'
import { openExchangeRateModal } from '../../../../utils/ozonQuickShelve/exchangeRateStore'
import type { QuickShelvePriceCurrency, QuickShelvePriceSource } from '../../../../utils/ozonQuickShelve/types'

const CURRENCY_OPTS: Array<{ value: QuickShelvePriceCurrency; label: string }> = [
  { value: 'rub', label: '卢布' },
  { value: 'rmb', label: '人民币' },
  { value: 'usd', label: '美元' },
]

const PRICE_SOURCE_OPTS: Array<{ value: QuickShelvePriceSource; label: string }> = [
  { value: 'now', label: '现价' },
  { value: 'original', label: '原价' },
  { value: 'actual', label: '实际售价' },
  { value: 'recommend', label: '推荐售价' },
]
</script>
