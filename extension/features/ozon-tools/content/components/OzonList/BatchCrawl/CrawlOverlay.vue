<template>
  <Teleport to="body">
    <div v-if="snapshot.visible" class="mjgd_crawl_root">
      <div v-show="overlayVisible" class="mjgd_crawl_log_overlay">
        <button type="button" class="mjgd_crawl_overlay_close_btn" aria-label="关闭" @click="handleOverlayClose">×</button>
        <div class="mjgd_crawl_log_container">
          <div class="mjgd_crawl_log_inner">
            <div ref="logStreamRef" class="mjgd_crawl_log_stream mjgd_crawl_mono">
              <TransitionGroup tag="div" name="mjgd_crawl_log" class="mjgd_crawl_log_stream_inner">
                <div
                  v-for="line in snapshot.logs"
                  :key="line.id"
                  class="mjgd_crawl_log_line"
                >
                  <span class="mjgd_crawl_log_time">{{ line.time }}</span>
                  <span class="mjgd_crawl_log_level" :class="levelClass(line.level)">{{ levelLabel(line.level) }}</span>
                  <span class="mjgd_crawl_log_msg" v-html="line.message"></span>
                </div>
              </TransitionGroup>
            </div>
          </div>
        </div>
      </div>

      <div class="mjgd_crawl_modal_shell">
        <div class="mjgd_crawl_dialog">
          <div
            class="mjgd_crawl_confirm_layer"
            :class="{ mjgd_crawl_confirm_show: showConfirm }"
          >
            <div class="mjgd_crawl_confirm_card">
              <div class="mjgd_crawl_confirm_header">
                <div class="mjgd_crawl_confirm_tag">CLOSE WARNING</div>
                <div class="mjgd_crawl_confirm_title">关闭确认</div>
              </div>
              <div class="mjgd_crawl_confirm_body">
                <div class="mjgd_crawl_confirm_msg">
                  关闭后爬取数据将清空，当前采集结果、导出进度及日志状态将被重置。
                </div>
                <div class="mjgd_crawl_confirm_actions">
                  <button
                    type="button"
                    class="mjgd_crawl_confirm_btn mjgd_crawl_confirm_btn_cancel"
                    @click="showConfirm = false"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    class="mjgd_crawl_confirm_btn mjgd_crawl_confirm_btn_danger"
                    @click="confirmClose"
                  >
                    确认关闭
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="mjgd_crawl_dialog_header">
            <div class="mjgd_crawl_dialog_titles">
              <div class="mjgd_crawl_dialog_title_row">
                <img :src="logoUrl" alt="logo" class="mjgd_crawl_dialog_brand_logo" />
                <span class="mjgd_crawl_dialog_brand_name">Auto Ozon</span>
                <h2 class="mjgd_crawl_dialog_title">商品信息采集</h2>
              </div>
              <p class="mjgd_crawl_dialog_subtitle">实时查看采集状态及导出进度</p>
            </div>
            <button type="button" class="mjgd_crawl_close_btn" @click="requestClose">×</button>
          </div>

          <div class="mjgd_crawl_dialog_content">
            <div class="mjgd_crawl_stats_card">
              <div class="mjgd_crawl_stats_label">已采集数量</div>
              <div class="mjgd_crawl_stats_count">{{ formattedCount }}</div>
              <div class="mjgd_crawl_stats_badge">
                <span v-show="showPulseDot" class="mjgd_crawl_pulse_dot"></span>
                <span>{{ badgeText }}</span>
              </div>
            </div>

            <div class="mjgd_crawl_status_row">
              <div>
                <div class="mjgd_crawl_status_label">当前状态</div>
                <div class="mjgd_crawl_status_value">
                  <span class="mjgd_crawl_dot" :class="statusDotClass"></span>
                  <span class="mjgd_crawl_status_text">{{ statusText }}</span>
                </div>
              </div>
              <div class="mjgd_crawl_progress_label">
                导出进度
                <span class="mjgd_crawl_progress_num">
                  {{ snapshot.exportProgress }}/{{ snapshot.exportTotal }}
                </span>
              </div>
            </div>

            <div class="mjgd_crawl_progress_track">
              <div
                class="mjgd_crawl_progress_bar"
                :style="{ width: exportPercent + '%' }"
              ></div>
            </div>
          </div>

          <div class="mjgd_crawl_dialog_footer">
            <div
              v-show="showCollectActions"
              class="mjgd_crawl_action_group"
            >
              <button
                type="button"
                class="mjgd_crawl_btn"
                :class="pauseBtnClass"
                @click="handlePauseResume"
              >
                {{ pauseBtnText }}
              </button>
              <button
                type="button"
                class="mjgd_crawl_btn mjgd_crawl_btn_stop"
                @click="handleStop"
              >
                停止
              </button>
            </div>
            <div
              v-show="showResultActions"
              class="mjgd_crawl_action_group"
            >
              <button
                type="button"
                class="mjgd_crawl_btn"
                :class="exportBtnClass"
                :disabled="!exportEnabled"
                @click="handleExport"
              >
                {{ exportBtnText }}
              </button>
              <button
                type="button"
                class="mjgd_crawl_btn"
                :class="clearBtnClass"
                :disabled="clearDisabled"
                @click="handleClear"
              >
                清理数据
              </button>
              <div class="mjgd_crawl_tooltip_wrap">
                <div class="mjgd_crawl_help_icon">?</div>
                <div class="mjgd_crawl_tooltip_box">
                  导出配置路径：偏好设置 → 自动爬取设置 → 导出字段 / 速度
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { resolveAssetUrl } from '../../../../utils/runtime'
import fallbackLogoUrl from '../../../../assets/img/newlogo.png'
import type { CrawlLogLevel } from '../../../utils/ozonBatchCrawl/types'
import {
  clearBatchCrawlData,
  closeBatchCrawlOverlay,
  exportCrawlToExcel,
  getCrawlSnapshot,
  pauseBatchCrawl,
  pauseBatchCrawlFromOverlayClose,
  resumeBatchCrawl,
  stopBatchCrawl,
  subscribeCrawlState,
} from '../../../utils/ozonBatchCrawl/crawlController'

// 内容脚本里 raw import 的资源 URL 会相对宿主页(ozon.ru)解析而 404；
// 统一走 resolveAssetUrl → chrome.runtime.getURL，拿到扩展内的绝对地址（对齐其它组件 logo）
const logoUrl = resolveAssetUrl('src/assets/img/newlogo.png', fallbackLogoUrl)

const snapshot = ref(getCrawlSnapshot())
const showConfirm = ref(false)
const overlayVisible = ref(true)
const logStreamRef = ref<HTMLElement | null>(null)
let unsubscribe: (() => void) | null = null

const isCollecting = computed(() => snapshot.value.status === 'collecting')
const isPaused = computed(() => snapshot.value.status === 'paused')
const isStopped = computed(() => snapshot.value.status === 'stopped')
const isExportDone = computed(() => snapshot.value.status === 'export_done')
const isClearedReady = computed(() => snapshot.value.status === 'cleared_ready')
const hasData = computed(() => snapshot.value.count > 0)

const formattedCount = computed(() => snapshot.value.count.toLocaleString('zh-CN'))

const statusText = computed(() => {
  if (snapshot.value.isExporting) return '导出中'
  switch (snapshot.value.status) {
    case 'collecting':
      return '采集中'
    case 'paused':
      return '已暂停'
    case 'stopped':
      return '已停止'
    case 'export_done':
      return '导出完成'
    case 'cleared_ready':
      return '数据已清空'
    default:
      return '待机'
  }
})

const statusDotClass = computed(() => {
  if (snapshot.value.isExporting) return 'mjgd_crawl_dot_cyan'
  switch (snapshot.value.status) {
    case 'collecting':
      return 'mjgd_crawl_dot_emerald'
    case 'paused':
      return 'mjgd_crawl_dot_amber'
    case 'stopped':
      return 'mjgd_crawl_dot_rose'
    case 'export_done':
      return 'mjgd_crawl_dot_emerald'
    case 'cleared_ready':
      return 'mjgd_crawl_dot_slate'
    default:
      return 'mjgd_crawl_dot_slate'
  }
})

const badgeText = computed(() => {
  if (snapshot.value.isExporting) return '正在导出数据...'
  switch (snapshot.value.status) {
    case 'collecting':
      return '数据流持续刷新中'
    case 'paused':
      return '采集已暂停'
    case 'stopped':
      return '等待导出或继续'
    case 'export_done':
      return '导出已完成，可再次导出'
    case 'cleared_ready':
      return '等待继续采集'
    default:
      return '可导出或清理数据'
  }
})

const showPulseDot = computed(
  () => isCollecting.value || snapshot.value.isExporting,
)

const exportPercent = computed(() => {
  if (!snapshot.value.exportTotal) return 0
  return Math.round(
    (snapshot.value.exportProgress / snapshot.value.exportTotal) * 100,
  )
})

const showCollectActions = computed(
  () =>
    isCollecting.value ||
    isPaused.value ||
    isClearedReady.value,
)

const showResultActions = computed(
  () =>
    isStopped.value ||
    isExportDone.value ||
    snapshot.value.isExporting ||
    (!showCollectActions.value && hasData.value),
)

const pauseBtnText = computed(() => (isCollecting.value ? '暂停' : '继续'))

const pauseBtnClass = computed(() =>
  isCollecting.value ? 'mjgd_crawl_btn_pause' : 'mjgd_crawl_btn_continue',
)

const exportEnabled = computed(
  () => hasData.value && !snapshot.value.isExporting && !snapshot.value.isCookieChecking,
)

const exportBtnText = computed(() =>
  snapshot.value.isCookieChecking ? 'Cookie检测中...' : '导出',
)

const exportBtnClass = computed(() =>
  exportEnabled.value ? 'mjgd_crawl_btn_export' : 'mjgd_crawl_btn_export_disabled',
)

const clearDisabled = computed(() => snapshot.value.isExporting)

const clearBtnClass = computed(() =>
  clearDisabled.value ? 'mjgd_crawl_btn_clear_disabled' : 'mjgd_crawl_btn_clear',
)

function levelClass(level: CrawlLogLevel) {
  return `mjgd_crawl_level_${level}`
}

function levelLabel(level: CrawlLogLevel) {
  const map: Record<CrawlLogLevel, string> = {
    info: 'INFO',
    success: 'OK',
    warn: 'WARN',
    stop: 'STOP',
  }
  return map[level]
}

function refreshSnapshot() {
  snapshot.value = getCrawlSnapshot()
}

function scrollLogsToEnd() {
  nextTick(() => {
    const el = logStreamRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function requestClose() {
  showConfirm.value = true
}

function confirmClose() {
  showConfirm.value = false
  overlayVisible.value = true
  closeBatchCrawlOverlay(true)
}

function handleOverlayClose() {
  overlayVisible.value = false
  if (isCollecting.value) {
    pauseBatchCrawlFromOverlayClose()
  }
}

function handlePauseResume() {
  if (isCollecting.value) {
    // 旧版：暂停同时关闭日志覆盖层，方便用户回看页面
    overlayVisible.value = false
    pauseBatchCrawl()
  } else {
    overlayVisible.value = true
    resumeBatchCrawl()
  }
}

function handleStop() {
  // 旧版：停止同时关闭日志覆盖层
  overlayVisible.value = false
  stopBatchCrawl()
}

function handleClear() {
  if (clearDisabled.value) return
  clearBatchCrawlData()
}

async function handleExport() {
  if (!exportEnabled.value) return
  await exportCrawlToExcel()
}

watch(
  () => snapshot.value.logs.length,
  () => scrollLogsToEnd(),
)

watch(
  () => snapshot.value.visible,
  (visible) => {
    if (visible) {
      overlayVisible.value = true
      showConfirm.value = false
    }
  },
)

onMounted(() => {
  unsubscribe = subscribeCrawlState(() => {
    refreshSnapshot()
  })
})

onUnmounted(() => {
  unsubscribe?.()
})
</script>
