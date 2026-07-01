<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import ScrapPanel from '@/components/ScrapPanel.vue'
import RecordsPanel from '@/components/RecordsPanel.vue'
import { checkBackendHealth } from '@/utils/api'

type Tab = 'scrap' | 'records'

const activeTab = ref<Tab>('scrap')
const backendOk = ref<boolean | null>(null)

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'scrap', label: '采集', icon: 'scan' },
  { id: 'records', label: '记录', icon: 'list' },
]

async function checkBackend() {
  backendOk.value = await checkBackendHealth()
}

onMounted(checkBackend)

watch(activeTab, (tab) => {
  if (tab === 'records') checkBackend()
})
</script>

<template>
  <div class="w-[380px] min-h-[520px] flex flex-col bg-surface-50 overflow-hidden">
    <!-- Header -->
    <header class="relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-br from-ozon-600 via-ozon-500 to-brand-500" />
      <div class="absolute inset-0 opacity-10">
        <div class="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/20" />
        <div class="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/15" />
      </div>
      <div class="relative px-5 pt-5 pb-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <div>
              <h1 class="text-white font-semibold text-sm tracking-tight">Auto-Ozon</h1>
              <p class="text-white/60 text-[11px]">智能采集助手</p>
            </div>
          </div>
          <div v-if="backendOk === true" class="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-2.5 py-1">
            <span class="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span class="text-white text-[11px] font-medium">已连接</span>
          </div>
          <div v-else-if="backendOk === false" class="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-2.5 py-1">
            <span class="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span class="text-white text-[11px] font-medium">未连接</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Tab Navigation -->
    <nav class="relative flex bg-white border-b border-surface-100 px-2 pt-1">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all duration-200 relative"
        :class="[
          activeTab === tab.id
            ? 'text-ozon-600'
            : 'text-surface-400 hover:text-surface-600',
        ]"
      >
        <!-- Scan icon -->
        <svg v-if="tab.icon === 'scan'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
        </svg>

        <!-- List icon -->
        <svg v-if="tab.icon === 'list'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <span>{{ tab.label }}</span>
        <!-- Active indicator -->
        <div
          v-if="activeTab === tab.id"
          class="absolute bottom-0 left-3 right-3 h-0.5 bg-ozon-500 rounded-full"
        />
      </button>
    </nav>

    <!-- Content -->
    <main class="flex-1 overflow-y-auto overflow-x-hidden">
      <Transition name="fade" mode="out-in">
        <ScrapPanel v-if="activeTab === 'scrap'" :key="'scrap'" @refresh="refreshBadge" />
        <RecordsPanel v-else-if="activeTab === 'records'" :key="'records'" @refresh="refreshBadge" />
      </Transition>
    </main>
  </div>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
