<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import type { PluginSettings } from '@/utils/types'
import { getSettings, saveSettings } from '@/utils/storage'
import { checkBackendHealth } from '@/utils/api'

const settings = reactive<PluginSettings>({
  apiBaseUrl: 'http://localhost:9000',
  autoScrape: true,
  priceMin: 0,
  priceMax: 0,
  minRating: 0,
  minReviews: 0,
  brandWhitelist: [],
  brandBlacklist: [],
})

const saving = ref(false)
const saved = ref(false)
const backendOk = ref<boolean | null>(null)
const brandInput = ref('')
const blacklistInput = ref('')

async function loadSettings() {
  const s = await getSettings()
  Object.assign(settings, s)
}

async function checkBackend() {
  backendOk.value = null
  backendOk.value = await checkBackendHealth()
}

async function doSave() {
  saving.value = true
  saved.value = false
  await saveSettings({ ...settings })
  saving.value = false
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}

function addWhitelistBrand() {
  const v = brandInput.value.trim()
  if (v && !settings.brandWhitelist.includes(v)) {
    settings.brandWhitelist.push(v)
    brandInput.value = ''
  }
}

function removeWhitelistBrand(brand: string) {
  settings.brandWhitelist = settings.brandWhitelist.filter((b) => b !== brand)
}

function addBlacklistBrand() {
  const v = blacklistInput.value.trim()
  if (v && !settings.brandBlacklist.includes(v)) {
    settings.brandBlacklist.push(v)
    blacklistInput.value = ''
  }
}

function removeBlacklistBrand(brand: string) {
  settings.brandBlacklist = settings.brandBlacklist.filter((b) => b !== brand)
}

onMounted(async () => {
  await loadSettings()
  await checkBackend()
})
</script>

<template>
  <div class="p-4 space-y-4 animate-fade-in">
    <!-- Backend Connection -->
    <div class="card p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold text-surface-700 uppercase tracking-wider">后端连接</h3>
        <div class="flex items-center gap-1.5">
          <span
            class="w-2 h-2 rounded-full transition-colors duration-300"
            :class="backendOk === null ? 'bg-surface-300 animate-pulse' : backendOk ? 'bg-emerald-500' : 'bg-red-500'"
          />
          <span class="text-[11px]" :class="backendOk === null ? 'text-surface-400' : backendOk ? 'text-emerald-600' : 'text-red-500'">
            {{ backendOk === null ? '检测中...' : backendOk ? '已连接' : '未连接' }}
          </span>
        </div>
      </div>
      <div class="flex gap-2">
        <input
          v-model="settings.apiBaseUrl"
          type="url"
          class="input-field text-xs flex-1"
          placeholder="http://localhost:9000"
        />
        <button @click="checkBackend" class="btn-ghost text-xs px-3">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Auto Scrape -->
    <div class="card p-4">
      <h3 class="text-xs font-semibold text-surface-700 uppercase tracking-wider mb-3">采集设置</h3>

      <div class="flex items-center justify-between py-2">
        <div>
          <p class="text-sm text-surface-800 font-medium">自动采集</p>
          <p class="text-[11px] text-surface-400 mt-0.5">进入商品页时自动采集数据</p>
        </div>
        <button
          @click="settings.autoScrape = !settings.autoScrape"
          class="relative w-11 h-6 rounded-full transition-colors duration-200"
          :class="settings.autoScrape ? 'bg-ozon-500' : 'bg-surface-200'"
        >
          <span
            class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
            :class="settings.autoScrape ? 'translate-x-[22px]' : 'translate-x-0.5'"
          />
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="card p-4">
      <h3 class="text-xs font-semibold text-surface-700 uppercase tracking-wider mb-3">过滤条件</h3>
      <div class="space-y-3">
        <!-- Price Range -->
        <div>
          <label class="text-xs text-surface-500 mb-1 block">价格区间 (RUB)</label>
          <div class="flex gap-2">
            <input
              v-model.number="settings.priceMin"
              type="number"
              class="input-field text-xs"
              placeholder="最低"
              min="0"
            />
            <span class="text-surface-300 self-center text-xs">—</span>
            <input
              v-model.number="settings.priceMax"
              type="number"
              class="input-field text-xs"
              placeholder="最高"
              min="0"
            />
          </div>
        </div>

        <!-- Rating -->
        <div>
          <label class="text-xs text-surface-500 mb-1 block">最低评分</label>
          <div class="flex items-center gap-3">
            <input
              v-model.number="settings.minRating"
              type="range"
              min="0"
              max="5"
              step="0.1"
              class="flex-1 h-1.5 bg-surface-200 rounded-full appearance-none cursor-pointer accent-amber-400"
            />
            <span class="text-xs font-medium text-surface-700 w-6 text-right">{{ settings.minRating }}</span>
          </div>
        </div>

        <!-- Min Reviews -->
        <div>
          <label class="text-xs text-surface-500 mb-1 block">最低评价数量</label>
          <input
            v-model.number="settings.minReviews"
            type="number"
            class="input-field text-xs"
            placeholder="0"
            min="0"
          />
        </div>
      </div>
    </div>

    <!-- Brand Whitelist -->
    <div class="card p-4">
      <h3 class="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">品牌白名单</h3>
      <p class="text-[11px] text-surface-400 mb-2">仅采集以下品牌</p>
      <div class="flex gap-2 mb-2">
        <input
          v-model="brandInput"
          type="text"
          class="input-field text-xs flex-1"
          placeholder="输入品牌名..."
          @keydown.enter="addWhitelistBrand"
        />
        <button @click="addWhitelistBrand" class="btn-ghost text-xs px-2.5 py-1.5">添加</button>
      </div>
      <div v-if="settings.brandWhitelist.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="brand in settings.brandWhitelist"
          :key="brand"
          class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[11px] font-medium px-2 py-0.5 rounded-full"
        >
          {{ brand }}
          <button @click="removeWhitelistBrand(brand)" class="hover:text-emerald-900">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      </div>
    </div>

    <!-- Brand Blacklist -->
    <div class="card p-4">
      <h3 class="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2">品牌黑名单</h3>
      <p class="text-[11px] text-surface-400 mb-2">排除以下品牌</p>
      <div class="flex gap-2 mb-2">
        <input
          v-model="blacklistInput"
          type="text"
          class="input-field text-xs flex-1"
          placeholder="输入品牌名..."
          @keydown.enter="addBlacklistBrand"
        />
        <button @click="addBlacklistBrand" class="btn-ghost text-xs px-2.5 py-1.5">添加</button>
      </div>
      <div v-if="settings.brandBlacklist.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="brand in settings.brandBlacklist"
          :key="brand"
          class="inline-flex items-center gap-1 bg-red-50 text-red-700 text-[11px] font-medium px-2 py-0.5 rounded-full"
        >
          {{ brand }}
          <button @click="removeBlacklistBrand(brand)" class="hover:text-red-900">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </span>
      </div>
    </div>

    <!-- Save -->
    <button @click="doSave" :disabled="saving" class="w-full btn-brand py-3">
      <svg v-if="saving" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <template v-else-if="saved">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        已保存
      </template>
      <template v-else>保存设置</template>
    </button>
  </div>
</template>
