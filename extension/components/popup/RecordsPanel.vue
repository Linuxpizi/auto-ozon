<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NEmpty, NIcon, NInput, NPopconfirm, NSelect, NSkeleton, NTag, useMessage } from 'naive-ui'
import { CloudDownloadOutline, RefreshOutline, SearchOutline, TrashOutline } from '@vicons/ionicons5'
import type { Platform, ScrapedProduct } from '@/lib/utils/types'

interface ProductRecord extends Partial<ScrapedProduct> {
  id: number
  created_at?: string
}

const message = useMessage()
const loading = ref(false)
const records = ref<ProductRecord[]>([])
const keyword = ref('')
const platform = ref<'all' | Platform>('all')
const options = [
  { label: '全部平台', value: 'all' },
  { label: 'Ozon', value: 'ozon' },
  { label: 'Wildberries', value: 'wb' },
  { label: '1688', value: '1688' },
  { label: '拼多多', value: 'pdd' },
]

const filtered = computed(() => records.value.filter((item) => {
  const hitPlatform = platform.value === 'all' || item.platform === platform.value
  const q = keyword.value.trim().toLowerCase()
  return hitPlatform && (!q
    || item.title?.toLowerCase().includes(q)
    || item.brand?.toLowerCase().includes(q)
    || item.sourceId?.toLowerCase().includes(q))
}))

function tagType(value?: Platform) {
  return value === 'ozon' ? 'info' : value === 'wb' ? 'error' : value === '1688' ? 'warning' : 'success'
}

function formatTime(value?: string) {
  if (!value) return '刚刚'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function load() {
  loading.value = true
  try {
    const response = await browser.runtime.sendMessage({ action: 'getProducts', limit: 100 })
    records.value = response?.products || []
  } catch {
    records.value = []
    message.error('采集记录加载失败')
  } finally {
    loading.value = false
  }
}

async function remove(id: number) {
  await browser.runtime.sendMessage({ action: 'deleteProduct', id })
  records.value = records.value.filter((item) => item.id !== id)
  message.success('记录已删除')
}

onMounted(load)
</script>

<template>
  <div class="panel-stack">
    <NCard size="small" class="filter-card">
      <NInput v-model:value="keyword" clearable placeholder="搜索标题、品牌或商品 ID">
        <template #prefix><NIcon :component="SearchOutline" /></template>
      </NInput>
      <div class="filter-row">
        <NSelect v-model:value="platform" :options="options" />
        <NButton secondary :loading="loading" @click="load">
          <template #icon><NIcon :component="RefreshOutline" /></template>
          刷新
        </NButton>
      </div>
    </NCard>

    <div class="list-summary">
      <span>同步记录</span><NTag size="small" round :bordered="false">{{ filtered.length }} 条</NTag>
    </div>

    <div v-if="loading" class="loading">
      <NSkeleton v-for="n in 3" :key="n" height="88px" :sharp="false" />
    </div>
    <NEmpty v-else-if="!filtered.length" description="暂无匹配的采集记录" class="empty">
      <template #icon><NIcon :component="CloudDownloadOutline" /></template>
      <template #extra><NButton size="small" @click="load">重新加载</NButton></template>
    </NEmpty>
    <NCard v-for="item in filtered" v-else :key="item.id" size="small" class="record-card">
      <div class="record">
        <div class="thumb">
          <img v-if="item.images?.[0]" :src="item.images[0]" alt="商品图片">
          <NIcon v-else :component="CloudDownloadOutline" />
        </div>
        <div class="record-info">
          <strong class="ellipsis">{{ item.title || '未命名商品' }}</strong>
          <div><NTag size="tiny" :type="tagType(item.platform)" round :bordered="false">{{ item.platform || '未知' }}</NTag><span>{{ formatTime(item.created_at || item.scrapedAt) }}</span></div>
          <p>{{ item.currency }} {{ item.price?.toLocaleString() || '—' }}</p>
        </div>
        <NPopconfirm @positive-click="remove(item.id)">
          <template #trigger>
            <NButton quaternary circle size="small" type="error" aria-label="删除记录"><template #icon><NIcon :component="TrashOutline" /></template></NButton>
          </template>
          确认删除这条记录？
        </NPopconfirm>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.filter-card :deep(.n-card__content) { display: flex; flex-direction: column; gap: 8px; }
.filter-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.list-summary { padding: 0 3px; display: flex; align-items: center; justify-content: space-between; color: #696c80; font-size: 11px; font-weight: 600; }
.loading { display: flex; flex-direction: column; gap: 8px; }
.empty { padding: 48px 0; border: 1px dashed #dfe0e8; border-radius: 14px; background: rgba(255,255,255,.55); }
.record-card { transition: border-color .2s ease, transform .2s ease; }
.record-card:hover { border-color: #cfd0ee; transform: translateY(-1px); }
.record-card :deep(.n-card__content) { padding: 10px; }
.record { display: grid; grid-template-columns: 56px minmax(0,1fr) auto; gap: 10px; align-items: center; }
.thumb { width: 56px; height: 56px; display: grid; place-items: center; overflow: hidden; border-radius: 10px; color: #a0a3b2; background: #eef0f5; font-size: 21px; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.record-info { min-width: 0; }
.record-info strong { display: block; color: #2f3146; font-size: 12px; }
.record-info div { display: flex; align-items: center; gap: 7px; margin-top: 5px; color: #9699aa; font-size: 10px; }
.record-info p { margin: 4px 0 0; color: #5b5cf0; font-size: 12px; font-weight: 700; }
</style>