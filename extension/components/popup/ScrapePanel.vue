<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NAlert, NButton, NCard, NIcon, NSelect, NTag, useMessage } from 'naive-ui'
import {
  ArrowForwardOutline,
  CheckmarkCircleOutline,
  CubeOutline,
  OpenOutline,
  ScanOutline,
} from '@vicons/ionicons5'
import type { Platform, ScrapedProduct } from '@/lib/utils/types'

const message = useMessage()
const platform = ref<Platform>('ozon')
const currentUrl = ref('')
const supported = ref(false)
const scraping = ref(false)
const result = ref<ScrapedProduct | null>(null)
const error = ref('')

const options = [
  { label: 'Ozon', value: 'ozon' }, { label: 'Wildberries', value: 'wb' },
  { label: '1688', value: '1688' }, { label: '拼多多', value: 'pdd' },
]
const platformLabel = computed(() => options.find((item) => item.value === platform.value)?.label ?? platform.value)
const currentHost = computed(() => {
  if (!currentUrl.value) return '未读取到当前页面'
  try { return new URL(currentUrl.value).hostname }
  catch { return currentUrl.value }
})
const priceText = computed(() => {
  if (!result.value?.price) return '价格待识别'
  return `${result.value.currency || ''} ${result.value.price.toLocaleString()}`.trim()
})

function detect(url: string): Platform | null {
  if (/ozon\.ru/.test(url)) return 'ozon'
  if (/wildberries\.ru/.test(url)) return 'wb'
  if (/1688\.com/.test(url)) return '1688'
  if (/yangkeduo\.com|pinduoduo\.com/.test(url)) return 'pdd'
  return null
}
async function inspectTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  currentUrl.value = tab?.url || ''
  const detected = detect(currentUrl.value)
  supported.value = Boolean(detected)
  if (detected) platform.value = detected
}
async function scrape() {
  scraping.value = true
  result.value = null
  error.value = ''
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('无法访问当前标签页')
    // 统一经 background 触发采集。background 会确保对应平台的 content
    // script 已注入，再向页面发送 content scripts 约定的 `scrape` 消息。
    const response = await browser.runtime.sendMessage({ action: 'triggerScrape', tabId: tab.id })
    if (!response?.success) throw new Error(response?.error || '页面数据采集失败')
    if (!response.data) throw new Error('采集脚本未返回商品数据，请刷新商品详情页后重试')
    result.value = response.data
    message.success('商品数据已采集并同步')
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : String(reason)
    error.value = /Receiving end does not exist|Could not establish connection/i.test(detail)
      ? '采集脚本尚未加载，请刷新商品详情页后重试'
      : detail
  } finally {
    scraping.value = false
  }
}
async function openPlatform() {
  const urls: Record<Platform, string> = { ozon: 'https://www.ozon.ru/', wb: 'https://www.wildberries.ru/', '1688': 'https://www.1688.com/', pdd: 'https://yangkeduo.com/' }
  await browser.tabs.create({ url: urls[platform.value] })
}
onMounted(inspectTab)
</script>

<template>
  <div class="panel-stack">
    <NCard size="small" class="page-card">
      <template #header>
        <div class="card-title"><NIcon :component="ScanOutline" /><span>当前页面</span></div>
      </template>
      <template #header-extra>
        <NTag :type="supported ? 'success' : 'warning'" size="small" round :bordered="false">
          {{ supported ? platformLabel : '平台未识别' }}
        </NTag>
      </template>

      <div class="page-status">
        <div class="status-icon" :class="{ active: supported }"><NIcon :component="supported ? CheckmarkCircleOutline : CubeOutline" /></div>
        <div class="status-copy">
          <strong>{{ supported ? '页面可以采集' : '等待支持的商品页面' }}</strong>
          <span class="ellipsis">{{ currentHost }}</span>
        </div>
      </div>

      <NButton type="primary" block size="large" :loading="scraping" :disabled="!supported" class="scrape-button" @click="scrape">
        <template #icon><NIcon :component="ScanOutline" /></template>
        {{ scraping ? '正在读取并同步商品数据' : '采集并同步当前商品' }}
      </NButton>

      <NAlert v-if="!supported" type="info" :show-icon="true" class="panel-alert">请打开 Ozon、Wildberries、1688 或拼多多商品页。</NAlert>
      <NAlert v-if="error" type="error" closable class="panel-alert" @close="error = ''">{{ error }}</NAlert>
    </NCard>

    <NCard size="small">
      <template #header>
        <div class="card-title"><NIcon :component="OpenOutline" /><span>快速前往</span></div>
      </template>
      <div class="platform-row">
        <NSelect v-model:value="platform" :options="options" />
        <NButton secondary type="primary" @click="openPlatform">
          打开平台<template #icon><NIcon :component="ArrowForwardOutline" /></template>
        </NButton>
      </div>
    </NCard>

    <NCard v-if="result" size="small">
      <template #header><div class="card-title success"><NIcon :component="CheckmarkCircleOutline" /><span>采集完成</span></div></template>
      <div class="result">
        <img v-if="result.images?.[0]" :src="result.images[0]" alt="商品图片">
        <div v-else class="result-placeholder"><NIcon :component="CubeOutline" /></div>
        <div><strong class="ellipsis">{{ result.title || '未识别标题' }}</strong><p>{{ priceText }}</p><span>{{ result.brand || platformLabel }}</span></div>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.card-title { display: flex; align-items: center; gap: 7px; color: #2b2d42; font-size: 13px; font-weight: 650; }
.card-title .n-icon { color: #6465e8; font-size: 17px; }
.card-title.success .n-icon { color: #16a273; }
.page-status { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 11px; align-items: center; padding: 12px; border: 1px solid #ebebf1; border-radius: 12px; background: #f8f8fb; }
.status-icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 11px; color: #a0a2b2; background: #e9eaf0; font-size: 22px; }
.status-icon.active { color: #16875f; background: #dff5ec; }
.status-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.status-copy strong { color: #303247; font-size: 12px; }
.status-copy span { color: #8b8e9f; font-size: 10px; }
.scrape-button { height: 42px; margin-top: 12px; box-shadow: 0 6px 16px rgba(91, 92, 240, .18); }
.panel-alert { margin-top: 10px; }
.platform-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.result { display: grid; grid-template-columns: 58px minmax(0,1fr); gap: 11px; align-items: center; }
.result img, .result-placeholder { width: 58px; height: 58px; border-radius: 11px; background: #eef0f5; }
.result img { object-fit: cover; }
.result-placeholder { display: grid; place-items: center; color: #9a9dad; font-size: 24px; }
.result > div:last-child { min-width: 0; }
.result strong { display: block; color: #2d2f44; font-size: 12px; }
.result p { margin: 5px 0 2px; color: #5b5cf0; font-size: 13px; font-weight: 700; }
.result span { color: #8b8e9f; font-size: 10px; }
</style>