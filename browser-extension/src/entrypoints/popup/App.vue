<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import ScrapPanel from '@/components/ScrapPanel.vue'
import RecordsPanel from '@/components/RecordsPanel.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import { getUnsyncedCount } from '@/utils/storage'

type Tab = 'scrap' | 'records' | 'settings'

const activeTab = ref<Tab>('scrap')
const unsyncedCount = ref(0)

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'scrap', label: '采集', icon: 'scan' },
  { id: 'records', label: '记录', icon: 'list' },
  { id: 'settings', label: '设置', icon: 'settings' },
]

async function refreshBadge() {
  unsyncedCount.value = await getUnsyncedCount()
}

onMounted(refreshBadge)

watch(activeTab, (tab) => {
  if (tab === 'records') refreshBadge()
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
          <div v-if="unsyncedCount > 0" class="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm rounded-full px-2.5 py-1">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-soft" />
            <span class="text-white text-[11px] font-medium">{{ unsyncedCount }} 待同步</span>
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
        <!-- Settings icon -->
        <svg v-if="tab.icon === 'settings'" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
        <SettingsPanel v-else :key="'settings'" />
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
