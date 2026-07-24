<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { NAlert, NButton, NIcon, NProgress, NTag } from 'naive-ui'
import { PlayOutline, StopOutline } from '@vicons/ionicons5'
import type { OzonListCrawlSnapshot } from '@/lib/ozonbox/list-crawl-contract'

const POLL_INTERVAL_MS = 2000

const snapshot = ref<OzonListCrawlSnapshot | null>(null)
const error = ref('')
const polling = ref(false)
let pollTimer: ReturnType<typeof setInterval> | undefined

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

async function sendOzonboxMessage(type: string): Promise<unknown> {
  return browser.runtime.sendMessage({ type } as any)
}

async function startCrawl() {
  error.value = ''
  try {
    const response = await sendOzonboxMessage('OZONBOX_LIST_CRAWL_START')
    if (response && typeof response === 'object' && 'error' in response) {
      error.value = (response as any).error as string
      return
    }
    startPolling()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}

async function stopCrawl() {
  error.value = ''
  try {
    await sendOzonboxMessage('OZONBOX_LIST_CRAWL_STOP')
    stopPolling()
    await fetchSnapshot()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}

async function fetchSnapshot() {
  try {
    const response = await sendOzonboxMessage('OZONBOX_LIST_CRAWL_SNAPSHOT')
    if (response && typeof response === 'object') {
      if ('error' in response) {
        error.value = (response as any).error as string
        return
      }
      snapshot.value = response as OzonListCrawlSnapshot
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}

function startPolling() {
  polling.value = true
  stopPolling()
  pollTimer = setInterval(() => {
    fetchSnapshot()
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
  await fetchSnapshot()
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

      <div class="panel-actions">
        <NButton
          v-if="!isRunning"
          type="primary"
          block
          size="large"
          class="panel-primary-button"
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
.panel-actions { margin-top: 10px; }
.panel-alert { margin-top: 10px; }
</style>
