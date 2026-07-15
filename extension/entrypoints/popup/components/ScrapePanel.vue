<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NAlert, NButton, NCard, NSelect, NSpace, NTag, useMessage } from 'naive-ui'
import type { Platform, ScrapedProduct } from '@/utils/types'

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
  scraping.value = true; result.value = null; error.value = ''
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('无法访问当前标签页')
    const response = await browser.tabs.sendMessage(tab.id, { action: 'scrapeProduct' })
    if (!response?.success) throw new Error(response?.error || '页面数据采集失败')
    result.value = response.data
    message.success('商品数据已采集并同步')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally { scraping.value = false }
}
async function openPlatform() {
  const urls: Record<Platform, string> = { ozon: 'https://www.ozon.ru/', wb: 'https://www.wildberries.ru/', '1688': 'https://www.1688.com/', pdd: 'https://yangkeduo.com/' }
  await browser.tabs.create({ url: urls[platform.value] })
}
onMounted(inspectTab)
</script>

<template>
  <div class="panel-stack">
    <NCard size="small" title="当前页面">
      <template #header-extra><NTag :type="supported ? 'success' : 'warning'" size="small" round>{{ supported ? platformLabel : '未识别' }}</NTag></template>
      <div class="url-row"><span class="page-dot" :class="{ active: supported }" /><span class="ellipsis">{{ currentUrl || '无法读取当前页面地址' }}</span></div>
      <NSpace vertical :size="10" style="margin-top: 14px">
        <NButton type="primary" block size="large" :loading="scraping" :disabled="!supported" @click="scrape">{{ scraping ? '正在采集页面数据' : '立即采集当前商品' }}</NButton>
        <NAlert v-if="!supported" type="info" :show-icon="true">请先打开支持平台的商品详情页。</NAlert>
        <NAlert v-if="error" type="error" closable @close="error = ''">{{ error }}</NAlert>
      </NSpace>
    </NCard>

    <NCard size="small" title="快速前往">
      <NSpace vertical>
        <NSelect v-model:value="platform" :options="options" />
        <NButton block secondary type="primary" @click="openPlatform">打开 {{ platformLabel }} 平台</NButton>
      </NSpace>
    </NCard>

    <NCard v-if="result" size="small" title="采集结果">
      <div class="result"><img v-if="result.images?.[0]" :src="result.images[0]" alt="商品图片"><div><strong class="ellipsis">{{ result.title || '未识别标题' }}</strong><p>{{ priceText }}</p><span>{{ result.brand || platformLabel }}</span></div></div>
    </NCard>
  </div>
</template>

<style scoped>
.url-row { display:flex; align-items:center; gap:8px; padding:9px 10px; border-radius:9px; color:#697386; background:#f6f8fb; font-size:11px; }
.page-dot { width:7px; height:7px; flex:none; border-radius:50%; background:#f59e0b; }.page-dot.active { background:#22c55e; }
.result { display:grid; grid-template-columns:58px minmax(0,1fr); gap:11px; }.result img { width:58px; height:58px; object-fit:cover; border-radius:10px; background:#eef1f5; }
.result div { min-width:0; }.result strong { display:block; font-size:13px; }.result p { margin:5px 0 2px; color:#2563eb; font-weight:700; }.result span { color:#8b95a5; font-size:11px; }
</style>