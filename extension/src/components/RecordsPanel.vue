<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { ScrapedProduct } from '@/utils/types'

const emit = defineEmits<{ refresh: [] }>()

interface BackendProduct extends ScrapedProduct {
  id: number
  created_at?: string
}

const products = ref<BackendProduct[]>([])
const loading = ref(false)
const searchQuery = ref('')
const filterPlatform = ref<'all' | 'ozon' | 'wb' | '1688' | 'pdd'>('all')

const requiredAttributeKeywords = ['产品类别', '类目', '类别', '分类', '颜色', '色号', '尺码', '尺寸', '规格', '款式', '型号', '重量', '毛重', '净重', '容量', '材质']

const filteredProducts = computed(() => {
  let list = products.value
  if (filterPlatform.value !== 'all') {
    list = list.filter((p) => p.platform === filterPlatform.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.sourceId.includes(q),
    )
  }
  return list
})

async function loadProducts() {
  loading.value = true
  try {
    const platform = filterPlatform.value === 'all' ? undefined : filterPlatform.value
    const resp = await browser.runtime.sendMessage({ action: 'getProducts', platform, limit: 200 })
    products.value = resp?.products || []
  } catch {
    products.value = []
  } finally {
    loading.value = false
  }
}

async function deleteProduct(id: number) {
  await browser.runtime.sendMessage({ action: 'deleteProduct', id })
  products.value = products.value.filter((p) => p.id !== id)
  emit('refresh')
}

async function refreshList() {
  await loadProducts()
  emit('refresh')
}

function formatPrice(product: BackendProduct) {
  if (!product.price) return '—'
  const symbol = product.platform === '1688' || product.platform === 'pdd' ? '¥' : '₽'
  return `${symbol}${product.price.toLocaleString()}`
}

function formatWeight(grams?: number) {
  if (!grams) return ''
  return grams >= 1000 ? `${(grams / 1000).toFixed(grams % 1000 ? 2 : 0)}kg` : `${grams}g`
}

function formatDimensions(spec: any) {
  const parts = [spec?.depth_mm, spec?.width_mm, spec?.height_mm].filter(Boolean)
  return parts.length ? `${parts.join('×')}mm` : ''
}

function getPriorityAttributes(product: BackendProduct) {
  const attrs = (product.attributes || []).filter((attr) => attr?.name && attr?.value)
  const score = (name: string) => {
    const lower = name.toLowerCase()
    const index = requiredAttributeKeywords.findIndex((keyword) => lower.includes(keyword.toLowerCase()))
    return index === -1 ? 999 : index
  }
  return [...attrs].sort((a, b) => score(a.name) - score(b.name)).slice(0, 6)
}

function getSpecChips(product: BackendProduct) {
  const spec = product.specList?.[0]
  const chips: Array<{ label: string; value: string; color: string }> = []
  if (product.category) chips.push({ label: '类别', value: product.category, color: 'blue' })
  if (spec?.color) chips.push({ label: '颜色', value: String(spec.color), color: 'rose' })
  if (spec?.size) chips.push({ label: '规格', value: String(spec.size), color: 'emerald' })
  const weight = formatWeight(spec?.weight_g)
  if (weight) chips.push({ label: '重量', value: weight, color: 'amber' })
  const dimensions = formatDimensions(spec)
  if (dimensions) chips.push({ label: '尺寸', value: dimensions, color: 'violet' })
  return chips.slice(0, 5)
}

function getCompleteness(product: BackendProduct) {
  const attrs = product.attributes || []
  const spec = product.specList?.[0]
  const hasCategory = Boolean(product.category || attrs.some((a) => /产品类别|类目|类别|分类/.test(a.name)))
  const hasSkuSpec = Boolean(spec?.color || spec?.size || attrs.some((a) => /颜色|色号|尺码|尺寸|规格|款式|型号|容量/.test(a.name)))
  const hasPhysical = Boolean(spec?.weight_g || spec?.depth_mm || spec?.width_mm || spec?.height_mm || attrs.some((a) => /重量|毛重|净重|长|宽|高|尺寸/.test(a.name)))
  const count = [hasCategory, hasSkuSpec, hasPhysical].filter(Boolean).length
  return { count, total: 3, ok: count === 3 }
}

onMounted(loadProducts)
</script>

<template>
  <div class="flex flex-col animate-fade-in">
    <!-- Toolbar -->
    <div class="p-3 border-b border-surface-100 bg-white">
      <!-- Search -->
      <div class="relative mb-2.5">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索标题、品牌、ID..."
          class="input-field pl-9 pr-3 py-2 text-xs"
        />
      </div>

      <!-- Platform filter & refresh button -->
      <div class="flex items-center gap-2">
        <div class="flex bg-surface-50 rounded-lg p-0.5 flex-1">
          <button
            v-for="f in (['all', 'ozon', 'wb', '1688', 'pdd'] as const)"
            :key="f"
            @click="filterPlatform = f"
            class="flex-1 py-1.5 text-[11px] font-medium rounded-md transition-all duration-200"
            :class="filterPlatform === f ? 'bg-white text-surface-800 shadow-sm' : 'text-surface-400 hover:text-surface-600'"
          >
            {{ f === 'all' ? '全部' : f === 'ozon' ? 'Ozon' : f === '1688' ? '1688' : f === 'pdd' ? 'PDD' : 'WB' }}
          </button>
        </div>
        <button
          @click="refreshList"
          class="btn-primary py-2 px-3 text-xs whitespace-nowrap"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          刷新
        </button>
      </div>
    </div>

    <!-- Product list -->
    <div class="flex-1 overflow-y-auto" style="max-height: 380px;">
      <!-- Loading -->
      <div v-if="loading" class="p-8 text-center">
        <svg class="w-6 h-6 mx-auto text-surface-300 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>

      <!-- Empty -->
      <div v-else-if="filteredProducts.length === 0" class="text-center py-12">
        <div class="w-14 h-14 mx-auto mb-3 rounded-2xl bg-surface-50 flex items-center justify-center">
          <svg class="w-7 h-7 text-surface-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        </div>
        <p class="text-surface-400 text-xs">暂无采集记录</p>
      </div>

      <!-- List -->
      <div v-else class="p-2 space-y-2">
        <div
          v-for="product in filteredProducts"
          :key="product.id"
          class="card-hover p-3 animate-slide-up"
        >
          <div class="flex gap-3">
            <!-- Thumbnail -->
            <div class="w-14 h-14 rounded-xl overflow-hidden bg-surface-100 flex-shrink-0">
              <img
                v-if="product.images?.length"
                :src="product.images[0]"
                class="w-full h-full object-cover"
                alt=""
                @error="($event.target as HTMLImageElement).style.display='none'"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <svg class="w-5 h-5 text-surface-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
                </svg>
              </div>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <p class="text-xs font-medium text-surface-800 line-clamp-1">{{ product.title || '无标题' }}</p>
              <div class="flex items-center gap-1.5 mt-1">
                <span
                  class="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  :class="product.platform === 'ozon' ? 'bg-ozon-50 text-ozon-600' : product.platform === '1688' ? 'bg-orange-50 text-orange-600' : product.platform === 'pdd' ? 'bg-red-50 text-red-600' : 'bg-wb-50 text-wb-600'"
                >
                  {{ product.platform === 'ozon' ? 'Ozon' : product.platform === '1688' ? '1688' : product.platform === 'pdd' ? 'PDD' : 'WB' }}
                </span>
                <span class="text-brand-600 text-xs font-bold">
                  {{ formatPrice(product) }}
                </span>
                <span
                  class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  :class="getCompleteness(product).ok ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'"
                >
                  必填 {{ getCompleteness(product).count }}/{{ getCompleteness(product).total }}
                </span>
              </div>

              <div v-if="getSpecChips(product).length" class="flex flex-wrap gap-1 mt-2">
                <span
                  v-for="chip in getSpecChips(product)"
                  :key="`${product.id}-${chip.label}-${chip.value}`"
                  class="inline-flex items-center max-w-full px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                  :class="chip.color === 'blue' ? 'bg-blue-50 text-blue-700' : chip.color === 'rose' ? 'bg-rose-50 text-rose-700' : chip.color === 'emerald' ? 'bg-emerald-50 text-emerald-700' : chip.color === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-violet-50 text-violet-700'"
                >
                  <span class="opacity-70 mr-0.5">{{ chip.label }}</span>
                  <span class="truncate max-w-[120px]">{{ chip.value }}</span>
                </span>
              </div>

              <div v-if="getPriorityAttributes(product).length" class="mt-2 rounded-xl bg-surface-50/80 border border-surface-100 overflow-hidden">
                <div class="px-2 py-1 flex items-center justify-between border-b border-surface-100">
                  <span class="text-[10px] font-semibold text-surface-500">规格属性</span>
                  <span class="text-[10px] text-surface-400">{{ product.attributes?.length || 0 }} 项</span>
                </div>
                <div class="p-2 grid grid-cols-1 gap-1">
                  <div
                    v-for="attr in getPriorityAttributes(product)"
                    :key="`${product.id}-${attr.name}-${attr.value}`"
                    class="grid grid-cols-[64px_1fr] gap-1.5 text-[10px] leading-relaxed"
                  >
                    <span class="text-surface-400 truncate" :title="attr.name">{{ attr.name }}</span>
                    <span class="text-surface-700 font-medium break-words">{{ attr.value }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Delete -->
            <button
              @click="deleteProduct(product.id)"
              class="w-7 h-7 rounded-lg flex items-center justify-center text-surface-300 hover:text-red-500 hover:bg-red-50 transition-all duration-200 flex-shrink-0"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
