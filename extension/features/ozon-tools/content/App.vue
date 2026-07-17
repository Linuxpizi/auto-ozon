<template>
  <div class="mjgd-extension-root">
    <Widget ref="widgetRef" @ai-collect="handleOpenAiCollect" @ai-auto-select="handleOpenAiAutoSelect" @logout="handleLogout" />
    <OzonListHost />
    <CrawlOverlay />
    <ImageDownloadOverlay />
    <QuickShelveModal />
    <TemplateEditModal />
    <ExchangeRateModal />
    <GoodsNoPrefixModal />
    <SettingsModal />
    <SelectionRuleEditorModal />
    <!-- 三个 AI 弹窗共用一层遮罩，避免多开时背景叠加变深 -->
    <div v-if="anyAiModalVisible" class="mjgd_app_shared_modal_overlay mjgd_plugin_overlay" aria-hidden="true"></div>
    <AiAutoSelectModal v-model:visible="showAiAutoSelectModal" shared-overlay @close="showAiAutoSelectModal = false" @open-results="handleOpenAutoSelectResults" @start-collection="handleStartAutoSelectCollection" />
    <AiAutoSelectResultModal ref="resultModalRef" v-model:visible="showAutoSelectResultModal" shared-overlay :ai-fill-processor="processAutoSelectAiFillItem" @close="showAutoSelectResultModal = false" @reselect="handleAutoSelectReselect" @edit-item="handleEditAutoSelectItem" />
    <AiCollectModal ref="aiCollectRef" v-model:visible="showAiCollectModal" shared-overlay @close="showAiCollectModal = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue'
import Widget from './components/Widget.vue'
import { OzonListHost } from './components/OzonList'
import CrawlOverlay from './components/OzonList/BatchCrawl/CrawlOverlay.vue'
import ImageDownloadOverlay from './components/OzonList/ImageDownload/ImageDownloadOverlay.vue'
import QuickShelveModal from './components/OzonList/QuickShelve/QuickShelveModal.vue'
import TemplateEditModal from './components/OzonList/QuickShelve/TemplateEditModal.vue'
import ExchangeRateModal from './components/OzonList/QuickShelve/ExchangeRateModal.vue'
import GoodsNoPrefixModal from './components/OzonList/QuickShelve/GoodsNoPrefixModal.vue'
import SettingsModal from './components/OzonList/CardSettings/SettingsModal.vue'
import SelectionRuleEditorModal from './components/OzonList/SelectionRules/SelectionRuleEditorModal.vue'
import AiCollectModal from './components/AiCollectModal.vue'
import AiAutoSelectModal from './components/AiAutoSelect/AiAutoSelectModal.vue'
import AiAutoSelectResultModal from './components/AiAutoSelect/AiAutoSelectResultModal.vue'
import { apiService } from '../utils/api'
import { showToast } from '../utils/toast'
import {
  isHeadlessPipelineActive,
  recoverAutoSelectItemAiFill,
  runAutoSelectItemAiFill,
} from './utils/productSession'
import type { ChineseFieldMark } from './utils/ozonAiFillAndSubmit'
import { tryActivateOzonListFeatures } from './utils/ozonList/authSession'
import {
  assignTabSessionId,
  configureAiRecoverPoller,
  consumePendingAutoSelectConfig,
  ensureTabSessionId,
  is1688CategorySearchPage,
  isAwaitingAiFillRecover,
  isPendingAutoStartLanding,
  isDraftResumableStatus,
  isResumableDraft,
  normalizeAiAutoSelectConfig,
  peekPendingAutoSelectConfig,
  peekPendingForAutoStart,
  readDraft,
  resetAutoSelectSession,
  resetRunnerState,
  savePendingAutoSelectConfig,
  waitForAutoSelectLandingReady,
  type AiAutoSelectConfig,
  type AiAutoSelectDraft,
  type AiAutoSelectDraftItem,
  type AiAutoSelectAiStepConfig,
} from './utils/aiAutoSelect'
import { isGoodsDetailPage } from './utils/isGoodsDetailPage'

// 入口文件：只负责组件组合和事件传递
const showAiCollectModal = ref(false)
const showAiAutoSelectModal = ref(false)
const showAutoSelectResultModal = ref(false)
const widgetRef = ref<InstanceType<typeof Widget> | null>(null)
const aiCollectRef = ref<InstanceType<typeof AiCollectModal> | null>(null)
const resultModalRef = ref<InstanceType<typeof AiAutoSelectResultModal> | null>(null)

const anyAiModalVisible = computed(
  () =>
    showAiCollectModal.value ||
    showAiAutoSelectModal.value ||
    showAutoSelectResultModal.value,
)

/** 详情页：打开 AI 采集前关闭选品配置弹窗 */
function closeAutoSelectConfigOnDetailPage() {
  if (!isGoodsDetailPage()) return
  showAiAutoSelectModal.value = false
}

/** 详情页：打开自动选品前关闭工作台（走 dismiss 完整清理） */
function closeAiCollectOnDetailPage() {
  if (!isGoodsDetailPage()) return
  if (!showAiCollectModal.value) return
  aiCollectRef.value?.dismiss?.()
}

const handleOpenAiCollect = () => {
  closeAutoSelectConfigOnDetailPage()
  showAiCollectModal.value = true
}

const handleOpenAiAutoSelect = () => {
  closeAiCollectOnDetailPage()
  // 最小化悬浮球期间：直接展开选品结果弹窗，避免重复开配置任务
  if (resultModalRef.value?.isMinimized?.()) {
    resultModalRef.value.restoreFromMinimized()
    return
  }
  if (!showAutoSelectResultModal.value) {
    showAiAutoSelectModal.value = true
  }
}

const handleOpenAutoSelectResults = async (payload?: { sessionId: string }) => {
  if (payload?.sessionId) {
    await assignTabSessionId(payload.sessionId)
    // 须在 visible watch 之前灌入指定会话草稿，避免 ensureTabSessionId 抢先 reload 空数据
    await resultModalRef.value?.loadSessionRecords?.(payload.sessionId)
  }
  showAutoSelectResultModal.value = true
}

/** 配置弹窗发起采集：打开合并工作台并启动 runner */
const handleStartAutoSelectCollection = async (payload: {
  config: AiAutoSelectConfig
  resumeFrom?: AiAutoSelectDraft | null
  sessionId?: string
}) => {
  const sessionId = payload.resumeFrom?.sessionId ?? payload.sessionId ?? await ensureTabSessionId()
  // 续采保留草稿；新任务仅清空本会话，避免影响其他 Tab
  if (!payload.resumeFrom) {
    await resetAutoSelectSession(sessionId)
  }
  showAutoSelectResultModal.value = true
  showAiAutoSelectModal.value = false
  await nextTick()
  if (!payload.resumeFrom) {
    resultModalRef.value?.prepareCollectionUi(payload.config, sessionId)
  }
  await resultModalRef.value?.startCollection(payload.config, payload.resumeFrom, sessionId)
}

/** 空结果重新选品：回填条件并打开配置弹窗 */
const handleAutoSelectReselect = async (config: AiAutoSelectConfig) => {
  const sessionId = await ensureTabSessionId()
  await savePendingAutoSelectConfig(normalizeAiAutoSelectConfig(config), { sessionId })
  await resetAutoSelectSession(sessionId)
  showAutoSelectResultModal.value = false
  showAiAutoSelectModal.value = true
}

/** 打开工作台编辑自动选品商品，保存后回写草稿 */
const handleEditAutoSelectItem = async (
  item: AiAutoSelectDraftItem,
  focus?: AiAutoSelectDraftItem['manualEditFocus'],
  chineseMarks?: ChineseFieldMark[],
) => {
  // 从草稿取最新条目，避免批量帮填后卡片引用滞后
  const latest = resultModalRef.value?.getDraftItemById(item.id) ?? item
  if (isAwaitingAiFillRecover(latest)) {
    showToast('正在重新获取帮填结果，请稍后', 3000)
    return
  }
  const onSaved = (itemId: string, patch: Partial<AiAutoSelectDraftItem>) => {
    resultModalRef.value?.applyItemPatch(itemId, patch)
  }
  // 切换编辑商品前先保存上一商品草稿
  if (
    aiCollectRef.value?.isEditingAutoSelectItem?.() &&
    showAiCollectModal.value
  ) {
    aiCollectRef.value?.flushAutoSelectSave?.()
  }
  // 列表页自动选品：先进入工作台展示加载态，再异步灌入草稿（详情页采集与此无关）
  aiCollectRef.value?.beginAutoSelectItemLoad(latest, onSaved, { focus, chineseMarks })
  showAiCollectModal.value = true
  await nextTick()
  await aiCollectRef.value?.loadFromAutoSelectItem(latest, onSaved, { focus, chineseMarks })
}

/** 单条自动选品 AI 帮填：独立 ProductSession，不占用工作台 UI */
const processAutoSelectAiFillItem = async (
  item: AiAutoSelectDraftItem,
  aiStepOverride?: AiAutoSelectAiStepConfig,
): Promise<Partial<AiAutoSelectDraftItem> | null> => {
  const latest = resultModalRef.value?.getDraftItemById(item.id) ?? item
  const onMidSave = (patch: Partial<AiAutoSelectDraftItem>) => {
    resultModalRef.value?.applyItemPatch(latest.id, patch)
  }
  const maxVariantExecutionCountOverride = resultModalRef.value?.getSessionMaxVariantExecutionCount() ?? undefined
  return runAutoSelectItemAiFill(latest, {
    onAiTaskStarted: (sessionId) => {
      resultModalRef.value?.notifyBatchFillAiTaskStarted(latest.id)
      resultModalRef.value?.applyItemPatch(latest.id, {
        cardStatus: 'ai_processing',
        aiSessionId: sessionId,
      })
    },
    onMidSave,
    aiStepOverride,
    maxVariantExecutionCountOverride,
  })
}

/** 配置 AI 中断恢复调度：SSE 失败后按 sessionId 延时重试 */
function setupAiRecoverPoller() {
  configureAiRecoverPoller({
    getProcessingItems: () => resultModalRef.value?.getProcessingDraftItems() ?? [],
    isModalBusyForRecover: () =>
      isHeadlessPipelineActive()
      || aiCollectRef.value?.isAutoSelectPipelineBusy?.()
      || false,
    processor: async (item) => {
      if (isHeadlessPipelineActive()) return 'pending'
      if (aiCollectRef.value?.isAutoSelectPipelineBusy?.()) return 'pending'
      if (aiCollectRef.value?.isAutoSelectItemFillActive?.(item.id)) return 'pending'
      const latest = resultModalRef.value?.getDraftItemById(item.id) ?? item
      if (!latest.offerId) return null
      if (!latest.aiSessionId) return 'pending'
      const onMidSave = (patch: Partial<AiAutoSelectDraftItem>) => {
        resultModalRef.value?.applyItemPatch(latest.id, patch)
      }
      return (await recoverAutoSelectItemAiFill(latest, { onMidSave })) ?? null
    },
    onDone: (mergedItem) => {
      resultModalRef.value?.applyItemPatch(mergedItem.id, mergedItem)
      if (mergedItem.cardStatus === 'ai_success') {
        showToast('AI 帮填已恢复完成', 3000)
      }
    },
    onRecoverExhausted: (item) => {
      resultModalRef.value?.applyItemPatch(item.id, { cardStatus: 'waiting_ai' })
      showToast('帮填结果获取超时，请稍后手动重试', 3000)
    },
  })
}

// 无认证复刻版没有登录/退出流程；保留事件接线但不销毁功能会话。
const handleLogout = () => undefined

// 无认证复刻版：初始化本地兼容会话并直接激活页面能力，不与 BCS 校验身份。
const checkAuthStatus = async () => {
  try {
    await apiService.init()
    widgetRef.value?.setUserName('本地模式')
    tryActivateOzonListFeatures()
  } catch (error) {
    console.error('初始化本地模式失败:', error)
  }
}

// 组件挂载时验证登录状态
onMounted(async () => {
  setupAiRecoverPoller()
  await checkAuthStatus()
  const pending = await peekPendingForAutoStart()
  // autoStart 跳转落地：直接开进度弹窗，避免条件弹窗闪现
  if (pending?.autoStart && isPendingAutoStartLanding(pending)) {
    const consumed = await consumePendingAutoSelectConfig(pending.sessionId)
    if (!consumed) {
      return
    }
    const { config, sessionId, resume } = consumed
    await assignTabSessionId(sessionId)
    const existingDraft = await readDraft(sessionId)
    const isInterruptedDraft = existingDraft && isDraftResumableStatus(existingDraft.status)
    // 任务恢复弹窗「继续采集」：携带 resume 标记，落地后恢复草稿与选品条件
    const isResumeContinuation = Boolean(resume && existingDraft && isInterruptedDraft)
    // 店铺跨域续采：runner 跳转下一店铺时无 resume 标记，仍按可恢复草稿续采
    const isStoreContinuation =
      !isResumeContinuation
      && config.storeCollectEnabled
      && isResumableDraft(existingDraft, window.location.href, sessionId)
      && (existingDraft?.items?.length ?? 0) > 0

    if ((isResumeContinuation || isStoreContinuation) && existingDraft) {
      resetRunnerState()
      showAutoSelectResultModal.value = true
      await nextTick()
      const ready = await waitForAutoSelectLandingReady(config)
      if (!ready) {
        showToast('页面加载超时，请手动点击开始', 3000)
        showAutoSelectResultModal.value = false
        await savePendingAutoSelectConfig(config, { sessionId, autoStart: true, resume: isResumeContinuation || undefined })
        showAiAutoSelectModal.value = true
        return
      }
      await resultModalRef.value?.startCollection(config, existingDraft, sessionId)
      return
    }

    // 须在结果弹窗打开前清空本会话，避免 visible watch 先展示上次选品数据
    await resetAutoSelectSession(sessionId)
    showAutoSelectResultModal.value = true
    await nextTick()
    resultModalRef.value?.prepareCollectionUi(config, sessionId)
    const ready = await waitForAutoSelectLandingReady(config)
    if (!ready) {
      showToast('页面加载超时，请手动点击开始', 3000)
      showAutoSelectResultModal.value = false
      await savePendingAutoSelectConfig(config, { sessionId, autoStart: true })
      showAiAutoSelectModal.value = true
      return
    }
    // autoStart 为用户主动点击「开始智能选品」触发，始终新任务，不续采旧草稿
    await resultModalRef.value?.startCollection(config, null, sessionId)
    return
  }
  // 非 autoStart：类目搜索页仅恢复选品条件弹窗
  const formPending = await peekPendingAutoSelectConfig()
  if (formPending && !formPending.autoStart && is1688CategorySearchPage()) {
    showAiAutoSelectModal.value = true
  }
})
</script>

<style>
/* Unified scrollbar style across content app */
*::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

*::-webkit-scrollbar-track {
  background: #f5f7fa;
  border-radius: 4px;
}

*::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 4px;
}

*::-webkit-scrollbar-thumb:hover {
  background: #909399;
}
</style>
