<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import type { ScrapedProduct } from '@/utils/types'

const emit = defineEmits<{ refresh: [] }>()

interface BackendProduct extends ScrapedProduct {
  id: number
  created_at?: string
}

const urlInput = ref('')
const navigating = ref(false)
const errorMsg = ref('')
const recentProducts = ref<BackendProduct[]>([])
const loading = ref(false)

const isValidUrl = computed(() => {
  const v = urlInput.value.trim()
  return /1688\.com/.test(v)
})

// 从后端获取 1688 商品
async function loadRecent() {
  loading.value = true
  try {
    const resp = await browser.runtime.sendMessage({ action: 'getProducts', platform: '1688', limit: 20 })
    recentProducts.value = resp?.products || []
  } catch {
    recentProducts.value = []
  } finally {
    loading.value = false
  }
}

async function goToUrl() {
  const url = urlInput.value.trim()
  if (!isValidUrl.value) {
    errorMsg.value = '请输入有效的 1688 商品链接'
    return
  }
  errorMsg.value = ''
  navigating.value = true
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (tab?.id) {
      await browser.tabs.update(tab.id, { url })
      // 等待页面加载完成后自动切换到采集 tab
      emit('refresh')
    }
  } catch (e) {
    errorMsg.value = String(e)
  } finally {
    navigating.value = false
  }
}

function openSearch() {
  const q = urlInput.value.trim() || '新款'
  const searchUrl = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(q)}`
  chrome.tabs.create({ url: searchUrl })
}

onMounted(loadRecent)

async function deleteProduct(id: number) {
  await browser.runtime.sendMessage({ action: 'deleteProduct', id })
  recentProducts.value = recentProducts.value.filter((p) => p.id !== id)
  emit('refresh')
}
</script>

<template>
  <div class="p-4 space-y-3 animate-fade-in">
    <!-- URL Input Section -->
    <div class="card p-3">
      <div class="flex items-center gap-2 mb-2.5">
        <div class="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
          <span class="text-white font-bold text-[11px]">A</span>
        </div>
        <div>
          <h3 class="text-xs font-semibold text-surface-800">1688 采集</h3>
          <p class="text-[10px] text-surface-400">粘贴1688商品链接快速采集</p>
        </div>
      </div>

      <div class="flex gap-2">
        <input
          v-model="urlInput"
          type="text"
          placeholder="粘贴 1688 商品或搜索链接..."
          class="flex-1 text-xs px-3 py-2 rounded-xl border border-surface-200 bg-white focus:border-orange-400 focus:ring-1 focus:ring-orange-200 outline-none transition-all"
          @keydown.enter="goToUrl"
        />
      </div>

      <div v-if="errorMsg" class="mt-2 text-[11px] text-red-500">{{ errorMsg }}</div>

      <div class="flex gap-2 mt-2.5">
        <button
          @click="goToUrl"
          :disabled="!isValidUrl || navigating"
          class="flex-1 rounded-xl py-2 text-xs font-semibold transition-all duration-200"
          :class="isValidUrl && !navigating
            ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md hover:shadow-lg active:scale-[0.98]'
            : 'bg-surface-100 text-surface-400 cursor-not-allowed'"
        >
          <span class="flex items-center justify-center gap-1.5">
            <svg v-if="!navigating" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <svg v-else class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            去采集
          </span>
        </button>
        <button
          @click="openSearch"
          class="px-3 py-2 rounded-xl border border-surface-200 text-xs text-surface-600 hover:bg-surface-50 transition-all duration-200"
        >
          <span class="flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            搜索
          </span>
        </button>
      </div>
    </div>

    <!-- Tips -->
    <div class="card p-3 bg-orange-50/50 border-orange-100">
      <div class="flex items-start gap-2">
        <svg class="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <div class="text-[11px] text-orange-700 leading-relaxed">
          <p class="font-medium mb-0.5">使用提示</p>
          <ul class="space-y-0.5 text-orange-600">
            <li>• 详情页 URL: detail.1688.com/offer/xxx.html</li>
            <li>• 搜索页 URL: s.1688.com/selloffer/offer_search.htm</li>
            <li>• 打开页面后切到「采集」Tab 点击采集按钮</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Recent 1688 Products -->
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between px-3 py-2 border-b border-surface-100">
        <span class="text-xs font-medium text-surface-600">最近采集的1688商品</span>
        <span class="text-[10px] text-surface-400">{{ recentProducts.length }}条</span>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="p-6 text-center">
        <svg class="w-5 h-5 mx-auto text-surface-300 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>

      <!-- Empty -->
      <div v-else-if="recentProducts.length === 0" class="p-6 text-center">
        <p class="text-surface-400 text-xs">暂无1688采集记录</p>
        <p class="text-surface-300 text-[10px] mt-1">输入链接开始采集</p>
      </div>

      <!-- Product list -->
      <div v-else class="max-h-[220px] overflow-y-auto">
        <div
          v-for="product in recentProducts"
          :key="product.id"
          class="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-50 transition-colors border-b border-surface-50 last:border-b-0"
        >
          <!-- Thumbnail -->
          <div class="w-9 h-9 rounded-lg overflow-hidden bg-surface-100 flex-shrink-0">
            <img
              v-if="product.images?.length"
              :src="product.images[0]"
              class="w-full h-full object-cover"
              @error="($event.target as HTMLImageElement).style.display='none'"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <svg class="w-4 h-4 text-surface-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
              </svg>
            </div>
          </div>
          <!-- Info -->
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-medium text-surface-700 line-clamp-1">{{ product.title || '无标题' }}</p>
            <span class="text-orange-500 text-[11px] font-bold">
              {{ product.price ? `¥${product.price.toLocaleString()}` : '—' }}
            </span>
          </div>
          <!-- Delete -->
          <button
            @click="deleteProduct(product.id)"
            class="w-6 h-6 rounded flex items-center justify-center text-surface-300 hover:text-red-500 hover:bg-red-50 transition-all flex-shrink-0"
          >
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
