<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NConfigProvider, NDialogProvider, NMessageProvider, NTabPane, NTabs, type GlobalThemeOverrides } from 'naive-ui'
import ScrapePanel from './components/ScrapePanel.vue'
import RecordsPanel from './components/RecordsPanel.vue'
import { checkBackendHealth } from '@/utils/api'
import packageJson from '@/package.json'

const activeTab = ref('scrape')
const backendOk = ref<boolean | null>(null)
const extensionName = `${packageJson.name} v${packageJson.version}`
const themeOverrides: GlobalThemeOverrides = {
  common: { primaryColor: '#2563eb', primaryColorHover: '#3b82f6', primaryColorPressed: '#1d4ed8', primaryColorSuppl: '#2563eb', borderRadius: '10px', fontSize: '13px' },
  Card: { borderRadius: '14px' },
}
const connectionLabel = computed(() => backendOk.value === null ? '检测中' : backendOk.value ? '服务正常' : '服务离线')
const connectionClass = computed(() => backendOk.value === null ? 'pending' : backendOk.value ? 'online' : 'offline')
async function refreshBackend() { backendOk.value = null; backendOk.value = await checkBackendHealth() }
onMounted(refreshBackend)
watch(activeTab, (tab) => tab === 'records' && refreshBackend())
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NDialogProvider><NMessageProvider>
      <div class="popup-shell">
        <header class="app-header">
          <div class="brand-mark">鲸</div>
          <div class="brand-copy"><strong>{{ extensionName }}</strong><span>跨境商品采集助手</span></div>
          <button class="connection" :class="connectionClass" @click="refreshBackend"><i />{{ connectionLabel }}</button>
        </header>
        <NTabs v-model:value="activeTab" type="line" animated justify-content="space-evenly" class="app-tabs">
          <NTabPane name="scrape" tab="采集中心"><ScrapePanel /></NTabPane>
          <NTabPane name="records" tab="采集记录"><RecordsPanel /></NTabPane>
        </NTabs>
      </div>
    </NMessageProvider></NDialogProvider>
  </NConfigProvider>
</template>

<style scoped>
.popup-shell { width: 400px; min-height: 560px; background: #f5f7fb; }
.app-header { height: 76px; padding: 16px 18px; display: flex; align-items: center; gap: 11px; color: white; background: linear-gradient(125deg,#172554,#1d4ed8 58%,#4f46e5); position: relative; overflow: hidden; }
.app-header::after { content:''; position:absolute; width:130px; height:130px; border-radius:50%; right:-45px; top:-70px; background:rgba(255,255,255,.1); }
.brand-mark { width:38px; height:38px; display:grid; place-items:center; border-radius:12px; background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.24); font-size:18px; font-weight:700; }
.brand-copy { display:flex; flex-direction:column; flex:1; line-height:1.35; }
.brand-copy strong { font-size:15px; } .brand-copy span { font-size:11px; color:rgba(255,255,255,.65); }
.connection { z-index:1; display:flex; align-items:center; gap:6px; padding:6px 9px; border:0; border-radius:999px; color:white; background:rgba(255,255,255,.12); cursor:pointer; font-size:11px; }
.connection i { width:7px; height:7px; border-radius:50%; background:#fbbf24; } .connection.online i { background:#4ade80; } .connection.offline i { background:#fb7185; }
.app-tabs { background:white; } .app-tabs :deep(.n-tabs-nav) { padding:0 18px; box-shadow:0 1px 0 #edf0f5; }
.app-tabs :deep(.n-tabs-tab) { padding:13px 24px 11px; font-weight:600; } .app-tabs :deep(.n-tab-pane) { background:#f5f7fb; padding:14px; min-height:437px; }
</style>