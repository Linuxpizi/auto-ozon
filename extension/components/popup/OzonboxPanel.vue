<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NAlert, NButton, NCard, NIcon, NTag, useMessage } from 'naive-ui'
import { CheckmarkCircleOutline, CloudDownloadOutline, CubeOutline, SaveOutline } from '@vicons/ionicons5'
import { isRecord } from '@/lib/ozonbox/contract'
import { toSelectionProduct } from '@/lib/ozonbox/selection-product'
import { isOzonProductUrl } from '@/lib/ozonbox/url'
import { syncProducts } from '@/lib/utils/api'
import type { ScrapedProduct } from '@/lib/utils/types'

const message = useMessage()
const currentUrl = ref('')
const saving = ref(false)
const error = ref('')
const saved = ref<{ created: number; skipped: number } | null>(null)
const record = ref<ScrapedProduct | null>(null)

const currentHost = computed(() => {
  try { return new URL(currentUrl.value).hostname }
  catch { return currentUrl.value || '未读取到当前页面' }
})

async function inspectPage() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  currentUrl.value = tab?.url || ''
  if (!isOzonProductUrl(currentUrl.value)) {
    error.value = '请打开严格匹配的 Ozon 商品详情页。'
  }
}

async function collectAndSave() {
  error.value = ''
  saved.value = null
  record.value = null

  saving.value = true
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url || !isOzonProductUrl(tab.url)) {
      throw new Error('当前页面不是严格匹配的 Ozon 商品详情页')
    }
    currentUrl.value = tab.url

    const response: unknown = await browser.runtime.sendMessage({
      type: 'COLLECT_PRODUCT',
      tabId: tab.id,
    })
    if (!isRecord(response)) throw new Error('Ozon 采集请求返回了无效响应')
    if (response.success !== true) {
      throw new Error(typeof response.error === 'string' ? response.error : 'Ozon 商品采集失败')
    }
    record.value = toSelectionProduct(response.data)
    saved.value = await syncProducts([record.value])
    message.success(saved.value.created > 0 ? 'Ozon 商品已保存到选品中心' : '选品中心已有相同商品数据')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    saving.value = false
  }
}

onMounted(inspectPage)
</script>

<template>
  <div class="panel-stack">
    <NCard size="small" class="page-card">
      <template #header>
        <div class="card-title"><img class="brand-logo" src="/brand-logo.png" alt="鲸智 AI"><span>鲸智 AI 商品采集</span></div>
      </template>
      <template #header-extra>
        <NTag :type="isOzonProductUrl(currentUrl) ? 'success' : 'warning'" size="small" round :bordered="false">
          {{ isOzonProductUrl(currentUrl) ? 'Ozon PDP' : '页面不匹配' }}
        </NTag>
      </template>

      <div class="page-status">
        <div class="status-icon" :class="{ active: isOzonProductUrl(currentUrl) }"><NIcon :component="CloudDownloadOutline" /></div>
        <div class="status-copy">
          <strong>{{ isOzonProductUrl(currentUrl) ? '已定位当前商品详情页' : '等待 Ozon 商品详情页' }}</strong>
          <span class="ellipsis">{{ currentHost }}</span>
        </div>
      </div>

      <NButton type="primary" block size="large" :loading="saving" :disabled="!isOzonProductUrl(currentUrl)" class="panel-primary-button" @click="collectAndSave">
        <template #icon><NIcon :component="SaveOutline" /></template>
        {{ saving ? '正在采集并保存' : '采集到选品中心' }}
      </NButton>

      <NAlert v-if="!isOzonProductUrl(currentUrl)" type="info" :show-icon="true" class="panel-alert">请打开 URL 形如 `/product/商品名称-数字/` 的 Ozon 商品详情页。</NAlert>
      <NAlert v-if="error" type="error" closable class="panel-alert" @close="error = ''">{{ error }}</NAlert>
    </NCard>

    <NCard v-if="record && saved" size="small">
      <template #header><div class="card-title success"><NIcon :component="CheckmarkCircleOutline" /><span>保存完成</span></div></template>
      <div class="result">
        <img v-if="record.images[0]" :src="record.images[0]" alt="商品图片">
        <div v-else class="result-placeholder"><NIcon :component="CubeOutline" /></div>
        <div>
          <strong class="ellipsis">{{ record.title }}</strong>
          <p>{{ record.price.toLocaleString() }} ₽ · {{ record.variants.length }} 个变体</p>
          <span>{{ record.category || 'Ozon 页面未提供类目路径' }} · {{ saved.created > 0 ? '已写入选品中心' : '数据未变化' }}</span>
        </div>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.brand-logo { width: 20px; height: 20px; object-fit: contain; border-radius: 5px; }
</style>