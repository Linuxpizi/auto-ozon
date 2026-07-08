<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import type { PlatformScrapingConfig, PluginSettings } from '@/utils/types'
import { getSettings, saveSettings } from '@/utils/storage'

const emit = defineEmits<{ refresh: [] }>()

// --- Page info ---
interface PageInfo {
  isSupported: boolean
  platform?: 'ozon' | 'wb' | '1688' | 'pdd'
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

// Batch progress
const progress = ref({ scraped: 0, enriched: 0, synced: 0, total: 0, phase: '' as string })

// Result
const result = ref<{ success: boolean; created?: number; skipped?: number; count?: number; data?: any } | null>(null)

// Settings
const settings = ref<PluginSettings | null>(null)
const platformConfig = ref<PlatformScrapingConfig | null>(null)

const currentPlatform = computed(() => pageInfo.value.platform || 'ozon')

const canScrape = computed(() => pageInfo.value.isProductPage || pageInfo.value.isListPage)

const priorityAttributeNames = [
  '产品类别', '类目', '类别', '分类', '品牌', '型号', '颜色', '色号', '尺码', '尺寸', '规格', '款式', '容量', '净含量', '重量', '毛重', '净重', '材质',
  'бренд', 'brand', 'модель', 'model', 'цвет', 'color', 'размер', 'size',
  'вес', 'масса', 'weight', 'длина', 'ширина', 'высота', 'глубина',
  'габарит', 'материал', 'material', 'тип', 'type', 'назначение',
]

function formatWeight(grams?: number) {
  if (!grams) return ''
  return grams >= 1000 ? `${(grams / 1000).toFixed(grams % 1000 ? 2 : 0)} kg` : `${grams} g`
}

function formatDimensions(spec: any) {
  const parts = [spec?.depth_mm, spec?.width_mm, spec?.height_mm].filter(Boolean)
  return parts.length ? `${parts.join(' × ')} mm` : ''
}

const keyAttributes = computed(() => {
  const attrs = result.value?.data?.attributes || []
  const normalized = attrs.filter((attr: any) => attr?.name && attr?.value)
  const score = (attr: any) => {
    const name = String(attr.name).toLowerCase()
    const index = priorityAttributeNames.findIndex((keyword) => name.includes(keyword))
    return index === -1 ? 999 : index
  }
  return [...normalized].sort((a, b) => score(a) - score(b)).slice(0, 24)
})

const attributeGroups = computed(() => {
  const groups: Record<string, any[]> = { physical: [], identity: [], other: [] }
  for (const attr of keyAttributes.value) {
    const name = String(attr.name || '').toLowerCase()
    if (/(вес|масса|weight|длина|ширина|высота|глубина|габарит|размер|цвет|color|size|尺寸|尺码|规格|款式|重量|毛重|净重|颜色|容量)/.test(name)) {
      groups.physical.push(attr)
    } else if (/(бренд|brand|品牌|модель|model|型号|тип|type|类别|分类|类目|артикул|sku)/.test(name)) {
      groups.identity.push(attr)
    } else {
      groups.other.push(attr)
    }
  }
  return [
    { key: 'physical', title: '物理 / 规格', color: 'violet', items: groups.physical },
    { key: 'identity', title: '商品标识', color: 'blue', items: groups.identity },
    { key: 'other', title: '其他属性', color: 'surface', items: groups.other },
  ].filter((group) => group.items.length)
})

const physicalSpec = computed(() => {
  const spec = result.value?.data?.specList?.[0]
  if (!spec) return null
  const display = {
    weight: formatWeight(spec.weight_g),
    size: formatDimensions(spec),
    color: spec.color || '',
    skuSize: spec.size || spec.capacity || spec.style || spec.weight || '',
  }
  return Object.values(display).some(Boolean) ? display : null
})

const specPreviewRows = computed(() => {
  const list = result.value?.data?.specList || []
  return list.slice(0, 8).map((spec: any, index: number) => ({
    index: index + 1,
    name: spec.capacity || spec.size || spec.color || spec.style || spec.weight || spec.sku || `规格 ${index + 1}`,
    weight: formatWeight(spec.weight_g),
    dimension: formatDimensions(spec),
    color: spec.color || '',
  }))
})

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
          if (msg.progress) {
            // Ozon format: { action, progress: { scraped, enriched, synced, total, phase } }
            progress.value = msg.progress
          } else {
            // 1688 format: { action, platform, current, total, created, skipped, done? }
            progress.value = {
              scraped: msg.current || 0,
              enriched: 0,
              synced: 0,
              total: msg.total || 0,
              phase: msg.done ? 'done' : 'scroll',
            }
          }
          // ★ 1688 done 消息带有 created/skipped → 设置 result 让模板显示结果
          if (msg.done && (msg.platform === '1688' || msg.platform === 'pdd')) {
            result.value = {
              success: true,
              count: msg.total || msg.current || 0,
              created: msg.created ?? 0,
              skipped: msg.skipped ?? 0,
            }
            emit('refresh')
          }
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
      <p class="text-surface-400 text-xs mt-1.5">请打开 Ozon / WB / 1688 / PDD 商品页或列表页</p>
    </div>

    <template v-else>
      <!-- Platform info card -->
      <div class="card p-3">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
            :class="pageInfo.platform === 'ozon' ? 'bg-gradient-to-br from-ozon-500 to-ozon-600' : pageInfo.platform === '1688' ? 'bg-gradient-to-br from-orange-500 to-orange-600' : pageInfo.platform === 'pdd' ? 'bg-gradient-to-br from-red-500 to-rose-600' : 'bg-gradient-to-br from-wb-500 to-wb-600'"
          >
            {{ pageInfo.platform === 'ozon' ? 'O' : pageInfo.platform === '1688' ? 'A' : pageInfo.platform === 'pdd' ? 'P' : 'W' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-surface-800">
                {{ pageInfo.platform === 'ozon' ? 'Ozon' : pageInfo.platform === '1688' ? '1688(阿里巴巴)' : pageInfo.platform === 'pdd' ? 'PDD(拼多多)' : 'Wildberries' }}
              </span>
              <span v-if="pageInfo.isProductPage" class="badge-success">商品页</span>
              <span v-else-if="pageInfo.isListPage" class="badge-info">列表页</span>
              <span v-else class="badge-warning">未知页面</span>
            </div>
            <p class="text-xs text-surface-400 mt-0.5 truncate">{{ pageInfo.url }}</p>
          </div>
        </div>
      </div>

      <!-- Per-platform settings (always visible, for list pages) -->
      <div v-if="pageInfo.isListPage && platformConfig" class="card overflow-hidden">
        <div class="px-3 pt-2.5 pb-1">
          <span class="flex items-center gap-1.5 text-xs font-medium text-surface-600">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            采集条件设置
          </span>
        </div>
        <div class="px-3 pb-3 space-y-2.5 border-t border-surface-100">
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
                <label class="text-[11px] text-surface-500 mb-1 block">最低价格</label>
                <input v-model.number="platformConfig.priceMin" type="number" min="0"
                  class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-surface-200 bg-white focus:border-ozon-400 focus:ring-1 focus:ring-ozon-200 outline-none"
                  @change="savePlatformConfig" />
              </div>
              <div>
                <label class="text-[11px] text-surface-500 mb-1 block">最高价格</label>
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
      </div>

      <!-- Platform usage tips -->
      <div class="card p-3">
        <div class="flex items-center gap-1.5 mb-2">
          <svg class="w-3.5 h-3.5 text-ozon-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <span class="text-xs font-medium text-surface-600">使用提示</span>
        </div>
        <div class="text-[11px] text-surface-400 space-y-1.5">
          <template v-if="pageInfo.platform === 'ozon'">
            <p>• 打开 <span class="text-surface-600 font-medium">Ozon</span> 商品页或搜索列表页,点击「一键采集商品」</p>
            <p>• 商品页:自动提取标题、图片、价格、规格等</p>
            <p>• 列表页:可批量滚动采集,支持价格/评分过滤</p>
          </template>
          <template v-else-if="pageInfo.platform === 'wb'">
            <p>• 打开 <span class="text-surface-600 font-medium">Wildberries</span> 商品页或搜索列表页,点击「一键采集商品」</p>
            <p>• 商品页:自动提取标题、图片、价格、规格等</p>
            <p>• 列表页:可批量滚动采集,支持价格/评分过滤</p>
          </template>
          <template v-else-if="pageInfo.platform === '1688'">
            <p>• 打开 <span class="text-surface-600 font-medium">1688</span> 商品页或搜索列表页,点击「一键采集商品」</p>
            <p>• 商品页:自动提取标题、图片、价格、SKU 等</p>
            <p>• 列表页:可批量滚动采集,支持价格过滤</p>
            <p>• 价格单位为人民币 ¥,导入后可自动换算</p>
          </template>
          <template v-else-if="pageInfo.platform === 'pdd'">
            <p>• 打开 <span class="text-surface-600 font-medium">拼多多 / PDD</span> 商品页,点击「一键采集商品」</p>
            <p>• 重点提取类目、颜色/尺码/规格、重量、长宽高等上传必需参数</p>
            <p>• 价格单位为人民币 ¥,规格属性会自动回填到物理规格卡片</p>
          </template>
        </div>
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
                  {{ result.data.price ? ((result.data.platform === '1688' || result.data.platform === 'pdd') ? `¥${result.data.price.toLocaleString()}` : `₽${result.data.price.toLocaleString()}`) : '—' }}
                </span>
                <span v-if="result.data.oldPrice && result.data.oldPrice > result.data.price"
                  class="text-surface-400 text-xs line-through">{{ (result.data.platform === '1688' || result.data.platform === 'pdd') ? '¥' : '₽' }}{{ result.data.oldPrice.toLocaleString() }}</span>
              </div>
              <div class="flex flex-wrap gap-1.5 mt-2">
                <span v-if="result.data.category" class="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium">{{ result.data.category }}</span>
                <span v-if="result.data.brand" class="px-2 py-0.5 rounded-full bg-surface-100 text-surface-600 text-[11px] font-medium">{{ result.data.brand }}</span>
              </div>
            </div>
          </div>

          <div v-if="physicalSpec" class="mt-4 grid grid-cols-2 gap-2">
            <div v-if="physicalSpec.weight" class="rounded-xl bg-amber-50 px-3 py-2">
              <p class="text-[10px] text-amber-600 font-semibold">重量</p>
              <p class="text-xs text-amber-900 font-medium">{{ physicalSpec.weight }}</p>
            </div>
            <div v-if="physicalSpec.size" class="rounded-xl bg-violet-50 px-3 py-2">
              <p class="text-[10px] text-violet-600 font-semibold">尺寸</p>
              <p class="text-xs text-violet-900 font-medium">{{ physicalSpec.size }}</p>
            </div>
            <div v-if="physicalSpec.color" class="rounded-xl bg-rose-50 px-3 py-2">
              <p class="text-[10px] text-rose-600 font-semibold">颜色</p>
              <p class="text-xs text-rose-900 font-medium">{{ physicalSpec.color }}</p>
            </div>
            <div v-if="physicalSpec.skuSize" class="rounded-xl bg-emerald-50 px-3 py-2">
              <p class="text-[10px] text-emerald-600 font-semibold">规格</p>
              <p class="text-xs text-emerald-900 font-medium">{{ physicalSpec.skuSize }}</p>
            </div>
          </div>

          <div v-if="specPreviewRows.length > 1" class="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 overflow-hidden">
            <div class="px-3 py-2 flex items-center justify-between bg-white/70">
              <div>
                <span class="text-xs font-semibold text-emerald-700">SKU 规格明细</span>
                <p class="text-[10px] text-emerald-600/70 mt-0.5">按规格选项回填重量、尺寸、颜色等物理参数</p>
              </div>
              <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-[11px] text-emerald-700">{{ result.data.specList.length }} 组</span>
            </div>
            <div class="max-h-48 overflow-auto divide-y divide-emerald-100 bg-white">
              <div v-for="row in specPreviewRows" :key="`${row.index}-${row.name}`" class="px-3 py-2">
                <div class="flex items-start justify-between gap-2">
                  <p class="text-[11px] font-semibold text-surface-800 break-words">{{ row.name }}</p>
                  <span class="text-[10px] text-surface-400 flex-shrink-0">#{{ row.index }}</span>
                </div>
                <div class="mt-1 flex flex-wrap gap-1.5">
                  <span v-if="row.weight" class="px-1.5 py-0.5 rounded-md bg-amber-50 text-[10px] text-amber-700">重量 {{ row.weight }}</span>
                  <span v-if="row.dimension" class="px-1.5 py-0.5 rounded-md bg-violet-50 text-[10px] text-violet-700">尺寸 {{ row.dimension }}</span>
                  <span v-if="row.color" class="px-1.5 py-0.5 rounded-md bg-rose-50 text-[10px] text-rose-700">颜色 {{ row.color }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="keyAttributes.length" class="mt-4 rounded-2xl border border-surface-100 overflow-hidden bg-white">
            <div class="px-3 py-2 bg-gradient-to-r from-surface-50 to-white flex items-center justify-between">
              <div>
                <span class="text-xs font-semibold text-surface-700">规格属性</span>
                <p class="text-[10px] text-surface-400 mt-0.5">优先展示上传必需的物理规格、颜色、尺寸与商品标识</p>
              </div>
              <span class="px-2 py-0.5 rounded-full bg-surface-100 text-[11px] text-surface-500">{{ result.data.attributes.length }} 项</span>
            </div>
            <div class="max-h-72 overflow-auto p-2 space-y-2">
              <div v-for="group in attributeGroups" :key="group.key" class="rounded-xl border border-surface-100 overflow-hidden">
                <div class="px-2.5 py-1.5 bg-surface-50 flex items-center gap-1.5">
                  <span
                    class="w-1.5 h-1.5 rounded-full"
                    :class="group.color === 'violet' ? 'bg-violet-500' : group.color === 'blue' ? 'bg-blue-500' : 'bg-surface-400'"
                  ></span>
                  <span class="text-[11px] font-semibold text-surface-600">{{ group.title }}</span>
                </div>
                <div class="divide-y divide-surface-100">
                  <div v-for="attr in group.items" :key="`${group.key}-${attr.name}-${attr.value}`" class="px-2.5 py-2 grid grid-cols-[86px_1fr] gap-2 items-start">
                    <span class="text-[11px] text-surface-500 truncate" :title="attr.name">{{ attr.name }}</span>
                    <span class="text-[11px] text-surface-800 font-medium break-words leading-relaxed">{{ attr.value }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>


