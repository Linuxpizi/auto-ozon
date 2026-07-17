<template>
  <div v-if="visible && !minimized" class="mjgd_ai_auto_select_result_overlay mjgd_plugin_overlay is_tier_2" :class="{ is_panel_only: sharedOverlay }">
    <div class="mjgd_ai_auto_select_result_modal">
      <div class="mjgd_ai_auto_select_result_header_actions">
        <button type="button" class="mjgd_ai_auto_select_result_minimize" title="最小化" @click="handleMinimize">−</button>
        <button type="button" class="mjgd_ai_auto_select_result_close" @click="handleClose">×</button>
      </div>

      <!-- 上栏：选品条件与采集进度 -->
      <div class="mjgd_ai_auto_select_result_workspace_top">
        <div class="mjgd_ai_auto_select_result_title_row"><AiMenuBtnIcon /><h2 class="mjgd_ai_auto_select_result_title">自动选品</h2></div>
        <div class="mjgd_ai_auto_select_result_workspace_main" :class="{ is_finished: runnerStatus === 'finished' }" v-if="activeConfig">
          <!-- 左：选品条件 -->
          <div class="mjgd_ai_auto_select_result_workspace_left">
            <div class="mjgd_ai_auto_select_result_stat_label mjgd_ai_auto_select_result_stat_label2">选品条件</div>
            <dl class="mjgd_ai_auto_select_result_condition_list">
              <div class="mjgd_ai_auto_select_result_condition_row"><dt>类目</dt><dd>{{ activeConfig.category }}</dd></div>
              <div class="mjgd_ai_auto_select_result_condition_row"><dt>价格</dt><dd>{{ priceRangeLabel }}</dd></div>
              <div class="mjgd_ai_auto_select_result_condition_row"><dt>数量</dt><dd>{{ activeConfig.targetCount }} 件</dd></div>
              <div class="mjgd_ai_auto_select_result_condition_row"><dt>关键词</dt><dd class="mjgd_ai_auto_select_result_keywords_value" :title="keywordsLabel">{{ keywordsLabel }}</dd></div>
            </dl>
          </div>
          <!-- 中：选品设置 -->
          <div class="mjgd_ai_auto_select_result_workspace_center">
            <div class="mjgd_ai_auto_select_result_stat_label mjgd_ai_auto_select_result_stat_label2">选品设置</div>
            <dl class="mjgd_ai_auto_select_result_condition_list is_settings">
              <!-- 关键词匹配模式暂时下线，固定精准匹配
              <div class="mjgd_ai_auto_select_result_condition_row"><dt>关键词匹配模式</dt><dd>{{ keywordMatchModeLabel }}</dd></div>
              -->
              <div class="mjgd_ai_auto_select_result_condition_row">
                <dt>自动化设置</dt>
                <dd>
                  <div>{{ automationModeLabel }}</div>
                  <ul v-if="automationDetailLines.length" class="mjgd_ai_auto_select_result_setting_details">
                    <li v-for="(line, i) in automationDetailLines" :key="i">{{ line }}</li>
                  </ul>
                </dd>
              </div>
              <div class="mjgd_ai_auto_select_result_condition_row"><dt>店铺商品采集</dt><dd>{{ storeCollectLabel }}</dd></div>
            </dl>
          </div>
          <!-- 右：状态 / 进度 / 操作 -->
          <div class="mjgd_ai_auto_select_result_workspace_right">
            <div class="mjgd_ai_auto_select_result_status_card">
              <div class="mjgd_ai_auto_select_result_status_left">
                <div class="mjgd_ai_auto_select_result_stat_label">选品状态</div>
                <div class="mjgd_ai_auto_select_result_status_row">
                  <span class="mjgd_ai_auto_select_result_status_dot" :class="statusDotClass"><span v-if="runnerStatus === 'collecting'" class="mjgd_ai_auto_select_result_radar_sweep" aria-hidden="true"></span></span>
                  <span>{{ statusLabel }}</span>
                </div>
              </div>
              <div class="mjgd_ai_auto_select_result_status_right">
                <span class="mjgd_ai_auto_select_result_export_label">采集进度</span>
                <span class="mjgd_ai_auto_select_result_export_value">{{ collectedCount }} / {{ targetCount }}</span>
              </div>
            </div>
            <div class="mjgd_ai_auto_select_result_progress_bar_wrap" :class="{ is_collecting: runnerStatus === 'collecting' }">
              <div class="mjgd_ai_auto_select_result_progress_bar_fill" :style="{ width: `${progressPercent}%` }"></div>
            </div>
            <div v-if="isRunnerControllable" class="mjgd_ai_auto_select_result_runner_actions">
              <button v-if="runnerStatus === 'collecting'" type="button" class="mjgd_ai_auto_select_result_btn_pause" @click="handlePause">暂停</button>
              <button v-else-if="runnerStatus === 'paused'" type="button" class="mjgd_ai_auto_select_result_btn_primary" @click="handleResume">继续</button>
              <button type="button" class="mjgd_ai_auto_select_result_btn_stop" :disabled="runnerStatus === 'stopped' || runnerStatus === 'finished'" @click="handleStop">停止</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 下栏：商品操作区 -->
      <div class="mjgd_ai_auto_select_result_center">
        <div class="mjgd_ai_auto_select_result_toolbar">
          <select v-model="statusFilter" class="mjgd_ai_auto_select_result_filter">
            <option value="all">状态：全部</option>
            <option value="waiting_ai">等待 AI 处理</option>
            <option value="ai_processing">AI 处理中</option>
            <option value="ai_success">AI 处理成功</option>
            <option value="listed">已上架</option>
            <option value="in_collect_box">已存入采集箱</option>
          </select>
          <label class="mjgd_ai_auto_select_result_select_all">
            <input type="checkbox" :checked="isAllSelected" :disabled="!filteredItems.length" @change="toggleSelectAll" />
            <span>全选</span>
          </label>
          <div class="mjgd_ai_auto_select_result_batch_btns">
            <button type="button" class="mjgd_ai_auto_select_result_batch_btn" :class="{ is_loading: batchAiFillLoading }" :disabled="!hasSelection || batchActionBusy" @click="handleBatchAiFill">
              <span v-if="batchAiFillLoading" class="mjgd_ai_auto_select_result_batch_btn_spinner" />
              {{ batchAiFillLoading ? 'AI 帮填中…' : 'AI 帮填' }}
            </button>
            <button type="button" class="mjgd_ai_auto_select_result_batch_btn" :class="{ is_loading: batchOzonLoading || ozonPrevalidating }" :disabled="!hasSelection || batchActionBusy" @click="openOzonSubmit()">
              <span v-if="batchOzonLoading || ozonPrevalidating" class="mjgd_ai_auto_select_result_batch_btn_spinner" />
              {{ batchOzonLoading ? '上架中…' : ozonPrevalidating ? '检查中…' : '批量上架 Ozon' }}
            </button>
            <button type="button" class="mjgd_ai_auto_select_result_batch_btn" :class="{ is_loading: batchCollectBoxLoading }" :disabled="!hasSelection || batchActionBusy" @click="handleBatchCollectBox">
              <span v-if="batchCollectBoxLoading" class="mjgd_ai_auto_select_result_batch_btn_spinner" />
              {{ batchCollectBoxLoading ? '加入中…' : '批量加入采集箱' }}
            </button>
            <button type="button" class="mjgd_ai_auto_select_result_batch_btn is_danger" :class="{ is_loading: batchDeleteLoading }" :disabled="!hasSelection || batchActionBusy" @click="handleBatchDelete">
              <span v-if="batchDeleteLoading" class="mjgd_ai_auto_select_result_batch_btn_spinner is_danger" />
              {{ batchDeleteLoading ? '删除中…' : '批量删除' }}
            </button>
          </div>
        </div>

        <div class="mjgd_ai_auto_select_result_grid_wrap">
          <div class="mjgd_ai_auto_select_result_grid_panel">
            <!-- 采集中/暂停/空结果遮罩：有商品后自动隐藏 -->
            <div v-if="bottomOverlay" class="mjgd_ai_auto_select_result_collect_overlay" :class="`is_${bottomOverlay}`">
              <template v-if="bottomOverlay === 'collecting'">
                <div class="mjgd_ai_auto_select_result_collect_radar" aria-hidden="true"><div class="mjgd_ai_auto_select_result_radar_sweep"></div></div>
                <span class="mjgd_ai_auto_select_result_collect_text">采集中…</span>
              </template>
              <template v-else-if="bottomOverlay === 'paused'">
                <div class="mjgd_ai_auto_select_result_collect_paused_icon" aria-hidden="true"><svg class="mjgd_ai_auto_select_result_collect_paused_svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="13" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg></div>
                <span class="mjgd_ai_auto_select_result_collect_text">已暂停</span>
              </template>
              <template v-else-if="bottomOverlay === 'empty'">
                <div class="mjgd_ai_auto_select_result_collect_empty_icon" aria-hidden="true"><svg class="mjgd_ai_auto_select_result_collect_empty_svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" /><path d="M20 20L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg></div>
                <span class="mjgd_ai_auto_select_result_collect_text font_weight">{{ emptyResultText }}</span>
                <button type="button" class="mjgd_ai_auto_select_result_btn_primary mjgd_ai_auto_select_result_collect_empty_btn" @click="handleReselect">+ 创建选品任务</button>
              </template>
            </div>
            <div v-else class="mjgd_ai_auto_select_result_grid">
              <div v-for="item in pagedItems" :key="item.id" class="mjgd_ai_auto_select_result_card" @click="handleCardClick(item)">
                <label class="mjgd_ai_auto_select_result_check" @click.stop>
                  <input type="checkbox" :checked="selectedIds.has(item.id)" @change="toggleSelect(item.id)" />
                </label>

                <button v-if="item.needsManualEdit" type="button" class="mjgd_ai_auto_select_result_edit_tag" @click.stop="handleEditTag(item)">需手动编辑</button>

                <div class="mjgd_ai_auto_select_result_status_group">
                  <span v-for="badge in getItemCardBadges(item)" :key="badge.key" class="mjgd_ai_auto_select_result_status" :class="`is_${badge.key}`">{{ badge.label }}</span>
                  <span v-if="hasOzonListingFailure(item)" class="mjgd_ai_auto_select_result_status is_listing_failed" @click.stop="openOzonListingErrorModal(item)">上架失败，点击查看</span>
                </div>

                <div class="mjgd_ai_auto_select_result_card_body">
                  <div class="mjgd_ai_auto_select_result_img_wrap">
                    <img :src="cardImage(item)" alt="" class="mjgd_ai_auto_select_result_img" />
                  </div>

                  <div class="mjgd_ai_auto_select_result_info">
                    <div class="mjgd_ai_auto_select_result_name" :title="cardDisplayTitle(item)">{{ cardDisplayTitle(item) }}</div>
                    <div class="mjgd_ai_auto_select_result_price">商品价格 <span>¥{{ displayPrice(item) }}</span></div>
                    <div class="mjgd_ai_auto_select_result_metrics">
                      <span>月销 {{ item.listMetrics?.monthlySales ?? '-' }}</span>
                      <span>复购 {{ item.listMetrics?.repurchaseRate != null ? formatRepurchase(item.listMetrics.repurchaseRate) : '-' }}</span>
                      <span class="mjgd_ai_auto_select_result_stars">评分
                        <template v-if="item.listMetrics?.rating != null">
                          <span v-for="i in 5" :key="i" class="mjgd_ai_auto_select_result_star" :class="{ is_on: i <= Math.round(item.listMetrics!.rating!) }">★</span>
                          {{ item.listMetrics.rating.toFixed(1) }}
                        </template>
                        <template v-else>-</template>
                      </span>
                    </div>
                  </div>
                </div>

                <div class="mjgd_ai_auto_select_result_actions" @click.stop>
                  <template v-for="btn in cardButtons(item)" :key="btn.key">
                    <button type="button" :class="['mjgd_ai_auto_select_result_action_btn', btn.primary ? 'is_primary' : '', { is_loading: isCardButtonLoading(item.id, btn.key) }]" :disabled="isCardButtonLoading(item.id, btn.key)" @click="btn.handler(item)">
                      <span v-if="isCardButtonLoading(item.id, btn.key)" class="mjgd_ai_auto_select_result_action_btn_spinner" :class="{ is_primary: btn.primary }" />{{ isCardButtonLoading(item.id, btn.key) ? btn.loadingLabel : btn.label }}
                    </button>
                  </template>
                </div>

                <!-- 批量 AI 帮填：遮罩覆盖商品图与信息区，底部按钮保持原样 -->
                <div v-if="getBatchFillProgress(item)" class="mjgd_ai_auto_select_result_card_mask" :class="`is_${getBatchFillProgress(item)!.status}`" @click.stop>
                  <div class="mjgd_ai_auto_select_result_card_mask_progress">
                    <span class="mjgd_ai_auto_select_result_card_mask_percent">{{ formatProgressPercent(getBatchFillProgress(item)!.percent) }}</span>
                    <div class="mjgd_ai_auto_select_result_card_mask_bar">
                      <div class="mjgd_ai_auto_select_result_card_mask_bar_fill" :style="{ width: `${getBatchFillProgress(item)!.percent}%` }"></div>
                    </div>
                    <!-- 隐藏预计耗时 -->
                    <!-- <span class="mjgd_ai_auto_select_result_card_mask_estimate">{{ getBatchFillProgress(item)!.estimatedLabel }}</span> -->
                  </div>
                </div>
                <!-- 帮填轮询恢复等待：无有效 AI 结果时遮罩，防止进工作台与回填冲突 -->
                <div v-else-if="getCardRecoverMask(item)" class="mjgd_ai_auto_select_result_card_mask is_recovering" @click.stop>
                  <span class="mjgd_ai_auto_select_result_card_mask_spinner" aria-hidden="true"></span><span class="mjgd_ai_auto_select_result_card_mask_recover_text">正在重新获取处理结果</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="totalPages > 1" class="mjgd_ai_auto_select_result_pagination">
          <button type="button" :disabled="currentPage <= 1" @click="currentPage -= 1">上一页</button>
          <template v-for="item in paginationItems" :key="item.type === 'page' ? `p-${item.page}` : `e-${item.id}`">
            <button v-if="item.type === 'page'" type="button" :class="{ is_active: item.page === currentPage }" @click="currentPage = item.page">{{ item.page }}</button>
            <span v-else class="mjgd_ai_auto_select_result_pagination_ellipsis" aria-hidden="true">...</span>
          </template>
          <button type="button" :disabled="currentPage >= totalPages" @click="currentPage += 1">下一页</button>
        </div>
      </div>
    </div>

    <AiAutoSelectImagePreview :visible="previewVisible" :image-url="previewUrl" @close="previewVisible = false" />

    <AiAutoSelectOzonSubmitModal :visible="ozonModalVisible" @confirm="handleOzonConfirm" @cancel="ozonModalVisible = false" />

    <ValidationWarningModal :visible="showValidationWarningModal" :mode="validationWarningMode" :fields="validationWarningFields" :product-title="chineseBlockedProductTitle" overlay-class="is_nested is_tier_nested" @close="handleValidationWarningBack" @go-edit="handleValidationWarningGoEdit" />

    <OzonSubmitResultModal :visible="showOzonResultModal" :mode="ozonResultMode" :failures="ozonResultFailures" overlay-class="is_nested is_tier_nested" @close="showOzonResultModal = false" />
  </div>

  <!-- 最小化后：视口右侧圆形进度悬浮球，点击恢复结果弹窗 -->
  <Teleport to="body">
    <button v-if="minimized" type="button" class="mjgd_ai_auto_select_result_float" title="展开选品结果" @click="handleRestore">
      <svg class="mjgd_ai_auto_select_result_float_ring" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id="mjgd_float_radar_grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(37, 99, 235, 0)" />
            <stop offset="100%" stop-color="rgba(37, 99, 235, 0.35)" />
          </radialGradient>
        </defs>
        <circle class="mjgd_ai_auto_select_result_float_track" cx="50" cy="50" :r="FLOAT_RING_RADIUS" />
        <!-- 采集中：环内旋转扇形，表达雷达扫描感 -->
        <g v-if="runnerStatus === 'collecting'" class="mjgd_ai_auto_select_result_float_radar">
          <path d="M50,50 L78.548,28.052 A36,36 0 0,1 78.548,71.948 Z" fill="url(#mjgd_float_radar_grad)" />
        </g>
        <circle class="mjgd_ai_auto_select_result_float_progress" cx="50" cy="50" :r="FLOAT_RING_RADIUS" :style="{ strokeDasharray: FLOAT_RING_CIRCUMFERENCE, strokeDashoffset: floatRingOffset }" />
      </svg>
      <span class="mjgd_ai_auto_select_result_float_content">
        <span class="mjgd_ai_auto_select_result_float_status">{{ statusLabel }}</span>
        <span class="mjgd_ai_auto_select_result_float_count">{{ collectedCount }}/{{ targetCount }}</span>
      </span>
    </button>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { messageBoxConfirm } from '../../../utils/messageBox'
import { showToast } from '../../../utils/toast'
import { buildVariantImageCountWarningFields, buildVariantAspectWarningFields, type ChineseFieldMark, type VariantImageCountExceededItem, type VariantAspectValidationItem } from '../../utils/ozonAiFillAndSubmit'
import AiMenuBtnIcon from '../common/AiMenuBtnIcon.vue'
import ValidationWarningModal, { type ValidationWarningFieldItem, type ValidationWarningModalMode } from '../common/ValidationWarningModal.vue'
import OzonSubmitResultModal, { type OzonSubmitFailureItem } from '../common/OzonSubmitResultModal.vue'
import AiAutoSelectImagePreview from './AiAutoSelectImagePreview.vue'
import AiAutoSelectOzonSubmitModal from './AiAutoSelectOzonSubmitModal.vue'
import {
  addToCollectBox,
  evaluateNeedsManualEdit,
  manualEditFocusFromChineseMark,
  manualEditFocusFromVariantAspectItem,
  validateOzonDraftItemBeforeSubmit,
  getCardStatusBadges,
  resolveTabDraft,
  readDraft,
  removeDraftItems,
  rememberSeenOfferIds,
  createAiFillQueue,
  saveDraft,
  syncAiRecoverPollWithDraft,
  scheduleAiFillRecover,
  updateDraftItem,
  updateDraftItems,
  isAutoSelectAiFillDone,
  isAwaitingAiFillRecover,
  isOzonSubmitReady,
  mergeDraftWithItemOutcomes,
  patchRunnerDraftItem,
  calcAiFillEstimatedMs,
  calcAiFillEstimatedSeconds,
  createAiFillProgressSimulator,
  formatEstimatedDuration,
  resolveAiFillStepOptions,
  bindRunnerSession,
  clearDraft,
  createEmptyDraft,
  getRunnerDraft,
  isRunnerActive,
  pauseRunner,
  removeRunnerDraftItems,
  resumeRunner,
  setRunnerDraft,
  startRunner,
  stopRunner,
  ensureTabSessionId,
  normalizeAiAutoSelectConfig,
  normalizeConfigKeywords,
  // KEYWORD_MATCH_MODE_LABELS,
  AUTOMATION_MODE_LABELS,
  formatAiStepDetailLines,
  formatListingPriceAdjustLine,
  createOzonAutoQueue,
  submitDraftItemsToOzon,
  shouldAutoOzonFromConfig,
  type AiFillProgressSimulator,
  type OzonAutoQueue,
  type AiFillQueue,
  type AiFillStepOptions,
  type BatchAiFillProcessor,
  type AiAutoSelectAiStepConfig,
  type AiAutoSelectConfig,
  type AiAutoSelectDraft,
  type AiAutoSelectDraftItem,
  type OzonListingFailureRecord,
  type AutoSelectStatusFilter,
  type RunnerStatus,
} from '../../utils/aiAutoSelect'
import {
  formatVariantLimitExceededMessageForItem,
  getMaxVariantExecutionCount,
  getSkuVariantCount,
  isVariantCountOverLimit,
  normalizeMaxVariantExecutionCount,
  DEFAULT_MAX_VARIANT_EXECUTION_COUNT,
} from '../../utils/maxVariantExecution'
import { buildPaginationItems } from '../../utils/paginationItems'

/** 每页 6 件：2 行 × 3 列 */
const PAGE_SIZE = 6

/** 悬浮球环形进度半径，与 SVG viewBox 一致 */
const FLOAT_RING_RADIUS = 42
const FLOAT_RING_CIRCUMFERENCE = 2 * Math.PI * FLOAT_RING_RADIUS

const minimized = ref(false)

const props = defineProps<{
  visible: boolean
  sharedOverlay?: boolean
  /** 由 App 注入：单条帮填 Pipeline 执行器 */
  aiFillProcessor?: BatchAiFillProcessor | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
  (e: 'reselect', config: AiAutoSelectConfig): void
  (e: 'edit-item', item: AiAutoSelectDraftItem, focus?: AiAutoSelectDraftItem['manualEditFocus'], chineseMarks?: ChineseFieldMark[]): void
}>()

const draft = ref<AiAutoSelectDraft | null>(null)
const activeSessionId = ref<string | null>(null)
const runnerStatus = ref<RunnerStatus>('idle')

/** 以 draft 中固化配置为准，避免采集中展示被误改 */
const activeConfig = computed((): AiAutoSelectConfig | null => draft.value?.config ?? null)

const collectedCount = computed(() => draft.value?.collectedCount ?? 0)

const scannedCount = computed(() => draft.value?.scannedOfferIds?.length ?? 0)

/** 空结果文案：有扫描量且从未采集成功时，说明均不符合筛选条件 */
const emptyResultText = computed(() => {
  if (collectedCount.value === 0 && scannedCount.value > 0) {
    return `已扫描${scannedCount.value}件商品，均不符合当前选品条件`
  }
  return '当前选品条件下没有找到匹配的商品数据'
})

const targetCount = computed(() => draft.value?.config.targetCount ?? 0)

const priceRangeLabel = computed(() => {
  const cfg = activeConfig.value
  if (!cfg) return '-'
  const { minPrice, maxPrice } = cfg
  if (minPrice == null && maxPrice == null) return '不限'
  if (minPrice != null && maxPrice != null) return `¥${minPrice} — ¥${maxPrice}`
  if (minPrice != null) return `¥${minPrice} 起`
  return `¥${maxPrice} 以内`
})

const keywordsLabel = computed(() => {
  const kws = normalizeConfigKeywords(activeConfig.value?.keywords)
  if (!kws.length) return '未设置'
  return kws.join('、')
})

// 关键词匹配模式 UI 暂时下线
// const keywordMatchModeLabel = computed(() => {
//   const mode = activeConfig.value?.keywordMatchMode ?? 'strict'
//   return KEYWORD_MATCH_MODE_LABELS[mode]
// })

const automationModeLabel = computed(() => {
  const mode = activeConfig.value?.automationMode ?? 'semi'
  return AUTOMATION_MODE_LABELS[mode]
})

const storeCollectLabel = computed(() => (activeConfig.value?.storeCollectEnabled ? '是' : '否'))

/** 半自动模式读取设置页全局变体上限，弹窗打开时异步加载 */
const globalMaxVariantCount = ref(DEFAULT_MAX_VARIANT_EXECUTION_COUNT)

/** 卡片徽章与帮填校验共用的当前生效变体上限 */
const effectiveMaxVariantCount = computed(() => {
  const cfg = activeConfig.value
  if (cfg?.automationMode === 'full') {
    return normalizeMaxVariantExecutionCount(cfg.maxVariantExecutionCount ?? DEFAULT_MAX_VARIANT_EXECUTION_COUNT)
  }
  return globalMaxVariantCount.value
})

function getItemCardBadges(item: AiAutoSelectDraftItem) {
  return getCardStatusBadges(item, effectiveMaxVariantCount.value)
}

/** 全自动会话变体上限，供 App 注入帮填校验；半自动返回 null 走全局 */
function getSessionMaxVariantExecutionCount(): number | null {
  const cfg = activeConfig.value
  if (cfg?.automationMode === 'full') {
    return normalizeMaxVariantExecutionCount(cfg.maxVariantExecutionCount ?? DEFAULT_MAX_VARIANT_EXECUTION_COUNT)
  }
  return null
}

const automationDetailLines = computed(() => {
  const cfg = activeConfig.value
  if (!cfg || cfg.automationMode !== 'full') return []
  const lines = formatAiStepDetailLines(cfg.aiStep, cfg.maxVariantExecutionCount)
  const priceLine = formatListingPriceAdjustLine(cfg.listingPriceAdjust)
  if (priceLine) lines.push(priceLine)
  const shopCount = cfg.listingShops?.length ?? 0
  if (shopCount > 0) {
    lines.push(`自动上架：已选 ${shopCount} 个店铺`)
  }
  return lines
})

const progressPercent = computed(() => {
  const target = targetCount.value
  if (!target) return 0
  return Math.min(100, Math.round((collectedCount.value / target) * 100))
})

/** 环形进度 stroke-dashoffset，供最小化悬浮球 SVG 使用 */
const floatRingOffset = computed(() => {
  return FLOAT_RING_CIRCUMFERENCE * (1 - progressPercent.value / 100)
})

const statusLabel = computed(() => {
  const map: Record<RunnerStatus, string> = {
    idle: '待开始',
    collecting: '采集中',
    paused: '已暂停',
    stopped: '已停止',
    finished: '已完成',
    error: '异常',
  }
  return map[runnerStatus.value] ?? runnerStatus.value
})

const statusDotClass = computed(() => {
  if (runnerStatus.value === 'collecting') return 'is_active'
  if (runnerStatus.value === 'paused') return 'is_paused'
  if (runnerStatus.value === 'finished') return 'is_done'
  if (runnerStatus.value === 'error' || runnerStatus.value === 'stopped') return 'is_stopped'
  return ''
})

const isRunnerControllable = computed(
  () => runnerStatus.value === 'collecting' || runnerStatus.value === 'paused',
)

/** 下栏遮罩：无商品时展示采集/暂停/空结果态 */
type BottomOverlay = 'collecting' | 'paused' | 'empty'

const bottomOverlay = computed((): BottomOverlay | null => {
  const items = draft.value?.items ?? []
  if (items.length > 0) return null
  if (runnerStatus.value === 'collecting') return 'collecting'
  if (runnerStatus.value === 'paused') return 'paused'
  if (runnerStatus.value === 'stopped' || runnerStatus.value === 'finished') return 'empty'
  return null
})

const runnerCallbacks = {
  onDraftUpdate(d: AiAutoSelectDraft) {
    const prevKnown = knownItemIds
    // 与结果页内存合并 outcome，避免 Runner 旧副本覆盖已上架/已入采集箱
    draft.value = mergeDraftWithItemOutcomes(draft.value, d)
    runnerStatus.value = d.status
    // 全自动：每采集一件新商品立即入队 AI 处理
    if (d.config.automationMode === 'full') {
      const newItems: AiAutoSelectDraftItem[] = []
      for (const item of d.items) {
        if (!prevKnown.has(item.id)) {
          prevKnown.add(item.id)
          if (item.cardStatus === 'waiting_ai' && !isAutoSelectAiFillDone(item)) {
            newItems.push(item)
          }
        }
      }
      if (newItems.length) {
        void enqueueItemsToAiFill(newItems, d.config.aiStep, { silentLimitToast: true })
      }
    } else {
      for (const item of d.items) {
        prevKnown.add(item.id)
      }
    }
  },
  onStatusChange(status: RunnerStatus) {
    runnerStatus.value = status
    // 兜底：采集结束/停止时补入队漏网 waiting_ai 条目
    if (status === 'finished' || status === 'stopped') {
      void drainRemainingWaitingAi()
    }
  },
  onError(message: string) {
    showToast(message, 3000)
  },
  onCaptchaRequired(detailUrl: string) {
    void handleCaptchaRequiredPrompt(detailUrl)
  },
}
const statusFilter = ref<AutoSelectStatusFilter>('all')
const selectedIds = ref<Set<string>>(new Set())
const currentPage = ref(1)
const previewVisible = ref(false)
const previewUrl = ref('')
const ozonModalVisible = ref(false)
const ozonTargetIds = ref<string[]>([])
const showValidationWarningModal = ref(false)
const validationWarningMode = ref<ValidationWarningModalMode>('chinese')
const validationWarningFields = ref<ValidationWarningFieldItem[]>([])
const chineseBlockedItem = ref<AiAutoSelectDraftItem | null>(null)
const chineseBlockedMarks = ref<ChineseFieldMark[]>([])
const imageCountBlockedItem = ref<AiAutoSelectDraftItem | null>(null)
const imageCountFirstVariantIndex = ref<number | null>(null)
const aspectBlockedItem = ref<AiAutoSelectDraftItem | null>(null)
const aspectFirstVariantIndex = ref<number | null>(null)
const aspectFirstValidationItem = ref<VariantAspectValidationItem | null>(null)
const showOzonResultModal = ref(false)
const ozonResultMode = ref<'success' | 'failure'>('failure')
const ozonResultFailures = ref<OzonSubmitFailureItem[]>([])

const chineseBlockedProductTitle = computed(() => {
  const item = chineseBlockedItem.value ?? imageCountBlockedItem.value ?? aspectBlockedItem.value
  if (!item) return ''
  return formatItemLabelWithPosition(item)
})

/** 批量 AI 帮填 UI：卡片进度遮罩（排队 0% / 处理中模拟进度） */
type BatchFillProgress = {
  percent: number
  estimatedLabel: string
  estimatedMs: number
  status: 'waiting' | 'processing'
}

const batchFillProgressMap = ref<Map<string, BatchFillProgress>>(new Map())
const progressSimulators = new Map<string, AiFillProgressSimulator>()

const batchAiFillLoading = ref(false)
const batchOzonLoading = ref(false)
const autoOzonLoading = ref(false)
/** 打开选店弹窗前预校验进行中 */
const ozonPrevalidating = ref(false)
const ozonPrevalidatingIds = ref<Set<string>>(new Set())
const batchCollectBoxLoading = ref(false)
const batchDeleteLoading = ref(false)

/** 全自动采集：已见过的草稿条目 id，用于 onDraftUpdate 检测新商品 */
const knownItemIds = new Set<string>()
let aiFillQueue: AiFillQueue | null = null
let ozonAutoQueue: OzonAutoQueue | null = null
/** 全自动模式本次选品独立的 AI 流程配置 */
let queueAiStepOverride: AiAutoSelectAiStepConfig | undefined

function disposeAiFillQueue() {
  aiFillQueue?.dispose()
  aiFillQueue = null
  queueAiStepOverride = undefined
}

function disposeOzonAutoQueue() {
  ozonAutoQueue?.dispose()
  ozonAutoQueue = null
}

/** 业务结果写回：落盘并同步 Runner 内存，避免续采时 onDraftUpdate 覆盖 outcome */
async function persistItemOutcome(itemId: string, patch: Partial<AiAutoSelectDraftItem>) {
  if (!draft.value) return
  draft.value = updateDraftItem(draft.value, itemId, patch)
  await saveDraft(draft.value)
  patchRunnerDraftItem(itemId, patch)
}

/** 批量业务结果写回 */
async function persistItemsOutcome(itemIds: string[], patch: Partial<AiAutoSelectDraftItem>) {
  if (!draft.value || !itemIds.length) return
  draft.value = updateDraftItems(draft.value, itemIds, patch)
  await saveDraft(draft.value)
  for (const itemId of itemIds) {
    patchRunnerDraftItem(itemId, patch)
  }
}

/** 将 Ozon 上架失败写入草稿，供卡片展示 */
async function persistOzonListingFailures(itemId: string, failures: OzonListingFailureRecord[]) {
  await persistItemOutcome(itemId, { ozonListingFailures: failures })
}

function hasOzonListingFailure(item: AiAutoSelectDraftItem): boolean {
  return Boolean(item.ozonListingFailures?.length)
}

function getOzonListingFailureFullText(item: AiAutoSelectDraftItem): string {
  const failures = item.ozonListingFailures ?? []
  if (!failures.length) return ''
  return failures.map((f) => (f.shopId ? `店铺 ID ${f.shopId}：${f.message}` : f.message)).join('\n')
}

function openOzonListingErrorModal(item: AiAutoSelectDraftItem) {
  const failures = item.ozonListingFailures ?? []
  if (!failures.length) return
  ozonResultMode.value = 'failure'
  ozonResultFailures.value = failures.map((f) => ({ shopId: f.shopId, message: f.message }))
  showOzonResultModal.value = true
}

function ensureOzonAutoQueue() {
  if (ozonAutoQueue) return
  ozonAutoQueue = createOzonAutoQueue({
    processor: async (item) => {
      await runAutoOzonForItem(item)
    },
    onIdle: () => {
      autoOzonLoading.value = false
    },
  })
}

/** 帮填完成后按预选店铺自动上架，跳过选店弹窗 */
async function runAutoOzonForItem(item: AiAutoSelectDraftItem) {
  const config = activeConfig.value
  if (!config || !shouldAutoOzonFromConfig(config)) return
  if (batchOzonLoading.value || ozonPrevalidating.value) return
  const latest = getDraftItemById(item.id) ?? item
  if (!isOzonSubmitReady(latest) || latest.isListed || latest.needsManualEdit) return
  const precheck = validateOzonDraftItemBeforeSubmit(latest)
  if (precheck.status === 'chinese_blocked') {
    openChineseBlockedModal(latest, precheck.marks)
    return
  }
  if (precheck.status === 'image_count_exceeded') {
    openImageCountExceededModal(latest, precheck.items)
    return
  }
  if (precheck.status === 'aspect_validation_failed') {
    openVariantAspectValidationModal(latest, precheck.items)
    return
  }
  if (precheck.status === 'validation_failed') {
    await persistOzonListingFailures(latest.id, [{ shopId: 0, message: precheck.message }])
    return
  }
  autoOzonLoading.value = true
  const ozonLoadingNext = new Set(cardOzonLoadingIds.value)
  ozonLoadingNext.add(latest.id)
  cardOzonLoadingIds.value = ozonLoadingNext
  try {
    const result = await submitDraftItemsToOzon([latest], {
      selectedShopIds: config.listingShops,
      shopWarehouseInventory: config.listingShopWarehouseInventory,
      listingPriceAdjust: config.listingPriceAdjust,
    }, {
      isOzonSubmitReady,
      onChineseBlocked: (it, marks) => openChineseBlockedModal(it, marks),
      onVariantImageCountExceeded: (it, payload) => openImageCountExceededModal(it, payload.items),
      onVariantAspectValidationFailed: (it, payload) => openVariantAspectValidationModal(it, payload.items),
      onItemListed: async (itemId) => {
        await persistItemOutcome(itemId, { isListed: true, ozonListingFailures: undefined })
      },
      onItemListingFailed: async (failedItem, failures) => {
        await persistOzonListingFailures(failedItem.id, failures)
      },
    })
    if (showValidationWarningModal.value) return
    if (result.successCount > 0) {
      showToast('商品已自动上架', 2500)
    }
  } finally {
    const ozonDoneNext = new Set(cardOzonLoadingIds.value)
    ozonDoneNext.delete(latest.id)
    cardOzonLoadingIds.value = ozonDoneNext
  }
}

function maybeEnqueueAutoOzon(item: AiAutoSelectDraftItem) {
  const config = activeConfig.value
  if (!config || !shouldAutoOzonFromConfig(config)) return
  if (!isOzonSubmitReady(item) || item.isListed || item.needsManualEdit) return
  ensureOzonAutoQueue()
  autoOzonLoading.value = true
  ozonAutoQueue!.enqueue(item)
}

function ensureAiFillQueue(aiStepOverride?: AiAutoSelectAiStepConfig) {
  if (aiStepOverride !== undefined) {
    queueAiStepOverride = aiStepOverride
  }
  if (aiFillQueue) return
  aiFillQueue = createAiFillQueue({
    processor: async (item) => {
      if (!props.aiFillProcessor) return null
      return props.aiFillProcessor(item, queueAiStepOverride)
    },
    onItemStart: (item) => {
      batchAiFillLoading.value = true
      // cardStatus + aiSessionId 由 onAiTaskStarted 在拿到 sessionId 后统一落盘
      updateBatchFillProgress(item.id, { status: 'processing', percent: 0 })
    },
    onItemDone: (item) => {
      const simulator = progressSimulators.get(item.id)
      const finishItem = async () => {
        disposeProgressSimulator(item.id)
        removeBatchFillProgressEntry(item.id)
        await applyItemPatch(item.id, item)
        const latest = getDraftItemById(item.id)
        if (latest) maybeEnqueueAutoOzon(latest)
      }
      if (simulator) {
        simulator.complete(() => { void finishItem() })
      } else {
        void finishItem()
      }
    },
    onIdle: () => {
      batchAiFillLoading.value = false
      syncAiRecoverPollWithDraft(draft.value?.items ?? [])
    },
  })
}

/** 入队前写入 waiting 进度，变体超限则跳过 */
async function enqueueItemsToAiFill(
  items: AiAutoSelectDraftItem[],
  aiStepOverride?: AiAutoSelectAiStepConfig,
  options?: { silentLimitToast?: boolean },
) {
  if (!items.length || !props.aiFillProcessor) return
  const eligible = await filterEligibleBatchFillItems(items, {
    silentLimitToast: options?.silentLimitToast ?? aiStepOverride != null,
  })
  if (!eligible.length) return

  const stepOptions = await resolveAiFillStepOptions(aiStepOverride ?? null)
  // 手动帮填未传 override 时走全局设置，避免沿用全自动会话的 aiStep
  if (aiStepOverride !== undefined) {
    ensureAiFillQueue(aiStepOverride)
  } else {
    queueAiStepOverride = undefined
    ensureAiFillQueue()
  }
  batchAiFillLoading.value = true

  const next = new Map(batchFillProgressMap.value)
  eligible.forEach((item) => {
    if (!next.has(item.id)) {
      next.set(item.id, buildBatchFillProgressEntry(item, stepOptions))
    }
  })
  setBatchFillProgressMap(next)
  aiFillQueue!.enqueueMany(eligible)
}

/** 采集结束兜底：补入队仍为 waiting_ai 且未帮填完成的条目 */
async function drainRemainingWaitingAi() {
  const config = activeConfig.value
  if (!config || config.automationMode !== 'full') return
  const pending = (draft.value?.items ?? []).filter(
    (i) => i.cardStatus === 'waiting_ai' && !isAutoSelectAiFillDone(i),
  )
  if (!pending.length) return
  await enqueueItemsToAiFill(pending, config.aiStep, { silentLimitToast: true })
}

/** 单卡操作 loading：按商品 id 追踪，避免重复点击 */
const cardCollectLoadingIds = ref<Set<string>>(new Set())
const cardOzonLoadingIds = ref<Set<string>>(new Set())

/** 批量操作互斥：任一进行中时禁用其余批量按钮 */
const batchActionBusy = computed(
  () =>
    batchAiFillLoading.value
    || batchOzonLoading.value
    || autoOzonLoading.value
    || ozonPrevalidating.value
    || batchCollectBoxLoading.value
    || batchDeleteLoading.value,
)

const filteredItems = computed(() => {
  const items = draft.value?.items || []
  if (statusFilter.value === 'all') return items
  if (statusFilter.value === 'listed') return items.filter((i) => i.isListed)
  if (statusFilter.value === 'in_collect_box') return items.filter((i) => i.inCollectBox)
  return items.filter((i) => i.cardStatus === statusFilter.value)
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / PAGE_SIZE)))

const paginationItems = computed(() => buildPaginationItems(currentPage.value, totalPages.value))

const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return filteredItems.value.slice(start, start + PAGE_SIZE)
})

/** 当前筛选与 selectedIds 的交集，批量操作与按钮可用性均以此为准 */
const filteredSelectedIdSet = computed(() => {
  const ids = new Set<string>()
  for (const item of filteredItems.value) {
    if (selectedIds.value.has(item.id)) ids.add(item.id)
  }
  return ids
})

const hasSelection = computed(() => filteredSelectedIdSet.value.size > 0)

/** 当前筛选列表是否已全部勾选（用于头部全选复选框） */
const isAllSelected = computed(() => {
  const items = filteredItems.value
  if (!items.length) return false
  return items.every((i) => selectedIds.value.has(i.id))
})

async function reloadDraft() {
  if (!activeSessionId.value) return
  draft.value = await resolveTabDraft(activeSessionId.value, window.location.href)
}

async function persistItem(item: AiAutoSelectDraftItem) {
  if (!draft.value) return
  const evalResult = evaluateNeedsManualEdit(item)
  const next = {
    ...item,
    needsManualEdit: evalResult.needsManualEdit,
    manualEditFocus: evalResult.manualEditFocus,
  }
  draft.value = updateDraftItem(draft.value, item.id, next)
  await saveDraft(draft.value)
  // 有 sessionId 时立即调度恢复，不必等整队帮填结束
  if (next.cardStatus === 'ai_processing' && next.aiSessionId) {
    scheduleAiFillRecover(next.id)
  }
  syncAiRecoverPollWithDraft(draft.value.items)
}

async function persistDraft(next: AiAutoSelectDraft) {
  draft.value = next
  await saveDraft(next)
}

/** 卡片展示标题：始终用列表页采集时的原标题，不随帮填后的 product_name 变化 */
function cardDisplayTitle(item: AiAutoSelectDraftItem): string {
  return String(item.title ?? '').trim()
}

function cardImage(item: AiAutoSelectDraftItem): string {
  return item.mainImageUrl || item.transformed?.global_data?.media_gallery?.main_images?.[0] || ''
}

function displayPrice(item: AiAutoSelectDraftItem): string {
  if (item.listPrice != null) return String(item.listPrice)
  const sku = item.transformed?.sku_matrix?.[0]
  return sku?.price_amount != null ? String(sku.price_amount) : '-'
}

function formatRepurchase(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

/** 全选/取消全选：作用于当前筛选结果下的全部商品（含各分页） */
function toggleSelectAll() {
  const items = filteredItems.value
  if (!items.length) return
  if (isAllSelected.value) {
    const next = new Set(selectedIds.value)
    items.forEach((i) => next.delete(i.id))
    selectedIds.value = next
    return
  }
  // 替换式全选：仅选中当前筛选商品，不保留其它筛选下的勾选
  selectedIds.value = new Set(items.map((i) => i.id))
}

function getSelectedItems(): AiAutoSelectDraftItem[] {
  const idSet = filteredSelectedIdSet.value
  return filteredItems.value.filter((i) => idSet.has(i.id))
}

type CardButton = {
  key: string
  label: string
  loadingLabel?: string
  primary?: boolean
  handler: (item: AiAutoSelectDraftItem) => void
}

function isCardButtonLoading(itemId: string, key: string): boolean {
  if (key === 'collect') return cardCollectLoadingIds.value.has(itemId)
  if (key === 'ozon') {
    return cardOzonLoadingIds.value.has(itemId) || ozonPrevalidatingIds.value.has(itemId)
  }
  return false
}

function getBatchFillProgress(item: AiAutoSelectDraftItem): BatchFillProgress | null {
  return batchFillProgressMap.value.get(item.id) ?? null
}

/** 轮询恢复等待遮罩：批量进度遮罩优先，且无有效帮填结果时展示 */
function getCardRecoverMask(item: AiAutoSelectDraftItem): boolean {
  if (getBatchFillProgress(item)) return false
  const latest = getDraftItemById(item.id) ?? item
  return isAwaitingAiFillRecover(latest)
}

const AWAITING_RECOVER_TOAST = '正在重新获取帮填结果，请稍后'

/** 等待帮填恢复时拦截进工作台，返回 true 表示已拦截 */
function blockEditIfAwaitingRecover(item: AiAutoSelectDraftItem): boolean {
  const latest = getDraftItemById(item.id) ?? item
  if (!isAwaitingAiFillRecover(latest)) return false
  showToast(AWAITING_RECOVER_TOAST, 3000)
  return true
}

function formatProgressPercent(percent: number): string {
  return `${Math.round(percent)}%`
}

function buildBatchFillProgressEntry(
  item: AiAutoSelectDraftItem,
  stepOptions: AiFillStepOptions,
): BatchFillProgress {
  const skuCount = getSkuVariantCount(item)
  const seconds = calcAiFillEstimatedSeconds(skuCount, stepOptions, item.transformed)
  return {
    percent: 0,
    estimatedLabel: formatEstimatedDuration(seconds),
    estimatedMs: calcAiFillEstimatedMs(skuCount, stepOptions, item.transformed),
    status: 'waiting',
  }
}

function setBatchFillProgressMap(next: Map<string, BatchFillProgress>) {
  batchFillProgressMap.value = next
}

function updateBatchFillProgress(itemId: string, patch: Partial<BatchFillProgress>) {
  const next = new Map(batchFillProgressMap.value)
  const current = next.get(itemId)
  if (!current) return
  next.set(itemId, { ...current, ...patch })
  setBatchFillProgressMap(next)
}

function removeBatchFillProgressEntry(itemId: string) {
  if (!batchFillProgressMap.value.has(itemId)) return
  const next = new Map(batchFillProgressMap.value)
  next.delete(itemId)
  setBatchFillProgressMap(next)
}

function disposeProgressSimulator(itemId: string) {
  progressSimulators.get(itemId)?.dispose()
  progressSimulators.delete(itemId)
}

function disposeAllProgressSimulators() {
  progressSimulators.forEach((sim) => sim.dispose())
  progressSimulators.clear()
}

function clearBatchFillProgress() {
  disposeAllProgressSimulators()
  setBatchFillProgressMap(new Map())
}

/** AI 任务提交后启动 rAF 模拟进度（由 App 经 headless batchFill 回调触发） */
function notifyBatchFillAiTaskStarted(itemId: string) {
  const entry = batchFillProgressMap.value.get(itemId)
  if (!entry || entry.status !== 'processing') return
  if (progressSimulators.has(itemId)) return

  const simulator = createAiFillProgressSimulator({
    estimatedMs: entry.estimatedMs,
    onUpdate: (percent) => updateBatchFillProgress(itemId, { percent }),
  })
  progressSimulators.set(itemId, simulator)
  simulator.start()
}

function cardButtons(item: AiAutoSelectDraftItem): CardButton[] {
  const edit: CardButton = {
    key: 'edit',
    label: '编辑',
    handler: (i) => {
      if (blockEditIfAwaitingRecover(i)) return
      emit('edit-item', i)
    },
  }
  const collect: CardButton = {
    key: 'collect',
    label: '加入采集箱',
    loadingLabel: '加入中…',
    handler: (i) => handleSingleCollectBox(i),
  }
  const ozon: CardButton = {
    key: 'ozon',
    label: '上架至Ozon',
    loadingLabel: ozonPrevalidatingIds.value.has(item.id) ? '检查中…' : '上架中…',
    primary: true,
    handler: (i) => openOzonSubmit([i.id]),
  }
  const del: CardButton = { key: 'del', label: '删除', handler: (i) => handleSingleDelete(i) }
  const detail: CardButton = {
    key: 'detail',
    label: '商品详情',
    handler: (i) => window.open(i.detailUrl, '_blank'),
  }
  return [edit, collect, ozon, del, detail]
}

function handleCardClick(item: AiAutoSelectDraftItem) {
  const fillProgress = getBatchFillProgress(item)
  if (fillProgress?.status === 'processing') {
    showToast('生成商品信息中，请稍后', 3000)
    return
  }
  if (fillProgress?.status === 'waiting') {
    showToast('正在排队等待 AI 处理', 3000)
    return
  }
  if (blockEditIfAwaitingRecover(item)) return
  emit('edit-item', item)
}

function handleEditTag(item: AiAutoSelectDraftItem) {
  if (blockEditIfAwaitingRecover(item)) return
  emit('edit-item', item, item.manualEditFocus)
}

function openPreview(item: AiAutoSelectDraftItem) {
  const url = cardImage(item)
  if (!url) return
  previewUrl.value = url
  previewVisible.value = true
}

async function handleSingleCollectBox(item: AiAutoSelectDraftItem) {
  const latest = getDraftItemById(item.id) ?? item
  if (latest.inCollectBox) {
    showToast('该商品已加入采集箱', 2000)
    return
  }
  if (cardCollectLoadingIds.value.has(item.id)) return
  const loadingNext = new Set(cardCollectLoadingIds.value)
  loadingNext.add(item.id)
  cardCollectLoadingIds.value = loadingNext
  try {
    const result = await addToCollectBox([latest])
    if (!result.succeededIds.length || !draft.value) return
    await persistItemOutcome(item.id, { inCollectBox: true })
    showToast('已加入采集箱', 2000)
  } finally {
    const doneNext = new Set(cardCollectLoadingIds.value)
    doneNext.delete(item.id)
    cardCollectLoadingIds.value = doneNext
  }
}

async function handleBatchCollectBox() {
  const items = getSelectedItems()
  if (!items.length || batchActionBusy.value) return
  const skipped = items.filter((i) => (getDraftItemById(i.id) ?? i).inCollectBox)
  const toProcess = items.filter((i) => !(getDraftItemById(i.id) ?? i).inCollectBox)
  if (skipped.length) {
    showToast(`已跳过 ${skipped.length} 个已加入采集箱的商品`, 2500)
  }
  if (!toProcess.length) return
  batchCollectBoxLoading.value = true
  try {
    const latestItems = toProcess.map((i) => getDraftItemById(i.id) ?? i)
    const result = await addToCollectBox(latestItems)
    if (!result.succeededIds.length || !draft.value) return
    await persistItemsOutcome(result.succeededIds, { inCollectBox: true })
    if (result.failed.length === 0) {
      showToast('批量加入采集箱完成', 2000)
    }
  } finally {
    batchCollectBoxLoading.value = false
  }
}

function handleSingleDelete(item: AiAutoSelectDraftItem) {
  messageBoxConfirm('确定删除该商品吗？')
    .then(async () => {
      if (!draft.value) return
      // 删除前记入 seenOfferIds，续采时不再扫描同一 offerId
      draft.value = rememberSeenOfferIds(draft.value, [item.offerId])
      draft.value = removeDraftItems(draft.value, [item.id])
      await saveDraft(draft.value)
      removeRunnerDraftItems([item.id])
      selectedIds.value.delete(item.id)
    })
    .catch(() => { })
}

function handleBatchDelete() {
  if (batchActionBusy.value) return
  const items = getSelectedItems()
  if (!items.length) return

  messageBoxConfirm(`确定删除选中的 ${items.length} 个商品吗？`)
    .then(async () => {
      if (!draft.value) return
      batchDeleteLoading.value = true
      try {
        await nextTick()
        const itemIds = items.map((i) => i.id)
        draft.value = rememberSeenOfferIds(draft.value, items.map((i) => i.offerId))
        draft.value = removeDraftItems(draft.value, itemIds)
        await saveDraft(draft.value)
        removeRunnerDraftItems(itemIds)
        selectedIds.value = new Set()
      } finally {
        batchDeleteLoading.value = false
      }
    })
    .catch(() => { })
}

/** 商品在当前筛选列表中的分页位置，便于用户定位卡片 */
function getFilteredItemPosition(item: AiAutoSelectDraftItem): { page: number; indexOnPage: number } | null {
  const index = filteredItems.value.findIndex((i) => i.id === item.id)
  if (index < 0) return null
  return {
    page: Math.floor(index / PAGE_SIZE) + 1,
    indexOnPage: (index % PAGE_SIZE) + 1,
  }
}

/** 第 x 页第 x 个商品 + 标题，供预检确认框与中文警告弹窗复用 */
function formatItemLabelWithPosition(item: AiAutoSelectDraftItem): string {
  const title = item.title?.trim()
  const pos = getFilteredItemPosition(item)
  const posHint = pos ? `第${pos.page}页的第${pos.indexOnPage}个商品` : ''
  if (posHint && title) return `${posHint}「${title}」`
  if (posHint) return posHint
  return title || ''
}

function formatOzonItemHint(item: AiAutoSelectDraftItem, message: string): string {
  const label = formatItemLabelWithPosition(item)
  return label ? `${label}${message}` : message
}

/** 预检失败：弹公用确认框，确认后打开对应商品编辑 */
async function confirmThenOpenItemEdit(
  item: AiAutoSelectDraftItem,
  message: string,
  focus?: AiAutoSelectDraftItem['manualEditFocus'],
) {
  try {
    await messageBoxConfirm(message, '上架预检', {
      confirmButtonText: '去编辑',
      cancelButtonText: '取消',
      type: 'warning',
    })
    if (blockEditIfAwaitingRecover(item)) return
    emit('edit-item', item, focus ?? item.manualEditFocus)
  } catch {
    // 用户取消
  }
}

/** 上架前预校验：不合规弹确认框引导编辑，通过后再打开选店弹窗 */
async function openOzonSubmit(ids?: string[]) {
  if (ozonPrevalidating.value || batchOzonLoading.value) return

  const isBatch = !ids
  const selectedItems = isBatch
    ? getSelectedItems()
    : ids.map((id) => getDraftItemById(id)).filter((i): i is AiAutoSelectDraftItem => Boolean(i))

  if (!selectedItems.length) return

  const skipped = selectedItems.filter((i) => i.isListed)
  const toProcess = selectedItems.filter((i) => !i.isListed)

  // 单卡上架：已上架则直接提示，不弹配置窗
  if (!isBatch && skipped.length) {
    showToast('该商品已上架', 2000)
    return
  }

  if (isBatch && skipped.length) {
    showToast(`已跳过 ${skipped.length} 个已上架的商品`, 2500)
  }
  if (!toProcess.length) return

  const notReady = toProcess.filter((i) => !isOzonSubmitReady(getDraftItemById(i.id) ?? i))
  const ready = toProcess.filter((i) => isOzonSubmitReady(getDraftItemById(i.id) ?? i))

  if (!isBatch && notReady.length) {
    const latest = getDraftItemById(notReady[0].id) ?? notReady[0]
    if (latest.cardStatus === 'ai_processing') {
      showToast('AI 处理中，请稍后再试', 3000)
    } else {
      showToast('请先进行 AI 帮填后再上架', 3000)
    }
    return
  }

  if (isBatch && notReady.length) {
    showToast(`已跳过 ${notReady.length} 个未完成 AI 帮填的商品`, 2500)
  }
  if (!ready.length) return

  const targetIds = ready.map((i) => i.id)
  let blockedEdit: {
    item: AiAutoSelectDraftItem
    message: string
    focus?: AiAutoSelectDraftItem['manualEditFocus']
  } | null = null

  ozonPrevalidating.value = true
  ozonPrevalidatingIds.value = new Set(targetIds)
  try {
    for (const item of ready) {
      const latest = getDraftItemById(item.id) ?? item

      if (latest.needsManualEdit) {
        blockedEdit = {
          item: latest,
          message: formatOzonItemHint(latest, '存在异常，请先手动编辑修正后再尝试上架'),
          focus: latest.manualEditFocus,
        }
        break
      }

      const precheck = validateOzonDraftItemBeforeSubmit(latest)
      if (precheck.status === 'chinese_blocked') {
        openChineseBlockedModal(latest, precheck.marks)
        return
      }
      if (precheck.status === 'image_count_exceeded') {
        openImageCountExceededModal(latest, precheck.items)
        return
      }
      if (precheck.status === 'aspect_validation_failed') {
        openVariantAspectValidationModal(latest, precheck.items)
        return
      }
      if (precheck.status === 'validation_failed') {
        const evalResult = evaluateNeedsManualEdit(latest)
        blockedEdit = {
          item: latest,
          message: formatOzonItemHint(latest, precheck.message),
          focus: evalResult.manualEditFocus,
        }
        break
      }
    }

    if (!blockedEdit) {
      ozonTargetIds.value = targetIds
      ozonModalVisible.value = true
    }
  } finally {
    ozonPrevalidating.value = false
    ozonPrevalidatingIds.value = new Set()
  }

  if (blockedEdit) {
    await confirmThenOpenItemEdit(blockedEdit.item, blockedEdit.message, blockedEdit.focus)
  }
}

function openChineseBlockedModal(item: AiAutoSelectDraftItem, marks: ChineseFieldMark[]) {
  imageCountBlockedItem.value = null
  aspectBlockedItem.value = null
  aspectFirstValidationItem.value = null
  chineseBlockedItem.value = item
  chineseBlockedMarks.value = marks
  validationWarningMode.value = 'chinese'
  validationWarningFields.value = marks.map(({ label, value }) => ({ label, value }))
  imageCountFirstVariantIndex.value = null
  aspectFirstVariantIndex.value = null
  showValidationWarningModal.value = true
}

function openImageCountExceededModal(item: AiAutoSelectDraftItem, items: VariantImageCountExceededItem[]) {
  chineseBlockedItem.value = null
  chineseBlockedMarks.value = []
  aspectBlockedItem.value = null
  aspectFirstValidationItem.value = null
  imageCountBlockedItem.value = item
  validationWarningMode.value = 'image_count'
  validationWarningFields.value = buildVariantImageCountWarningFields(items)
  imageCountFirstVariantIndex.value = items[0]?.variantIndex != null ? items[0].variantIndex - 1 : null
  aspectFirstVariantIndex.value = null
  showValidationWarningModal.value = true
}

function openVariantAspectValidationModal(item: AiAutoSelectDraftItem, items: VariantAspectValidationItem[]) {
  chineseBlockedItem.value = null
  chineseBlockedMarks.value = []
  imageCountBlockedItem.value = null
  aspectBlockedItem.value = item
  aspectFirstValidationItem.value = items[0] ?? null
  validationWarningMode.value = 'variant_aspect'
  validationWarningFields.value = buildVariantAspectWarningFields(items)
  aspectFirstVariantIndex.value = items[0]?.variantIndex != null ? items[0].variantIndex - 1 : null
  imageCountFirstVariantIndex.value = null
  showValidationWarningModal.value = true
}

function resetValidationWarningModalState() {
  showValidationWarningModal.value = false
  validationWarningMode.value = 'chinese'
  validationWarningFields.value = []
  chineseBlockedItem.value = null
  chineseBlockedMarks.value = []
  imageCountBlockedItem.value = null
  imageCountFirstVariantIndex.value = null
  aspectBlockedItem.value = null
  aspectFirstVariantIndex.value = null
  aspectFirstValidationItem.value = null
}

function handleImageCountGoEdit() {
  const imageItem = imageCountBlockedItem.value
  const index = imageCountFirstVariantIndex.value
  resetValidationWarningModalState()
  if (!imageItem) return
  if (blockEditIfAwaitingRecover(imageItem)) return
  emit('edit-item', imageItem, { kind: 'image_queue', rowIndex: index ?? 0 })
}

function handleVariantAspectGoEdit() {
  const aspectItem = aspectBlockedItem.value
  const index = aspectFirstVariantIndex.value
  const validationItem = aspectFirstValidationItem.value
  resetValidationWarningModalState()
  if (!aspectItem) return
  if (blockEditIfAwaitingRecover(aspectItem)) return
  const focus = validationItem
    ? manualEditFocusFromVariantAspectItem(validationItem, aspectItem.editState?.featureAttrs)
    : { kind: 'sku' as const, rowIndex: index ?? 0 }
  emit('edit-item', aspectItem, focus)
}

function handleValidationWarningGoEdit() {
  if (validationWarningMode.value === 'image_count') {
    handleImageCountGoEdit()
    return
  }
  if (validationWarningMode.value === 'variant_aspect') {
    handleVariantAspectGoEdit()
  }
}

function handleValidationWarningBack() {
  const item = chineseBlockedItem.value
  const marks = chineseBlockedMarks.value
  resetValidationWarningModalState()
  if (!item) return
  if (blockEditIfAwaitingRecover(item)) return
  const focus = marks.length ? manualEditFocusFromChineseMark(marks[0]) : undefined
  emit('edit-item', item, focus, marks)
}

async function handleOzonConfirm(payload: {
  selectedShopIds: number[]
  shopWarehouseInventory: Record<number, { warehouseId: number | null; quantity: number }>
}) {
  ozonModalVisible.value = false
  const items = (draft.value?.items || [])
    .filter((i) => ozonTargetIds.value.includes(i.id))
    .filter((i) => isOzonSubmitReady(getDraftItemById(i.id) ?? i))

  batchOzonLoading.value = true
  try {
    const config = activeConfig.value
    const result = await submitDraftItemsToOzon(items, {
      ...payload,
      listingPriceAdjust: config?.listingPriceAdjust,
    }, {
      isOzonSubmitReady: (item) => isOzonSubmitReady(getDraftItemById(item.id) ?? item),
      onValidationFailed: (msg) => showToast(msg, 4000),
      onVariantImageCountExceeded: (item, payload) => openImageCountExceededModal(item, payload.items),
      onVariantAspectValidationFailed: (item, payload) => openVariantAspectValidationModal(item, payload.items),
      onChineseBlocked: (item, marks) => openChineseBlockedModal(item, marks),
      onError: (msg) => showToast(msg, 4000),
      onItemListed: async (itemId) => {
        await persistItemOutcome(itemId, { isListed: true })
      },
    })

    if (showValidationWarningModal.value) return
    if (result.failures.length > 0) {
      ozonResultMode.value = 'failure'
      ozonResultFailures.value = result.failures.map((f) => ({
        shopId: f.shopId,
        message: f.message,
      }))
      showOzonResultModal.value = true
    } else if (result.successCount > 0) {
      showToast(`成功上架 ${result.successCount} 个商品`, 3000)
    } else if (result.processedCount > 0) {
      showToast('上架失败，请检查商品信息', 3000)
    }
  } finally {
    batchOzonLoading.value = false
  }
}

/** 筛选可进入批量帮填队列的商品，并校验变体上限 */
async function filterEligibleBatchFillItems(
  items: AiAutoSelectDraftItem[],
  options?: { silentLimitToast?: boolean },
): Promise<AiAutoSelectDraftItem[]> {
  const maxVariantExecutionCount = activeConfig.value?.automationMode === 'full'
    ? normalizeMaxVariantExecutionCount(activeConfig.value.maxVariantExecutionCount ?? DEFAULT_MAX_VARIANT_EXECUTION_COUNT)
    : await getMaxVariantExecutionCount()
  const eligible: AiAutoSelectDraftItem[] = []
  for (const item of items) {
    const skuCount = getSkuVariantCount(item)
    if (isVariantCountOverLimit(skuCount, maxVariantExecutionCount)) {
      if (!options?.silentLimitToast) {
        showToast(
          formatVariantLimitExceededMessageForItem(item.title, skuCount, maxVariantExecutionCount),
          3500,
        )
      }
      continue
    }
    eligible.push(item)
  }
  return eligible
}

/** 全自动模式：初始化队列；续采时补入队 waiting_ai 条目 */
async function initFullAutoQueue(config: AiAutoSelectConfig, resumeFrom?: AiAutoSelectDraft | null) {
  disposeAiFillQueue()
  disposeOzonAutoQueue()
  knownItemIds.clear()
  if (config.automationMode !== 'full') return
  if (resumeFrom) {
    for (const item of resumeFrom.items) {
      knownItemIds.add(item.id)
    }
    const pending = resumeFrom.items.filter(
      (i) => i.cardStatus === 'waiting_ai' && !isAutoSelectAiFillDone(i),
    )
    if (pending.length) {
      await enqueueItemsToAiFill(pending, config.aiStep, { silentLimitToast: true })
    }
  }
}

async function handleBatchAiFill() {
  if (batchActionBusy.value) return
  const selected = getSelectedItems()
  const skippedDone = selected.filter((i) => isAutoSelectAiFillDone(i))
  let items = selected.filter(
    (i) => i.cardStatus !== 'ai_processing' && !isAutoSelectAiFillDone(i),
  )
  if (!items.length) {
    if (skippedDone.length) {
      showToast('所选商品均已 AI 帮填，无需重复处理', 3000)
    }
    return
  }
  if (skippedDone.length) {
    showToast(`已跳过 ${skippedDone.length} 个已帮填商品`, 2500)
  }

  const eligible = await filterEligibleBatchFillItems(items)
  if (!eligible.length) return

  await runBatchAiFill(eligible)
}

/** 关闭主弹窗时重置嵌套子弹窗，避免重开时意外弹出 */
function resetNestedModalState() {
  previewVisible.value = false
  previewUrl.value = ''
  ozonModalVisible.value = false
  ozonTargetIds.value = []
  resetValidationWarningModalState()
  showOzonResultModal.value = false
  ozonResultFailures.value = []
}

/** 帮填进行中重开时，跳到首个有进度商品的所在页 */
function syncPageToBatchFillProgress() {
  if (!batchFillProgressMap.value.size) return
  const firstId = batchFillProgressMap.value.keys().next().value as string | undefined
  if (!firstId) return
  const items = draft.value?.items ?? []
  const index = items.findIndex((i) => i.id === firstId)
  if (index >= 0) {
    currentPage.value = Math.floor(index / PAGE_SIZE) + 1
  }
}

function handlePause() {
  pauseRunner(runnerCallbacks)
}

/** 1688 人机验证：弹公用确认框引导去验证，验证后用户手动点「继续」恢复采集 */
async function handleCaptchaRequiredPrompt(detailUrl: string) {
  try {
    await messageBoxConfirm('已触发1688人机验证，请点击去验证，验证后手动点击继续，否则无法继续选品。', '验证提示', {
      confirmButtonText: '去验证',
      cancelButtonText: '取消',
      type: 'warning',
    })
    window.open(detailUrl, '_blank')
  } catch {
    // 用户关闭弹窗，仍需手动点「继续」
  }
}

function handleResume() {
  resumeRunner(runnerCallbacks)
}

function handleStop() {
  stopRunner(runnerCallbacks)
}

/** 空结果时回到配置弹窗重新选品 */
function handleReselect() {
  const config = activeConfig.value
  if (!config) return
  emit('reselect', normalizeAiAutoSelectConfig(config))
}

/** 跨页 autoStart 落地时预填进度 UI，避免等待列表 DOM 期间弹窗空白 */
function prepareCollectionUi(config: AiAutoSelectConfig, sessionId: string) {
  activeSessionId.value = sessionId
  bindRunnerSession(sessionId)
  draft.value = createEmptyDraft(window.location.href, config, sessionId)
  runnerStatus.value = 'collecting'
}

/** 由配置弹窗触发：在当前列表页启动或续采 */
async function startCollection(config: AiAutoSelectConfig, resumeFrom?: AiAutoSelectDraft | null, sessionId?: string) {
  const resolvedSessionId = resumeFrom?.sessionId ?? sessionId ?? activeSessionId.value ?? await ensureTabSessionId()
  activeSessionId.value = resolvedSessionId
  bindRunnerSession(resolvedSessionId)
  await initFullAutoQueue(config, resumeFrom)
  if (resumeFrom) {
    draft.value = resumeFrom
    runnerStatus.value = 'collecting'
    setRunnerDraft(resumeFrom)
    // 用户点击「继续采集」后才恢复帮填轮询，避免刷新后静默请求
    syncAiRecoverPollWithDraft(resumeFrom.items, { resetAttempts: true })
    await startRunner(config, runnerCallbacks, resumeFrom)
    return
  }
  await clearDraft(resolvedSessionId)
  draft.value = createEmptyDraft(window.location.href, config, resolvedSessionId)
  setRunnerDraft(null)
  runnerStatus.value = 'collecting'
  await startRunner(config, runnerCallbacks, null)
}

function handleClose() {
  if (isRunnerActive()) {
    messageBoxConfirm('采集正在进行，确定关闭吗？关闭将停止采集。')
      .then(() => {
        stopRunner(runnerCallbacks)
        doClose()
      })
      .catch(() => { })
    return
  }
  doClose()
}

/** 最小化：隐藏弹窗与遮罩，采集 runner 继续在后台运行 */
function handleMinimize() {
  resetNestedModalState()
  minimized.value = true
  emit('update:visible', false)
}

/** 从最小化悬浮球恢复全屏结果弹窗 */
function handleRestore() {
  minimized.value = false
  emit('update:visible', true)
}

function isMinimized() {
  return minimized.value
}

function restoreFromMinimized() {
  if (minimized.value) {
    handleRestore()
  }
}

function doClose() {
  minimized.value = false
  // 帮填进行中：仅隐藏弹窗，保留进度 Map 与 rAF 模拟器供重开恢复
  if (!batchAiFillLoading.value) {
    clearBatchFillProgress()
  }
  resetNestedModalState()
  emit('update:visible', false)
  emit('close')
}

/** 按 id 读取草稿最新条目，优先内存（批量帮填刚写入可能尚未落盘） */
function getDraftItemById(id: string): AiAutoSelectDraftItem | undefined {
  return draft.value?.items.find((i) => i.id === id)
}

/** 外部 AI 帮填完成后回写 */
async function applyItemPatch(itemId: string, patch: Partial<AiAutoSelectDraftItem>) {
  if (!draft.value) await reloadDraft()
  if (!draft.value) return
  const existing = draft.value.items.find((i) => i.id === itemId)
  if (!existing) return
  const nextTransformed = patch.transformed ?? existing.transformed
  const merged: AiAutoSelectDraftItem = {
    ...existing,
    ...patch,
    // 保留列表页原标题供卡片展示；帮填后的 product_name 仅存在于 transformed
    title: existing.title,
    transformed: nextTransformed,
    editState: patch.editState
      ? { ...existing.editState, ...patch.editState }
      : existing.editState,
    aiStepFailures: patch.aiStepFailures ?? existing.aiStepFailures,
  }
  await persistItem(merged)
  // 同步 Runner 内存草稿，避免继续采集时旧内存覆盖 IndexedDB
  patchRunnerDraftItem(itemId, merged)
}

async function runBatchAiFill(
  items: AiAutoSelectDraftItem[],
  aiStepOverride?: AiAutoSelectAiStepConfig,
) {
  if (!items.length) return
  await enqueueItemsToAiFill(items, aiStepOverride)
  if (aiFillQueue) {
    await aiFillQueue.waitUntilIdle()
  }
}

function getProcessingDraftItems(): AiAutoSelectDraftItem[] {
  return (draft.value?.items ?? []).filter((i) => i.cardStatus === 'ai_processing')
}

watch(
  () => props.visible,
  async (open) => {
    if (open) {
      minimized.value = false
      // 草稿同步须在首个 await 之前完成，避免 App autoStart 的 prepareCollectionUi 被后续 reloadDraft 覆盖
      const runnerDraft = getRunnerDraft()
      // 仅采集中优先 Runner 内存（实时进度）；查看历史记录时以 loadSessionRecords / reloadDraft 为准
      if (runnerDraft && isRunnerActive()) {
        draft.value = runnerDraft
        activeSessionId.value = runnerDraft.sessionId
        runnerStatus.value = runnerDraft.status
      } else {
        if (!activeSessionId.value) {
          activeSessionId.value = await ensureTabSessionId()
        }
        // 「使用上次记录」可能在打开前已通过 loadSessionRecords 灌入草稿，避免重复 reload 覆盖
        if (!draft.value || draft.value.sessionId !== activeSessionId.value) {
          await reloadDraft()
        }
        runnerStatus.value = draft.value?.status ?? 'idle'
      }
      selectedIds.value = new Set()
      // 半自动卡片徽章依赖全局变体上限
      globalMaxVariantCount.value = await getMaxVariantExecutionCount()
      // 帮填进行中重开：保留进度并跳到含进度商品的页码
      if (batchAiFillLoading.value && batchFillProgressMap.value.size > 0) {
        syncPageToBatchFillProgress()
      } else {
        currentPage.value = 1
      }
      // 仅同会话采集中重开结果页时同步，冷打开「使用上次数据」不触发恢复
      if (isRunnerActive() || batchAiFillLoading.value) {
        syncAiRecoverPollWithDraft(draft.value?.items ?? [])
      }
    }
  },
)

watch(statusFilter, () => {
  currentPage.value = 1
})

onUnmounted(() => {
  disposeAiFillQueue()
  disposeOzonAutoQueue()
  clearBatchFillProgress()
})

/** 仅加载指定会话的历史记录展示，不启动采集 */
async function loadSessionRecords(sessionId: string) {
  activeSessionId.value = sessionId
  bindRunnerSession(sessionId)
  const loaded = await readDraft(sessionId)
  draft.value = loaded
  runnerStatus.value = loaded?.status ?? 'idle'
  // 同步 Runner 内存，避免 visible watch 用旧会话/采集中草稿覆盖刚加载的历史记录
  setRunnerDraft(loaded)
  selectedIds.value = new Set()
  currentPage.value = 1
}

defineExpose({
  reloadDraft,
  applyItemPatch,
  runBatchAiFill,
  getDraftItemById,
  getProcessingDraftItems,
  notifyBatchFillAiTaskStarted,
  prepareCollectionUi,
  loadSessionRecords,
  startCollection,
  isMinimized,
  restoreFromMinimized,
  getSessionMaxVariantExecutionCount,
})
</script>

<style scoped lang="scss">
.mjgd_ai_auto_select_result_overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.mjgd_ai_auto_select_result_modal {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(1200px, 92vw);
  height: 90vh;
  background: #ffffff;
  border-radius: 12px;
  padding: 20px 24px;
  overflow: hidden;
}

.mjgd_ai_auto_select_result_header_actions {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  gap: 8px;
  z-index: 2;
}

.mjgd_ai_auto_select_result_minimize,
.mjgd_ai_auto_select_result_close {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: #e2e8f0;
  border-radius: 50%;
  cursor: pointer;
  font-size: 20px;
  line-height: 32px;
  color: #475569;
}

.mjgd_ai_auto_select_result_minimize {
  font-size: 22px;
  line-height: 28px;

  &:hover {
    background: #cbd5e1;
  }
}

.mjgd_ai_auto_select_result_close:hover {
  background: #cbd5e1;
}

// 采集中雷达扫描：扇形旋转动画，悬浮球 / 遮罩 / 状态点共用
@keyframes mjgd_ai_auto_select_radar_spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.mjgd_ai_auto_select_result_radar_sweep {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(from 0deg, transparent 0deg, rgba(37, 99, 235, 0.45) 72deg, transparent 144deg);
    animation: mjgd_ai_auto_select_radar_spin 2s linear infinite;
  }
}

.mjgd_ai_auto_select_result_float {
  position: fixed;
  right: 24px;
  top: 20%;
  transform: translateY(-50%);
  z-index: var(--mjgd-z-widget-float);
  width: 92px;
  height: 92px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.2s, transform 0.2s;

  &:hover {
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.24);
    transform: translateY(-50%) scale(1.04);
  }
}

.mjgd_ai_auto_select_result_float_ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.mjgd_ai_auto_select_result_float_track {
  fill: none;
  stroke: #e2e8f0;
  stroke-width: 6;
}

.mjgd_ai_auto_select_result_float_radar {
  transform-origin: 50px 50px;
  animation: mjgd_ai_auto_select_radar_spin 2s linear infinite;
}

.mjgd_ai_auto_select_result_float_progress {
  fill: none;
  stroke: #2563eb;
  stroke-width: 6;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.3s ease;
}

.mjgd_ai_auto_select_result_float_content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none;
  padding-top: 6px;
}

.mjgd_ai_auto_select_result_float_status {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  line-height: 1.2;
  max-width: 64px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mjgd_ai_auto_select_result_float_count {
  font-size: 15px;
  font-weight: 700;
  color: #2563eb;
  line-height: 1.2;
}

.mjgd_ai_auto_select_result_workspace_top {
  flex-shrink: 0;
  margin-bottom: 12px;
}

.mjgd_ai_auto_select_result_title_row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.mjgd_ai_auto_select_result_workspace_main {
  display: flex;
  gap: 22px;
  align-items: stretch;
  background: #eff6ff;
  border-radius: 10px;
  padding: 12px 16px;

  &.is_finished {
    background: #ecfdf5;
  }
}

.mjgd_ai_auto_select_result_workspace_left {
  flex: 1;
  min-width: 0;
  max-width: 220px;
}

.mjgd_ai_auto_select_result_workspace_center {
  flex: 1;
  min-width: 0;
  max-width: 360px;
}

.mjgd_ai_auto_select_result_workspace_right {
  flex: 1;
  min-width: 0;
  padding-left: 40px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mjgd_ai_auto_select_result_condition_list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  &.is_settings {
    .mjgd_ai_auto_select_result_condition_row dt {
      min-width: 80px;
    }
  }
}

.mjgd_ai_auto_select_result_setting_details {
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;

  li + li {
    margin-top: 2px;
  }
}

.mjgd_ai_auto_select_result_condition_row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.4;

  dt {
    flex-shrink: 0;
    margin: 0;
    color: #94a3b8;
    min-width: 42px;
  }

  dd {
    margin: 0;
    color: #0f172a;
    word-break: break-word;
  }
}

/* 关键词最多两行，超出省略；title 悬停展示完整列表 */
.mjgd_ai_auto_select_result_keywords_value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.mjgd_ai_auto_select_result_stat_label {
  margin-bottom: 4px;
  color: #64748b;
  font-size: 14px;

  &.mjgd_ai_auto_select_result_stat_label2 {
    color: #333333;
  }
}

.mjgd_ai_auto_select_result_status_card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 14px;
}

.mjgd_ai_auto_select_result_status_row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #0f172a;
  margin-top: 2px;
}

.mjgd_ai_auto_select_result_status_dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
  flex-shrink: 0;
}

.mjgd_ai_auto_select_result_status_dot.is_active {
  position: relative;
  width: 16px;
  height: 16px;
  background: #f0f7ff;
  border: 1px solid #bfdbfe;
  overflow: hidden;
}

.mjgd_ai_auto_select_result_status_dot.is_paused {
  background: #f59e0b;
}

.mjgd_ai_auto_select_result_status_dot.is_done {
  background: #22c55e;
}

.mjgd_ai_auto_select_result_status_dot.is_stopped {
  background: #ef4444;
}

.mjgd_ai_auto_select_result_export_label {
  font-size: 13px;
  color: #64748b;
}

.mjgd_ai_auto_select_result_export_value {
  display: block;
  font-size: 14px;
  color: #2563eb;
  font-weight: 600;
  margin-top: 2px;
}

.mjgd_ai_auto_select_result_progress_bar_wrap {
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
}

.mjgd_ai_auto_select_result_progress_bar_fill {
  height: 100%;
  background: #2563eb;
  border-radius: 3px;
  transition: width 0.3s ease;
}

// 采集中：进度条横向扫光，与环形雷达动效呼应
.mjgd_ai_auto_select_result_progress_bar_wrap.is_collecting .mjgd_ai_auto_select_result_progress_bar_fill {
  position: relative;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 40%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.45), transparent);
    animation: mjgd_ai_auto_select_progress_scan 1.8s linear infinite;
  }
}

@keyframes mjgd_ai_auto_select_progress_scan {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(350%);
  }
}

.mjgd_ai_auto_select_result_runner_actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: auto;
}

.mjgd_ai_auto_select_result_btn_primary,
.mjgd_ai_auto_select_result_btn_pause,
.mjgd_ai_auto_select_result_btn_stop {
  box-sizing: border-box;
  padding: 8px 18px;
  border: 1px solid;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

.mjgd_ai_auto_select_result_btn_primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.mjgd_ai_auto_select_result_btn_pause {
  border-color: #f59e0b;
  background: #fff;
  color: #d97706;
}

.mjgd_ai_auto_select_result_btn_stop {
  background: #ef4444;
  border-color: #ef4444;
  color: #fff;
}

.mjgd_ai_auto_select_result_btn_stop:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mjgd_ai_auto_select_result_title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.mjgd_ai_auto_select_result_title_row :deep(.mjgd_menu_btn_ai_icon) {
  width: 30px;
  height: 30px;
  margin: -4px -8px 0 0;
}

.mjgd_ai_auto_select_result_toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  flex-shrink: 0;
  margin-bottom: 10px;
}

.mjgd_ai_auto_select_result_filter {
  height: 36px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0 12px;
  background: #fff;
}

.mjgd_ai_auto_select_result_batch_btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}

.mjgd_ai_auto_select_result_batch_btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid #cbd5e1;
  background: #fff;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
}

.mjgd_ai_auto_select_result_batch_btn_spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #cbd5e1;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: mjgd_ai_auto_select_result_batch_spin 0.7s linear infinite;
  flex-shrink: 0;
}

.mjgd_ai_auto_select_result_batch_btn_spinner.is_danger {
  border-color: #fecaca;
  border-top-color: #ef4444;
}

@keyframes mjgd_ai_auto_select_result_batch_spin {
  to {
    transform: rotate(360deg);
  }
}

.mjgd_ai_auto_select_result_batch_btn.is_danger {
  color: #ef4444;
  border-color: #fecaca;
}

.mjgd_ai_auto_select_result_batch_btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 中栏容器：与图片处理中心 mjgd-ai-workspace-center 一致，占满剩余高度且不滚动 */
.mjgd_ai_auto_select_result_center {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.mjgd_ai_auto_select_result_select_all {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  line-height: 19px;
  font-size: 14px;
  color: #475569;
}

.mjgd_ai_auto_select_result_select_all input:disabled {
  cursor: not-allowed;
}

/* 灰底滚动区外壳：对齐 mjgd-ai-workspace-grid-wrap，此处禁止滚动由网格自适应撑满 */
.mjgd_ai_auto_select_result_grid_wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #f5f7fa;
  border-radius: 8px;
}

.mjgd_ai_auto_select_result_grid_panel {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  position: relative;
}

.mjgd_ai_auto_select_result_collect_overlay {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 8px;
}

.mjgd_ai_auto_select_result_collect_overlay.is_collecting {
  color: #475569;
}

.mjgd_ai_auto_select_result_collect_overlay.is_paused {
  gap: 16px;
  color: #4e5969;
}

.mjgd_ai_auto_select_result_collect_overlay.is_empty {
  gap: 16px;
  color: #4e5969;
}

.mjgd_ai_auto_select_result_collect_paused_icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #fffbeb;
  color: #d97706;
}

.mjgd_ai_auto_select_result_collect_paused_svg {
  width: 32px;
  height: 32px;
}

.mjgd_ai_auto_select_result_collect_empty_icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #f0f7ff;
  color: #2563eb;
}

.mjgd_ai_auto_select_result_collect_empty_svg {
  width: 32px;
  height: 32px;
}

.mjgd_ai_auto_select_result_collect_empty_btn {
  margin-top: 30px;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
}

.mjgd_ai_auto_select_result_collect_radar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #f0f7ff;

  .mjgd_ai_auto_select_result_radar_sweep {
    position: relative;
    width: 56px;
    height: 56px;
    inset: auto;
  }
}

.mjgd_ai_auto_select_result_collect_text {
  font-size: 15px;

  &.font_weight {
    font-weight: 600;
  }
}

/* 每页 6 件：默认 3 列 × 2 行，行高均分避免溢出滚动条 */
.mjgd_ai_auto_select_result_grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 900px) {
  .mjgd_ai_auto_select_result_grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {

  /* 窄屏保持 2 列，避免 6 行撑出滚动条 */
  .mjgd_ai_auto_select_result_grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
}

.mjgd_ai_auto_select_result_card {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: #fff;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.mjgd_ai_auto_select_result_card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.mjgd_ai_auto_select_result_check {
  position: absolute;
  top: 0;
  left: 0;
  padding: 10px;
  z-index: 2;
}

.mjgd_ai_auto_select_result_edit_tag {
  position: absolute;
  top: 36px;
  left: 10px;
  z-index: 2;
  background: #ef4444;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
}

.mjgd_ai_auto_select_result_status_group {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.mjgd_ai_auto_select_result_status {
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #64748b;
  white-space: nowrap;
}

.mjgd_ai_auto_select_result_status.is_ai_processing {
  background: #dbeafe;
  color: #2563eb;
}

.mjgd_ai_auto_select_result_status.is_ai_success,
.mjgd_ai_auto_select_result_status.is_listed,
.mjgd_ai_auto_select_result_status.is_in_collect_box {
  background: #dcfce7;
  color: #16a34a;
}

.mjgd_ai_auto_select_result_status.is_step_failure_fill,
.mjgd_ai_auto_select_result_status.is_step_failure_translate,
.mjgd_ai_auto_select_result_status.is_step_failure_refine,
.mjgd_ai_auto_select_result_status.is_step_failure_rich_content {
  background: #fee2e2;
  color: #dc2626;
}

.mjgd_ai_auto_select_result_status.is_variant_limit_exceeded {
  background: #fef3c7;
  color: #d97706;
}

.mjgd_ai_auto_select_result_status.is_listing_failed {
  background: #fee2e2;
  color: #dc2626;
  cursor: pointer;
}

.mjgd_ai_auto_select_result_status.is_listing_failed:hover {
  background: #fecaca;
}

.mjgd_ai_auto_select_result_img_wrap {
  position: relative;
  flex: 1 1 auto;
  min-height: 48px;
  width: 100%;
  overflow: hidden;
  border-radius: 8px;
  margin-bottom: 6px;
  box-sizing: border-box;
}

.mjgd_ai_auto_select_result_img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mjgd_ai_auto_select_result_name {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  max-height: 32px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.mjgd_ai_auto_select_result_price {
  margin: 4px 0;
  color: #64748b;
  font-size: 12px;
  flex-shrink: 0;

  span {
    color: #333333;
    font-size: 15px;
    font-weight: 700;
  }
}

.mjgd_ai_auto_select_result_metrics {
  font-size: 12px;
  color: #64748b;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 4px;
  flex-shrink: 0;
  overflow: hidden;
}

.mjgd_ai_auto_select_result_star {
  color: #cbd5e1;
}

.mjgd_ai_auto_select_result_star.is_on {
  color: #f59e0b;
}

.mjgd_ai_auto_select_result_info {
  flex-shrink: 0;
  min-width: 0;
}

.mjgd_ai_auto_select_result_actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex-shrink: 0;
}

.mjgd_ai_auto_select_result_action_btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 16px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
}

.mjgd_ai_auto_select_result_action_btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.mjgd_ai_auto_select_result_action_btn_spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #cbd5e1;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: mjgd_ai_auto_select_result_batch_spin 0.7s linear infinite;
  flex-shrink: 0;
}

.mjgd_ai_auto_select_result_action_btn_spinner.is_primary {
  border-color: rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
}

.mjgd_ai_auto_select_result_action_btn.is_primary {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

// 状态遮罩
.mjgd_ai_auto_select_result_card_body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mjgd_ai_auto_select_result_card_mask {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.9);
}

.mjgd_ai_auto_select_result_card_mask.is_processing {
  background: rgba(219, 234, 254, 0.92);
}

.mjgd_ai_auto_select_result_card_mask.is_waiting {
  background: rgba(241, 245, 249, 0.92);
}

.mjgd_ai_auto_select_result_card_mask_progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 200px;
  padding: 0 12px;
}

.mjgd_ai_auto_select_result_card_mask_percent {
  font-size: 20px;
  font-weight: 700;
  color: #2563eb;
  line-height: 1.2;
}

.mjgd_ai_auto_select_result_card_mask.is_waiting .mjgd_ai_auto_select_result_card_mask_percent {
  color: #64748b;
}

.mjgd_ai_auto_select_result_card_mask_bar {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: rgba(226, 232, 240, 0.9);
  overflow: hidden;
}

.mjgd_ai_auto_select_result_card_mask_bar_fill {
  height: 100%;
  border-radius: 3px;
  background: #2563eb;
  transition: width 0.12s linear;
}

.mjgd_ai_auto_select_result_card_mask.is_waiting .mjgd_ai_auto_select_result_card_mask_bar_fill {
  background: #94a3b8;
}

.mjgd_ai_auto_select_result_card_mask_estimate {
  font-size: 12px;
  color: #475569;
  text-align: center;
  line-height: 1.3;
}

.mjgd_ai_auto_select_result_card_mask.is_waiting .mjgd_ai_auto_select_result_card_mask_estimate {
  color: #64748b;
}

.mjgd_ai_auto_select_result_card_mask.is_recovering {
  flex-direction: column;
  gap: 10px;
  background: rgba(224, 231, 255, 0.94);
}

.mjgd_ai_auto_select_result_card_mask_spinner {
  width: 22px;
  height: 22px;
  border: 2px solid #c7d2fe;
  border-top-color: #4f46e5;
  border-radius: 50%;
  animation: mjgd_ai_auto_select_result_recover_spin 0.75s linear infinite;
}

.mjgd_ai_auto_select_result_card_mask_recover_text {
  font-size: 13px;
  font-weight: 500;
  color: #4338ca;
  text-align: center;
  line-height: 1.35;
  padding: 0 12px;
}

@keyframes mjgd_ai_auto_select_result_recover_spin {
  to {
    transform: rotate(360deg);
  }
}

.mjgd_ai_auto_select_result_pagination {
  display: flex;
  flex-shrink: 0;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e2e8f0;
}

.mjgd_ai_auto_select_result_pagination button {
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
}

.mjgd_ai_auto_select_result_pagination button.is_active {
  background: #2563eb;
  color: #fff;
  border-color: #2563eb;
}

.mjgd_ai_auto_select_result_pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mjgd_ai_auto_select_result_pagination_ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  padding: 6px 4px;
  color: #94a3b8;
  user-select: none;
}
</style>
