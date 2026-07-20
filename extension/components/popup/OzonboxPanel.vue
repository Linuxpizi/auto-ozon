<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NAlert, NButton, NCard, NIcon, NSelect, NTag, useMessage } from 'naive-ui'
import { CheckmarkCircleOutline, CloudDownloadOutline, CubeOutline, RefreshOutline, SaveOutline } from '@vicons/ionicons5'
import {
  assertOzonboxProductRecord,
  isRecord,
} from '@/lib/ozonbox/contract'
import type {
  OzonboxCategoryResult,
  OzonboxCollectedProduct,
  OzonboxProductRecord,
  OzonboxProductRecordSaved,
  OzonboxStore,
} from '@/lib/ozonbox/contract'
import { isOzonProductUrl } from '@/lib/ozonbox/url'
import {
  listOzonboxStores,
  queryOzonboxLiveCategory,
  queryOzonboxLocalCategory,
  saveOzonboxProductRecord,
} from '@/lib/utils/api'

const message = useMessage()
const stores = ref<OzonboxStore[]>([])
const selectedStoreId = ref<number | null>(null)
const currentUrl = ref('')
const loadingStores = ref(false)
const saving = ref(false)
const error = ref('')
const categorySource = ref<'local' | 'live' | ''>('')
const saved = ref<OzonboxProductRecordSaved | null>(null)
const record = ref<OzonboxProductRecord | null>(null)

const usableStores = computed(() => stores.value.filter((store) => store.usable))
const storeOptions = computed(() => usableStores.value.map((store) => ({
  label: store.storeName || store.name,
  value: store.id,
})))
const selectedStore = computed(() => usableStores.value.find((store) => store.id === selectedStoreId.value))
const currentHost = computed(() => {
  try { return new URL(currentUrl.value).hostname }
  catch { return currentUrl.value || '未读取到当前页面' }
})

function isLocalCategoryNotFound(reason: unknown): boolean {
  return reason instanceof Error && reason.message === '本地没有该商品的真实类目信息'
}

function requireCollectedProduct(value: unknown, storeId: number): OzonboxCollectedProduct {
  if (!isRecord(value)) throw new Error('Ozon 采集器返回了无效商品数据')
  return assertOzonboxProductRecord({ ...value, storeId })
}

function requireCategory(value: OzonboxCategoryResult): OzonboxCategoryResult {
  if (!Number.isInteger(value.categoryId) || value.categoryId <= 0) {
    throw new Error('类目查询未返回真实的 categoryId')
  }
  if (!Number.isInteger(value.descriptionCategoryId) || value.descriptionCategoryId <= 0) {
    throw new Error('类目查询未返回真实的 descriptionCategoryId')
  }
  if (value.categoryId !== value.descriptionCategoryId) {
    throw new Error('类目查询返回了不一致的类目 ID')
  }
  if (value.typeId !== null && (!Number.isInteger(value.typeId) || value.typeId <= 0)) {
    throw new Error('类目查询返回了无效的 typeId')
  }
  return value
}

async function inspectPage() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  currentUrl.value = tab?.url || ''
  if (!isOzonProductUrl(currentUrl.value)) {
    error.value = '请打开严格匹配的 Ozon 商品详情页。'
    return
  }
  await loadStores()
}

async function loadStores() {
  loadingStores.value = true
  error.value = ''
  selectedStoreId.value = null
  try {
    stores.value = await listOzonboxStores()
    if (usableStores.value.length === 0) {
      throw new Error('没有可用的 Ozon 店铺，请先在后台配置并启用店铺')
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loadingStores.value = false
  }
}

async function collectAndSave() {
  error.value = ''
  saved.value = null
  record.value = null
  categorySource.value = ''
  if (!selectedStore.value) {
    error.value = '请选择要保存到的目标店铺'
    return
  }

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
    const collected = requireCollectedProduct(response.data, selectedStore.value.id)
    const productId = Number(collected.productId)
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      throw new Error('采集结果缺少有效的 productId')
    }

    let category: OzonboxCategoryResult
    try {
      category = requireCategory(await queryOzonboxLocalCategory(selectedStore.value.id, productId))
      categorySource.value = 'local'
    } catch (reason) {
      if (!isLocalCategoryNotFound(reason)) throw reason
      category = requireCategory(await queryOzonboxLiveCategory(selectedStore.value.clientId, productId))
      categorySource.value = 'live'
    }

    record.value = assertOzonboxProductRecord({
      ...collected,
      storeId: selectedStore.value.id,
      categoryId: category.categoryId,
      descriptionCategoryId: category.descriptionCategoryId,
      typeId: category.typeId,
      categoryPath: category.categoryPath ?? collected.categoryPath ?? null,
    })
    saved.value = await saveOzonboxProductRecord(record.value)
    message.success('Ozon 商品已保存为草稿')
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
        <div class="card-title"><NIcon :component="CubeOutline" /><span>Ozonbox 商品采集</span></div>
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

      <label class="field-label">目标店铺</label>
      <NSelect
        v-model:value="selectedStoreId"
        :options="storeOptions"
        :loading="loadingStores"
        :disabled="loadingStores || usableStores.length === 0"
        clearable
        placeholder="请选择保存目标，不会自动选择"
      />
      <div class="store-actions">
        <span>{{ usableStores.length ? `可用店铺 ${usableStores.length} 个` : '尚未加载可用店铺' }}</span>
        <NButton text size="small" :loading="loadingStores" @click="loadStores">
          <template #icon><NIcon :component="RefreshOutline" /></template>刷新店铺
        </NButton>
      </div>

      <NButton type="primary" block size="large" :loading="saving" :disabled="!selectedStore || !isOzonProductUrl(currentUrl)" class="save-button" @click="collectAndSave">
        <template #icon><NIcon :component="SaveOutline" /></template>
        {{ saving ? '采集、匹配类目并保存中' : '采集并保存 Ozon 商品' }}
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
          <p>{{ record.price.toLocaleString() }} ₽ · {{ record.variantsData.length }} 个真实变体</p>
          <span>记录 #{{ saved.id }} · {{ categorySource === 'local' ? '本地类目' : '线上类目' }}</span>
        </div>
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
.field-label { display: block; margin: 14px 0 6px; color: #53566c; font-size: 11px; font-weight: 600; }
.store-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 5px; color: #8b8e9f; font-size: 10px; }
.save-button { height: 42px; margin-top: 14px; box-shadow: 0 6px 16px rgba(91, 92, 240, .18); }
.panel-alert { margin-top: 10px; }
.result { display: grid; grid-template-columns: 58px minmax(0,1fr); gap: 11px; align-items: center; }
.result img, .result-placeholder { width: 58px; height: 58px; border-radius: 11px; background: #eef0f5; }
.result img { object-fit: cover; }
.result-placeholder { display: grid; place-items: center; color: #9a9dad; font-size: 24px; }
.result > div:last-child { min-width: 0; }
.result strong { display: block; color: #2d2f44; font-size: 12px; }
.result p { margin: 5px 0 2px; color: #5b5cf0; font-size: 12px; font-weight: 700; }
.result span { color: #8b8e9f; font-size: 10px; }
</style>