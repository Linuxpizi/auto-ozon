<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  NConfigProvider,
  NDialogProvider,
  NIcon,
  NMessageProvider,
  NTabPane,
  NTabs,
  type GlobalThemeOverrides,
} from 'naive-ui'
import {
  CloudDoneOutline,
  CloudOfflineOutline,
  CloudOutline,
  CubeOutline,
  PulseOutline,
} from '@vicons/ionicons5'
import RecordsPanel from '@/components/popup/RecordsPanel.vue'
import ScrapePanel from '@/components/popup/ScrapePanel.vue'
import { checkBackendHealth } from '@/lib/utils/api'
import packageJson from '@/package.json'

const activeTab = ref('scrape')
const backendOk = ref<boolean | null>(null)
const extensionName = packageJson.displayName || packageJson.name
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#5b5cf0',
    primaryColorHover: '#7475f4',
    primaryColorPressed: '#4546d7',
    primaryColorSuppl: '#5b5cf0',
    successColor: '#16a273',
    warningColor: '#d58a13',
    errorColor: '#dd5365',
    borderRadius: '10px',
    fontSize: '13px',
  },
  Button: { borderRadiusMedium: '10px', borderRadiusLarge: '12px' },
  Card: { borderRadius: '16px' },
  Tabs: { tabFontWeightActive: '650' },
}
const connectionLabel = computed(() => backendOk.value === null ? '检测中' : backendOk.value ? '服务正常' : '服务离线')
const connectionType = computed(() => backendOk.value === null ? 'pending' : backendOk.value ? 'online' : 'offline')
const connectionIcon = computed(() => backendOk.value === null ? CloudOutline : backendOk.value ? CloudDoneOutline : CloudOfflineOutline)

async function refreshBackend() {
  backendOk.value = null
  backendOk.value = await checkBackendHealth()
}

onMounted(refreshBackend)
watch(activeTab, (tab) => tab === 'records' && refreshBackend())
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NDialogProvider>
      <NMessageProvider>
        <main class="popup-shell">
          <header class="app-header">
            <div class="brand-mark" aria-hidden="true"><NIcon :component="CubeOutline" /></div>
            <div class="brand-copy">
              <div><strong>{{ extensionName }}</strong><span class="version">v{{ packageJson.version }}</span></div>
              <span>跨境商品采集工作台</span>
            </div>
            <button class="connection" :class="connectionType" type="button" @click="refreshBackend">
              <NIcon :component="connectionIcon" />
              <span>{{ connectionLabel }}</span>
            </button>
          </header>

          <div class="workspace-heading">
            <div>
              <span class="eyebrow"><NIcon :component="PulseOutline" />Extension workspace</span>
              <h1>商品采集控制台</h1>
            </div>
            <span class="platform-count">4 个平台</span>
          </div>

          <NTabs v-model:value="activeTab" type="segment" animated class="app-tabs">
            <NTabPane name="scrape" tab="采集中心"><ScrapePanel /></NTabPane>
            <NTabPane name="records" tab="采集记录"><RecordsPanel /></NTabPane>
          </NTabs>
        </main>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>

<style scoped>
.popup-shell { width: 420px; min-height: 600px; padding-bottom: 16px; overflow: hidden; background: #f4f5fa; }
.app-header { height: 78px; padding: 16px 18px; display: flex; align-items: center; gap: 12px; color: white; background: linear-gradient(125deg, #25275f, #4748c9 58%, #6b55d9); position: relative; overflow: hidden; }
.app-header::before, .app-header::after { content: ''; position: absolute; border-radius: 50%; background: rgba(255,255,255,.08); pointer-events: none; }
.app-header::before { width: 150px; height: 150px; right: -58px; top: -100px; }
.app-header::after { width: 82px; height: 82px; left: 190px; bottom: -68px; }
.brand-mark { width: 42px; height: 42px; flex: none; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.2); border-radius: 13px; background: rgba(255,255,255,.14); font-size: 22px; box-shadow: inset 0 1px 0 rgba(255,255,255,.2); }
.brand-copy { min-width: 0; display: flex; flex: 1; flex-direction: column; gap: 2px; line-height: 1.35; }
.brand-copy > div { display: flex; align-items: center; gap: 7px; }
.brand-copy strong { max-width: 155px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; letter-spacing: .01em; }
.brand-copy > span { color: rgba(255,255,255,.62); font-size: 11px; }
.version { padding: 2px 5px; border-radius: 5px; color: rgba(255,255,255,.75); background: rgba(255,255,255,.1); font-size: 9px; }
.connection { z-index: 1; display: flex; align-items: center; gap: 5px; padding: 7px 9px; border: 1px solid rgba(255,255,255,.13); border-radius: 999px; color: rgba(255,255,255,.88); background: rgba(20,20,60,.16); cursor: pointer; font-size: 10px; transition: background .2s ease; }
.connection:hover { background: rgba(255,255,255,.16); }
.connection .n-icon { font-size: 14px; color: #f8c65b; }
.connection.online .n-icon { color: #68e1b4; }
.connection.offline .n-icon { color: #ff8998; }
.workspace-heading { padding: 18px 18px 14px; display: flex; align-items: flex-end; justify-content: space-between; }
.workspace-heading h1 { margin: 5px 0 0; color: #202236; font-size: 20px; line-height: 1.15; }
.eyebrow { display: inline-flex; align-items: center; gap: 5px; color: #777b91; font-size: 10px; font-weight: 650; letter-spacing: .09em; text-transform: uppercase; }
.platform-count { padding: 5px 8px; border: 1px solid #e0e1ea; border-radius: 8px; color: #73768b; background: rgba(255,255,255,.7); font-size: 10px; }
.app-tabs { padding: 0 14px; }
.app-tabs :deep(.n-tabs-rail) { padding: 4px; border: 1px solid #e7e8ef; background: #e9eaf1; }
.app-tabs :deep(.n-tabs-tab) { font-size: 12px; }
.app-tabs :deep(.n-tabs-pane-wrapper) { margin-top: 12px; }
</style>