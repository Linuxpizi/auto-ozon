<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { NAlert, NButton, NCheckbox, NCheckboxGroup, NIcon, NInputNumber, NProgress, NSwitch, NTag } from 'naive-ui'
import { PlayOutline, StopOutline } from '@vicons/ionicons5'
import {
  assertOzonListCrawlStartConfig,
  createDefaultOzonListCrawlStartConfig,
  type OzonListCrawlSnapshot,
} from '@/lib/ozonbox/list-crawl-contract'
import type { OzonboxRuntimeMessage } from '@/lib/ozonbox/contract'
import {
  requirePanelToolData,
  type PanelSelectionRule,
  type PanelToolRequest,
} from '@/lib/ozonbox/panel-tools-contract'

const POLL_INTERVAL_MS = 2000
const SelectionRulesManager = defineAsyncComponent(() => import('./SelectionRulesManager.vue'))

const snapshot = ref<OzonListCrawlSnapshot | null>(null)
const error = ref('')
const polling = ref(false)
const rulesLoading = ref(false)
const startLoading = ref(false)
const defaults = createDefaultOzonListCrawlStartConfig()
const target = ref<number | null>(defaults.target)
const collectVariants = ref(defaults.collectVariants)
const selectionRuleIds = ref<Array<string | number>>([...defaults.selectionRuleIds])
const rules = ref<PanelSelectionRule[]>([])
let pollTimer: ReturnType<typeof setInterval> | undefined

const enabledRules = computed(() => rules.value.filter(rule => rule.enabled))

const isRunning = computed(() => {
  const s = snapshot.value
  return s?.status === 'collecting' || s?.status === 'paused' || s?.status === 'stopping'
})

const couldStart = computed(() => {
  return !snapshot.value
    || snapshot.value.status === 'idle'
    || snapshot.value.status === 'stopped'
    || snapshot.value.status === 'completed'
    || snapshot.value.status === 'error'
})

const statusLabel = computed(() => {
  const s = snapshot.value
  if (!s) return '等待启动'
  switch (s.status) {
    case 'idle': return '待机中'
    case 'collecting': return '采集中'
    case 'paused': return '已暂停'
    case 'stopping': return '正在停止'
    case 'completed': return '采集完成'
    case 'stopped': return '已停止'
    case 'error': return '发生错误'
    default: return s.status
  }
})

const statusType = computed<'info' | 'success' | 'warning' | 'error'>(() => {
  const s = snapshot.value
  if (!s || s.status === 'idle' || s.status === 'stopping') return 'info'
  switch (s.status) {
    case 'collecting': return 'info'
    case 'completed': return 'success'
    case 'paused':
    case 'stopped': return 'warning'
    case 'error': return 'error'
    default: return 'info'
  }
})

const progressPercent = computed(() => {
  const s = snapshot.value
  if (!s || s.target <= 0) return 0
  return Math.min(100, Math.round((s.saved / s.target) * 100))
})

function responseError(response: unknown): string | undefined {
  if (!response || typeof response !== 'object' || !('error' in response)) return undefined
  const value = (response as { error?: unknown }).error
  return typeof value === 'string' && value.trim() ? value : '扩展服务请求失败'
}

async function sendOzonboxMessage(message: OzonboxRuntimeMessage): Promise<unknown> {
  return browser.runtime.sendMessage(message)
}

async function loadSelectionRules() {
  rulesLoading.value = true
  try {
    const request: PanelToolRequest = { type: 'PANEL_SELECTION_LIST' }
    const response = await browser.runtime.sendMessage(request)
    const { data } = requirePanelToolData<PanelSelectionRule[]>(response)
    updateRules(data)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    rulesLoading.value = false
  }
}

function updateRules(nextRules: PanelSelectionRule[]) {
  rules.value = nextRules
  const enabledIds = new Set(nextRules.filter(rule => rule.enabled).map(rule => rule.id))
  selectionRuleIds.value = selectionRuleIds.value.filter(id => enabledIds.has(Number(id)))
}

async function startCrawl() {
  error.value = ''
  startLoading.value = true
  try {
    const config = assertOzonListCrawlStartConfig({
      target: target.value,
      collectVariants: collectVariants.value,
      selectionRuleIds: selectionRuleIds.value.map(Number),
    })
    if (config.selectionRuleIds.length === 0) throw new Error('请至少选择一条启用的选品规则')
    const response = await sendOzonboxMessage({ type: 'OZONBOX_LIST_CRAWL_START', config })
    const failure = responseError(response)
    if (failure) throw new Error(failure)
    if (response && typeof response === 'object') snapshot.value = response as OzonListCrawlSnapshot
    startPolling()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    startLoading.value = false
  }
}

async function stopCrawl() {
  error.value = ''
  try {
    const response = await sendOzonboxMessage({ type: 'OZONBOX_LIST_CRAWL_STOP' })
    const failure = responseError(response)
    if (failure) throw new Error(failure)
    stopPolling()
    await fetchSnapshot()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}

async function fetchSnapshot() {
  try {
    const response = await sendOzonboxMessage({ type: 'OZONBOX_LIST_CRAWL_SNAPSHOT' })
    if (response && typeof response === 'object') {
      const failure = responseError(response)
      if (failure) throw new Error(failure)
      snapshot.value = response as OzonListCrawlSnapshot
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}

function startPolling() {
  stopPolling()
  polling.value = true
  pollTimer = setInterval(() => {
    void fetchSnapshot()
  }, POLL_INTERVAL_MS)
}

function stopPolling() {
  polling.value = false
  if (pollTimer !== undefined) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
}

onMounted(async () => {
  await Promise.all([fetchSnapshot(), loadSelectionRules()])
  const s = snapshot.value
  if (s && (s.status === 'collecting' || s.status === 'paused')) {
    startPolling()
  }
})

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="panel-stack">
    <div class="list-panel">
      <div class="panel-header">
        <div class="card-title">Ozon 列表采集</div>
        <NTag :type="statusType" size="small" round :bordered="false">{{ statusLabel }}</NTag>
      </div>

      <NProgress
        v-if="snapshot"
        :value="progressPercent"
        indicator-placement="inside"
        :height="18"
        :border-radius="4"
        :fill-bar-color="progressPercent >= 100 ? '#16a34a' : '#1677ff'"
        class="progress-bar"
      />

      <div v-if="snapshot" class="counts-grid">
        <div class="count-item">
          <span class="count-label">目标命中</span>
          <span class="count-value primary">{{ snapshot.saved }}/{{ snapshot.target }}</span>
        </div>
        <div class="count-item">
          <span class="count-label">已发现</span>
          <span class="count-value">{{ snapshot.collected }}</span>
        </div>
        <div class="count-item">
          <span class="count-label">已跳过</span>
          <span class="count-value">{{ snapshot.skipped }}</span>
        </div>
        <div class="count-item">
          <span class="count-label">待处理</span>
          <span class="count-value">{{ snapshot.pending }}</span>
        </div>
        <div class="count-item">
          <span class="count-label">失败</span>
          <span class="count-value error">{{ snapshot.failed }}</span>
        </div>
      </div>

      <p v-if="snapshot?.message" class="status-message">{{ snapshot.message }}</p>

      <div v-if="!isRunning" class="start-config" aria-label="启动爬虫配置">
        <label class="config-label" for="ozon-list-crawl-target">目标采集数目</label>
        <NInputNumber
          id="ozon-list-crawl-target"
          v-model:value="target"
          :min="1"
          :precision="0"
          :step="1"
          placeholder="请输入目标数量"
        />
        <p class="config-hint">仅统计命中所选规则且成功上报的商品，默认 100。</p>

        <div class="variant-row">
          <div>
            <div class="config-label">是否采集 SKU 变体</div>
            <p class="config-hint">默认关闭：只采集当前 SKU，不采集 SKU 变体。</p>
          </div>
          <NSwitch v-model:value="collectVariants" aria-label="是否采集 SKU 变体" />
        </div>

        <div class="config-label">本次启动使用的选品规则</div>
        <p v-if="rulesLoading" class="config-hint">正在读取启用的选品规则…</p>
        <NAlert v-else-if="enabledRules.length === 0" type="warning" :bordered="false">
          暂无启用的选品规则，请在下方新增或启用规则。
        </NAlert>
        <NCheckboxGroup v-else v-model:value="selectionRuleIds" class="rule-list">
          <NCheckbox v-for="rule in enabledRules" :key="rule.id" :value="rule.id" :label="rule.name" />
        </NCheckboxGroup>

        <SelectionRulesManager :rules="rules" :loading="rulesLoading" @update:rules="updateRules" />
      </div>

      <div class="panel-actions">
        <NButton
          v-if="!isRunning"
          type="primary"
          block
          size="large"
          class="panel-primary-button"
          :loading="startLoading"
          :disabled="rulesLoading || enabledRules.length === 0 || selectionRuleIds.length === 0"
          @click="startCrawl"
        >
          <template #icon><NIcon :component="PlayOutline" /></template>
          {{ couldStart ? '开始采集' : '重新采集' }}
        </NButton>
        <NButton
          v-else
          type="warning"
          block
          size="large"
          @click="stopCrawl"
        >
          <template #icon><NIcon :component="StopOutline" /></template>
          {{ snapshot?.status === 'paused' ? '停止并退出' : '停止采集' }}
        </NButton>
      </div>

      <NAlert v-if="error" type="error" closable class="panel-alert" @close="error = ''">
        {{ error }}
      </NAlert>
    </div>
  </div>
</template>

<style scoped>
.panel-stack { display: flex; flex-direction: column; gap: 10px; }
.list-panel { padding: 14px; border-radius: 12px; background: #fff; }
.panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.card-title { color: #262626; font-size: 14px; font-weight: 600; }
.progress-bar { margin: 8px 0; }
.counts-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin: 10px 0; }
.count-item { display: flex; flex-direction: column; padding: 8px; border-radius: 8px; background: #f5f5f7; }
.count-label { color: #8c8c8c; font-size: 11px; line-height: 1.4; }
.count-value { color: #262626; font-size: 15px; font-weight: 700; line-height: 1.3; }
.count-value.primary { color: #1677ff; }
.count-value.error { color: #ef4444; }
.status-message { margin: 6px 0 0; color: #595959; font-size: 12px; line-height: 1.5; word-break: break-all; }
.start-config { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #f0f0f0; }
.config-label { color: #262626; font-size: 12px; font-weight: 600; }
.config-hint { margin: -4px 0 2px; color: #8c8c8c; font-size: 11px; line-height: 1.45; }
.variant-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.variant-row > div { min-width: 0; }
.variant-row .config-hint { margin: 2px 0 0; }
.rule-list { display: flex; max-height: 112px; flex-direction: column; gap: 6px; overflow-y: auto; padding: 8px; border: 1px solid #e5e7eb; border-radius: 8px; }
.panel-actions { margin-top: 10px; }
.panel-alert { margin-top: 10px; }
</style>
