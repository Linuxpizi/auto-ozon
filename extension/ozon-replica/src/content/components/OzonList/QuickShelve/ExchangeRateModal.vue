<template>
  <Teleport to="body">
    <div v-if="state.visible" class="mjgd_exchange_mask" @click.self="closeExchangeRateModal">
      <div class="mjgd_exchange_dialog" role="dialog" aria-modal="true">
        <div class="mjgd_exchange_header">
          <div class="mjgd_exchange_header_text">
            <h3 class="mjgd_exchange_title">汇率设置</h3>
            <p class="mjgd_exchange_hint">默认为当天汇率，可自行修改（输入失焦自动应用）</p>
          </div>
          <button type="button" class="mjgd_exchange_close" @click="closeExchangeRateModal">×</button>
        </div>

        <div class="mjgd_exchange_meta">
          <span class="mjgd_exchange_meta_source">{{ sourceLabel }}</span>
          <span v-if="state.updatedAt" class="mjgd_exchange_meta_time">{{ updatedAtLabel }}</span>
          <button
            type="button"
            class="mjgd_exchange_refresh_btn"
            :disabled="state.loading"
            @click="handleRefresh"
          >
            {{ state.loading ? '刷新中...' : '刷新当日汇率' }}
          </button>
        </div>

        <div class="mjgd_exchange_body">
          <div class="mjgd_exchange_row" v-for="row in ROWS" :key="row.key">
            <span>1 {{ row.fromLabel }} ≈</span>
            <input
              :value="state.rates[row.key]"
              type="number"
              step="0.0001"
              min="0"
              class="mjgd_exchange_input"
              @input="onInput(row.key, ($event.target as HTMLInputElement).value)"
              @blur="onBlur(row.key, ($event.target as HTMLInputElement).value, row.label)"
            />
            <span>{{ row.toLabel }}</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { showToast } from '../../../../utils/toast'
import {
  applyExchangeRate,
  closeExchangeRateModal,
  exchangeRateState as state,
  loadExchangeRates,
  type ExchangeRates,
  type RateSource,
} from '../../../utils/ozonQuickShelve/exchangeRateStore'

const ROWS: Array<{ key: keyof ExchangeRates; fromLabel: string; toLabel: string; label: string }> = [
  { key: 'rmbLB', fromLabel: '人民币', toLabel: '卢布', label: '人民币→卢布' },
  { key: 'rmbMY', fromLabel: '人民币', toLabel: '美元', label: '人民币→美元' },
  { key: 'lbRMB', fromLabel: '卢布', toLabel: '人民币', label: '卢布→人民币' },
  { key: 'lbMY', fromLabel: '卢布', toLabel: '美元', label: '卢布→美元' },
  { key: 'myRMB', fromLabel: '美元', toLabel: '人民币', label: '美元→人民币' },
  { key: 'myLB', fromLabel: '美元', toLabel: '卢布', label: '美元→卢布' },
]

const SOURCE_LABEL: Record<RateSource, string> = {
  thirdParty: '当前来源：三方实时',
  dict: '当前来源：后端字典',
  manual: '当前来源：手动设置',
  default: '当前来源：默认值',
}

const sourceLabel = computed(() => SOURCE_LABEL[state.source])
const updatedAtLabel = computed(() => {
  if (!state.updatedAt) return ''
  const d = new Date(state.updatedAt)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `更新于 ${yyyy}-${mm}-${dd} ${hh}:${mi}`
})

const debounceTimers: Partial<Record<keyof ExchangeRates, number>> = {}

function clearTimer(key: keyof ExchangeRates) {
  const id = debounceTimers[key]
  if (id != null) {
    window.clearTimeout(id)
    delete debounceTimers[key]
  }
}

function parseValue(raw: string): number {
  const v = parseFloat(raw)
  return Number.isFinite(v) ? v : NaN
}

/** 1500ms 防抖应用（对齐旧版 applyRateValue） */
function onInput(key: keyof ExchangeRates, raw: string) {
  clearTimer(key)
  debounceTimers[key] = window.setTimeout(() => {
    const v = parseValue(raw)
    if (v > 0) applyExchangeRate(key, v)
    delete debounceTimers[key]
  }, 1500)
}

/** blur 立即应用 + toast */
function onBlur(key: keyof ExchangeRates, raw: string, label: string) {
  clearTimer(key)
  const v = parseValue(raw)
  if (!(v > 0)) {
    showToast(`${label} 请输入大于 0 的数字`, 2500)
    return
  }
  if (applyExchangeRate(key, v)) {
    showToast(`${label} 已更新为 ${v}`, 1500)
  }
}

async function handleRefresh() {
  if (state.loading) return
  const before = JSON.stringify(state.rates)
  await loadExchangeRates(true)
  const after = JSON.stringify(state.rates)
  if (before === after) {
    showToast('当前汇率已是最新', 2000)
  } else {
    showToast('汇率已刷新', 2000)
  }
}

onBeforeUnmount(() => {
  Object.keys(debounceTimers).forEach((k) => clearTimer(k as keyof ExchangeRates))
})
</script>
