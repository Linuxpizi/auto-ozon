<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import type { PlatformScrapingConfig, PluginSettings } from '@/utils/types'
import { getSettings, saveSettings } from '@/utils/storage'

const emit = defineEmits<{ refresh: [] }>()

// --- Page info ---
interface PageInfo {
  isSupported: boolean
  platform?: 'ozon' | 'wb' | '1688'
  isProductPage?: boolean
  isListPage?: boolean
  pageType?: string
  tabId?: number
  url?: string
}

const pageInfo = ref<PageInfo>({ isSupported: false })

// --- State ---
const scraping = ref(false)
const stopping = ref(false)
const errorMsg = ref('')
const settingsOpen = ref(false)

// Batch progress
const progress = ref({ scraped: 0, enriched: 0, synced: 0, total: 0, phase: '' as string })

// Result
const result = ref<{ success: boolean; created?: number; skipped?: number; count?: number; data?: any } | null>(null)

// Settings
const settings = ref<PluginSettings | null>(null)
const platformConfig = ref<PlatformScrapingConfig | null>(null)

const currentPlatform = computed(() => pageInfo.value.platform || 'ozon')

const canScrape = computed(() => pageInfo.value.isProductPage || pageInfo.value.isListPage)

async function checkPage() {
  try {
    const resp = await browser.runtime.sendMessage({ action: 'checkCurrentPage' })
    pageInfo.value = resp
  } catch {
    pageInfo.value = { isSupported: false }
  }
}

async function loadSettings() {
  const s = await getSettings()
  settings.value = s
  platformConfig.value = { ...(s[currentPlatform.value] || s.ozon) }
}

watch(() => pageInfo.value.platform, () => {
  if (pageInfo.value.platform) loadSettings()
})

async function savePlatformConfig() {
  if (!settings.value || !platformConfig.value) return
  settings.value[currentPlatform.value] = { ...platformConfig.value }
  await saveSettings(settings.value)
}

// --- Scraping ---
async function doScrape() {
  scraping.value = true
  stopping.value = false
  errorMsg.value = ''
  result.value = null
  progress.value = { scraped: 0, enriched: 0, synced: 0, total: 0, phase: '' }

  try {
    if (pageInfo.value.isListPage) {
      const cfg = platformConfig.value
      const progressListener = (msg: any) => {
        if (msg.action === 'scrapingProgress') {
          progress.value = msg.progress
        }
      }
      browser.runtime.onMessage.addListener(progressListener)

      try {
        const resp = await browser.runtime.sendMessage({
          action: 'triggerListScrape',
          tabId: pageInfo.value.tabId,
          maxItems: cfg?.maxItems || 50,
          scrollDelay: cfg?.scrollDelay || 1500,
          batchSize: cfg?.batchSize || 10,
        })
        if (resp?.success) {
          result.value = { success: true, count: resp.count, created: resp.created, skipped: resp.skipped }
          emit('refresh')
        } else {
          errorMsg.value = resp?.error || '采集失败'
        }
      } finally {
        browser.runtime.onMessage.removeListener(progressListener)
      }
    } else {
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
    }
  } catch (e) {
    errorMsg.value = String(e)
  } finally {
    scraping.value = false
    stopping.value = false
  }
}

async function doStop() {
  stopping.value = true
  try {
    await browser.runtime.sendMessage({ action: 'stopScraping' })
  } catch {}
}

onMounted(async () => {
  await checkPage()
  await loadSettings()
})
</script>

<template>
  <div class="p-4 space-y-3 animate-fade-in">
    <!-- Unsupported page -->
    <div v-if="!pageInfo.isSupported" class="text-center py-10">
      <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-100 flex items-center justify-center">
        <svg class="w-8 h-8 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <p class="text-surface-500 text-sm font-medium">当前页面不支持采集</p>
      <p class="text-surface-400 text-xs mt-1.5">请打开 Ozon / WB / 1688 商品页或列表页</p>
    </div>

    <template v-else>
      <!-- Platform info card -->
      <div class="card p-3">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
            :class="pageInfo.platform === 'ozon' ? 'bg-gradient-to-br from-ozon-500 to-ozon-600' : pageInfo.platform === '1688' ? 'bg-gradient-to-br from-orange-500 to-orange-600' : 'bg-gradient-to-br from-wb-500 to-wb-600'"
          >
            {{ pageInfo.platform === 'ozon' ? 'O' : pageInfo.platform === '1688' ? 'A' : 'W' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-surface-800">
                {{ pageInfo.platform === 'ozon' ? 'Ozon' : pageInfo.platform === '1688' ? '1688(阿里巴巴)' : 'Wildberries' }}
              </span>
              <span v-if="pageInfo.isProductPage" class="badge-success">商品页</span>
              <span v-else-if="pageInfo.isListPage" class="badge-info">列表页</span>
              <span v-else class="badge-warning">未知页面</span>
            </div>
            <p class="text-xs text-surface-400 mt-0.5 truncate">{{ pageInfo.url }}</p>
          </div>
        </div>
      </div>

      <!-- Per-platform settings (collapsible, for list pages) -->
      <div v-if="pageInfo.isListPage && platformConfig" class="card overflow-hidden">
        <button
          @click="settingsOpen = !settingsOpen"
          class="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-surface-600 hover:bg-surface-50 transition-colors"
        >
          <span class="flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            采集条件设置
          </span>
          <svg class="w-4 h-4 transition-transform" :class="{ 'rotate-180': settingsOpen }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        <Transition name="settings">
          <div v-if="settingsOpen" class="px-3 pb-3 space-y-2.5 border-t border-surface-100">
            <!-- Max items -->
            <div class="pt-2.5">
              <label class="text-[11px] text-surface-500 mb-1 block">最大采集数量</label>
              <input
                v-model.number="platformConfig.maxItems"
                type="number" min="1" max="500"
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white focus:border-ozon-400 focus:ring-1 focus:ring-ozon-200 outline-none"
                @change="savePlatformConfig"
              />
            </div>
            <!-- Batch size -->
            <div>
              <label class="text-[11px] text-surface-500 mb-1 block">每批上报数量</label>
              <input
                v-model.number="platformConfig.batchSize"
                type="number" min="1" max="50"
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white focus:border-ozon-400 focus:ring-1 focus:ring-ozon-200 outline-none"
                @change="savePlatformConfig"
              />
            </div>
            <!-- Scroll delay -->
            <div>
              <label class="text-[11px] text-surface-500 mb-1 block">滚动间隔 (ms)</label>
              <input
                v-model.number="platformConfig.scrollDelay"
                type="number" min="500" max="5000" step="100"
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white focus:border-ozon-400 focus:ring-1 focus:ring-ozon-200 outline-none"
                @change="savePlatformConfig"
              />
            </div>
            <!-- Price range -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-surface-500 mb-1 block">最低价格 (₽)</label>
                <input v-model.number="platformConfig.priceMin" type="number" min="0"
                  class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white focus:border-ozon-400 focus:ring-1 focus:ring-ozon-200 outline-none"
                  @change="savePlatformConfig" />
              </div>
              <div>
                <label class="text-[11px] text-surface-500 mb-1 block">最高价格 (₽)</label>
                <input v-model.number="platformConfig.priceMax" type="number" min="0"
                  class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white focus:border-ozon-400 focus:ring-1 focus:ring-ozon-200 outline-none"
                  @change="savePlatformConfig" />
              </div>
            </div>
            <!-- Rating & Reviews -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[11px] text-surface-500 mb-1 block">最低评分</label>
                <input v-model.number="platformConfig.minRating" type="number" min="0" max="5" step="0.1"
                  class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white focus:border-ozon-400 focus:ring-1 focus:ring-ozon-200 outline-none"
                  @change="savePlatformConfig" />
              </div>
              <div>
                <label class="text-[11px] text-surface-500 mb-1 block">最低评价数</label>
                <input v-model.number="platformConfig.minReviews" type="number" min="0"
                  class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white focus:border-ozon-400 focus:ring-1 focus:ring-ozon-200 outline-none"
                  @change="savePlatformConfig" />
              </div>
            </div>
            <!-- Brand whitelist -->
            <div>
              <label class="text-[11px] text-surface-500 mb-1 block">品牌白名单 (逗号分隔,空=不限)</label>
              <input
                :value="platformConfig.brandWhitelist.join(', ')"
                @change="platformConfig.brandWhitelist = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean); savePlatformConfig()"
                type="text" placeholder="AI 技术提供商, Samsung"
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white focus:border-ozon-400 focus:ring-1 focus:ring-ozon-200 outline-none" />
            </div>
            <!-- Brand blacklist -->
            <div>
              <label class="text-[11px] text-surface-500 mb-1 block">品牌黑名单 (逗号分隔)</label>
              <input
                :value="platformConfig.brandBlacklist.join(', ')"
                @change="platformConfig.brandBlacklist = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean); savePlatformConfig()"
                type="text" placeholder="BrandX, BrandY"
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white focus:border-ozon-400 focus:ring-1 focus:ring-ozon-200 outline-none" />
            </div>
          </div>
        </Transition>
      </div>

      <!-- Main action button (not scraping) -->
      <button
        v-if="!scraping"
        @click="doScrape"
        :disabled="!canScrape"
        class="w-full group relative overflow-hidden rounded-2xl py-3.5 font-semibold text-sm transition-all duration-300"
        :class="canScrape
          ? 'bg-gradient-to-r from-ozon-500 via-ozon-600 to-brand-500 text-white shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]'
          : 'bg-surface-100 text-surface-400 cursor-not-allowed'"
      >
        <span v-if="pageInfo.isListPage" class="flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
          </svg>
          滚动采集全部商品
        </span>
        <span v-else class="flex items-center justify-center gap-2">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z" />
            <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75z" />
          </svg>
          一键采集商品
        </span>
        <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
      </button>

      <!-- Scraping in progress: Stop + Progress -->
      <template v-if="scraping">
        <button
          @click="doStop"
          :disabled="stopping"
          class="w-full rounded-2xl py-3 font-semibold text-sm transition-all duration-300"
          :class="stopping ? 'bg-surface-200 text-surface-400 cursor-not-allowed' : 'bg-red-500 text-white hover:bg-red-600 active:scale-[0.98]'"
        >
          <span class="flex items-center justify-center gap-2">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
            </svg>
            {{ stopping ? '正在停止...' : '停止采集' }}
          </span>
        </button>

        <!-- Progress card -->
        <div class="card p-4 space-y-3">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-ozon-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span class="text-xs font-medium text-surface-700">
              {{ progress.phase === 'enrich' ? '正在补全商品详情...' : progress.phase === 'sync' ? '正在同步到后端...' : '正在滚动采集...' }}
            </span>
          </div>
          <div class="space-y-2">
            <div v-if="progress.total > 0">
              <div class="flex justify-between text-[11px] text-surface-500 mb-0.5">
                <span>采集卡片</span>
                <span>{{ progress.scraped }} / {{ progress.total }}</span>
              </div>
              <div class="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                <div class="h-full bg-ozon-500 rounded-full transition-all duration-300"
                  :style="{ width: `${Math.min(100, (progress.scraped / progress.total) * 100)}%` }" />
              </div>
            </div>
            <div v-if="progress.enriched > 0 || progress.phase === 'enrich'">
              <div class="flex justify-between text-[11px] text-surface-500 mb-0.5">
                <span>补全详情</span>
                <span>{{ progress.enriched }} / {{ progress.total }}</span>
              </div>
              <div class="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                <div class="h-full bg-blue-500 rounded-full transition-all duration-300"
                  :style="{ width: `${Math.min(100, progress.total > 0 ? (progress.enriched / progress.total) * 100 : 0)}%` }" />
              </div>
            </div>
            <div v-if="progress.synced > 0 || progress.phase === 'sync'">
              <div class="flex justify-between text-[11px] text-surface-500 mb-0.5">
                <span>已同步后端</span>
                <span>{{ progress.synced }} / {{ progress.total }}</span>
              </div>
              <div class="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                <div class="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  :style="{ width: `${Math.min(100, progress.total > 0 ? (progress.synced / progress.total) * 100 : 0)}%` }" />
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Error -->
      <div v-if="errorMsg" class="card p-3 bg-red-50 border-red-100 animate-slide-up">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <span class="text-xs text-red-600">{{ errorMsg }}</span>
        </div>
      </div>

      <!-- List result -->
      <div v-if="result?.success && result.count" class="card p-3 animate-slide-up">
        <div class="flex items-center gap-2 mb-1">
          <div class="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg class="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <span class="text-xs font-semibold text-emerald-600">采集完成: {{ result.count }} 个商品</span>
        </div>
        <p class="text-xs text-surface-400">
          已保存 {{ result.created }} 条, 去重跳过 {{ result.skipped }} 条
        </p>
      </div>

      <!-- Single product result -->
      <div v-if="result?.success && result.data" class="card overflow-hidden animate-slide-up">
        <div class="p-4">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg class="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <span class="text-xs font-semibold text-emerald-600">采集成功</span>
          </div>
          <div class="flex gap-3">
            <div v-if="result.data.images?.length" class="w-16 h-16 rounded-xl overflow-hidden bg-surface-100 flex-shrink-0">
              <img :src="result.data.images[0]" class="w-full h-full object-cover" alt="" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-surface-800 line-clamp-2 leading-snug">{{ result.data.title }}</p>
              <div class="flex items-center gap-2 mt-1.5">
                <span class="text-brand-600 font-bold text-sm">
                  {{ result.data.price ? `₽${result.data.price.toLocaleString()}` : '—' }}
                </span>
                <span v-if="result.data.oldPrice && result.data.oldPrice > result.data.price"
                  class="text-surface-400 text-xs line-through">₽{{ result.data.oldPrice.toLocaleString() }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.settings-enter-active,
.settings-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.settings-enter-from,
.settings-leave-to {
  opacity: 0;
  max-height: 0;
}
.settings-enter-to,
.settings-leave-from {
  opacity: 1;
  max-height: 600px;
}
</style>
