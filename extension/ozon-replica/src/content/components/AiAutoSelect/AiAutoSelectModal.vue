<template>
  <div v-if="visible" class="mjgd_ai_auto_select_overlay mjgd_plugin_overlay" :class="{ is_panel_only: sharedOverlay }">
    <!-- 多任务恢复：列出全部会话；已结束可查看记录，进行中可继续采集 -->
    <div v-if="showTaskPicker" class="mjgd_ai_auto_select_resume_overlay mjgd_plugin_overlay is_nested is_tier_nested">
      <div class="mjgd_ai_auto_select_resume_box">
        <button type="button" class="mjgd_ai_auto_select_resume_close" title="关闭" aria-label="关闭" @click="handleDismissTaskPicker">×</button>
        <div class="mjgd_ai_auto_select_resume_title">发现本地选品记录</div>
        <div class="mjgd_ai_auto_select_task_list">
          <label v-for="task in taskList" :key="task.sessionId" class="mjgd_ai_auto_select_task_item" :class="{ is_selected: selectedTaskSessionId === task.sessionId, is_disabled: !task.selectable && !task.resumable }">
            <input type="radio" name="auto_select_task" class="mjgd_ai_auto_select_task_radio" :value="task.sessionId" :checked="selectedTaskSessionId === task.sessionId" :disabled="!task.selectable && !task.resumable" @change="selectedTaskSessionId = task.sessionId" />
            <span class="mjgd_ai_auto_select_task_main">
              <span class="mjgd_ai_auto_select_task_name">{{ task.displayName }}</span>
              <span class="mjgd_ai_auto_select_task_meta">{{ RUNNER_STATUS_LABELS[task.status] }} · 已采集 {{ task.collectedCount }} / {{ task.targetCount }} 件</span>
            </span>
          </label>
        </div>
        <div class="mjgd_ai_auto_select_resume_actions">
          <button type="button" class="mjgd_ai_auto_select_btn_secondary" @click="handleFreshStart">重新开始</button>
          <button type="button" class="mjgd_ai_auto_select_btn_primary" :disabled="!canUseSelectedRecord" @click="handleUseSelectedRecord">使用数据</button>
          <button type="button" class="mjgd_ai_auto_select_btn_primary" :disabled="!canContinueSelectedTask" @click="handleContinueCollection">继续采集</button>
        </div>
      </div>
    </div>

    <div class="mjgd_ai_auto_select_modal">
      <button type="button" class="mjgd_ai_auto_select_close" @click="handleClose">×</button>
      <!-- 配置视图 -->
      <div class="mjgd_ai_auto_select_header"><AiMenuBtnIcon /><h2 class="mjgd_ai_auto_select_title">自动选品</h2></div>

      <div ref="modal_body_ref" class="mjgd_ai_auto_select_body">
        <div class="mjgd_ai_auto_select_field">
          <label class="mjgd_ai_auto_select_label">
            选品类目 <span class="mjgd_ai_auto_select_required">*</span>
          </label>
          <AiAutoSelectCategoryPicker v-model="formCategory" @change="handleUserCategoryChange" />
        </div>

        <div class="mjgd_ai_auto_select_row">
          <div class="mjgd_ai_auto_select_field">
            <label class="mjgd_ai_auto_select_label">价格区间</label>
            <div class="mjgd_ai_auto_select_price_row">
              <div class="mjgd_ai_auto_select_price_input_wrap">
                <span class="mjgd_ai_auto_select_currency">¥</span>
                <input v-model.number="formMinPrice" type="number" min="0" class="mjgd_ai_auto_select_price_input" placeholder="最低价（0为不限）" />
              </div>
              <span class="mjgd_ai_auto_select_price_dash">—</span>
              <div class="mjgd_ai_auto_select_price_input_wrap">
                <span class="mjgd_ai_auto_select_currency">¥</span>
                <input v-model.number="formMaxPrice" type="number" min="0" class="mjgd_ai_auto_select_price_input" placeholder="最高价（0为不限）" />
              </div>
            </div>
            <div class="mjgd_ai_auto_select_field_hint">不输入或输入0则为不限价格</div>
          </div>
          <div class="mjgd_ai_auto_select_field">
            <label class="mjgd_ai_auto_select_label">选品数量 <span class="mjgd_ai_auto_select_required">*</span></label>
            <div class="mjgd_ai_auto_select_count_wrap">
              <input v-model.number="formTargetCount" type="number" min="1" max="500" class="mjgd_ai_auto_select_count_input" />
              <span class="mjgd_ai_auto_select_count_unit">件</span>
            </div>
            <div class="mjgd_ai_auto_select_presets">
              <button v-for="preset in countPresets" :key="preset" type="button" class="mjgd_ai_auto_select_preset_btn" @click="formTargetCount = preset">推荐 {{ preset }}</button>
            </div>
          </div>
        </div>

        <!-- 类目提示 / loading / AI 推荐词（置于关键词输入上方） -->
        <div v-if="categoryTipVisible" class="mjgd_ai_auto_select_info">未选择具体类目，请手动添加关键词或选择类目获取 AI 推荐</div>
        <div v-else-if="keyword_loading" class="mjgd_ai_auto_select_info mjgd_ai_auto_select_recommend_loading">
          <span class="mjgd_ai_auto_select_keyword_spinner" aria-hidden="true"></span>
          <span>推荐词加载中...</span>
        </div>
        <div v-else-if="recommendedKeywords.length" class="mjgd_ai_auto_select_recommend_wrap">
          <div class="mjgd_ai_auto_select_recommend_header">
            <div class="mjgd_ai_auto_select_recommend_label">AI 推荐词（点击添加/取消）</div>
            <button type="button" class="mjgd_ai_auto_select_recommend_add_all" @click="addAllRecommendedKeywords">一键添加</button>
          </div>
          <div class="mjgd_ai_auto_select_tags">
            <button v-for="(kw, idx) in recommendedKeywords" :key="`${kw}-${idx}`" type="button" class="mjgd_ai_auto_select_tag is_recommend is_clickable" :class="{ is_selected: hasSelectedKeyword(kw) }" :aria-pressed="hasSelectedKeyword(kw)" @click="selectRecommendedKeyword(kw)">{{ kw }}</button>
          </div>
        </div>

        <div class="mjgd_ai_auto_select_field">
          <label class="mjgd_ai_auto_select_label">关键词（按回车键添加标签）</label>
          <div class="mjgd_ai_auto_select_keyword_wrap">
            <div v-if="formKeywords.length" class="mjgd_ai_auto_select_tags_row">
              <div class="mjgd_ai_auto_select_tags">
                <span v-for="(kw, idx) in formKeywords" :key="`${kw.text}-${idx}`" class="mjgd_ai_auto_select_tag">
                  {{ kw.text }}
                  <button type="button" class="mjgd_ai_auto_select_tag_remove" @click="removeKeyword(idx)">×</button>
                </span>
              </div>
              <button type="button" class="mjgd_ai_auto_select_clear_all_btn" title="清空全部关键词" aria-label="清空全部关键词" @click="clearAllKeywords">×</button>
            </div>
            <input v-model="keywordInput" type="text" class="mjgd_ai_auto_select_keyword_input" placeholder="输入关键词后按回车键添加" @keydown.enter.prevent="addKeyword" />
            <span class="mjgd_ai_auto_select_keyword_count">{{ formKeywords.length }}个</span>
          </div>
        </div>

        <!-- 关键词匹配模式暂时下线，固定使用精准匹配
        <div class="mjgd_ai_auto_select_field">
          <label class="mjgd_ai_auto_select_label">关键词匹配模式</label>
          <div class="mjgd_ai_auto_select_mode_cards" role="radiogroup" aria-label="关键词匹配模式">
            <button type="button" class="mjgd_ai_auto_select_mode_card" :class="{ is_active: formKeywordMatchMode === 'fuzzy' }" :aria-pressed="formKeywordMatchMode === 'fuzzy'" @click="formKeywordMatchMode = 'fuzzy'">
              <span v-if="formKeywordMatchMode === 'fuzzy'" class="mjgd_ai_auto_select_mode_card_check" aria-hidden="true">✓</span>
              <div class="mjgd_ai_auto_select_mode_card_head"><span class="mjgd_ai_auto_select_mode_card_icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="1.8"/><path d="M14.5 14.5L19 19" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span><span class="mjgd_ai_auto_select_mode_card_title">模糊匹配</span></div>
              <span class="mjgd_ai_auto_select_mode_card_desc">允许词根省略、后缀子串等智能匹配，不需要商品中出现完整的关键词，范围更广</span>
            </button>
            <button type="button" class="mjgd_ai_auto_select_mode_card" :class="{ is_active: formKeywordMatchMode === 'strict' }" :aria-pressed="formKeywordMatchMode === 'strict'" @click="formKeywordMatchMode = 'strict'">
              <span v-if="formKeywordMatchMode === 'strict'" class="mjgd_ai_auto_select_mode_card_check" aria-hidden="true">✓</span>
              <div class="mjgd_ai_auto_select_mode_card_head"><span class="mjgd_ai_auto_select_mode_card_icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" width="20" height="20"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg></span><span class="mjgd_ai_auto_select_mode_card_title">精准匹配</span></div>
              <span class="mjgd_ai_auto_select_mode_card_desc">商品必须完整包含一个关键词，结果更精确</span>
            </button>
          </div>
        </div>
        -->

        <div ref="full_auto_banner_ref" class="mjgd_ai_auto_select_setting_banner" :class="{ is_expanded: formAutomationMode === 'full' }">
          <div class="mjgd_ai_auto_select_setting_banner_header">
            <div class="mjgd_ai_auto_select_setting_banner_info">
              <span class="mjgd_ai_auto_select_setting_banner_icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" stroke-width="1.5"/></svg>
              </span>
              <div class="mjgd_ai_auto_select_setting_banner_text">
                <span class="mjgd_ai_auto_select_setting_banner_title">全自动模式</span>
                <span class="mjgd_ai_auto_select_setting_banner_desc">采集过程中根据勾选配置自动执行 AI 流程，可预选店铺自动上架</span>
              </div>
            </div>
            <div class="mjgd_ai_auto_select_setting_banner_actions">
              <button v-show="formAutomationMode === 'full'" type="button" class="mjgd_ai_auto_select_save_config_btn" :disabled="savingFullAutoConfig" title="将当前自动流程与售价设置保存为账号默认" @click="handleSaveFullAutoConfig">保存当前配置</button>
              <button type="button" class="mjgd_ai_auto_select_switch" :class="{ is_on: formAutomationFullEnabled }" role="switch" :aria-checked="formAutomationFullEnabled" title="开启后采集过程中自动执行 AI 流程" @click="formAutomationFullEnabled = !formAutomationFullEnabled"><span class="mjgd_ai_auto_select_switch_thumb"></span></button>
            </div>
          </div>
          <div v-show="formAutomationMode === 'full'" class="mjgd_ai_auto_select_setting_banner_body">
            <div class="mjgd_ai_auto_select_ai_step_wrap">
              <AiProcessStepBlock v-model="formAiStepConfig" v-model:max-variant-execution-count="formMaxVariantExecutionCount" :show-max-variant-select="true" :refine-template-list="refineTemplateList" />
            </div>
            <div class="mjgd_ai_auto_select_listing_price_section">
              <div class="mjgd_ai_auto_select_listing_price_header">
                <span class="mjgd_ai_auto_select_listing_price_title">商品售价设置</span>
                <span class="mjgd_ai_auto_select_listing_price_desc">依据采集价格调整各变体售价，上架前自动生效</span>
              </div>
              <div class="mjgd_ai_auto_select_listing_price_row">
                <span class="mjgd_ai_auto_select_listing_price_label">售价:</span>
                <select v-model="formListingPriceOp" class="mjgd_ai_auto_select_listing_price_op">
                  <option v-for="opt in listingPriceOpOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <div class="mjgd_ai_auto_select_listing_price_input_wrap">
                  <input v-model.number="formListingPriceValue" type="number" min="0" step="0.01" class="mjgd_ai_auto_select_listing_price_input" :class="{ has_suffix: formListingPriceOpIsPercent }" placeholder="请输入数值" />
                  <span v-if="formListingPriceOpIsPercent" class="mjgd_ai_auto_select_listing_price_suffix">%</span>
                </div>
              </div>
            </div>
            <div class="mjgd_ai_auto_select_listing_shop_section">
              <div class="mjgd_ai_auto_select_listing_shop_header">
                <span class="mjgd_ai_auto_select_listing_shop_title">上品店铺设置</span>
                <span class="mjgd_ai_auto_select_listing_shop_desc">预选上架店铺与仓库库存，AI 完成后自动上架</span>
                <label v-if="shopSelectAllVisible" class="mjgd_ai_auto_select_listing_shop_select_all">
                  <input type="checkbox" :checked="shopSelectAllChecked" @change="handleShopSelectAll" />
                  <span>全选</span>
                </label>
              </div>
              <AiAutoSelectShopPanel ref="shop_panel_ref" v-model:selected-shops="formListingShops" v-model:shop-warehouse-inventory="formListingShopInventory" @available-shops-change="availableShopIds = $event" @shop-list-loading="shopListLoading = $event" />
            </div>
          </div>
        </div>

        <div class="mjgd_ai_auto_select_setting_banner" :class="{ is_expanded: formStoreCollectEnabled }">
          <div class="mjgd_ai_auto_select_setting_banner_header">
            <div class="mjgd_ai_auto_select_setting_banner_info">
              <span class="mjgd_ai_auto_select_setting_banner_icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" width="20" height="20"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6Z" stroke="currentColor" stroke-width="1.8"/><path d="M3 6h18" stroke="currentColor" stroke-width="1.8"/><path d="M16 10a4 4 0 0 1-8 0" stroke="currentColor" stroke-width="1.8"/></svg>
              </span>
              <div class="mjgd_ai_auto_select_setting_banner_text">
                <span class="mjgd_ai_auto_select_setting_banner_title">店铺商品采集</span>
                <span class="mjgd_ai_auto_select_setting_banner_desc">输入店铺商品列表链接，多个链接用；分隔</span>
              </div>
            </div>
            <button type="button" class="mjgd_ai_auto_select_switch" :class="{ is_on: formStoreCollectEnabled }" role="switch" :aria-checked="formStoreCollectEnabled" title="开启后从指定店铺商品列表采集" @click="formStoreCollectEnabled = !formStoreCollectEnabled"><span class="mjgd_ai_auto_select_switch_thumb"></span></button>
          </div>
          <div v-show="formStoreCollectEnabled" class="mjgd_ai_auto_select_setting_banner_body">
            <textarea v-model="formStoreLinksInput" rows="3" class="mjgd_ai_auto_select_store_input" placeholder="请输入店铺商品列表链接" />
          </div>
        </div>
      </div>

      <div class="mjgd_ai_auto_select_footer">
        <div class="mjgd_ai_auto_select_footer_actions">
          <button type="button" class="mjgd_ai_auto_select_btn_secondary" @click="handleResetConditions">清空选品条件</button>
          <button type="button" class="mjgd_ai_auto_select_btn_primary" :disabled="starting" @click="handleStart">{{ starting ? '启动中...' : '开始智能选品' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AiMenuBtnIcon from '../common/AiMenuBtnIcon.vue'
import AiAutoSelectCategoryPicker from './AiAutoSelectCategoryPicker.vue'
import AiAutoSelectShopPanel from './AiAutoSelectShopPanel.vue'
import AiProcessStepBlock from '../AiProcessStepBlock.vue'
import { apiService } from '../../../utils/api'
import { getPluginRecommendWords } from '../../../utils/aiApi'
import { showToast } from '../../../utils/toast'
import {
  UNLIMITED_CATEGORY,
  WWW_1688_HOME_URL,
  build1688CategorySearchUrl,
  buildCategorySearchUrlWithPageOneFromCurrent,
  clearPendingAutoSelectConfig,
  consumePendingAutoSelectConfig,
  peekPendingAutoSelectConfig,
  ensureTabSessionId,
  getTabSessionId,
  assignTabSessionId,
  clearExpiredDraftSessions,
  clearFinishedDraftSessions,
  listDraftTasks,
  readDraft,
  reconcileStaleInterruptedSessions,
  ACTIVE_RUNNER_STATUSES,
  RUNNER_STATUS_LABELS,
  is1688Host,
  is1688WwwHost,
  isCategorySearchOnPageOne,
  isCurrentCategorySearchPage,
  needsCategoryNavigation,
  resolveAutoSelectLandingUrl,
  needsStoreNavigation,
  getFirstStoreLink,
  parseStoreLinks,
  savePendingAutoSelectConfig,
  normalizeAiAutoSelectConfig,
  DEFAULT_AI_STEP_CONFIG,
  DEFAULT_FULL_AUTO_AI_STEP_CONFIG,
  normalizeAiStepConfig,
  normalizeListingPriceAdjustConfig,
  resetAutoSelectSession,
  type AiAutoSelectAiStepConfig,
  type AiAutoSelectConfig,
  type AiAutoSelectDraft,
  type AiAutoSelectTaskSummary,
  type AutomationMode,
  type KeywordMatchMode,
  type ListingPriceAdjustConfig,
  type ListingPriceAdjustOp,
  type ShopWarehouseInventoryMap,
} from '../../utils/aiAutoSelect'
import { DEFAULT_MAX_VARIANT_EXECUTION_COUNT } from '../../utils/maxVariantExecution'
import {
  readSettingsCache,
  saveLocalAndRemoteImmediate,
} from '../../utils/userSystemSettings/userSystemSettingsSync'

const props = defineProps<{
  visible: boolean
  /** 由 App 提供共享遮罩时，本层不再绘制背景 */
  sharedOverlay?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
  (e: 'open-results', payload?: { sessionId: string }): void
  (e: 'start-collection', payload: { config: AiAutoSelectConfig; resumeFrom?: AiAutoSelectDraft | null; sessionId?: string }): void
}>()
const taskList = ref<AiAutoSelectTaskSummary[]>([])
const selectedTaskSessionId = ref<string | null>(null)
const taskPickerDismissed = ref(false)

const showTaskPicker = computed(() => taskList.value.length > 0 && !taskPickerDismissed.value)
const selectedTask = computed(() => taskList.value.find((t) => t.sessionId === selectedTaskSessionId.value))
/** 采集中/已暂停表示 runner 仍存活，禁止操作直至心跳超时变为已停止 */
const isActiveRunnerTask = (task: AiAutoSelectTaskSummary | undefined) => Boolean(task && ACTIVE_RUNNER_STATUSES.includes(task.status))
const canUseSelectedRecord = computed(() => {
  const task = selectedTask.value
  if (!task || isActiveRunnerTask(task)) return false
  return task.selectable || task.resumable
})
const canContinueSelectedTask = computed(() => {
  const task = selectedTask.value
  if (!task || isActiveRunnerTask(task)) return false
  return task.resumable === true
})
const starting = ref(false)

type FormKeywordItem = {
  text: string
  source: 'manual' | 'recommended'
}

const formCategory = ref(UNLIMITED_CATEGORY)
const formMinPrice = ref(0)
const formMaxPrice = ref(0)
const formTargetCount = ref(0)
/** 用户已选关键词（含手动输入与从推荐池点选的词） */
const formKeywords = ref<FormKeywordItem[]>([])
/** AI 推荐词池（未选中） */
const recommendedKeywords = ref<string[]>([])
const keywordInput = ref('')
const keyword_loading = ref(false)
// 关键词匹配模式 UI 已注释，固定精准匹配
const formKeywordMatchMode = ref<KeywordMatchMode>('strict')
const formAutomationMode = ref<AutomationMode>('semi')
const formAiStepConfig = ref<AiAutoSelectAiStepConfig>({ ...DEFAULT_AI_STEP_CONFIG })
const formMaxVariantExecutionCount = ref(DEFAULT_MAX_VARIANT_EXECUTION_COUNT)
const formStoreCollectEnabled = ref(false)
const formStoreLinksInput = ref('')
const formListingShops = ref<number[]>([])
const formListingShopInventory = ref<ShopWarehouseInventoryMap>({})
const formListingPriceOp = ref<ListingPriceAdjustOp>('add')
const formListingPriceValue = ref<number | null>(null)
const savingFullAutoConfig = ref(false)
const listingPriceOpOptions: Array<{ value: ListingPriceAdjustOp; label: string }> = [
  { value: 'add', label: '加' },
  { value: 'sub', label: '减' },
  { value: 'mul', label: '乘' },
  { value: 'div', label: '除' },
  { value: 'pct_up', label: '上涨 (百分比)' },
  { value: 'pct_down', label: '下调 (百分比)' },
]
const formListingPriceOpIsPercent = computed(() => formListingPriceOp.value === 'pct_up' || formListingPriceOp.value === 'pct_down')
const availableShopIds = ref<number[]>([])
const shopListLoading = ref(false)
const shop_panel_ref = ref<InstanceType<typeof AiAutoSelectShopPanel> | null>(null)
const refineTemplateList = ref<Array<{ id: number | string; templateName: string }>>([])
const modal_body_ref = ref<HTMLElement | null>(null)
const full_auto_banner_ref = ref<HTMLElement | null>(null)
/** 用于快速切换类目时忽略过期的 AI 关键词请求 */
let keyword_request_id = 0

const countPresets = [20, 50, 100, 200]

const categoryTipVisible = computed(() => formCategory.value === UNLIMITED_CATEGORY)

/** 用户手动开启全自动时补默认改图模板，不覆盖已加载草稿/配置中的勾选状态 */
function applyFullAutoAiStepDefaults() {
  const firstTemplateId = refineTemplateList.value[0] ? String(refineTemplateList.value[0].id) : ''
  if (!firstTemplateId || formAiStepConfig.value.imageRefineTemplate) return
  formAiStepConfig.value = {
    ...formAiStepConfig.value,
    imageRefineTemplate: firstTemplateId,
  }
}

/** 用账号级全自动默认项预填流程/售价；不恢复开关，固定为半自动 */
function applyFullAutoDefaultsFromSettings(payload: {
  fullAutoAiStep: AiAutoSelectAiStepConfig
  fullAutoMaxVariantExecutionCount: number
  listingPriceAdjust?: ListingPriceAdjustConfig
}) {
  formAutomationMode.value = 'semi'
  formAiStepConfig.value = normalizeAiStepConfig(payload.fullAutoAiStep)
  formMaxVariantExecutionCount.value = payload.fullAutoMaxVariantExecutionCount
  const priceAdjust = normalizeListingPriceAdjustConfig(payload.listingPriceAdjust)
  formListingPriceOp.value = priceAdjust?.op ?? 'add'
  formListingPriceValue.value = priceAdjust?.value ?? null
}

/** 手动保存当前自动流程与售价到账号配置（不保存开关与店铺） */
async function handleSaveFullAutoConfig() {
  if (savingFullAutoConfig.value) return
  savingFullAutoConfig.value = true
  try {
    const base = await readSettingsCache()
    const priceValue = Number(formListingPriceValue.value)
    const listingPriceAdjust = Number.isFinite(priceValue) && priceValue > 0
      ? normalizeListingPriceAdjustConfig({ op: formListingPriceOp.value, value: priceValue })
      : undefined
    await saveLocalAndRemoteImmediate({
      ...base,
      fullAutoAiStep: normalizeAiStepConfig(formAiStepConfig.value),
      fullAutoMaxVariantExecutionCount: formMaxVariantExecutionCount.value,
      ...(listingPriceAdjust ? { listingPriceAdjust } : { listingPriceAdjust: undefined }),
    })
  } catch (e) {
    console.error('[aiAutoSelect] 保存全自动配置失败:', e)
    showToast('保存配置失败', 2000)
  } finally {
    savingFullAutoConfig.value = false
  }
}

const formAutomationFullEnabled = computed({
  get: () => formAutomationMode.value === 'full',
  set: (enabled: boolean) => {
    if (enabled && formAutomationMode.value !== 'full') {
      formAutomationMode.value = 'full'
      applyFullAutoAiStepDefaults()
    } else if (!enabled) {
      formAutomationMode.value = 'semi'
    }
  },
})

const shopSelectAllVisible = computed(() => !shopListLoading.value && availableShopIds.value.length > 0)

const shopSelectAllChecked = computed(() => {
  if (!availableShopIds.value.length) return false
  return availableShopIds.value.every((id) => formListingShops.value.includes(id))
})

function handleShopSelectAll() {
  if (shopSelectAllChecked.value) {
    formListingShops.value = []
  } else {
    formListingShops.value = [...availableShopIds.value]
  }
}

/** 等待滚动容器内容高度稳定（子组件 v-if 展开时 border 尺寸不变，仅 scrollHeight 变化） */
function waitForScrollHeightStable(el: HTMLElement, timeoutMs = 400): Promise<void> {
  return new Promise((resolve) => {
    let lastHeight = el.scrollHeight
    let stableFrames = 0
    const start = performance.now()

    const tick = () => {
      const height = el.scrollHeight
      if (height === lastHeight) {
        stableFrames += 1
      } else {
        stableFrames = 0
        lastHeight = height
      }
      // 连续 2 帧高度不变视为布局稳定，或超时兜底
      if (stableFrames >= 2 || performance.now() - start >= timeoutMs) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** 原生 smooth 在部分滚动容器/扩展环境中不生效，改用手动缓动 */
function smoothScrollTo(el: HTMLElement, targetTop: number, duration = 320) {
  const startTop = el.scrollTop
  const distance = targetTop - startTop
  if (Math.abs(distance) < 1) return

  const startTime = performance.now()
  const tick = (now: number) => {
    const progress = Math.min((now - startTime) / duration, 1)
    const eased = 1 - (1 - progress) ** 3
    el.scrollTop = startTop + distance * eased
    if (progress < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** 展开店铺采集区块后滚到底部，避免新增内容被挡在可视区外 */
async function scrollModalBodyToBottom() {
  await nextTick()
  const el = modal_body_ref.value
  if (!el) return
  await waitForScrollHeightStable(el)
  const targetTop = Math.max(el.scrollHeight - el.clientHeight, 0)
  smoothScrollTo(el, targetTop)
}

/** 展开全自动后将对齐到该模块顶部，便于从流程配置开始浏览 */
async function scrollModalBodyToFullAutoTop() {
  await nextTick()
  const body = modal_body_ref.value
  const banner = full_auto_banner_ref.value
  if (!body || !banner) return
  await waitForScrollHeightStable(body)
  const targetTop = Math.max(0, banner.offsetTop - body.offsetTop)
  smoothScrollTo(body, targetTop)
}

watch(formAutomationMode, (mode) => {
  if (mode === 'full') {
    void nextTick(() => shop_panel_ref.value?.fetchShopList())
    void scrollModalBodyToFullAutoTop()
  }
})

watch(formStoreCollectEnabled, (enabled) => {
  if (enabled) {
    void scrollModalBodyToBottom()
  }
})

function hasSelectedKeyword(text: string): boolean {
  return formKeywords.value.some((item) => item.text === text)
}

/** 价格为 0 表示不限制，写入配置时用 null */
function normalizePriceLimit(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

/** 从已加载的改图模板列表解析名称，写入 config 供进度弹窗展示 */
function resolveRefineTemplateName(templateId: string): string {
  const trimmed = templateId.trim()
  if (!trimmed) return ''
  const matched = refineTemplateList.value.find((item) => String(item.id) === trimmed)
  return matched?.templateName?.trim() || ''
}

function buildConfig(): AiAutoSelectConfig {
  const storeLinks = formStoreCollectEnabled.value
    ? parseStoreLinks(formStoreLinksInput.value)
    : []
  const isFullAuto = formAutomationMode.value === 'full'
  const listingShops = isFullAuto ? [...formListingShops.value] : []
  const config: AiAutoSelectConfig = {
    category: formCategory.value,
    minPrice: normalizePriceLimit(formMinPrice.value),
    maxPrice: normalizePriceLimit(formMaxPrice.value),
    targetCount: Math.min(500, Math.max(1, formTargetCount.value)),
    keywords: formKeywords.value.map((item) => item.text),
    keywordMatchMode: formKeywordMatchMode.value,
    automationMode: formAutomationMode.value,
    storeCollectEnabled: formStoreCollectEnabled.value,
    storeLinks,
    listingShopEnabled: isFullAuto && listingShops.length > 0,
    listingShops,
    listingShopWarehouseInventory: isFullAuto ? { ...formListingShopInventory.value } : {},
  }
  if (formAutomationMode.value === 'full') {
    const aiStep = normalizeAiStepConfig(formAiStepConfig.value)
    const templateName = resolveRefineTemplateName(aiStep.imageRefineTemplate)
    config.aiStep = templateName ? { ...aiStep, imageRefineTemplateName: templateName } : aiStep
    config.maxVariantExecutionCount = formMaxVariantExecutionCount.value
    const priceValue = Number(formListingPriceValue.value)
    if (Number.isFinite(priceValue) && priceValue > 0) {
      config.listingPriceAdjust = { op: formListingPriceOp.value, value: priceValue }
    }
  }
  return config
}

function syncFormFromConfig(config: AiAutoSelectConfig) {
  const normalized = normalizeAiAutoSelectConfig(config)
  formCategory.value = normalized.category
  formMinPrice.value = normalized.minPrice ?? 0
  formMaxPrice.value = normalized.maxPrice ?? 0
  formTargetCount.value = normalized.targetCount
  formKeywordMatchMode.value = normalized.keywordMatchMode
  formAutomationMode.value = normalized.automationMode
  formAiStepConfig.value = normalized.aiStep
    ? normalizeAiStepConfig(normalized.aiStep)
    : normalized.automationMode === 'full'
      ? { ...DEFAULT_FULL_AUTO_AI_STEP_CONFIG }
      : { ...DEFAULT_AI_STEP_CONFIG }
  formMaxVariantExecutionCount.value = normalized.maxVariantExecutionCount ?? DEFAULT_MAX_VARIANT_EXECUTION_COUNT
  formStoreCollectEnabled.value = normalized.storeCollectEnabled
  formStoreLinksInput.value = normalized.storeLinks.join('；')
  formListingShops.value = [...normalized.listingShops]
  formListingShopInventory.value = { ...normalized.listingShopWarehouseInventory }
  formListingPriceOp.value = normalized.listingPriceAdjust?.op ?? 'add'
  formListingPriceValue.value = normalized.listingPriceAdjust?.value ?? null
  // 恢复配置时无法区分来源，一律视为手动输入
  formKeywords.value = normalized.keywords.map((text) => ({ text, source: 'manual' }))
  recommendedKeywords.value = []
}

function syncFormFromDraft(d: AiAutoSelectDraft) {
  syncFormFromConfig(d.config)
}

function addKeyword() {
  const raw = keywordInput.value.trim()
  if (!raw) return

  // 支持一次输入多个关键词（中英文逗号、顿号、分号分隔）
  const parts = raw.split(/[,，、;；]+/).map((s) => s.trim()).filter(Boolean)
  for (const kw of parts) {
    if (!hasSelectedKeyword(kw)) {
      formKeywords.value = [...formKeywords.value, { text: kw, source: 'manual' }]
    }
  }
  keywordInput.value = ''
}

function removeKeyword(idx: number) {
  formKeywords.value = formKeywords.value.filter((_, i) => i !== idx)
}

function clearAllKeywords() {
  formKeywords.value = []
}

function selectRecommendedKeyword(kw: string) {
  if (hasSelectedKeyword(kw)) {
    formKeywords.value = formKeywords.value.filter((item) => item.text !== kw)
    return
  }
  formKeywords.value = [...formKeywords.value, { text: kw, source: 'recommended' }]
}

/** 将全部推荐词加入关键词栏（已存在的跳过，推荐池保持不变） */
function addAllRecommendedKeywords() {
  const toAdd = recommendedKeywords.value.filter((kw) => !hasSelectedKeyword(kw)).map((text) => ({ text, source: 'recommended' as const }))
  if (toAdd.length) {
    formKeywords.value = [...formKeywords.value, ...toAdd]
  }
}

async function onCategoryChange(clearRecommendedKeywords = true) {
  // 切换类目时清空推荐池；用户主动换类目时移除已添加的推荐词，保留手动输入的关键词
  recommendedKeywords.value = []
  if (clearRecommendedKeywords) {
    formKeywords.value = formKeywords.value.filter((item) => item.source !== 'recommended')
  }

  if (formCategory.value === UNLIMITED_CATEGORY) {
    keyword_loading.value = false
    return
  }

  const request_id = ++keyword_request_id
  keyword_loading.value = true

  try {
    const res = await getPluginRecommendWords(formCategory.value)
    if (request_id !== keyword_request_id) return
    if (res?.code === 200 && res.data?.keywords) {
      const suggestions = res.data.keywords.split(';').map((s) => s.trim()).filter(Boolean)
      recommendedKeywords.value = suggestions
    }
  } catch {
    // AI 推荐失败不影响选品
  } finally {
    if (request_id === keyword_request_id) {
      keyword_loading.value = false
    }
  }
}

/** 用户在类目选择器中切换类目：清除已添加的推荐词并重新拉取 */
function handleUserCategoryChange(_category: string) {
  void onCategoryChange(true)
}

async function handleStart() {
  if (!Number.isFinite(formTargetCount.value) || formTargetCount.value < 1) {
    showToast('请填写选品数量', 3000)
    return
  }
  if (formTargetCount.value > 500) {
    showToast('选品数量需在 1-500 之间', 3000)
    return
  }

  // 输入框尚有未确认的关键词时，自动按回车逻辑转为标签，避免用户忘记按回车
  if (keywordInput.value.trim()) {
    addKeyword()
  }

  if (formStoreCollectEnabled.value && !parseStoreLinks(formStoreLinksInput.value).length) {
    showToast('请输入目标店铺商品列表链接', 3000)
    return
  }

  if (formAutomationMode.value === 'full' && formListingShops.value.length > 0) {
    const shopError = shop_panel_ref.value?.validateSelection()
    if (shopError) {
      showToast(shopError, 3000)
      return
    }
  }

  const config = buildConfig()
  const sessionId = await ensureTabSessionId()

  // 用户点击「开始智能选品」视为新任务，仅清空本会话草稿，不影响其他 Tab
  await resetAutoSelectSession(sessionId)
  if (!is1688Host()) {
    const landingUrl = resolveAutoSelectLandingUrl(config)
    if (!landingUrl) {
      showToast('请输入有效的店铺商品列表链接', 3000)
      return
    }
    await savePendingAutoSelectConfig(config, { sessionId, autoStart: true })
    window.open(landingUrl, '_blank')
    emit('update:visible', false)
    emit('close')
    return
  }

  // 店铺模式：跳转首个店铺链接，目标页自动开始采集（店铺列表扫描后续实现）
  if (needsStoreNavigation(config)) {
    const storeLink = getFirstStoreLink(config)
    if (!storeLink) {
      showToast('请输入有效的店铺商品列表链接', 3000)
      return
    }
    await savePendingAutoSelectConfig(config, { sessionId, autoStart: true })
    window.open(storeLink, '_blank')
    emit('update:visible', false)
    emit('close')
    return
  }

  // 选了具体类目且当前不在对应搜索页：携带配置跳转，目标页自动开始采集
  if (needsCategoryNavigation(config)) {
    await savePendingAutoSelectConfig(config, { sessionId, autoStart: true })
    window.open(build1688CategorySearchUrl(config.category), '_blank')
    emit('update:visible', false)
    emit('close')
    return
  }

  // 不限类目：以 www.1688.com 域名为准，非主站则携带条件跳转并自动开始
  if (config.category === UNLIMITED_CATEGORY) {
    if (!is1688WwwHost()) {
      await savePendingAutoSelectConfig(config, { sessionId, autoStart: true })
      window.location.href = WWW_1688_HOME_URL
      emit('update:visible', false)
      emit('close')
      return
    }
    starting.value = true
    emit('start-collection', { config, sessionId })
    emit('update:visible', false)
    emit('close')
    starting.value = false
    return
  }

  // 同类目再次选品：强制回到第一页，避免停留在已翻页位置
  if (isCurrentCategorySearchPage(config.category) && !isCategorySearchOnPageOne(config.category)) {
    await savePendingAutoSelectConfig(config, { sessionId, autoStart: true })
    window.location.href = buildCategorySearchUrlWithPageOneFromCurrent(config.category)
    emit('update:visible', false)
    emit('close')
    return
  }

  starting.value = true
  emit('start-collection', { config, sessionId })
  emit('update:visible', false)
  emit('close')
  starting.value = false
}

async function loadTaskList() {
  await reconcileStaleInterruptedSessions()
  // 打开恢复弹窗前清除两天前的本地记录，避免列表堆积过期任务
  await clearExpiredDraftSessions()
  taskList.value = await listDraftTasks()
  selectedTaskSessionId.value = taskList.value.find((t) => !ACTIVE_RUNNER_STATUSES.includes(t.status))?.sessionId ?? taskList.value[0]?.sessionId ?? null
}

async function handleFreshStart() {
  await clearFinishedDraftSessions()
  taskPickerDismissed.value = true
  resetFormToDefaults()
  selectedTaskSessionId.value = null
  await loadTaskList()
}

/** 使用数据：打开结果页展示已采数据；采集中/已暂停不可操作 */
async function handleUseSelectedRecord() {
  const task = selectedTask.value
  if (!task || isActiveRunnerTask(task)) return
  const draft = await readDraft(task.sessionId)
  if (!draft) return
  await assignTabSessionId(task.sessionId)
  taskPickerDismissed.value = true
  emit('open-results', { sessionId: task.sessionId })
}

/** 继续采集：恢复选品条件与草稿，新标签页打开落地页后自动续采；采集中/已暂停不可操作 */
async function handleContinueCollection() {
  const task = selectedTask.value
  if (!task?.resumable || isActiveRunnerTask(task)) return
  const draft = await readDraft(task.sessionId)
  if (!draft) {
    showToast('未找到任务数据', 3000)
    return
  }
  const config = normalizeAiAutoSelectConfig(draft.config)
  const sessionId = task.sessionId
  syncFormFromConfig(config)
  taskPickerDismissed.value = true

  const landingUrl = resolveAutoSelectLandingUrl(config)
  if (!landingUrl) {
    showToast('请输入有效的店铺商品列表链接', 3000)
    return
  }

  await savePendingAutoSelectConfig(config, { sessionId, autoStart: true, resume: true })
  window.open(landingUrl, '_blank')
  emit('update:visible', false)
  emit('close')
}

function handleClose() {
  emit('update:visible', false)
  emit('close')
}

/** 关闭任务恢复层，进入下方选品配置表单（不清除历史草稿） */
function handleDismissTaskPicker() {
  taskPickerDismissed.value = true
}

/** 将表单恢复为初始默认值，不影响已采集草稿与历史记录 */
function resetFormToDefaults() {
  formCategory.value = UNLIMITED_CATEGORY
  formMinPrice.value = 0
  formMaxPrice.value = 0
  formTargetCount.value = 0
  formKeywords.value = []
  formKeywordMatchMode.value = 'strict'
  formAutomationMode.value = 'semi'
  formAiStepConfig.value = { ...DEFAULT_AI_STEP_CONFIG }
  formMaxVariantExecutionCount.value = DEFAULT_MAX_VARIANT_EXECUTION_COUNT
  formStoreCollectEnabled.value = false
  formStoreLinksInput.value = ''
  formListingShops.value = []
  formListingShopInventory.value = {}
  recommendedKeywords.value = []
  keywordInput.value = ''
  keyword_loading.value = false
  // 作废进行中的 AI 推荐词请求，避免重置后仍写入旧结果
  ++keyword_request_id
}

async function fetchRefineTemplateList() {
  try {
    const res = await apiService.getRefineTemplateList()
    if (res?.code === 200 && Array.isArray(res?.rows)) {
      refineTemplateList.value = res.rows
      if (res.rows.length > 0 && formAiStepConfig.value.imageRefineTemplate === '') {
        formAiStepConfig.value = {
          ...formAiStepConfig.value,
          imageRefineTemplate: String(res.rows[0].id),
        }
      }
    }
  } catch (e) {
    console.warn('[aiAutoSelect] 获取改图模板列表失败', e)
  }
}

async function handleResetConditions() {
  resetFormToDefaults()
  const sessionId = await getTabSessionId()
  await clearPendingAutoSelectConfig(sessionId ?? undefined)
  showToast('已清空选品条件', 2000)
}

watch(
  () => props.visible,
  async (open) => {
    if (!open) {
      taskList.value = []
      selectedTaskSessionId.value = null
      taskPickerDismissed.value = false
      return
    }
    taskPickerDismissed.value = false
    // 跨标签页跳转：恢复跳转前保存的选品配置（autoStart 由 App 落地时直接开进度弹窗）
    let tabSessionId = await getTabSessionId()
    let pending = tabSessionId ? await consumePendingAutoSelectConfig(tabSessionId) : null
    if (!pending) {
      const latest = await peekPendingAutoSelectConfig()
      if (latest && !latest.autoStart) {
        pending = latest
        await assignTabSessionId(latest.sessionId)
        await consumePendingAutoSelectConfig(latest.sessionId)
        tabSessionId = latest.sessionId
      }
    } else {
      tabSessionId = pending.sessionId
      await assignTabSessionId(pending.sessionId)
    }
    if (pending) {
      syncFormFromConfig(pending.config)
      taskList.value = []
      selectedTaskSessionId.value = null
    } else {
      // 无会话恢复时预填账号级全自动默认（流程/售价），开关保持半自动
      try {
        const settings = await readSettingsCache()
        applyFullAutoDefaultsFromSettings(settings)
      } catch (e) {
        console.warn('[aiAutoSelect] 读取全自动账号配置失败', e)
      }
      await loadTaskList()
    }
    // 再次打开弹窗时补拉推荐词（类目未变，不清除已添加的推荐词）
    if (formCategory.value !== UNLIMITED_CATEGORY) {
      await onCategoryChange(false)
    }
    await fetchRefineTemplateList()
    if (formAutomationMode.value === 'full') {
      await nextTick()
      await shop_panel_ref.value?.fetchShopList()
    }
  },
)
</script>

<style scoped lang="scss">
.mjgd_ai_auto_select_overlay {
  z-index: var(--mjgd-z-modal-tier-1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.mjgd_ai_auto_select_modal {
  position: relative;
  width: 850px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  padding: 24px 22px 20px 28px;
}

.mjgd_ai_auto_select_close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: #e2e8f0;
  border-radius: 50%;
  cursor: pointer;
  font-size: 20px;
  line-height: 32px;
}

.mjgd_ai_auto_select_header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.mjgd_ai_auto_select_title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.mjgd_ai_auto_select_header :deep(.mjgd_menu_btn_ai_icon) {
  width: 30px;
  height: 30px;
  margin: -4px -8px 0 0;
}

.mjgd_ai_auto_select_body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 550px;
  overflow-y: auto;
  /* 预留滚动条槽位，避免滚动条出现时挤压内容宽度 */
  scrollbar-gutter: stable;
  /* 内容与滚动条之间留出间隙，避免贴边 */
  padding-right: 8px;
  box-sizing: border-box;
}

.mjgd_ai_auto_select_field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mjgd_ai_auto_select_label {
  font-size: 14px;
  color: #334155;
  font-weight: 500;
}

.mjgd_ai_auto_select_required {
  color: #ef4444;
}

.mjgd_ai_auto_select_row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.mjgd_ai_auto_select_price_row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mjgd_ai_auto_select_price_input_wrap {
  flex: 1;
  display: flex;
  align-items: center;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0 10px;
  height: 40px;
}

.mjgd_ai_auto_select_currency {
  color: #94a3b8;
  margin-right: 4px;
}

.mjgd_ai_auto_select_price_input {
  border: none;
  outline: none;
  width: 100%;
  font-size: 14px;
}

.mjgd_ai_auto_select_price_dash {
  color: #94a3b8;
}

.mjgd_ai_auto_select_field_hint {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}

.mjgd_ai_auto_select_count_wrap {
  position: relative;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  height: 40px;
}

.mjgd_ai_auto_select_count_input {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  padding: 0 36px 0 12px;
  font-size: 14px;
  border-radius: 8px;
}

.mjgd_ai_auto_select_count_unit {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 13px;
}

.mjgd_ai_auto_select_presets {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.mjgd_ai_auto_select_preset_btn {
  padding: 6px 10px;
  font-size: 13px;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
}

.mjgd_ai_auto_select_preset_btn:hover {
  background: #f1f5f9;
}

.mjgd_ai_auto_select_keyword_wrap {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  box-sizing: border-box;
  position: relative;
}

.mjgd_ai_auto_select_keyword_spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #e2e8f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: mjgd_ai_auto_select_keyword_spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes mjgd_ai_auto_select_keyword_spin {
  to {
    transform: rotate(360deg);
  }
}

.mjgd_ai_auto_select_tags_row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}

.mjgd_ai_auto_select_tags_row .mjgd_ai_auto_select_tags {
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}

.mjgd_ai_auto_select_tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.mjgd_ai_auto_select_tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #eff6ff;
  color: #2563eb;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 17px;
}

.mjgd_ai_auto_select_tag.is_clickable {
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}

.mjgd_ai_auto_select_tag.is_recommend {
  background: #f1f5f9;
  color: #64748b;
}

.mjgd_ai_auto_select_tag.is_recommend.is_clickable:hover {
  background: #e2e8f0;
  color: #475569;
}

.mjgd_ai_auto_select_tag.is_recommend.is_selected {
  background: #e2e8f0;
  color: #475569;
}

.mjgd_ai_auto_select_tag.is_recommend.is_selected.is_clickable:hover {
  background: #cbd5e1;
  color: #334155;
}

.mjgd_ai_auto_select_tag.is_clickable:hover {
  background: #dbeafe;
}

.mjgd_ai_auto_select_tag_remove {
  border: none;
  background: none;
  cursor: pointer;
  color: #64748b;
  padding: 0;
  line-height: 1;
}

.mjgd_ai_auto_select_keyword_input {
  width: 100%;
  border: none;
  outline: none;
  font-size: 14px;
  background: transparent;
}

.mjgd_ai_auto_select_keyword_count {
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-size: 12px;
  color: #94a3b8;
}

.mjgd_ai_auto_select_info {
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 13px;
  padding: 10px 12px;
  border-radius: 8px;
  line-height: 1.5;
}

.mjgd_ai_auto_select_recommend_loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
}

.mjgd_ai_auto_select_recommend_wrap {
  box-sizing: border-box;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 12px;
}

.mjgd_ai_auto_select_recommend_header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.mjgd_ai_auto_select_recommend_label {
  font-size: 13px;
  color: #64748b;
}

.mjgd_ai_auto_select_recommend_add_all {
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 0;
  font-size: 13px;
  color: #2563eb;
  cursor: pointer;
  line-height: 1.4;
}

.mjgd_ai_auto_select_recommend_add_all:hover {
  color: #1d4ed8;
  text-decoration: underline;
}

.mjgd_ai_auto_select_clear_all_btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  padding: 0;
  border: none;
  background: #e2e8f0;
  border-radius: 50%;
  font-size: 16px;
  line-height: 22px;
  color: #64748b;
  cursor: pointer;
  text-align: center;
}

.mjgd_ai_auto_select_clear_all_btn:hover {
  background: #cbd5e1;
  color: #334155;
}

.mjgd_ai_auto_select_footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin: 24px 6px 0 0;
}

.mjgd_ai_auto_select_footer_actions {
  display: flex;
  gap: 12px;
}

.mjgd_ai_auto_select_btn_secondary {
  padding: 10px 20px;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  color: #334155;
}

.mjgd_ai_auto_select_btn_primary {
  padding: 10px 24px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.mjgd_ai_auto_select_btn_primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mjgd_ai_auto_select_btn_pause {
  padding: 10px 20px;
  border: 1px solid #f59e0b;
  color: #d97706;
  background: #fff;
  border-radius: 8px;
  cursor: pointer;
}

.mjgd_ai_auto_select_btn_stop {
  padding: 10px 20px;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.mjgd_ai_auto_select_resume_overlay {
  display: flex;
  align-items: center;
  justify-content: center;
}

.mjgd_ai_auto_select_resume_box {
  position: relative;
  background: #fff;
  border-radius: 10px;
  padding: 24px;
  width: 420px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.mjgd_ai_auto_select_resume_close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: #e2e8f0;
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  line-height: 28px;
  color: #475569;
}

.mjgd_ai_auto_select_task_list {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px 0;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mjgd_ai_auto_select_task_item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.mjgd_ai_auto_select_task_item.is_selected {
  border-color: #3b82f6;
  background: #eff6ff;
}

.mjgd_ai_auto_select_task_item.is_disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: #f8fafc;
}

.mjgd_ai_auto_select_task_radio {
  margin-top: 3px;
  flex-shrink: 0;
}

.mjgd_ai_auto_select_task_main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.mjgd_ai_auto_select_task_name {
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
}

.mjgd_ai_auto_select_task_meta {
  font-size: 12px;
  color: #64748b;
}

.mjgd_ai_auto_select_resume_title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.mjgd_ai_auto_select_resume_text {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 20px;
}

.mjgd_ai_auto_select_resume_actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.mjgd_ai_auto_select_mode_cards {
  display: flex;
  gap: 12px;
}

.mjgd_ai_auto_select_mode_card {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 12px 14px;
  padding-right: 30px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.mjgd_ai_auto_select_mode_card_head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.mjgd_ai_auto_select_mode_card_icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  color: #64748b;
}

.mjgd_ai_auto_select_mode_card:hover:not(.is_active) {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.mjgd_ai_auto_select_mode_card.is_active {
  border-color: #2563eb;
  background: #eff6ff;
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.12);
}

.mjgd_ai_auto_select_mode_card_check {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #2563eb;
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.mjgd_ai_auto_select_mode_card.is_active .mjgd_ai_auto_select_mode_card_icon {
  color: #2563eb;
}

.mjgd_ai_auto_select_mode_card_title {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  line-height: 1.3;
}

.mjgd_ai_auto_select_mode_card.is_active .mjgd_ai_auto_select_mode_card_title {
  color: #1d4ed8;
}

.mjgd_ai_auto_select_mode_card_desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

.mjgd_ai_auto_select_mode_card.is_active .mjgd_ai_auto_select_mode_card_desc {
  color: #64748b;
}

.mjgd_ai_auto_select_setting_banner {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  padding: 12px 14px;
  transition: border-color 0.15s ease;
}

.mjgd_ai_auto_select_setting_banner.is_expanded {
  border-color: #cbd5e1;
}

.mjgd_ai_auto_select_setting_banner_header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mjgd_ai_auto_select_setting_banner_actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.mjgd_ai_auto_select_save_config_btn {
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px;
  border: 1px solid #93c5fd;
  border-radius: 6px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.mjgd_ai_auto_select_save_config_btn:hover:not(:disabled) {
  background: #dbeafe;
  border-color: #60a5fa;
}

.mjgd_ai_auto_select_save_config_btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mjgd_ai_auto_select_setting_banner_info {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.mjgd_ai_auto_select_setting_banner_icon {
  flex-shrink: 0;
  color: #2563eb;
  margin-top: 2px;
}

.mjgd_ai_auto_select_setting_banner_text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.mjgd_ai_auto_select_setting_banner_title {
  font-size: 14px;
  font-weight: 600;
  color: #1e40af;
}

.mjgd_ai_auto_select_setting_banner_desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.mjgd_ai_auto_select_setting_banner_body {
  margin-top: 12px;
}

.mjgd_ai_auto_select_ai_step_wrap {
  margin-top: 0;
}

.mjgd_ai_auto_select_listing_price_section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}

.mjgd_ai_auto_select_listing_price_header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.mjgd_ai_auto_select_listing_price_title {
  font-size: 14px;
  font-weight: 600;
  color: #1e40af;
}

.mjgd_ai_auto_select_listing_price_desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.mjgd_ai_auto_select_listing_price_row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.mjgd_ai_auto_select_listing_price_label {
  flex-shrink: 0;
  font-size: 13px;
  color: #334155;
}

.mjgd_ai_auto_select_listing_price_op {
  min-width: 140px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  color: #334155;
  background: #fff;
}

.mjgd_ai_auto_select_listing_price_input_wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.mjgd_ai_auto_select_listing_price_input {
  width: 120px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  color: #334155;
  background: #fff;
}

.mjgd_ai_auto_select_listing_price_input.has_suffix {
  padding-right: 24px;
}

.mjgd_ai_auto_select_listing_price_suffix {
  position: absolute;
  right: 10px;
  font-size: 13px;
  color: #64748b;
  pointer-events: none;
}

.mjgd_ai_auto_select_listing_shop_section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}

.mjgd_ai_auto_select_listing_shop_header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.mjgd_ai_auto_select_listing_shop_title {
  font-size: 14px;
  font-weight: 600;
  color: #1e40af;
}

.mjgd_ai_auto_select_listing_shop_desc {
  font-size: 12px;
  color: #64748b;
  line-height: 1.4;
}

.mjgd_ai_auto_select_listing_shop_select_all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-shrink: 0;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
}

/* 胶囊开关：店铺采集启用态 */
.mjgd_ai_auto_select_switch {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 20px;
  background: #e5e7eb;
  cursor: pointer;
  transition: background 0.2s ease;
}

.mjgd_ai_auto_select_switch.is_on {
  background: #2563eb;
}

.mjgd_ai_auto_select_switch_thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
  pointer-events: none;
}

.mjgd_ai_auto_select_switch.is_on .mjgd_ai_auto_select_switch_thumb {
  transform: translateX(16px);
}


.mjgd_ai_auto_select_store_input {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}
.mjgd_ai_auto_select_store_input::-webkit-input-placeholder {
  color: #999999;
}
.mjgd_ai_auto_select_store_input:focus {
  border-color: #2563eb;
}
</style>
