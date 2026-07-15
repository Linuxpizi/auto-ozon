<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NButton, NCard, NEmpty, NInput, NPopconfirm, NSelect, NSkeleton, NSpace, NTag, useMessage } from 'naive-ui'
import type { Platform, ScrapedProduct } from '@/utils/types'

interface ProductRecord extends Partial<ScrapedProduct> { id: number; created_at?: string }
const message = useMessage()
const loading = ref(false)
const records = ref<ProductRecord[]>([])
const keyword = ref('')
const platform = ref<'all' | Platform>('all')
const options = [{ label:'全部平台', value:'all' }, { label:'Ozon', value:'ozon' }, { label:'Wildberries', value:'wb' }, { label:'1688', value:'1688' }, { label:'拼多多', value:'pdd' }]
const filtered = computed(() => records.value.filter((item) => {
  const hitPlatform = platform.value === 'all' || item.platform === platform.value
  const q = keyword.value.trim().toLowerCase()
  return hitPlatform && (!q || item.title?.toLowerCase().includes(q) || item.brand?.toLowerCase().includes(q))
}))
function tagType(value?: Platform) { return value === 'ozon' ? 'info' : value === 'wb' ? 'error' : value === '1688' ? 'warning' : 'success' }
function formatTime(value?: string) { if (!value) return '刚刚'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) }
async function load() {
  loading.value = true
  try { const response = await browser.runtime.sendMessage({ action:'getProducts', limit:100 }); records.value = response?.products || [] }
  catch { records.value = []; message.error('采集记录加载失败') }
  finally { loading.value = false }
}
async function remove(id: number) {
  await browser.runtime.sendMessage({ action:'deleteProduct', id }); records.value = records.value.filter((item) => item.id !== id); message.success('记录已删除')
}
onMounted(load)
</script>

<template>
  <div class="panel-stack">
    <NCard size="small">
      <NSpace :size="8"><NInput v-model:value="keyword" clearable placeholder="搜索标题或品牌" style="width:220px" /><NSelect v-model:value="platform" :options="options" style="width:120px" /></NSpace>
    </NCard>
    <template v-if="loading"><NCard v-for="n in 3" :key="n" size="small"><NSkeleton text :repeat="2" /></NCard></template>
    <NCard v-else-if="!filtered.length" size="small"><NEmpty description="暂无匹配的采集记录"><template #extra><NButton size="small" @click="load">重新加载</NButton></template></NEmpty></NCard>
    <NCard v-for="item in filtered" v-else :key="item.id" size="small">
      <div class="record">
        <div class="thumb"><img v-if="item.images?.[0]" :src="item.images[0]" alt="商品图片"><span v-else>无图</span></div>
        <div class="record-info"><strong class="ellipsis">{{ item.title || '未命名商品' }}</strong><div><NTag size="tiny" :type="tagType(item.platform)" round>{{ item.platform || '未知' }}</NTag><span>{{ formatTime(item.created_at || item.scrapedAt) }}</span></div><p>{{ item.currency }} {{ item.price?.toLocaleString() || '—' }}</p></div>
        <NPopconfirm @positive-click="remove(item.id)"><template #trigger><NButton quaternary circle size="tiny" type="error">×</NButton></template>确认删除这条记录？</NPopconfirm>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.record { display:grid; grid-template-columns:54px minmax(0,1fr) 26px; gap:10px; align-items:center; }.thumb { width:54px; height:54px; display:grid; place-items:center; border-radius:10px; overflow:hidden; background:#f0f2f6; color:#a0a8b5; font-size:10px; }.thumb img { width:100%; height:100%; object-fit:cover; }
.record-info { min-width:0; }.record-info strong { display:block; font-size:12px; }.record-info div { display:flex; align-items:center; gap:7px; margin-top:5px; color:#99a1af; font-size:10px; }.record-info p { margin:4px 0 0; color:#2563eb; font-size:12px; font-weight:700; }
</style>