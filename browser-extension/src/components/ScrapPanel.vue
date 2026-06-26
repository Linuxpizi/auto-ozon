<script setup lang="ts">
import { ref, onMounted } from 'vue'

const emit = defineEmits<{ refresh: [] }>()

interface PageInfo {
  isSupported: boolean
  platform?: 'ozon' | 'wb'
  isProductPage?: boolean
  tabId?: number
  url?: string
}

interface ScrapResult {
  success: boolean
  data?: {
    title: string
    price: number
    oldPrice: number
    rating: number
    reviewCount: number
    brand: string
    images: string[]
    sourceId: string
  }
  added?: boolean
}

const pageInfo = ref<PageInfo>({ isSupported: false })
const loading = ref(false)
const scraping = ref(false)
const result = ref<ScrapResult | null>(null)
const errorMsg = ref('')

async function checkPage() {
  try {
    const resp = await browser.runtime.sendMessage({ action: 'checkCurrentPage' })
    pageInfo.value = resp
  } catch {
    pageInfo.value = { isSupported: false }
  }
}

async function doScrape() {
  scraping.value = true
  errorMsg.value = ''
  result.value = null
  try {
    const resp = await browser.runtime.sendMessage({
      action: 'triggerScrape',
      tabId: pageInfo.value.tabId,
    })
    if (resp?.success) {
      result.value = resp
      emit('refresh')
    } else {
      errorMsg.value = resp?.error || '采集失败'
    }
  } catch (e) {
    errorMsg.value = String(e)
  } finally {
    scraping.value = false
  }
}

onMounted(checkPage)
</script>

<template>
  <div class="p-4 space-y-4 animate-fade-in">
    <!-- Unsupported page -->
    <div v-if="!pageInfo.isSupported" class="text-center py-10">
      <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-100 flex items-center justify-center">
        <svg class="w-8 h-8 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <p class="text-surface-500 text-sm font-medium">当前页面不支持采集</p>
      <p class="text-surface-400 text-xs mt-1.5">请打开 Ozon 或 Wildberries 商品页面</p>
    </div>

    <!-- Supported page -->
    <template v-else>
      <!-- Page info card -->
      <div class="card p-4">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
            :class="pageInfo.platform === 'ozon' ? 'bg-gradient-to-br from-ozon-500 to-ozon-600' : 'bg-gradient-to-br from-wb-500 to-wb-600'"
          >
            {{ pageInfo.platform === 'ozon' ? 'O' : 'W' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-surface-800">
                {{ pageInfo.platform === 'ozon' ? 'Ozon' : 'Wildberries' }}
              </span>
              <span
                v-if="pageInfo.isProductPage"
                class="badge-success"
              >
                商品页
              </span>
              <span v-else class="badge-warning">非商品页</span>
            </div>
            <p class="text-xs text-surface-400 mt-0.5 truncate">
              {{ pageInfo.url }}
            </p>
          </div>
        </div>
      </div>

      <!-- Scrape button -->
      <button
        @click="doScrape"
        :disabled="!pageInfo.isProductPage || scraping"
        class="w-full group relative overflow-hidden rounded-2xl py-3.5 font-semibold text-sm transition-all duration-300"
        :class="[
          pageInfo.isProductPage && !scraping
            ? 'bg-gradient-to-r from-ozon-500 via-ozon-600 to-brand-500 text-white shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]'
            : 'bg-surface-100 text-surface-400 cursor-not-allowed',
        ]"
      >
        <span v-if="scraping" class="flex items-center justify-center gap-2">
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          采集中...
        </span>
        <span v-else class="flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
          </svg>
          一键采集
        </span>
        <!-- Shimmer effect -->
        <div
          v-if="pageInfo.isProductPage && !scraping"
          class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"
        />
      </button>

      <!-- Error -->
      <div v-if="errorMsg" class="card p-3 bg-red-50 border-red-100 animate-slide-up">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span class="text-xs text-red-600">{{ errorMsg }}</span>
        </div>
      </div>

      <!-- Success result -->
      <div v-if="result?.success && result.data" class="card overflow-hidden animate-slide-up">
        <div class="p-4">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg class="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <span class="text-xs font-semibold text-emerald-600">
              {{ result.added ? '采集成功' : '已存在（去重）' }}
            </span>
          </div>

          <div class="flex gap-3">
            <!-- Thumbnail -->
            <div v-if="result.data.images?.length" class="w-16 h-16 rounded-xl overflow-hidden bg-surface-100 flex-shrink-0">
              <img
                :src="result.data.images[0]"
                class="w-full h-full object-cover"
                alt=""
                @error="($event.target as HTMLImageElement).style.display='none'"
              />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-surface-800 line-clamp-2 leading-snug">
                {{ result.data.title }}
              </p>
              <div class="flex items-center gap-2 mt-1.5">
                <span class="text-brand-600 font-bold text-sm">
                  {{ result.data.price ? `₽${result.data.price.toLocaleString()}` : '—' }}
                </span>
                <span
                  v-if="result.data.oldPrice && result.data.oldPrice > result.data.price"
                  class="text-surface-400 text-xs line-through"
                >
                  ₽{{ result.data.oldPrice.toLocaleString() }}
                </span>
              </div>
              <div class="flex items-center gap-2 mt-1">
                <span v-if="result.data.rating" class="text-xs text-amber-500 flex items-center gap-0.5">
                  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  {{ result.data.rating }}
                </span>
                <span v-if="result.data.reviewCount" class="text-xs text-surface-400">
                  {{ result.data.reviewCount }} 条评价
                </span>
                <span v-if="result.data.brand" class="text-xs text-surface-400">
                  {{ result.data.brand }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
