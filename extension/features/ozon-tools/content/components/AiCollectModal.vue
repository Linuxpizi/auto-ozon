<template>
    <div
        v-show="visible"
        class="mjgd-ai-overlay mjgd_plugin_overlay is_tier_collect"
        :class="{ is_panel_only: sharedOverlay }"
    >
        <div id="mjgd-ai-collect-modal" class="mjgd-ai-modal">
            <!-- 顶部横栏 -->
            <div class="mjgd-ai-top-header">
                <div class="mjgd-ai-top-header-left">
                    <img :src="newLogo" alt="Auto Ozon Logo" class="mjgd-ai-logo-icon" />
                    <div class="mjgd-ai-logo-text">Auto Ozon · 本地模式</div>
                </div>
                <div class="mjgd-ai-top-header-right">
                    <button
                        type="button"
                        class="mjgd-ai-nav-btn"
                        :class="{ 'mjgd-ai-nav-btn-active': activeMenu === 'workbench' }"
                        @click="handleNavigateToWorkbench"
                    >
                        <img :src="cdIcon" alt="工作台" class="mjgd-ai-nav-btn-icon" />
                        <span class="mjgd-ai-nav-btn-text">工作台</span>
                    </button>
                    <button
                        type="button"
                        class="mjgd-ai-nav-btn"
                        :class="{ 'mjgd-ai-nav-btn-active': activeMenu === 'imageQueue' }"
                        @click="activeMenu = 'imageQueue'"
                    >
                        <img :src="imgIcon" alt="图片处理中心" class="mjgd-ai-nav-btn-icon" />
                        <span class="mjgd-ai-nav-btn-text">图片处理中心</span>
                    </button>
                    <button
                        type="button"
                        class="mjgd-ai-nav-btn"
                        :class="{ 'mjgd-ai-nav-btn-active': activeMenu === 'settings' }"
                        @click="activeMenu = 'settings'"
                    >
                        <img :src="settingIcon" alt="系统设置" class="mjgd-ai-nav-btn-icon" />
                        <span class="mjgd-ai-nav-btn-text">系统设置</span>
                    </button>
                    <span class="mjgd-ai-header-divider"></span>
                    <span class="mjgd-ai-close-btn" @click="handleClose">&times;</span>
                </div>
            </div>

            <!-- 下方内容区域 -->
            <div class="mjgd-ai-content">
                <div class="mjgd-ai-content-body">
                    <!-- 工作台 / 图片处理中心 / 系统设置 使用 KeepAlive + 动态组件，缓存实例避免 Tab 切换反复销毁重建 -->
                    <KeepAlive>
                        <component
                            :is="activeMenuPageComponent"
                            :key="activeMenu"
                            :ref="bindActiveMenuPageRef"
                            v-on="activeMenuPageListeners"
                        />
                    </KeepAlive>
                </div>
            </div>
        </div>

        <!-- 上传商品数据模态框 -->
        <div v-if="showUploadingModal" class="mjgd-ai-countdown-overlay mjgd_plugin_overlay is_nested is_tier_inner">
            <div class="mjgd-ai-uploading-modal">
                <div class="mjgd-ai-uploading-content">
                    <div class="mjgd-ai-uploading-icon">
                        <div class="mjgd-ai-uploading-spinner"></div>
                    </div>
                    <div class="mjgd-ai-uploading-title">正在上传商品数据</div>
                    <div class="mjgd-ai-uploading-text">请稍候，数据正在上传到系统中...</div>
                </div>
            </div>
        </div>

        <!-- 获取数据失败提示模态框 -->
        <div v-if="showGetDataFailedModal" class="mjgd-ai-countdown-overlay mjgd_plugin_overlay is_nested is_tier_inner">
            <div class="mjgd-ai-uploading-modal">
                <div class="mjgd-ai-uploading-content">
                    <div class="mjgd-ai-uploading-icon">
                        <svg t="1776335041878" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5500" width="64" height="64"><path d="M512 0C230.4 0 0 230.4 0 512s230.4 512 512 512 512-230.4 512-512S793.6 0 512 0z m0 981.333333C251.733333 981.333333 42.666667 772.266667 42.666667 512S251.733333 42.666667 512 42.666667s469.333333 209.066667 469.333333 469.333333-209.066667 469.333333-469.333333 469.333333z" p-id="5501" fill="#707070"></path><path d="M554.666667 209.066667h-85.333334l21.333334 469.333333h42.666666z" p-id="5502" fill="#707070"></path><path d="M512 806.4z" fill="#707070" p-id="5503"></path><path d="M533.333333 742.4h-42.666666v85.333333h42.666666" p-id="5504" fill="#707070"></path></svg>
                    </div>
                    <div class="mjgd-ai-uploading-title">未获取到商品数据</div>
                    <div class="mjgd-ai-uploading-text">
                        <div>可能是商品不支持采集或平台频率限制</div>
                        <div>请稍后或更换商品重试</div>
                    </div>
                    <button class="mjgd-ai-success-btn" @click="showGetDataFailedModal = false">我知道了</button>
                </div>
            </div>
        </div>

        <ValidationWarningModal :visible="showValidationWarningModal" :mode="validationWarningMode" :fields="validationWarningFields" overlay-class="is_nested is_tier_inner" @close="closeValidationWarningModal" @go-edit="handleValidationWarningGoEdit" />

        <OzonSubmitResultModal :visible="showOzonResultModal" :mode="ozonResultMode" :failures="ozonResultFailures" overlay-class="is_nested is_tier_inner" @close="showOzonResultModal = false" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, provide, type Component } from 'vue'
import { getShopList, getAiCategory, type ShopItem, type CategoryItem, type AttributeItem, getExchangeRate } from '../../utils/aiApi'
import { apiService, type BatchImageTranslateLanguage } from '../../utils/api'
import { roundPrice } from '../../utils/price'
import { messageBoxConfirm } from '../../utils/messageBox'
import { showToast } from '../../utils/toast'
import { ensureHttpImageUrlOnOss } from '../../utils/imageOssUpload'
import { applyTransformUrl } from '../../utils/imageTransform'
import { extractTitleFromRawData } from '../utils/profitDrawerPageContext'
import { buildCategoryTemplatesFromGoodsCategory, extractGoodsCategoryFromRaw } from '../utils/ozonGoodsCategory'
import {
    applyCollectedOzonFeaturesFromRuAttrs,
    extractOzonRowsFromRaw,
} from '../utils/ozonGoodsFeature'
import {
    FEATURE_ATTR_ID_DESCRIPTION,
    FIELD_SCOPE_STORAGE_KEY,
    FEATURE_SCOPE_STORAGE_KEY,
    SKU_VARIANT_DESCRIPTION_STORAGE_KEY,
    SKU_VARIANT_FEATURE_STORAGE_KEY,
    applyAiResultJsonToFeatureValues as applyAiResultJsonToFeatureValuesUtil,
    buildAiFillPayload,
    buildChineseValidationErrors,
    buildVariantImageCountWarningFields,
    buildVariantAspectWarningFields,
    checkServerAiFillRestoreAvailable,
    consumeAiAgentSse as consumeAiAgentSseUtil,
    createAiAgentStoppedError,
    fetchAndApplyAiFillResultBySession,
    getOfferIdFromPage,
    isAiAgentStoppedError,
    normalizeUnknownError,
    restoreAiFillResultFromServer,
    runOzonSubmitWithValidation,
    normalizeFeatureName,
    isAttrValueFilled,
    type AiApplyContext,
    type AiSseContext,
    type ChineseFieldMark,
    type OzonSubmitContext,
    type OzonSubmitValidationHooks,
    type SubmitValidateContext,
    type VariantImageCountExceededPayload,
    type VariantAspectValidationPayload,
    type VariantAspectValidationItem,
} from '../utils/ozonAiFillAndSubmit'
import {
    RICH_ANNOTATION_JSON_PREFILL_KEY,
    collectDetailImagesFromDom,
    enrichTransformedDataWithImageLists,
    generateDefaultOfferidPrefix,
    syncSkuImagesFromImgListToTransformed,
    transformCollectedRawData,
} from '../utils/collectedGoodsTransform'
import {
    buildEditStateSnapshotFromCollectModal,
    evaluateNeedsManualEdit,
    manualEditFocusFromVariantAspectItem,
    resolveSkuVideoUrlListForItem,
    syncSkuVideoUrlsToTransformed,
    resolveDraftItemTitle,
    type AiAutoSelectDraftItem,
    type AiFillStepFailureKey,
} from '../utils/aiAutoSelect'
import {
    bindAutoSelectDraftItem,
    ensureSessionCategoryAndFeatureAttrs,
    hydrateModalFromSession,
    sessionToAutoSelectPatch,
    syncSessionFromModal,
    type ModalSessionBindings,
    type ProductSession,
} from '../utils/productSession'
import { buildProductKey, clearImageEditDraft } from '../utils/imageEditDraftStorage'
import { PipelineManager, PipelineStep, type PipelineStepValue } from './PipelineManager'
import type { ProgressStep } from './PipelineManager'
import { USER_SYSTEM_SETTINGS_CACHE_EVENT } from '../utils/userSystemSettings/userSystemSettingsSync'
import { resolveAssetUrl, readStorageValue } from '../../utils/runtime'
import { proxyFetchJson } from '../../utils/proxyFetch'
import ValidationWarningModal, { type ValidationWarningFieldItem, type ValidationWarningModalMode } from './common/ValidationWarningModal.vue'
import OzonSubmitResultModal, { type OzonSubmitFailureItem } from './common/OzonSubmitResultModal.vue'
import WorkbenchPage from './WorkbenchPage.vue'
import ImageQueuePage from './ImageQueuePage.vue'
import type { AiLogStreamSink } from '../composables/useAiLogStream'
import type { ImageItem, ImageStatus } from './ImageQueuePage.vue'
import SettingsPage from './SettingsPage.vue'
import {
    formatVariantLimitExceededMessage,
    getMaxVariantExecutionCount,
    getSkuVariantCount,
    isVariantCountOverLimit,
} from '../utils/maxVariantExecution'
import fallbackNewLogo from '../../assets/img/newlogo.png'
import fallbackCdIcon from '../../assets/cd.svg'
import fallbackImgIcon from '../../assets/img.svg'
import fallbackSettingIcon from '../../assets/setting.svg'

// 创建 PipelineManager 实例
const pipeline = new PipelineManager()

// Props
const props = defineProps<{
    visible: boolean
    sharedOverlay?: boolean
}>()

// Emits
const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void
    (e: 'close'): void
}>()

let prevBodyOverflow = ''
let prevHtmlOverflow = ''
let pageScrollLocked = false
const newLogo = resolveAssetUrl('src/assets/img/newlogo.png', fallbackNewLogo)
const cdIcon = resolveAssetUrl('src/assets/cd.svg', fallbackCdIcon)
const imgIcon = resolveAssetUrl('src/assets/img.svg', fallbackImgIcon)
const settingIcon = resolveAssetUrl('src/assets/setting.svg', fallbackSettingIcon)

const lockPageScroll = () => {
    if (pageScrollLocked || typeof document === 'undefined') return
    prevBodyOverflow = document.body.style.overflow
    prevHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    pageScrollLocked = true
}

const unlockPageScroll = () => {
    if (!pageScrollLocked || typeof document === 'undefined') return
    document.body.style.overflow = prevBodyOverflow
    document.documentElement.style.overflow = prevHtmlOverflow
    pageScrollLocked = false
}

// 菜单状态
const activeMenu = ref<'workbench' | 'imageQueue' | 'settings'>('workbench')

// 自动选品外部加载模式：跳过页面采集，从草稿注入数据
const externalAutoSelectMode = ref(false)
const autoSelectSourceItemId = ref<string | null>(null)
const autoSelectSourceOfferId = ref<string | null>(null)
/** 灌入草稿时的列表标题，供 buildAutoSelectItemPatch 在 product_name 暂缺时回退 */
const autoSelectSourceItemTitle = ref('')
/** 当前工作台绑定的 ProductSession（自动选品编辑模式） */
const activeSession = ref<ProductSession | null>(null)
/** 自动选品灌入草稿期间，跳过工作台类目切换清空逻辑 */
const autoSelectItemLoading = ref(false)
let autoSelectSaveCallback: ((itemId: string, patch: Partial<AiAutoSelectDraftItem>) => void) | null = null

/** 自动选品在列表页无详情 URL，AI 帮填需使用草稿中的 offerId */
function getCollectOfferIdForAiFill(): { collectPlatform: string; offerId: string } {
    if (externalAutoSelectMode.value && autoSelectSourceOfferId.value) {
        return { collectPlatform: 'ALI_1688', offerId: autoSelectSourceOfferId.value }
    }
    return getOfferIdFromPage()
}

/** 当前 Tab 对应的页面组件（供 KeepAlive 内动态 component 使用） */
const activeMenuPageComponent = computed<Component | null>(() => {
    switch (activeMenu.value) {
        case 'workbench':
            return WorkbenchPage
        case 'imageQueue':
            return ImageQueuePage
        case 'settings':
            return SettingsPage
        default:
            return null
    }
})

// 需要在description中插入提示文本的属性ID列表
const ATTRIBUTE_IDS_REQUIRING_LIST_SELECTION = [10096]
//需要在description中插入 《必须输入俄文》提示文本的属性ID列表
const ATTRIBUTE_IDS_REQUIRING_RUSSIAN_INPUT = [22390, 10097,9533,8050,4384]
/** 型号名称等：自动生成 9 位字母数字随机码写入工作台；AI 回填不写入 prefilled（由工作台值优先展示） */
const FEATURE_ATTR_IDS_AUTO_RANDOM_MODEL = new Set([9048, 8292])
const FEATURE_ATTR_ID_BRAND_TYPE = 85
const FEATURE_ATTR_ID_FASHION_BRAND = 31
const FEATURE_ATTR_ID_TYPE = 8229
const FEATURE_ATTR_ID_ORIGIN_COUNTRY = 4389
const FEATURE_ATTR_ID_MANUFACTURER = 23487
/** 保质期（天），必填特征加载后与品牌/原产国等一并默认回填 */
const FEATURE_ATTR_ID_SHELF_LIFE_DAYS = 8205
// 生成4位随机串
const generateRandomString = (): string => {
    return Math.random().toString(36).substring(2, 6).toUpperCase()
}

// 店铺数据
interface Shop {
    id: number
    name: string
}

const shops = ref<Shop[]>([])
const selectedShops = ref<number[]>([])
/** 每店仓库 + 库存（工作台与 aiCreate 提交共用） */
const shopWarehouseInventory = ref<
  Record<number, { warehouseId: number | null; quantity: number }>
>({})
const selectAllShops = ref(false)
const shopListLoading = ref(false)

// 已选择店铺缓存键名
const SELECTED_SHOPS_STORAGE_KEY = 'mjgd_ai_selected_shops'
const AI_COLLECT_DRAFT_STORAGE_KEY = 'mjgd_ai_collect_modal_draft_v1'

// 保存已选择的店铺到 localStorage
const saveSelectedShopsToStorage = (shopIds: number[]) => {
  try {
    localStorage.setItem(SELECTED_SHOPS_STORAGE_KEY, JSON.stringify(shopIds))
  } catch (error) {
    console.error('保存已选择店铺失败:', error)
  }
}

type AiCollectDraft = {
    pageUrl: string
    activeMenu: 'workbench' | 'imageQueue' | 'settings'
    skuPrefix: string
    categoryTemplates: Array<{ id: number; name: string; data?: CategoryItem }>
    categoryTemplate: number | null
    featureAttrError: string | null
    featureAttrs: any[]
    attributeList: AttributeItem[]
    isCategoryUnavailable: boolean
    waitingForCategoryChange: boolean
    isManualSelect: boolean
    previousSubmittedCategoryTemplate: number | null
    rawData: string
    rawDataObj: any
    transformedData: any
    aiOutput: string
    visualModelOutput: string
    aiLogOverlayText: string
    prefilledFeatureAttrValues: Record<string, string | number | string[]>
    workbenchFeatureAttrValues: Record<string, string | number | string[]>
    featureAttrValidationErrors: Record<string, string>
    aiResultJsonList: any[]
    isDataLoaded: boolean
    submitResult: SubmitResultItem[]
    imageList: ImageItem[]
    selectedImagesForTranslate: string[]
    isManualImageSelect: boolean
    showStartTranslateBtn: boolean
    imageUrlMap: Array<[string, string]>
    imageUrlMapByVariant: Array<[number, Array<[string, string]>]>
    translateVariantIndex: number | null
    batchTranslateLanguage: BatchImageTranslateLanguage
    selectedShops: number[]
    shopWarehouseInventory: Record<number, { warehouseId: number | null; quantity: number }>
    skuVideoUrlList: Record<number, string>
}

const readAiCollectDraftStorage = (): string | null => {
    try {
        return sessionStorage.getItem(AI_COLLECT_DRAFT_STORAGE_KEY)
    } catch {
        return null
    }
}

const clearAiCollectDraft = () => {
    try {
        sessionStorage.removeItem(AI_COLLECT_DRAFT_STORAGE_KEY)
    } catch (error) {
        console.error('清理AI上品草稿失败:', error)
    }
}

const normalizeIndexedMediaMap = (raw: unknown): Record<number, string> => {
    if (!raw || typeof raw !== 'object') return {}
    return Object.fromEntries(
        Object.entries(raw as Record<string, unknown>)
            .map(([key, value]) => [Number(key), String(value ?? '').trim()] as const)
            .filter(([key, value]) => Number.isInteger(key) && key >= 0 && Boolean(value))
    )
}

const hasPersistableAiCollectDraft = () => {
    return Boolean(
        isDataLoaded.value
        || transformedData.value
        || rawData.value
        || aiOutput.value
        || imageList.value.length
    )
}

const persistAiCollectDraft = () => {
    try {
        if (!hasPersistableAiCollectDraft() && !aiLogOverlayText.value.trim()) {
            clearAiCollectDraft()
            return
        }
        // 落盘前同步图片顺序到 canonical 字段，与自动选品草稿保存行为一致
        syncSkuImagesFromImgListToTransformed(transformedData.value)
        const draft: AiCollectDraft = {
            pageUrl: window.location.href,
            activeMenu: activeMenu.value,
            skuPrefix: skuPrefix.value,
            categoryTemplates: JSON.parse(JSON.stringify(categoryTemplates.value)),
            categoryTemplate: categoryTemplate.value,
            featureAttrError: featureAttrError.value,
            featureAttrs: JSON.parse(JSON.stringify(featureAttrs.value)),
            attributeList: JSON.parse(JSON.stringify(attributeList.value)),
            isCategoryUnavailable: isCategoryUnavailable.value,
            waitingForCategoryChange: waitingForCategoryChange.value,
            isManualSelect: isManualSelect.value,
            previousSubmittedCategoryTemplate: previousSubmittedCategoryTemplate.value,
            rawData: rawData.value,
            rawDataObj: JSON.parse(JSON.stringify(rawDataObj.value)),
            transformedData: JSON.parse(JSON.stringify(transformedData.value)),
            aiOutput: aiOutput.value,
            visualModelOutput: visualModelOutput.value,
            aiLogOverlayText: aiLogOverlayText.value,
            prefilledFeatureAttrValues: JSON.parse(JSON.stringify(prefilledFeatureAttrValues.value)),
            workbenchFeatureAttrValues: JSON.parse(JSON.stringify(workbenchFeatureAttrValues.value)),
            featureAttrValidationErrors: JSON.parse(JSON.stringify(featureAttrValidationErrors.value)),
            aiResultJsonList: JSON.parse(JSON.stringify(aiResultJsonList.value)),
            isDataLoaded: isDataLoaded.value,
            submitResult: JSON.parse(JSON.stringify(submitResult.value)),
            imageList: JSON.parse(JSON.stringify(imageList.value)),
            selectedImagesForTranslate: JSON.parse(JSON.stringify(selectedImagesForTranslate.value)),
            isManualImageSelect: isManualImageSelect.value,
            showStartTranslateBtn: showStartTranslateBtn.value,
            imageUrlMap: Array.from(imageUrlMap.value.entries()),
            imageUrlMapByVariant: Array.from(imageUrlMapByVariant.value.entries()).map(([key, map]) => [
                key,
                Array.from(map.entries())
            ]),
            translateVariantIndex: translateVariantIndex.value,
            batchTranslateLanguage: batchTranslateLanguage.value,
            selectedShops: JSON.parse(JSON.stringify(selectedShops.value)),
            shopWarehouseInventory: JSON.parse(JSON.stringify(shopWarehouseInventory.value)),
            skuVideoUrlList: JSON.parse(JSON.stringify(skuVideoUrlList.value))
        }
        sessionStorage.setItem(AI_COLLECT_DRAFT_STORAGE_KEY, JSON.stringify(draft))
    } catch (error) {
        console.error('保存AI上品草稿失败:', error)
    }
}

/** AI 智能体日志流式追加时 debounce 写入 sessionStorage，与表单草稿同键 */
let aiCollectDraftPersistTimer: ReturnType<typeof setTimeout> | null = null
const AI_COLLECT_DRAFT_PERSIST_DEBOUNCE_MS = 400

const flushAiCollectDraftPersistTimer = () => {
    if (aiCollectDraftPersistTimer) {
        clearTimeout(aiCollectDraftPersistTimer)
        aiCollectDraftPersistTimer = null
    }
}

const schedulePersistAiCollectDraftFromLog = () => {
    if (aiCollectDraftPersistTimer) {
        clearTimeout(aiCollectDraftPersistTimer)
    }
    aiCollectDraftPersistTimer = setTimeout(() => {
        aiCollectDraftPersistTimer = null
        persistAiCollectDraft()
    }, AI_COLLECT_DRAFT_PERSIST_DEBOUNCE_MS)
}

const restoreAiCollectDraft = (): boolean => {
    try {
        const raw = readAiCollectDraftStorage()
        if (!raw) return false
        const draft = JSON.parse(raw) as AiCollectDraft
        // 变更说明：仅恢复当前页面的弹窗草稿，避免切换商品页后误带入旧数据。
        if (!draft || draft.pageUrl !== window.location.href) {
            clearAiCollectDraft()
            return false
        }

        activeMenu.value = draft.activeMenu || 'workbench'
        skuPrefix.value = draft.skuPrefix || skuPrefix.value
        categoryTemplates.value = Array.isArray(draft.categoryTemplates) ? draft.categoryTemplates : []
        categoryTemplate.value = draft.categoryTemplate ?? null
        featureAttrError.value = draft.featureAttrError ?? null
        featureAttrs.value = Array.isArray(draft.featureAttrs) ? draft.featureAttrs : []
        attributeList.value = Array.isArray(draft.attributeList) ? draft.attributeList : []
        isCategoryUnavailable.value = Boolean(draft.isCategoryUnavailable)
        waitingForCategoryChange.value = Boolean(draft.waitingForCategoryChange)
        isManualSelect.value = Boolean(draft.isManualSelect)
        previousSubmittedCategoryTemplate.value = draft.previousSubmittedCategoryTemplate ?? null
        rawData.value = draft.rawData || ''
        rawDataObj.value = draft.rawDataObj ?? null
        transformedData.value = draft.transformedData ?? null
        aiOutput.value = draft.aiOutput || ''
        visualModelOutput.value = draft.visualModelOutput || ''
        aiLogFullText = draft.aiLogOverlayText || ''
        aiLogOverlayText.value = aiLogFullText
        aiLogStreamSink?.setFullText(aiLogFullText)
        prefilledFeatureAttrValues.value = draft.prefilledFeatureAttrValues || {}
        workbenchFeatureAttrValues.value = draft.workbenchFeatureAttrValues || {}
        featureAttrValidationErrors.value = draft.featureAttrValidationErrors || {}
        aiResultJsonList.value = Array.isArray(draft.aiResultJsonList) ? draft.aiResultJsonList : []
        isDataLoaded.value = Boolean(draft.isDataLoaded)
        submitResult.value = Array.isArray(draft.submitResult) ? draft.submitResult : []
        imageList.value = Array.isArray(draft.imageList) ? draft.imageList : []
        selectedImagesForTranslate.value = Array.isArray(draft.selectedImagesForTranslate)
            ? draft.selectedImagesForTranslate
            : []
        isManualImageSelect.value = Boolean(draft.isManualImageSelect)
        showStartTranslateBtn.value = Boolean(draft.showStartTranslateBtn)
        imageUrlMap.value = new Map(Array.isArray(draft.imageUrlMap) ? draft.imageUrlMap : [])
        imageUrlMapByVariant.value = new Map(
            Array.isArray(draft.imageUrlMapByVariant)
                ? draft.imageUrlMapByVariant.map(([key, entries]) => [Number(key), new Map(entries)])
                : []
        )
        translateVariantIndex.value = draft.translateVariantIndex ?? null
        batchTranslateLanguage.value = draft.batchTranslateLanguage || 'CHS>RUS'
        selectedShops.value = Array.isArray(draft.selectedShops) ? draft.selectedShops : []
        shopWarehouseInventory.value = draft.shopWarehouseInventory || {}
        skuVideoUrlList.value = normalizeIndexedMediaMap(draft.skuVideoUrlList)
        selectAllShops.value = false
        ensureDefaultFeatureAttrSelections()
        ensureRandomModelNameFeatureAttrs()
        return true
    } catch (error) {
        console.error('恢复AI上品草稿失败:', error)
        clearAiCollectDraft()
        return false
    }
}

const handleAiCollectBeforeUnload = () => {
    clearAiCollectDraft()
}

const skuPrefix = ref(`AUTO-${generateRandomString()}`)
const categoryTemplates = ref<Array<{ id: number; name: string; data?: CategoryItem }>>([])
const categoryTemplate = ref<number | null>(null)

// 特征属性（类目 OSS JSON）：由父组件拉取并 provide 给 WorkbenchPage
const featureAttrLoading = ref(false)
const featureAttrError = ref<string | null>(null)
const featureAttrs = ref<any[]>([])
let featureAttrRequestSeq = 0
const NO_BRAND_OPTION = {
    id: 126745801,
    value: '无品牌',
    info: '无品牌',
    picture: 'https://cdn1.ozonusercontent.com/s3/product-service-meta-media/739f341e-d5f0-4d50-9037-018cab8e65f5.jpg'
}
const CHINA_ORIGIN_OPTION = {
    id: 90296,
    value: 'Китай', // 中国 -> 俄语翻译
    info: '中国'
}

const prependDictionaryOptionIfMissing = (attr: any, option: { id: number; value: string; info?: string; picture?: string }) => {
    const currentDict = Array.isArray(attr?.dictionary_values) ? attr.dictionary_values : []
    const exists = currentDict.some((item: any) => {
        return Number(item?.id) === option.id
            || normalizeFeatureName(item?.value) === normalizeFeatureName(option.value)
    })
    if (exists) return attr
    return {
        ...attr,
        dictionary_values: [option, ...currentDict]
    }
}

// 加载特征属性
async function loadFeatureAttrsFromCategory(typeId: string, level2Id: string) {
    const tid = String(typeId ?? '').trim()
    const lid = String(level2Id ?? '').trim()
    if (!tid && !lid) {
        featureAttrs.value = []
        featureAttrError.value = null
        return
    }
    featureAttrLoading.value = true
    featureAttrError.value = null
    const seq = ++featureAttrRequestSeq
    try {
        const res = await apiService.getCategoryAndOptionList(tid, lid)
        if (seq !== featureAttrRequestSeq) return
        const data = res?.data
        const resolvedTypeId = String(data?.typeId ?? '').trim()
        const zhOssPath = typeof data?.zhOssPath === 'string' ? data.zhOssPath : ''
        if (!zhOssPath) {
            featureAttrError.value = '未返回属性配置地址'
            featureAttrs.value = []
            // 抛出后由下方 catch 继续向上 reject，供 applyCategoryFromCollectedGoods.catch 回退 AI 智选
            throw new Error('未返回属性配置地址')
        }
        const json = await proxyFetchJson<any[]>(zhOssPath)
        if (seq !== featureAttrRequestSeq) return
        const list = Array.isArray(json) ? json : null
        if (!list) {
            featureAttrError.value = '属性数据格式错误'
            featureAttrs.value = []
            return
        }
        const normalizedList = list.map((attr: any) => {
            if (!attr || typeof attr !== 'object') return attr
            const attrId = Number(attr?.id)
            if (attrId === FEATURE_ATTR_ID_TYPE && resolvedTypeId) {
                if (isAttrValueFilled(attr, attr?.value)) {
                    return attr
                }
                return {
                    ...attr,
                    value: resolvedTypeId
                }
            }
            if (attrId === FEATURE_ATTR_ID_BRAND_TYPE || attrId === FEATURE_ATTR_ID_FASHION_BRAND) {
                return prependDictionaryOptionIfMissing(attr, NO_BRAND_OPTION)
            }
            if (attrId === FEATURE_ATTR_ID_ORIGIN_COUNTRY) {
                return prependDictionaryOptionIfMissing(attr, CHINA_ORIGIN_OPTION)
            }
            return attr
        })
        featureAttrs.value = normalizedList
        if (resolvedTypeId) {
            const typeAttr = normalizedList.find((item: any) => Number(item?.id) === FEATURE_ATTR_ID_TYPE && !item?.is_aspect)
            const existingTypeValue = getFeatureAttrExistingValue(typeAttr)
            if (!isAttrValueFilled(typeAttr, existingTypeValue)) {
                setWorkbenchFeatureAttrValue(FEATURE_ATTR_ID_TYPE, resolvedTypeId)
            }
        }
        featureAttrError.value = null
        ensureDefaultFeatureAttrSelections()
        ensureRandomModelNameFeatureAttrs()
        // Ozon 站点：zh 属性名与页面采集俄文不一致，用 ruOssPath 做名称/字典值桥接后回填
        const host = window.location.hostname
        if (host.includes('ozon.ru') || host.includes('ozon.kz')) {
            const ruOssPath = typeof data?.ruOssPath === 'string' ? data.ruOssPath : ''
            if (ruOssPath) {
                const ruJson = await proxyFetchJson<any[]>(ruOssPath)
                if (seq !== featureAttrRequestSeq) return
                const ruList = Array.isArray(ruJson) ? ruJson : null
                if (ruList?.length) {
                    const applyResult = applyCollectedOzonFeaturesFromRuAttrs({
                        ruAttrs: ruList,
                        zhFeatureAttrs: featureAttrs.value,
                        features: transformedData.value?.global_data?.features ?? [],
                        skuMatrix: transformedData.value?.sku_matrix ?? [],
                        ozonRows: extractOzonRowsFromRaw(rawDataObj.value),
                        prefilledFeatureAttrValues: prefilledFeatureAttrValues.value,
                        workbenchFeatureAttrValues: workbenchFeatureAttrValues.value,
                    })
                    prefilledFeatureAttrValues.value = applyResult.prefilledFeatureAttrValues
                    ensureRandomModelNameFeatureAttrs()
                }
            }
        }
        // Ozon 采集的 richAnnotationJson 回填到各变体 JSON富内容（与 step8 写入格式一致）
        applyOzonRichAnnotationJsonPrefill()
    } catch (e: any) {
        if (seq !== featureAttrRequestSeq) return
        featureAttrError.value = e?.message ?? '加载特征属性失败'
        featureAttrs.value = []
        throw e // 无 zhOssPath 须 reject 到调用方，内部 catch 吞掉后外层 .catch 收不到
    } finally {
        if (seq === featureAttrRequestSeq) featureAttrLoading.value = false
    }
}

/** 按商品标题拉取 AI 智选类目，写入模板并加载首项特征属性 */
const applyAiCategoryFromTitle = async (title: string): Promise<boolean> => {
    const categoryResponse = await getAiCategory(title)
    if (categoryResponse.code === 200 && categoryResponse.data && categoryResponse.data.length > 0) {
        categoryTemplates.value = categoryResponse.data.map((item, index) => ({
            id: index + 1,
            name: `${item.metadata.level1NameZh}/${item.metadata.level2NameZh}/${item.metadata.typeNameZh}`,
            data: item
        }))
        if (categoryTemplates.value.length > 0) {
            categoryTemplate.value = categoryTemplates.value[0].id
            const first = categoryResponse.data[0]
            const meta = first?.metadata
            if (meta) {
                const typeId = String(meta.typeId ?? '')
                const level2Id = String(meta.level2Id ?? '')
                if (typeId !== '' || level2Id !== '') {
                    try {
                        await loadFeatureAttrsFromCategory(typeId, level2Id)
                    } catch (err) {
                        console.error('回显加载特征属性失败:', err)
                    }
                }
            }
        }
        console.log('AI智选类目获取成功，共', categoryTemplates.value.length, '个类目，已默认选择第一个')
        return true
    }
    return false
}

/**
 * 将 Ozon 采集接口 /sku/shops 的 categories 同步到 categoryTemplates / categoryTemplate
 * 并在 loadFeatureAttrsFromCategory内拉取 ruOssPath，用俄文属性定义匹配页面采集特征后回填工作台
 * @returns 是否已成功应用（WorkbenchPage 通过 inject 读取同一 ref）
 */
const applyCategoryFromCollectedGoods = (raw: any): boolean => {
    const categories = extractGoodsCategoryFromRaw(raw)
    if (!categories?.length) {
        return false
    }

    const templates = buildCategoryTemplatesFromGoodsCategory(categories)
    if (!templates.length) {
        return false
    }

    categoryTemplates.value = templates
    categoryTemplate.value = templates[0].id

    const meta = templates[0].data?.metadata
    if (meta) {
        const typeId = String(meta.typeId ?? '')
        const level2Id = String(meta.level2Id ?? '')
        if (typeId !== '' || level2Id !== '') {
            // zhOssPath + ruOssPath 均在 loadFeatureAttrsFromCategory中加载；Ozon 站点会执行俄文特征匹配回填
            loadFeatureAttrsFromCategory(typeId, level2Id).catch(async (err) => {
                console.error('采集类目回显加载特征属性失败:', err)
                const title = extractTitleFromRawData(raw)
                if (!title) {
                    console.warn('采集类目特征加载失败且无标题，无法回退 AI 智选类目')
                    return
                }
                try {
                    categoryLoading.value = true
                    const ok = await applyAiCategoryFromTitle(title)
                    if (ok) {
                        console.log('采集类目属性配置缺失，已回退 AI 智选类目')
                        pipeline.setStepStatus(PipelineStep.FETCH_CATEGORY, 'completed')
                    } else {
                        console.warn('未获取到类目数据')
                        pipeline.setStepStatus(PipelineStep.FETCH_CATEGORY, 'pending')
                    }
                } catch (fallbackErr: any) {
                    console.error('获取AI智选类目失败:', fallbackErr)
                    pipeline.setStepStatus(PipelineStep.FETCH_CATEGORY, 'pending')
                } finally {
                    categoryLoading.value = false
                }
            })
        }
    }

    console.log('[采集类目] 已同步到工作台，共', templates.length, '个，默认:', templates[0].name)
    return true
}

// 处理类目选择事件
const handleCategorySelect = (item: { id: number; name: string; data?: any }) => {
    prefilledFeatureAttrValues.value = {}
    // 如果选择的类目不在列表中，添加到列表
    const existingIndex = categoryTemplates.value.findIndex(t => t.id === item.id)
    if (existingIndex === -1) {
        categoryTemplates.value.push({
            id: item.id,
            name: item.name,
            data: item.data
        })
    }
    // 更新选中的类目
    categoryTemplate.value = item.id
    console.log('类目已选择:', item.name, 'ID:', item.id)

    const meta = item.data?.metadata
    if (meta) {
        const typeId = String(meta.typeId ?? '')
        const level2IdVal = String(meta.level2Id ?? '')
        if (typeId !== '' || level2IdVal !== '') {
            loadFeatureAttrsFromCategory(typeId, level2IdVal).catch((err) => {
                console.error('获取类目与可选值列表失败:', err)
            })
        } else {
            featureAttrs.value = []
            featureAttrError.value = null
        }
    } else {
        featureAttrs.value = []
        featureAttrError.value = null
    }
}

// 系统设置相关状态
const categoryLoading = ref(false)
const isExecuting = ref(false)
const showUploadingModal = ref(false)
const showValidationWarningModal = ref(false)
const validationWarningMode = ref<ValidationWarningModalMode>('chinese')
const showOzonResultModal = ref(false)
const ozonResultMode = ref<'success' | 'failure'>('success')
const ozonResultFailures = ref<OzonSubmitFailureItem[]>([])

const validationWarningFields = ref<ValidationWarningFieldItem[]>([])
/** 图片超限弹窗：首个超限变体索引（0-based，供跳转图片集） */
const imageCountFirstVariantIndex = ref<number | null>(null)
/** 变体特征弹窗：首个待补变体索引（0-based，供跳转工作台 SKU） */
const aspectFirstVariantIndex = ref<number | null>(null)
/** 变体特征弹窗：首个报错项，供「去修改」滚动到具体字段 */
const aspectFirstValidationItem = ref<VariantAspectValidationItem | null>(null)

const closeValidationWarningModal = () => {
    showValidationWarningModal.value = false
    validationWarningMode.value = 'chinese'
    validationWarningFields.value = []
    imageCountFirstVariantIndex.value = null
    aspectFirstVariantIndex.value = null
    aspectFirstValidationItem.value = null
}

const openVariantImageCountWarning = (payload: VariantImageCountExceededPayload) => {
    validationWarningMode.value = 'image_count'
    validationWarningFields.value = buildVariantImageCountWarningFields(payload.items)
    imageCountFirstVariantIndex.value = payload.items[0]?.variantIndex != null ? payload.items[0].variantIndex - 1 : null
    aspectFirstVariantIndex.value = null
    showValidationWarningModal.value = true
}

const openVariantAspectWarning = (payload: VariantAspectValidationPayload) => {
    validationWarningMode.value = 'variant_aspect'
    validationWarningFields.value = buildVariantAspectWarningFields(payload.items)
    aspectFirstVariantIndex.value = payload.items[0]?.variantIndex != null ? payload.items[0].variantIndex - 1 : null
    aspectFirstValidationItem.value = payload.items[0] ?? null
    imageCountFirstVariantIndex.value = null
    showValidationWarningModal.value = true
    workbenchPageRef.value?.expandAll()
}

const handleImageCountGoEdit = () => {
    const index = imageCountFirstVariantIndex.value
    closeValidationWarningModal()
    if (index == null || index < 0) return
    skuListIndex.value = index
    activeMenu.value = 'imageQueue'
}

const handleVariantAspectGoEdit = async () => {
    const index = aspectFirstVariantIndex.value
    const validationItem = aspectFirstValidationItem.value
    closeValidationWarningModal()
    if (index == null || index < 0) return
    activeMenu.value = 'workbench'
    skuListIndex.value = index
    workbenchPageRef.value?.expandAll()
    await nextTick()
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
    })
    const focus = validationItem
        ? manualEditFocusFromVariantAspectItem(validationItem, featureAttrs.value)
        : { kind: 'sku' as const, rowIndex: index }
    await workbenchPageRef.value?.focusManualEditField?.(focus)
}

const handleValidationWarningGoEdit = () => {
    if (validationWarningMode.value === 'image_count') {
        handleImageCountGoEdit()
        return
    }
    if (validationWarningMode.value === 'variant_aspect') {
        handleVariantAspectGoEdit()
    }
}

// 执行状态管理（使用 PipelineManager 管理，这里只保留必要的业务状态）
const isCategoryUnavailable = ref(false)
const waitingForCategoryChange = ref(false)
const isManualSelect = ref(false)

// 保存上一次上传成功时的类目模板ID
const previousSubmittedCategoryTemplate = ref<number | null>(null)

// 数据展示
const rawData = ref('')
const rawDataObj = ref<any>(null) // 存储原始数据对象
const transformedData = ref<any>(null) // 存储转换后的数据
const aiOutput = ref('')
const visualModelOutput = ref('') // 存储视觉模型输出
const aiLogOverlayVisible = ref(false)
const aiLogOverlayText = ref('')
/** 日志全文缓冲，流式 delta 不即时写 ref，避免 Vue 热路径卡顿 */
let aiLogFullText = ''
let aiLogStreamSink: AiLogStreamSink | null = null
let aiLogFullTextSyncTimer: ReturnType<typeof setTimeout> | null = null
const AI_LOG_FULL_TEXT_SYNC_MS = 1000
const prefilledFeatureAttrValues = ref<Record<string, string | number | string[]>>({})
const workbenchFeatureAttrValues = ref<Record<string, string | number | string[]>>({})
const featureAttrValidationErrors = ref<Record<string, string>>({})
/** SKU 表格字段校验（变体特征/描述/标题等），与 Workbench is-error 联动 */
const skuAspectValidationErrors = ref<Record<string, string>>({})
const aiResultJsonList = ref<any[]>([])
const aiResultPublicFeatureData = ref<Record<string, any>>({})
const aiAgentEventSource = ref<EventSource | null>(null) // 存储AI代理事件源
const aiAgentSessionId = ref<string | null>(null) // 存储AI代理会话ID
/** AI 任务已提交到服务端（中断后可轮询恢复） */
const aiFillTaskSubmitted = ref(false)
/** 帮填 pipeline 各步骤失败项，写入自动选品卡片 aiStepFailures */
let pipelineStepFailures: AiFillStepFailureKey[] = []

function resetPipelineStepFailures() {
    pipelineStepFailures = []
}

/** 从草稿条目恢复运行态失败标记，避免切换商品时沿用上一商品 Pipeline 残留 */
function hydratePipelineStepFailuresFromItem(item: AiAutoSelectDraftItem) {
    pipelineStepFailures = [...(item.aiStepFailures ?? [])]
    if (activeSession.value) {
        activeSession.value.pipelineStepFailures = [...pipelineStepFailures]
    }
}

function recordStepFailure(key: AiFillStepFailureKey) {
    if (!pipelineStepFailures.includes(key)) {
        pipelineStepFailures.push(key)
    }
}

function getPipelineStepFailures(): AiFillStepFailureKey[] {
    return [...pipelineStepFailures]
}

/** 内存中是否已有 AI 帮填回填结果 */
function hasAppliedAiFillResult(): boolean {
    const publicData = aiResultPublicFeatureData.value
    const hasPublicAi =
        publicData != null &&
        typeof publicData === 'object' &&
        Object.keys(publicData).length > 0
    const hasVariantAi =
        Array.isArray(aiResultJsonList.value) && aiResultJsonList.value.length > 0
    return hasPublicAi || hasVariantAi
}

/** 自动选品批量帮填：AI 任务提交后通知结果页启动进度模拟 */
let autoSelectAiFillOnTaskStarted: ((sessionId: string) => void) | null = null
const aiAgentStopRequested = ref(false) // 存储AI代理停止请求标志
let rejectAiAgentSsePromise: ((reason?: any) => void) | null = null // 存储AI代理SSE拒绝承诺
const attributeList = ref<AttributeItem[]>([]) // 存储装载完可选值列表后的特征列表
const isDataLoaded = ref(false) // 标识数据是否已获取和转换
const isDataLoading = ref(false) // 标识数据是否正在加载

const scheduleSyncAiLogFullTextToRef = () => {
    if (aiLogFullTextSyncTimer) clearTimeout(aiLogFullTextSyncTimer)
    aiLogFullTextSyncTimer = setTimeout(() => {
        aiLogFullTextSyncTimer = null
        aiLogOverlayText.value = aiLogFullText
    }, AI_LOG_FULL_TEXT_SYNC_MS)
}

const flushAiLogFullTextToRef = () => {
    if (aiLogFullTextSyncTimer) {
        clearTimeout(aiLogFullTextSyncTimer)
        aiLogFullTextSyncTimer = null
    }
    aiLogOverlayText.value = aiLogFullText
}

const registerAiLogStream = (sink: AiLogStreamSink | null) => {
    aiLogStreamSink = sink
    if (sink && aiLogFullText) {
        sink.setFullText(aiLogFullText)
    }
}

const clearAiLogOverlayContent = () => {
    if (aiLogFullTextSyncTimer) {
        clearTimeout(aiLogFullTextSyncTimer)
        aiLogFullTextSyncTimer = null
    }
    aiLogFullText = ''
    aiLogStreamSink?.reset()
    aiLogOverlayText.value = ''
}

const setAiLogOverlayFullText = (text: string) => {
    if (aiLogFullTextSyncTimer) {
        clearTimeout(aiLogFullTextSyncTimer)
        aiLogFullTextSyncTimer = null
    }
    aiLogFullText = text
    aiLogStreamSink?.setFullText(text)
    aiLogOverlayText.value = text
}

const appendAiLogDelta = (delta: string) => {
    if (!delta) return
    aiLogFullText += delta
    aiLogStreamSink?.appendDelta(delta)
    scheduleSyncAiLogFullTextToRef()
}

watch(aiLogOverlayText, () => {
    schedulePersistAiCollectDraftFromLog()
})

// 提交结果数据
interface SkuOfferMappingItem {
    sku_name: string
    offer_id: string
}

interface SubmitResultItem {
    shopId: number
    taskId: number
    skuOfferMapping: SkuOfferMappingItem[]
}

const submitResult = ref<SubmitResultItem[]>([])
const skuVideoUrlList = ref<Record<number, string>>({})

/** 收集 Modal refs，供 sessionAdapter 双向同步 */
function getModalSessionBindings(): ModalSessionBindings {
    return {
        rawDataObj,
        transformedData,
        categoryTemplates,
        categoryTemplate,
        featureAttrs,
        prefilledFeatureAttrValues,
        workbenchFeatureAttrValues,
        aiResultJsonList,
        aiResultPublicFeatureData,
        selectedShops,
        shopWarehouseInventory,
        skuVideoUrlList,
        isDataLoaded,
    }
}

// 图片处理队列
const imageList = ref<ImageItem[]>([

])

// 图片翻译相关状态
const selectedImagesForTranslate = ref<string[]>([])  // 选中的图片URL列表
const isManualImageSelect = ref(false)  // 是否手动选择图片
const showStartTranslateBtn = ref(false)  // 是否显示"开始翻译"按钮
const imageTranslateInProgress = ref(false)  // 图片翻译是否进行中
const imageUrlMap = ref<Map<string, string>>(new Map())  // 原始图片URL到翻译后图片URL的映射（公共图片/非变体用）
/** 每个变体独立的改图映射：变体索引 -> (原始URL -> 改图后URL)，保证变体间图片互不影响 */
const imageUrlMapByVariant = ref<Map<number, Map<string, string>>>(new Map())
/** 当前发起翻译的变体索引（由 ImageQueuePage 在「图片集」下设置），翻译结果写入该变体映射 */
const translateVariantIndex = ref<number | null>(null)

const skuListIndex = ref<number>(0) // 当前选中的sku索引
/** 与 RuoYi 象集批量翻译一致：CHS>RUS | CHS>ENG | ENG>RUS，由 ImageQueuePage 在翻译前写入 */
const batchTranslateLanguage = ref<BatchImageTranslateLanguage>('CHS>RUS')

// 变体图片数量限制
const MAX_VARIANT_IMAGE_COUNT = 29
const handleNavigateToWorkbench = () => {
    // 检查图片是否超限：先收集所有超限变体，再统一提示
    if (activeMenu.value == 'imageQueue' && transformedData.value?.sku_matrix) {
        const exceededVariants: number[] = []
        transformedData.value.sku_matrix.forEach((sku: any, index: number) => {
            if (sku.skuImgList.length > MAX_VARIANT_IMAGE_COUNT) {
                exceededVariants.push(index + 1)
            }
        })
        if (exceededVariants.length > 0) {
            showToast(`变体 ${exceededVariants.join('、')} 的图片不能超过 ${MAX_VARIANT_IMAGE_COUNT} 张，请调整图片数量`, 3000)
            return
        }
    }
    activeMenu.value = 'workbench'
    // 图片队列改图后直接返回时立即落盘，避免未关弹窗切商品丢失顺序
    if (externalAutoSelectMode.value) {
        flushAutoSelectSave()
    }
}

// 进度条步骤状态计算（使用 PipelineManager）
// 直接访问响应式数据以确保 Vue 能追踪到变化
const progressSteps = computed<ProgressStep[]>(() => {
    // 访问 pipeline 的响应式数据对象，Vue 可以追踪到其内部属性的变化
    const progressData = pipeline.getProgressData()
    // 返回响应式数组，Vue 会自动追踪
    return progressData.steps
})

// pipelineRunning 供 provide 与 ImageQueuePage 使用
const pipelineRunning = computed(() => pipeline.getCurrentStage() !== null)

// 切换单个店铺选中状态
const handleToggleShop = (shopId: number) => {
    const idx = selectedShops.value.indexOf(shopId)
    if (idx === -1) {
        selectedShops.value = [...selectedShops.value, shopId]
    } else {
        selectedShops.value = selectedShops.value.filter(id => id !== shopId)
    }
}

type SkuPriceField = 'price_amount' | 'sale_price'

// 当前工作台只对已确认的价格字段做统一保留两位处理，后续若新增价格字段，在白名单里补充即可。
const SKU_PRICE_FIELD_WHITELIST = new Set<SkuPriceField>(['price_amount', 'sale_price'])

const normalizeSkuPriceValue = (
    field: SkuPriceField,
    value: number | string | null | undefined
) => {
    if (!SKU_PRICE_FIELD_WHITELIST.has(field)) return 0
    return roundPrice(value, 2)
}

// 更新 SKU 售价（工作台子组件用）
const handleUpdateSkuSalePrice = (index: number, value: number) => {
    if (transformedData.value?.sku_matrix?.[index]) {
        transformedData.value.sku_matrix[index].sale_price = value
    }
}

// 更新 SKU 原价/标价（工作台子组件用）
const handleUpdateSkuPriceAmount = (index: number, value: number) => {
    if (transformedData.value?.sku_matrix?.[index]) {
        transformedData.value.sku_matrix[index].price_amount = value
    }
}

// 更新单行货号前缀（工作台子组件用）
const handleUpdateSkuOfferidPrefix = (index: number, value: string) => {
    if (transformedData.value?.sku_matrix?.[index]) {
        transformedData.value.sku_matrix[index].offerid_prefix = value
    }
}

// 更新 SKU 包装尺寸/重量（工作台子组件用）
const handleUpdateSkuPackagingLength = (index: number, value: number) => {
    if (transformedData.value?.sku_matrix?.[index]) {
        transformedData.value.sku_matrix[index].length = value
    }
}
const handleUpdateSkuPackagingWidth = (index: number, value: number) => {
    if (transformedData.value?.sku_matrix?.[index]) {
        transformedData.value.sku_matrix[index].width = value
    }
}
const handleUpdateSkuPackagingHeight = (index: number, value: number) => {
    if (transformedData.value?.sku_matrix?.[index]) {
        transformedData.value.sku_matrix[index].height = value
    }
}
const handleUpdateSkuPackagingWeight = (index: number, value: number) => {
    if (transformedData.value?.sku_matrix?.[index]) {
        transformedData.value.sku_matrix[index].weight = value
    }
}

// 批量将货号前缀应用到所有 SKU
const handleBatchSetAllOfferidPrefix = (prefix: string) => {
    if (!transformedData.value?.sku_matrix?.length) return
    transformedData.value.sku_matrix.forEach((sku: any) => {
        sku.offerid_prefix = prefix
    })
}

// 全选/全不选（勾选时全选，再次点击清空；与 selectAllShops / 勾选状态一致）
const handleSelectAll = () => {
    if (selectAllShops.value) {
        selectedShops.value = []
    } else {
        selectedShops.value = shops.value.map((shop) => shop.id)
    }
}

// 监听选中店铺变化
watch(selectedShops, (newVal) => {
    selectAllShops.value = newVal.length === shops.value.length && newVal.length > 0
    // 保存已选择的店铺到 localStorage
    saveSelectedShopsToStorage(newVal)
    const inv = { ...shopWarehouseInventory.value }
    newVal.forEach((id) => {
        if (!(id in inv)) inv[id] = { warehouseId: null, quantity: 0 }
    })
    Object.keys(inv).forEach((k) => {
        const num = Number(k)
        if (!newVal.includes(num)) delete inv[num]
    })
    shopWarehouseInventory.value = inv
}, { deep: true })

// 复制货号
const handleCopyOfferId = async (offerId: string) => {
    try {
        await navigator.clipboard.writeText(offerId)
        showToast('货号已复制')
    } catch (err) {
        console.error('复制失败:', err)
        showToast('复制失败')
    }
}

// 获取店铺列表
const fetchShopList = async () => {
    if (shopListLoading.value) return

    shopListLoading.value = true
    try {
        const response = await getShopList()
        if (response.code === 200 && response.data) {
            // 将接口返回的数据转换为组件需要的格式
            shops.value = response.data.map((item: ShopItem) => ({
                id: item.id,
                name: item.keyName || `店铺${item.id}`
            }))
            selectAllShops.value = selectedShops.value.length === shops.value.length && shops.value.length > 0
        } else {
            console.error('获取店铺列表失败:', response.msg)
        }
    } catch (error: any) {
        console.error('获取店铺列表出错:', error)
    } finally {
        shopListLoading.value = false
    }
}

// 详情图在 1688 页面常为异步/懒加载：首次打开弹窗时 DOM 可能尚未渲染完成
let detailImagesRetryTimer: ReturnType<typeof setInterval> | null = null
let detailImagesRetryStartedAt = 0
const stopDetailImagesRetry = () => {
    if (detailImagesRetryTimer) {
        clearInterval(detailImagesRetryTimer)
        detailImagesRetryTimer = null
    }
    detailImagesRetryStartedAt = 0
}
const mergeDetailImagesIntoState = (urls: string[]) => {
    if (!urls || urls.length === 0) return
    if (!transformedData.value) return
    transformedData.value.global_data = transformedData.value.global_data || {}
    transformedData.value.global_data.media_gallery = transformedData.value.global_data.media_gallery || {}
    const gallery = transformedData.value.global_data.media_gallery
    const existing: string[] = Array.isArray(gallery.detail_images) ? gallery.detail_images : []
    const next = Array.from(new Set([...existing, ...urls].filter(Boolean)))
    gallery.detail_images = next

    // 补充进图片队列（只追加缺失项，保留已有状态）
    const existingByUrl = new Map(imageList.value.map((i) => [i.url, i]))
    const toAppend = urls
        .filter((u) => u && !existingByUrl.has(u))
        .map((u) => ({ url: u, status: 'waiting' as ImageStatus, sources: ['detail'] }))
    if (toAppend.length > 0) {
        imageList.value = [...imageList.value, ...toAppend]
    } else {
        imageList.value = imageList.value.map((it) => {
            if (!urls.includes(it.url)) return it
            const s = Array.isArray(it.sources) ? it.sources : []
            return s.includes('detail') ? it : { ...it, sources: [...s, 'detail'] }
        })
    }
}
const startDetailImagesRetryIfNeeded = () => {
    if (!props.visible) return
    if (!transformedData.value) return
    const existing = transformedData.value?.global_data?.media_gallery?.detail_images
    if (Array.isArray(existing) && existing.length > 0) return
    if (detailImagesRetryTimer) return

    detailImagesRetryStartedAt = Date.now()
    const maxMs = 20000
    detailImagesRetryTimer = setInterval(() => {
        if (!props.visible) {
            stopDetailImagesRetry()
            return
        }
        if (!transformedData.value) return
        if (Date.now() - detailImagesRetryStartedAt > maxMs) {
            stopDetailImagesRetry()
            return
        }
        const urls = collectDetailImagesFromDom()
        if (urls.length > 0) {
            mergeDetailImagesIntoState(urls)
            stopDetailImagesRetry()
        }
    }, 800)
}

// 监听类目选择变化，当用户重新选择类目后自动继续任务
// 移除自动触发逻辑，改为只在用户点击"继续"按钮时执行

// 监听模态框显示，自动获取店铺列表和原始数据
watch(() => props.visible, async (newVal) => {
    if (newVal) {
        lockPageScroll()
        fetchShopList()

        // 列表页自动选品编辑：从草稿注入，不采集当前列表页 DOM（详情页采集仅在详情页触发）
        if (externalAutoSelectMode.value) {
            return
        }

        stopDetailImagesRetry()
        // 变更说明：关闭后重新打开优先复用当前页草稿，只有没有草稿数据时才重新采集页面内容。
        if (isDataLoaded.value && transformedData.value) {
            startDetailImagesRetryIfNeeded()
            return
        }
        // 立即获取并转换原始数据
        if (!isDataLoaded.value && !isDataLoading.value) {
            isDataLoading.value = true
            try {
                // 获取原始数据
                const fetchedRawData = await fetchRawData()

                // 保存原始数据对象
                rawDataObj.value = fetchedRawData

                // 格式化并显示原始数据
                rawData.value = JSON.stringify(fetchedRawData, null, 2)

                // 转换数据
                const title = extractTitleFromRawData(fetchedRawData)
                if (title) {
                    const transformed = transformCollectedRawData(fetchedRawData, title)
                    // console.log('transformed', JSON.stringify(transformed, null, 2), 123123)
                    console.log('transformed', transformed)
                    if (transformed) {
                        transformedData.value = transformed
                        // 若详情图此刻还没渲染出来，后台无感补采集（采到即刷新 other 图片）
                        startDetailImagesRetryIfNeeded()

                        enrichTransformedDataWithImageLists(transformed) //处理图片

                        isDataLoaded.value = true

                        // 数据转换成功后，自动标记步骤1为完成，并同步类目（优先采集接口，否则 AI 智选）
                        pipeline.setStepStatus(PipelineStep.FETCH_RAW_DATA, 'completed')

                        try {
                            categoryLoading.value = true
                            pipeline.setStepStatus(PipelineStep.FETCH_CATEGORY, 'active')
                            if (applyCategoryFromCollectedGoods(fetchedRawData)) {
                                pipeline.setStepStatus(PipelineStep.FETCH_CATEGORY, 'completed')
                            } else {
                                const ok = await applyAiCategoryFromTitle(title)
                                if (ok) {
                                    pipeline.setStepStatus(PipelineStep.FETCH_CATEGORY, 'completed')
                                } else {
                                    console.warn('未获取到类目数据')
                                    pipeline.setStepStatus(PipelineStep.FETCH_CATEGORY, 'pending')
                                }
                            }
                        } catch (error: any) {
                            console.error('获取AI智选类目失败:', error)
                            // 获取类目失败不影响数据加载，只记录错误
                            pipeline.setStepStatus(PipelineStep.FETCH_CATEGORY, 'pending')
                        } finally {
                            categoryLoading.value = false
                        }
                    } else {
                        console.error('数据转换返回空结果')
                        showToast('数据转换失败', 3000)
                    }
                } else {
                    console.warn('未能从原始数据中解析出标题')
                    showToast('未能解析出标题，请检查原始数据', 3000)
                }
            } catch (error: any) {
                showGetDataFailedModal.value = true //显示获取失败弹窗
                console.error('获取原始数据失败:', error)
                if(error?.message){
                    showToast(`获取原始数据失败: ${error.message || '未知错误'}`, 3000)
                }
            } finally {
                isDataLoading.value = false
            }
        }
    } else {
        unlockPageScroll()
        if (externalAutoSelectMode.value) {
            flushAutoSelectSave()
            clearAutoSelectMode()
            resetAutoSelectInjectedData()
        } else {
            flushAiCollectDraftPersistTimer()
            persistAiCollectDraft()
        }
        showOzonResultModal.value = false
        showUploadingModal.value = false
        closeValidationWarningModal()
        resetExecutionState()
    }
})

const showGetDataFailedModal = ref(false)
// 获取原始数据（从1688页面）
const fetchRawData = (): Promise<any> => {
    return new Promise(async (resolve, reject) => {
        // 监听来自 MAIN 世界的响应
        function handleResponse(event: Event) {
            const customEvent = event as CustomEvent
            let detail = customEvent.detail
            if (typeof detail === 'string') { //从拼多多采集的数据是json字符串，需要解析
                detail = JSON.parse(detail)
            }
            if (detail && detail.type === 'getWindowData' && detail.action === 'getWindowData') {
                // 移除监听器
                document.removeEventListener('ext-res', handleResponse)
                const result = detail
                if (result && result.success && result.data) {
                    // 返回包含 source、data 及 Ozon 扩展字段（goodsCategory / ozonRows，尺寸在 ozonRows[].goodsSize）
                    resolve({
                        source: result.source,
                        data: result.data,
                        goodsCategory: result.goodsCategory ?? null,
                        ozonRows: result.ozonRows ?? null,
                    })
                } else {
                    reject(new Error('未找到数据'))
                }
            } else {
                reject(new Error('未找到数据'))
            }
        }

        // 添加响应监听器
        document.addEventListener('ext-res', handleResponse)
        // 如果当前是在ozon页面，需要选获取汇率
        let exchangeRate = null
        const host = window.location.hostname
        if (host.includes('ozon.ru') || host.includes('ozon.kz')) {
            exchangeRate = await getExchangeRate() //获取汇率
        }
        // 发送请求到 MAIN 世界
        const requestEvent = new CustomEvent('ext-req', {
            detail: {
                type: 'ext-req',
                action: 'getWindowData',
                exchangeRate: exchangeRate?.data?.cnyPerRub
            }
        })
        document.dispatchEvent(requestEvent)
        console.log('[ISOLATED World] 已发送请求到 MAIN 世界')
    })
}

// 执行 Pipeline 管道
const executePipeline = async (startFromStep?: PipelineStepValue) => {
    try {
        // 如果指定了起始步骤，跳转到该步骤
        if (startFromStep) {
            pipeline.jumpToStage(startFromStep)
        }

        // 步骤1: 原始数据获取
        if (!startFromStep || startFromStep <= PipelineStep.FETCH_RAW_DATA) {
            if (!await step1_fetchRawData()) {
                return false
            }
        }

        // 步骤2: AI智选类目获取
        if (!startFromStep || startFromStep <= PipelineStep.FETCH_CATEGORY) {
            if (!await step2_fetchCategory()) {
                return false
            }
        }

        // 步骤3: 等待开始执行（特殊处理：可能暂停等待用户操作）
        if (!startFromStep || startFromStep <= PipelineStep.WAIT_EXECUTION) {
            // 如果是手动选择模式或等待类目更换，这里会暂停
            if (isManualSelect.value || waitingForCategoryChange.value) {
                // 这些情况由 handleExecute 的特殊处理逻辑处理，不在这里执行
                return true
            }
            // 执行步骤3，如果返回 false 表示需要暂停等待用户操作
            const step3Result = await step3_waitExecution()
            if (!step3Result) {
                // 步骤3 暂停（显示倒计时或等待用户操作），停止 Pipeline 执行
                return false
            }
        }

        // 步骤4: 类目特征获取（已在 loadFeatureAttrsFromCategory完成，执行链路中跳过）
        pipeline.setStepStatus(PipelineStep.FETCH_ATTRIBUTES, 'skipped')

        // 步骤5: AI智能体输出
        if (!startFromStep || startFromStep <= PipelineStep.GENERATE_AI) {
            if (!await step5_generateAI()) {
                return false
            }
        }

        // 步骤6-8: 图片翻译 / AI改图 / 同步富内容（条件执行）
        if (!startFromStep || startFromStep <= PipelineStep.TRANSLATE_IMAGES) {
            if (!await executePostAiPipelineSteps()) {
                return false
            }
        }

        pipeline.setStepStatus(PipelineStep.SUBMIT, 'skipped')
        // 工作台手动帮填且弹窗可见时提示
        if (props.visible) {
            showToast('AI帮填流程执行完成', 3000)
        }
        // 一键流程结束，关闭日志弹窗
        closeAiLogOverlayAfterComplete()
        isExecuting.value = false
        // 列表页自动选品：帮填成功后立即回写草稿与卡片状态
        if (externalAutoSelectMode.value) {
            flushAutoSelectSaveAfterAiSuccess()
        }
        return true
    } catch (error: any) {
        console.error('Pipeline 执行失败:', error)
        showToast(`执行失败: ${error.message || '未知错误'}`, 3000)
        return false
    }
}

// 开始执行
const handleExecute = async () => {
    // 如果是重新上传（已有提交结果）
    if (submitResult.value && submitResult.value.length > 0) {
        await handleResubmit()
        return
    }

    // 如果正在等待用户更换类目（类目不可用的情况）
    if (waitingForCategoryChange.value) {
        if (!categoryTemplate.value) {
            alert('请先选择一个类目')
            return
        }
        // 重置状态并跳转到 AI 输出步骤
        isCategoryUnavailable.value = false
        waitingForCategoryChange.value = false
        const success = await executePipeline(PipelineStep.GENERATE_AI)
        if (!success) {
            stopExecutionState()
        }
        return
    }

    // 如果是手动选择模式，需要验证类目是否已选择
    if (isManualSelect.value) {
        if (!categoryTemplate.value) {
            alert('请先选择一个类目')
            return
        }
        // 检查数据是否已加载
        if (!isDataLoaded.value || !transformedData.value) {
            alert('数据尚未加载，请等待数据加载完成')
            return
        }
        // 重置手动选择标志，因为用户已经选择并继续了
        isManualSelect.value = false
        // 跳转到 AI 输出步骤继续执行
        const success = await executePipeline(PipelineStep.GENERATE_AI)
        if (!success) {
            stopExecutionState()
        }
        return
    }

    // 正常流程：验证和准备
    console.log('开始执行 Pipeline', {
        shops: selectedShops.value,
        skuPrefix: skuPrefix.value,
        categoryTemplate: categoryTemplate.value
    })

    // AI 帮填流程仅要求数据可用，不要求先选择店铺/仓库
    const executeValidation = validateExecuteRequirements()
    if (!executeValidation.valid) {
        if (isDataLoading.value && executeValidation.message === '数据尚未加载，请等待数据加载完成') {
            alert('数据正在加载中，请稍候...')
        } else {
            alert(executeValidation.message!)
        }
        return
    }

    // 重置 Pipeline 状态
    pipeline.reset()
    resetPipelineStepFailures()

    // 设置执行状态
    if(isExecuting.value) return;
    isExecuting.value = true

    // 执行 Pipeline
    const success = await executePipeline()
    if (!success) {
        stopExecutionState()
    }
}
// 是否显示[恢复帮填信息]按钮（刷新页面后检测服务端）
const getExecuteRecover = async () => {
    const { offerId } = getCollectOfferIdForAiFill()
    showExecuteRecover.value = await checkServerAiFillRestoreAvailable(offerId)
}
// 重新获取AI帮填信息：SSE 失败走 sessionId，刷新页面走 restore offerId
const handleGetExecuteResult = async () => {
    clearAiLogOverlayContent()
    openAiLogOverlay()
    appendAiLogOverlay('开始查询上次AI执行结果')
    const { offerId } = getCollectOfferIdForAiFill()
    const ctx = createAiApplyContext()
    const sessionId = aiAgentSessionId.value
    const result = sessionId
        ? await fetchAndApplyAiFillResultBySession(sessionId, ctx, 'recover')
        : await restoreAiFillResultFromServer(offerId, ctx)
    if (result.ok) {
        appendAiLogOverlay('查询AI结果成功，开始回填特征值')
        showExecuteRecover.value = false
        aiAgentSessionId.value = null
    } else {
        appendAiLogOverlay('查询AI结果失败')
        if (result.message) {
            appendAiLogOverlay('错误信息：' + result.message)
        }
    }
}

// 关闭AI代理SSE
const closeAiAgentSse = () => {
    if (aiAgentEventSource.value) {
        aiAgentEventSource.value.close()
        aiAgentEventSource.value = null
    }
}

const openAiLogOverlay = () => {
    aiLogOverlayVisible.value = true
}

const closeAiLogOverlay = () => {
    if (isExecuting.value && aiLogOverlayVisible.value) {
        aiAgentStopRequested.value = true
        aiLogOverlayVisible.value = false
        aiAgentSessionId.value = null
        closeAiAgentSse()
        const reject = rejectAiAgentSsePromise
        rejectAiAgentSsePromise = null
        if (reject) {
            reject(createAiAgentStoppedError())
        }
        pipeline.clearCurrentStage()
        pipeline.setProgressText('AI 智能体任务已手动停止')
        isExecuting.value = false
        return
    }
    aiLogOverlayVisible.value = false
    // 任务已结束但 SSE 仍偶发未收口时，叉号也关掉浏览器端连接，避免误以为“没注销”
    if (aiAgentEventSource.value) {
        closeAiAgentSse()
        aiAgentSessionId.value = null
    }
}

// AI 完成后自动收起「AI帮填信息」小弹窗（不视为“手动停止”，也不关闭整个 AiCollectModal）
const closeAiLogOverlayAfterComplete = () => {
    flushAiLogFullTextToRef()
    aiLogOverlayVisible.value = false
    if (aiAgentEventSource.value) {
        closeAiAgentSse()
    }
    aiAgentSessionId.value = null
    aiAgentStopRequested.value = false
    rejectAiAgentSsePromise = null
}

const resetExecutionState = () => {
    closeAiAgentSse()
    aiAgentSessionId.value = null
    aiAgentStopRequested.value = false
    rejectAiAgentSsePromise = null
    pipeline.reset()
    isExecuting.value = false
    aiLogOverlayVisible.value = false
}

const stopExecutionState = () => {
    closeAiAgentSse()
    aiAgentSessionId.value = null
    rejectAiAgentSsePromise = null
    pipeline.clearCurrentStage()
    isExecuting.value = false
}

const appendAiLogOverlay = (message: string, isTranslate = false) => {
    aiLogFullText = aiLogFullText ? `${aiLogFullText}\n${message}` : message
    aiLogStreamSink?.appendLine(message)
    aiLogOverlayText.value = aiLogFullText
    // 翻译图片日志同步
    if (isTranslate) {
        translateImagesLogInfo.value = message
    }
}

const isJsonRichTextFeatureAttr = (attr: any): boolean => {
    return normalizeFeatureName(attr?.name || '').includes('JSON富内容')
}

const getFeatureAttrExistingValue = (attr: any): string | number | string[] | undefined => {
    const key = String(attr?.id ?? '')
    const fromWorkbench = workbenchFeatureAttrValues.value[key]
    if (fromWorkbench !== undefined) return fromWorkbench
    const fromPrefill = prefilledFeatureAttrValues.value[key]
    if (fromPrefill !== undefined) return fromPrefill
    return attr?.value
}

const setWorkbenchFeatureAttrValue = (attrId: number, value: string | number | string[]) => {
    workbenchFeatureAttrValues.value = {
        ...workbenchFeatureAttrValues.value,
        [String(attrId)]: value
    }
}

const clearFeatureAttrValidationError = (attrId: number) => {
    const key = String(attrId)
    if (!(key in featureAttrValidationErrors.value)) return
    const next = { ...featureAttrValidationErrors.value }
    delete next[key]
    featureAttrValidationErrors.value = next
}

const resetWorkbenchFeatureAttrState = () => {
    workbenchFeatureAttrValues.value = {}
    featureAttrValidationErrors.value = {}
    skuAspectValidationErrors.value = {}
}

// 型号名称 / 合并至一张卡片：无值时生成 9 位大写字母+数字(1-9，不含0)
function generateRandomModelCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789'
    const parts: string[] = []
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(9)
        crypto.getRandomValues(bytes)
        for (let i = 0; i < 9; i++) {
            parts.push(chars[bytes[i]! % chars.length]!)
        }
    } else {
        for (let i = 0; i < 9; i++) {
            parts.push(chars[Math.floor(Math.random() * chars.length)]!)
        }
    }
    return parts.join('')
}

// 确保型号名称等特征属性有值
function ensureRandomModelNameFeatureAttrs() {
    const list = featureAttrs.value
    if (!Array.isArray(list) || list.length === 0) return
    for (const attr of list) {
        if (!attr || attr.is_aspect) continue
        const id = Number(attr.id)
        if (!FEATURE_ATTR_IDS_AUTO_RANDOM_MODEL.has(id)) continue
        const raw = getFeatureAttrExistingValue(attr)
        if (isAttrValueFilled(attr, raw)) continue
        setWorkbenchFeatureAttrValue(id, generateRandomModelCode())
    }
}

function ensureDefaultFeatureAttrSelections() {
    const list = featureAttrs.value
    if (!Array.isArray(list) || list.length === 0) return

    type DefaultFeatureRule =
        | { attrId: number; option: typeof NO_BRAND_OPTION | typeof CHINA_ORIGIN_OPTION }
        | { attrId: number; textValue: string }

    const rules: DefaultFeatureRule[] = [
        { attrId: FEATURE_ATTR_ID_BRAND_TYPE, option: NO_BRAND_OPTION },
        { attrId: FEATURE_ATTR_ID_ORIGIN_COUNTRY, option: CHINA_ORIGIN_OPTION },
        { attrId: FEATURE_ATTR_ID_MANUFACTURER, textValue: CHINA_ORIGIN_OPTION.value },
        { attrId: FEATURE_ATTR_ID_SHELF_LIFE_DAYS, textValue: '1095' }
    ]

    for (const rule of rules) {
        const attr = list.find((item: any) => Number(item?.id) === rule.attrId && !item?.is_aspect)
        if (!attr) continue

        const raw = getFeatureAttrExistingValue(attr)
        if (isAttrValueFilled(attr, raw)) continue

        if ('textValue' in rule) {
            setWorkbenchFeatureAttrValue(rule.attrId, rule.textValue)
            continue
        }

        const options = Array.isArray(attr.dictionary_values) ? attr.dictionary_values : []
        const matched = options.find((item: any) => {
            return Number(item?.id) === rule.option.id
                || normalizeFeatureName(item?.value) === normalizeFeatureName(rule.option.value)
        })

        if ((attr?.dictionary_id ?? 0) !== 0) {
            if (!matched) continue
            if (attr?.is_collection) {
                setWorkbenchFeatureAttrValue(rule.attrId, [String(matched.id)])
            } else {
                setWorkbenchFeatureAttrValue(rule.attrId, String(matched.id))
            }
            continue
        }

        setWorkbenchFeatureAttrValue(rule.attrId, rule.option.value)
    }
}

const createAiApplyContext = (options?: { silentRecover?: boolean }): AiApplyContext => ({
    getTransformedData: () => transformedData.value,
    setTransformedData: (data) => {
        transformedData.value = data
    },
    getFeatureAttrs: () => featureAttrs.value,
    setPrefilledFeatureAttrValues: (values) => {
        prefilledFeatureAttrValues.value = values
    },
    setAiResultJsonList: (rows) => {
        aiResultJsonList.value = rows
    },
    setAiResultPublicFeatureData: (data) => {
        aiResultPublicFeatureData.value = data
    },
    appendLog: options?.silentRecover ? () => {} : appendAiLogOverlay,
    onRecoverComplete: options?.silentRecover
        ? undefined
        : () => {
            closeAiLogOverlayAfterComplete()
            showToast('帮填信息已恢复', 3000)
        },
    ensureDefaultFeatureAttrSelections,
    ensureRandomModelNameFeatureAttrs,
})

const applyAiResultJsonToFeatureValues = (resultJson: unknown, mode?: 'recover') => {
    applyAiResultJsonToFeatureValuesUtil(resultJson, createAiApplyContext(), mode)
}

const createAiSseContext = (): AiSseContext => ({
    getStopRequested: () => aiAgentStopRequested.value,
    setSessionId: (id) => {
        aiAgentSessionId.value = id
    },
    setRejectPromise: (fn) => {
        rejectAiAgentSsePromise = fn
    },
    getRejectPromise: () => rejectAiAgentSsePromise,
    setEventSource: (es) => {
        aiAgentEventSource.value = es
    },
    getEventSource: () => aiAgentEventSource.value,
    closeEventSource: closeAiAgentSse,
    getLogText: () => aiLogStreamSink?.getFullText() ?? aiLogFullText,
    setLogText: (text) => {
        setAiLogOverlayFullText(text)
    },
    appendLogDelta: appendAiLogDelta,
    appendLog: appendAiLogOverlay,
    applyAiResult: (resultJson) => applyAiResultJsonToFeatureValues(resultJson),
    onShowRecoverButton: () => {
        showExecuteRecover.value = true
        // silent 批量帮填：等价于工作台显示恢复按钮，落盘 ai_processing 与 sessionId 供轮询
        if (externalAutoSelectMode.value && autoSelectSaveCallback && autoSelectSourceItemId.value) {
            autoSelectSaveCallback(autoSelectSourceItemId.value, {
                cardStatus: 'ai_processing',
                aiStepFailures: getPipelineStepFailures(),
                aiSessionId: aiAgentSessionId.value || undefined,
            })
        }
    },
    createStoppedError: createAiAgentStoppedError,
})

const consumeAiAgentSse = (sessionId: string) =>
    consumeAiAgentSseUtil(sessionId, createAiSseContext())

// 公共验证函数
const validateBasicRequirements = (): { valid: boolean; message?: string } => {
    if (selectedShops.value.length === 0) {
        return { valid: false, message: '请至少选择一个店铺' }
    }

    for (const shopId of selectedShops.value) {
        const row = shopWarehouseInventory.value[shopId]
        // 变更说明：仓库是否必选依赖店铺是否真的返回仓库列表，这层拿不到仓库列表，交给 WorkbenchPage 按实际数据校验。
        if (!row.quantity || row.quantity < 1) {
            return { valid: false, message: '请为每个已选店铺设置有效的库存数量（≥1）' }
        }
    }

    if (!isDataLoaded.value || !transformedData.value) {
        return { valid: false, message: '数据尚未加载，请等待数据加载完成' }
    }

    return { valid: true }
}

const validateExecuteRequirements = (): { valid: boolean; message?: string } => {
    if (!isDataLoaded.value || !transformedData.value) {
        return { valid: false, message: '数据尚未加载，请等待数据加载完成' }
    }
    return { valid: true }
}

// ========== Pipeline 步骤方法 ==========

// 步骤1: 原始数据获取
const step1_fetchRawData = async (): Promise<boolean> => {
    // 如果数据已加载，直接返回成功
    if (isDataLoaded.value && transformedData.value) {
        pipeline.setStepStatus(PipelineStep.FETCH_RAW_DATA, 'completed')
        return true
    }

    // 如果正在加载，等待完成
    if (isDataLoading.value) {
        return false
    }

    pipeline.updateStage(PipelineStep.FETCH_RAW_DATA, 'active', '正在获取原始数据...')
    isDataLoading.value = true

    try {
        // 获取原始数据
        const fetchedRawData = await fetchRawData()

        // 保存原始数据对象
        rawDataObj.value = fetchedRawData
        console.warn('原始数据', fetchedRawData);

        // 格式化并显示原始数据
        rawData.value = JSON.stringify(fetchedRawData, null, 2)

        // 转换数据
        const title = extractTitleFromRawData(fetchedRawData)
        if (!title) {
            throw new Error('未能从原始数据中解析出标题')
        }

        const transformed = transformCollectedRawData(fetchedRawData, title)
        if (!transformed) {
            throw new Error('数据转换返回空结果')
        }

        console.log('transformed', transformed)

        transformedData.value = transformed

        enrichTransformedDataWithImageLists(transformed) //处理图片

        isDataLoaded.value = true
        pipeline.updateStage(PipelineStep.FETCH_RAW_DATA, 'completed', '原始数据获取完成')
        return true
    } catch (error: any) {
        console.error('获取原始数据失败:', error)
        showToast(`获取原始数据失败: ${error.message || '未知错误'}`, 3000)
        pipeline.setStepStatus(PipelineStep.FETCH_RAW_DATA, 'pending')
        return false
    } finally {
        isDataLoading.value = false
    }
}

// 步骤2: AI智选类目获取
const step2_fetchCategory = async (): Promise<boolean> => {
    // 如果已有类目模板，直接返回成功
    if (categoryTemplates.value && categoryTemplates.value.length > 0) {
        pipeline.setStepStatus(PipelineStep.FETCH_CATEGORY, 'completed')
        return true
    }

    // 需要原始数据中的标题
    if (!rawDataObj.value) {
        console.warn('原始数据不存在，无法获取类目')
        return false
    }

    const title = extractTitleFromRawData(rawDataObj.value)
    if (!title) {
        console.warn('未能解析出标题')
        return false
    }

    pipeline.updateStage(PipelineStep.FETCH_CATEGORY, 'active', '正在同步采集类目...')
    categoryLoading.value = true

    try {
        if (applyCategoryFromCollectedGoods(rawDataObj.value)) {
            pipeline.updateStage(PipelineStep.FETCH_CATEGORY, 'completed', '采集类目同步完成')
            return true
        }

        pipeline.updateStage(PipelineStep.FETCH_CATEGORY, 'active', '正在获取AI智选类目...')
        const ok = await applyAiCategoryFromTitle(title)
        if (ok) {
            pipeline.updateStage(PipelineStep.FETCH_CATEGORY, 'completed', 'AI智选类目获取完成')
            return true
        }
        throw new Error('未获取到类目数据')
    } catch (error: any) {
        console.error('获取AI智选类目失败:', error)
        showToast(`获取AI智选类目失败: ${error.message || '未知错误'}`, 3000)
        pipeline.setStepStatus(PipelineStep.FETCH_CATEGORY, 'pending')
        return false
    } finally {
        categoryLoading.value = false
    }
}

// 步骤3: 等待开始执行（用户交互步骤）
const step3_waitExecution = async (): Promise<boolean> => {
    // 检查类目是否已获取
    if (!categoryTemplates.value || categoryTemplates.value.length === 0) {
        return false
    }

    // 判断是否选择的是第一个类目
    const isFirstCategory = categoryTemplates.value.length > 0 &&
                           categoryTemplate.value === categoryTemplates.value[0].id

    if (isFirstCategory) {
        // 选择的是第一个类目（默认的），直接继续
        pipeline.updateStage(PipelineStep.WAIT_EXECUTION, 'completed', '已自动选择第一个类目')
        return true
    } else {
        // 用户手动选择了其他类目，直接继续
        pipeline.updateStage(PipelineStep.WAIT_EXECUTION, 'completed', '已选择类目')
        return true
    }
}

// 步骤5: AI智能体输出
const step5_generateAI = async (): Promise<boolean> => {
    // 检查是否有已缓存的类目特征
    if (!featureAttrs.value || featureAttrs.value.length === 0) {
        alert('类目特征不存在，请先确认已加载类目特征')
        return false
    }

    if (!transformedData.value) {
        console.warn('转换后的数据不存在，无法调用AI接口')
        return false
    }

    pipeline.updateStage(PipelineStep.GENERATE_AI, 'active', '正在生成AI智能体输出...')

    try {
        // 自动选品：草稿已有 AI 结果则跳过 advancedAiStart，避免重复提交 AI 任务
        if (externalAutoSelectMode.value && hasAppliedAiFillResult()) {
            appendAiLogOverlay('草稿已有 AI 帮填结果，跳过智能体任务')
            pipeline.updateStage(PipelineStep.GENERATE_AI, 'completed', '已使用草稿 AI 结果')
            return true
        }

        const data1688 = JSON.parse(JSON.stringify(transformedData.value))
        if (data1688 && data1688.sku_matrix) {
            data1688.sku_matrix.forEach((sku: any) => {
                if (sku.sale_price !== undefined && sku.sale_price !== null) {
                    sku.price_amount = sku.sale_price
                }
            })
        }
        const { collectPlatform, offerId } = getCollectOfferIdForAiFill()
        const payload = buildAiFillPayload(
            data1688,
            featureAttrs.value,
            collectPlatform,
            offerId
        )

        aiOutput.value = ''
        clearAiLogOverlayContent()
        aiAgentStopRequested.value = false
        aiAgentSessionId.value = null
        openAiLogOverlay()
        visualModelOutput.value = ''
        appendAiLogOverlay('正在启动 AI 智能体任务...')
        const startRes = await apiService.advancedAiStart(payload)
        const sessionId = startRes?.data?.sessionId
        if (startRes?.code !== 200 || !sessionId) {
            throw new Error(startRes?.msg || '启动 AI 智能体任务失败')
        }
        aiFillTaskSubmitted.value = true
        aiAgentSessionId.value = String(sessionId)
        // 批量帮填：任务提交后立即落盘 sessionId，供 SSE 失败后轮询恢复
        if (externalAutoSelectMode.value) {
            flushAutoSelectSave({ aiSessionId: String(sessionId), cardStatus: 'ai_processing' })
        }
        // 批量帮填：任务已提交，通知结果页从此时开始 rAF 进度模拟
        if (autoSelectAiFillOnTaskStarted) {
            autoSelectAiFillOnTaskStarted(String(sessionId))
            autoSelectAiFillOnTaskStarted = null
        }
        if (aiAgentStopRequested.value) {
            throw createAiAgentStoppedError()
        }

        appendAiLogOverlay('AI 智能体任务已启动，正在接收输出...')
        const finalResult = await consumeAiAgentSse(String(sessionId))
        if (!finalResult && !aiLogOverlayText.value.trim()) {
            appendAiLogOverlay('AI 智能体未返回可解析内容')
        }

        // 自动选品：step5 回填后立即落盘 editState，防止后续 6–8 失败丢失 AI 结果
        if (externalAutoSelectMode.value && hasAppliedAiFillResult()) {
            flushAutoSelectSave({ cardStatus: 'ai_processing', aiStepFailures: getPipelineStepFailures() })
        }

        // 无有效帮填结果时不进入 step6-8，保持 ai_processing 供轮询恢复
        if (!hasAppliedAiFillResult()) {
            appendAiLogOverlay('AI 智能体未返回可解析帮填结果')
            pipeline.setStepStatus(PipelineStep.GENERATE_AI, 'pending')
            if (!aiFillTaskSubmitted.value) {
                recordStepFailure('fill')
            }
            return false
        }

        pipeline.updateStage(PipelineStep.GENERATE_AI, 'completed', 'AI智能体输出完成')
        return true
    } catch (error: any) {
        if (isAiAgentStoppedError(error)) {
            aiFillTaskSubmitted.value = false
            pipeline.setStepStatus(PipelineStep.GENERATE_AI, 'pending')
            appendAiLogOverlay('AI 智能体任务已手动停止')
            isExecuting.value = false
            return false
        }
        console.error('AI生成失败:', error)
        recordStepFailure('fill')
        pipeline.setStepStatus(PipelineStep.GENERATE_AI, 'pending')
        appendAiLogOverlay(`AI智能体输出失败: ${error?.message || '未知错误'}`)
        isExecuting.value = false
        showExecuteRecover.value = true //显示恢复帮填信息按钮
        return false
    }
}
// 步骤6: 图片翻译
const step6_translateImages = async (): Promise<boolean> => {
    pipeline.updateStage(PipelineStep.TRANSLATE_IMAGES, 'active', '正在处理图片翻译...')
    appendAiLogOverlay('正在处理图片翻译...')
    try {
        const { failedCount } = await translateImagesCore()
        if (failedCount > 0) {
            recordStepFailure('translate')
            appendAiLogOverlay(`图片翻译完成，${failedCount} 张未成功`)
        } else {
            appendAiLogOverlay('图片翻译完成')
        }
        pipeline.updateStage(
            PipelineStep.TRANSLATE_IMAGES,
            'completed',
            failedCount > 0 ? '图片翻译部分失败' : '图片翻译完成',
        )
        // 翻译失败不阻断后续改图/富内容，流程继续执行完毕
        return true
    } catch (error: any) {
        console.error('图片翻译失败:', error)
        recordStepFailure('translate')
        pipeline.setStepStatus(PipelineStep.TRANSLATE_IMAGES, 'skipped')
        return true
    }
}

// 步骤7: AI改图
const step7_refineImages = async (): Promise<boolean> => {
    pipeline.updateStage(PipelineStep.REFINE_IMAGES, 'active', '正在处理AI改图...')
    appendAiLogOverlay('正在处理AI改图...')
    let workingUrls: string[] = [] //上一步处理完的图片URL列表
    // 这里根据【ai执行流程】设置，提取需要改图的图片列表
    const { goodsImgList, allImgList } = getGoodsImg(true)
    if(imageRefineSelect === 'sku'){
        workingUrls = goodsImgList
    }else if(imageRefineSelect === 'sku_and_other'){
        workingUrls = allImgList
    }
    // 检查是否有图片需要处理
    if (workingUrls.length === 0) {
        pipeline.setStepStatus(PipelineStep.REFINE_IMAGES, 'skipped')
        return true
    }
    appendAiLogOverlay("开始执行AI改图模板");
    try {
        const failedCount = await runAiTemplateStep(workingUrls);
        if (failedCount > 0) {
            recordStepFailure('refine')
            appendAiLogOverlay(`AI改图完成，${failedCount} 张未成功`)
        }
        pipeline.updateStage(
            PipelineStep.REFINE_IMAGES,
            'completed',
            failedCount > 0 ? 'AI改图部分失败' : 'AI改图完成',
        )
        return true
    } catch (error: any) {
        console.error('AI改图失败:', error)
        recordStepFailure('refine')
        pipeline.setStepStatus(PipelineStep.REFINE_IMAGES, 'skipped')
        return true
    }
}

// 获取商品的图片，根据getAll参数获取所有图片或未改变的图片
function getGoodsImg(getAll: boolean = false) {
    if (!transformedData.value) {
        return { goodsImgList: [], otherImgList: [], allImgList: [] }
    }
    const { sku_matrix, detailImgList } = transformedData.value
    const skuMatrix = Array.isArray(sku_matrix) ? sku_matrix : []
    const detailList = Array.isArray(detailImgList) ? detailImgList : []
    const goodsImgList: string[] = []
    skuMatrix.forEach((sku: any) => {
        const imgList = Array.isArray(sku?.skuImgList) ? sku.skuImgList : []
        imgList.forEach((skuItem: any) => {
            if (getAll) {
                goodsImgList.push(skuItem.transformUrl)
            } else {
                if (skuItem.transformUrl == skuItem.url) {
                    goodsImgList.push(skuItem.transformUrl)
                }
            }
        })
    })
    let otherImgList: string[] = []
    if (getAll) {
        otherImgList = detailList.map((i: any) => i.transformUrl)
    } else {
        otherImgList = detailList.filter((i: any) => i.transformUrl == i.url).map((i: any) => i.transformUrl)
    }
    const allImgList = [...goodsImgList, ...otherImgList]
    return { //全部去重
        goodsImgList: [...new Set(goodsImgList)],
        otherImgList: [...new Set(otherImgList)],
        allImgList: [...new Set(allImgList)]
    }
}

// 步骤8: 同步富内容
const step8_imageRichContent = async (): Promise<boolean> => {
    pipeline.updateStage(PipelineStep.IMAGERICHCONTENT, 'active', '正在处理同步富内容...')
    appendAiLogOverlay('正在处理同步富内容...')
    try {
        // 与 ImageQueuePage 一致：数据或 JSON富内容 属性缺失时跳过，避免 null.global_data 报错
        if (!transformedData.value) {
            recordStepFailure('rich_content')
            appendAiLogOverlay('同步富内容失败: 商品数据不可用')
            pipeline.setStepStatus(PipelineStep.IMAGERICHCONTENT, 'skipped')
            return true
        }
        const attr = jsonRichTextFeatureAttr.value
        if (!attr?.id) {
            recordStepFailure('rich_content')
            appendAiLogOverlay('当前类目未找到 JSON富内容 属性，跳过同步富内容')
            pipeline.setStepStatus(PipelineStep.IMAGERICHCONTENT, 'skipped')
            return true
        }
        let selectedUrls: string[] = []
        const { goodsImgList, otherImgList, allImgList } = getGoodsImg(true)
        switch (imageRichContentTemplate) {
            case 'sku':
                selectedUrls = goodsImgList
                break;
            case 'sku_and_other':
                selectedUrls = allImgList
                break;
            case 'other':
            default:
                selectedUrls = otherImgList
                break;
        }
        const newWidget = buildJsonSyncWidget('raImage', selectedUrls); //这里自动执行富文本，使用raImage图片模式
        const data = transformedData.value
        data.global_data = data.global_data || {};
        data.global_data[FEATURE_SCOPE_STORAGE_KEY] = {
            ...(data.global_data[FEATURE_SCOPE_STORAGE_KEY] || {}),
            [String(attr.id)]: "variant",
        };
        let skuList = []
        if (imageRichContentSelect === 'sku') {
            skuList = data.sku_matrix || []
        }
        appendAiLogOverlay('已获取所有变体')
        skuList.forEach((_: any, idx: number) => {
            appendAiLogOverlay(`正在处理变体 ${idx + 1}...`)
            const existingRawValue = getVariantJsonRichTextValue(idx, String(attr.id));
            const existingWidgets = parseRichTextWidgets(existingRawValue) || [];
            if (existingWidgets?.length > 0) {
                appendAiLogOverlay(`变体 ${idx + 1} 已存在 JSON富内容，请先检查原内容`)
                return;
            }

            const nextValue = JSON.stringify(
                dataConverter.convertToCompetitorFormat({
                    widgets: [...existingWidgets, newWidget],
                    version: 0.3,
                })
            );

            const sku = data.sku_matrix?.[idx];
            // console.warn('sku', sku);
            if (!sku) {
                return;
            }

            sku[SKU_VARIANT_FEATURE_STORAGE_KEY] = {
                ...(sku[SKU_VARIANT_FEATURE_STORAGE_KEY] || {}),
                [String(attr.id)]: nextValue,
            };
        });
        appendAiLogOverlay('已处理所有变体，同步富内容完成')
        pipeline.updateStage(PipelineStep.IMAGERICHCONTENT, 'completed', '同步富内容完成')
        return true
    } catch (error: any) {
        console.error('同步富内容失败:', error)
        recordStepFailure('rich_content')
        appendAiLogOverlay(`同步富内容失败: ${error.message}`)
        pipeline.setStepStatus(PipelineStep.IMAGERICHCONTENT, 'skipped')
        // 富内容失败不阻断流程完毕判定
        return true
    }
}

/** step6-8：图片翻译 / AI改图 / 同步富内容（供完整 Pipeline 与轮询恢复后续跑复用） */
async function executePostAiPipelineSteps(): Promise<boolean> {
    if (imageTranslateCheck) {
        if (!await step6_translateImages()) {
            return false
        }
    } else {
        pipeline.setStepStatus(PipelineStep.TRANSLATE_IMAGES, 'skipped')
    }

    if (imageRefineCheck) {
        if (!await step7_refineImages()) {
            return false
        }
    } else {
        pipeline.setStepStatus(PipelineStep.REFINE_IMAGES, 'skipped')
    }

    if (imageRichContentCheck) {
        if (!await step8_imageRichContent()) {
            return false
        }
    } else {
        pipeline.setStepStatus(PipelineStep.IMAGERICHCONTENT, 'skipped')
    }

    return true
}

/** 插件设置是否开启任一键流程步骤（翻译/改图/富内容） */
function hasPostAiStepEnabled(): boolean {
    return imageTranslateCheck || imageRefineCheck || imageRichContentCheck
}

// start ai改图
import { processImageWithOptions, type ProcessImageOptions } from "../../utils/imageProcessor";
// AI改图模板步骤：按当前所选模板对每张图做画布处理（水印/边框/放大/比例等），结果写入 imageUrlMap
async function runAiTemplateStep(workingUrls: string[]): Promise<number> {
    const templateId = imageRefineTemplate;
    let refineTemplateList: any[] = []
    const res = await apiService.getRefineTemplateList();  //加载改图模板列表
    if (res?.code === 200 && Array.isArray(res?.rows)) {
        refineTemplateList = res.rows
    }
    const template = refineTemplateList.find(
        (t: any) => String(t.id) === String(templateId)
    );
    const options = templateToOptions(template);
    const hasAny =
        options.enableZoom ||
        options.enableBorder ||
        options.enableWatermark ||
        options.enablePixelPerturbation ||
        options.enableAspectRatio;
    if (!hasAny) {
        appendAiLogOverlay("当前模板未开启任何处理项，跳过");
        return 0;
    }
    const total = workingUrls.length;
    const resultUrlList: ImgTranslateItem[] = []
    let failedCount = 0
    for (let i = 0; i < total; i++) {
        const url = (workingUrls[i] || "").trim();
        try {
            appendAiLogOverlay(`AI改图模板 处理中 (${i + 1} / ${total})`);
            const dataUrl = await processImageWithOptions(url, options);
            const ossUrl = await ensureHttpImageUrlOnOss(dataUrl, `template_src_${i}_${Date.now()}`)
            resultUrlList.push({ transformUrl: url, resultUrl: ossUrl })
        } catch (e: any) {
            failedCount += 1
            appendAiLogOverlay(`图片处理失败: ${e?.message || "未知错误"}`);
        }
    }
    replaceImageUrls(resultUrlList) // 替换图片
    appendAiLogOverlay("AI改图模板处理完成");
    return failedCount
}
// 将精修模板转为 processImageWithOptions 所需选项（与 ozon-vue AiModifyPicture applyTemplate 一致）
function templateToOptions(template: any): ProcessImageOptions {
    if (!template) return {};
    const num = (v: any) => (v != null && v !== "" ? Number(v) : undefined);
    const str = (v: any) => (v != null && v !== "" ? String(v) : undefined);
    const isOn = (v: any) => v === "0" || v === 0;
    const enableZoom = isOn(template.isEnlarge);
    const enableBorder = isOn(template.isFrame);
    const customBorderUrl = str(template.customFrameUrl) || null;
    const enableWatermark = isOn(template.isWatermark);
    const enablePixelPerturbation = isOn(template.isPct);
    const enableAspectRatio = isOn(template.isImgSize);
    const aspectRatioWidth = num(template.width) ?? 1;
    const aspectRatioHeight = num(template.height) ?? 1;
    const watermarkType = template.imageWatermarkUrl ? "image" : "text";
    const textWatermark = str(template.textWatermark) || "";
    const imageWatermarkUrl = str(template.imageWatermarkUrl) || "";
    const watermarkPosition = str(template.watermarkPosition) || "bottom-right";
    const isFillWatermark = watermarkPosition === "fill";
    let watermarkOptions: ProcessImageOptions["watermarkOptions"] = {
        fill: isFillWatermark,
        ...(isFillWatermark ? {} : { position: watermarkPosition }),
    };
    if (template.superWatermarkJson) {
        try {
            const config = JSON.parse(template.superWatermarkJson);
            const superPosition =
                watermarkType === "image"
                    ? str(config.imgPosition) || str(config.position)
                    : str(config.position);
            const superFill =
                watermarkType === "image" ? config.imgFill ?? config.fill : config.fill;
            const superAngle =
                watermarkType === "image" ? config.imgAngle ?? config.angle : config.angle;
            const superOpacity =
                watermarkType === "image"
                    ? config.imgOpacity ?? config.watermarkImgOpacity
                    : config.textOpacity;
            const superScale =
                watermarkType === "image"
                    ? config.imgScale ?? config.watermarkImgScale
                    : undefined;

            if (superFill != null) {
                watermarkOptions.fill =
                    superFill === true ||
                    superFill === "true" ||
                    superFill === 1 ||
                    superFill === "1";
            }
            if (superPosition && !isFillWatermark && !watermarkOptions.fill) {
                watermarkOptions.position = superPosition;
            }
            if (config.fontFamily) watermarkOptions.fontFamily = config.fontFamily;
            if (config.fontSize != null)
                watermarkOptions.fontSize = Number(config.fontSize);
            if (config.fontWeight != null)
                watermarkOptions.fontWeight = Number(config.fontWeight);
            if (config.fontColor) watermarkOptions.fontColor = config.fontColor;
            if (superOpacity != null) {
                watermarkOptions.opacity = Number(superOpacity) / 100;
            }
            if (superScale != null) {
                watermarkOptions.scale = Number(superScale) / 100;
            }
            if (superAngle != null) {
                watermarkOptions.angle = Number(superAngle);
            }
        } catch (_) { }
    }
    return {
        enableZoom,
        zoomScale: num(template.enlargeScale) || 1.2,
        enableBorder,
        borderColor: str(template.borderColor) || "black",
        customBorderUrl,
        enableWatermark,
        watermarkType,
        textWatermark,
        imageWatermarkUrl,
        watermarkOptions,
        enablePixelPerturbation,
        enableAspectRatio,
        aspectRatioWidth,
        aspectRatioHeight,
    };
}
// end ai改图

// start 同步富内容
const jsonRichTextFeatureAttr = computed(
  () =>
    (featureAttrs?.value || []).find((attr: any) =>
      isJsonRichTextFeatureAttr(attr)
    ) || null
);

/**
 * 将 Ozon 采集的 richAnnotationJson 预填到各变体 JSON富内容 字段
 * 逻辑与 step8_imageRichContent 写入格式一致；已有内容则跳过
 */
const applyOzonRichAnnotationJsonPrefill = () => {
    const attr = jsonRichTextFeatureAttr.value
    const data = transformedData.value
    if (!attr?.id || !data?.sku_matrix?.length) return

    const prefill = String(
        data.global_data?.[RICH_ANNOTATION_JSON_PREFILL_KEY] ?? ''
    ).trim()
    if (!prefill) return

    data.global_data = data.global_data || {}
    data.global_data[FEATURE_SCOPE_STORAGE_KEY] = {
        ...(data.global_data[FEATURE_SCOPE_STORAGE_KEY] || {}),
        [String(attr.id)]: 'variant',
    }

    const attrKey = String(attr.id)
    data.sku_matrix.forEach((sku: any) => {
        const variantFeatureValues = sku?.[SKU_VARIANT_FEATURE_STORAGE_KEY] || {}
        // 变体已有 JSON 富内容时不覆盖（与 step8 一致）
        if (String(variantFeatureValues[attrKey] ?? '').trim()) return
        sku[SKU_VARIANT_FEATURE_STORAGE_KEY] = {
            ...variantFeatureValues,
            [attrKey]: prefill,
        }
    })
}

function getVariantJsonRichTextValue(variantIndex: number, attrId: string): string {
    const data = transformedData.value;
    const sku = data?.sku_matrix?.[variantIndex];
    if (!sku) return "";
    const variantFeatureValues = sku?.[SKU_VARIANT_FEATURE_STORAGE_KEY] || {};
    if (Object.prototype.hasOwnProperty.call(variantFeatureValues, attrId)) {
        return String(variantFeatureValues[attrId] ?? "");
    }
    const featureScopeMap = data?.global_data?.[FEATURE_SCOPE_STORAGE_KEY] || {};
    if (featureScopeMap?.[attrId] === "variant") {
        return "";
    }
    const publicValue = data?.global_data?.[attrId];
    return typeof publicValue === "string" ? publicValue : "";
}
// @ts-ignore local JS utility has no declaration file
import dataConverter from "./richTextEditor/utils/dataConverter.js";
function parseRichTextWidgets(rawValue: string): any[] | null {
    const text = String(rawValue || "").trim();
    if (!text) return [];
    try {
        const parsed = JSON.parse(text);
        const converted = dataConverter.smartConvert(parsed, "our");
        return Array.isArray(converted?.widgets) ? converted.widgets : [];
    } catch (error) {
        console.error("解析富文本失败", error);
        return null;
    }
}
type JsonSyncMode =
  | "raImage"
  | "raImageText"
  | "raLeftRightImage"
  | "raDoubleImage"
  | "raTripleImage"
  | "raQuadImage";
function buildJsonSyncWidget(mode: JsonSyncMode, imageUrls: string[]) {
  switch (mode) {
    case "raImage":
      return {
        widgetName: "raImage",
        items: imageUrls.map((url) => createImageTextLikeItem(url, "raImage")),
      };
  }
}
function createImageConfig(url: string, includeWidth = false) {
  const base = {
    src: url,
    srcMobile: url,
    alt: "",
    link: "",
    position: "to_the_edge",
    positionMobile: "to_the_edge",
  };
  if (!includeWidth) {
    return base;
  }
  return {
    ...base,
    width: "full",
    widthMobile: "full",
    scale: 100,
  };
}
function createEmptyTextConfig(size: "size2" | "size3" | "size4") {
  return {
    items: [{ type: "text", content: "" }],
    size,
    align: "left",
    color: "color1",
  };
}
function createImageTextLikeItem(url: string, widgetName: JsonSyncMode) {
  if (widgetName === "raLeftRightImage") {
    return {
      layout: "left",
      img: createImageConfig(url),
      title: createEmptyTextConfig("size3"),
      text: createEmptyTextConfig("size2"),
    };
  }
  return {
    img: createImageConfig(url, widgetName === "raImage"),
    ...(widgetName === "raImage"
      ? {}
      : {
          title: createEmptyTextConfig(
            widgetName === "raImageText" ? "size4" : "size3"
          ),
          text: createEmptyTextConfig("size2"),
        }),
  };
}
// end 同步富内容


// 处理重新上传
const handleResubmit = async () => {
    // 验证基本要求
    const validation = validateBasicRequirements()
    if (!validation.valid) {
        alert(validation.message!)
        return
    }

    // 判断用户是否更换了类目
    const hasCategoryChanged = previousSubmittedCategoryTemplate.value !== null &&
                               categoryTemplate.value !== previousSubmittedCategoryTemplate.value

    if (hasCategoryChanged) {
        // 如果更换了类目，从 AI 输出步骤开始执行（类目特征已在类目切换时加载）
        if (!categoryTemplate.value) {
            alert('请先选择一个类目')
            return
        }

        pipeline.setProgressText('已更换类目，正在重新生成 AI 智能体输出...')
        await executePipeline(PipelineStep.GENERATE_AI)
    } else {
        // 如果没有更换类目，询问用户是否使用已生成的 AI 输出直接结束流程
        await messageBoxConfirm(
            '是否使用已生成的AI智能体输出？\n\n点击"确定"直接结束\n点击"取消"重新进行AI智能体输出'
        )
            .then(() => {
                // 使用已有输出后直接结束，不再执行图片翻译与上传
                pipeline.setStepStatus(PipelineStep.GENERATE_AI, 'completed')
                pipeline.setStepStatus(PipelineStep.TRANSLATE_IMAGES, 'skipped')
                pipeline.setStepStatus(PipelineStep.SUBMIT, 'skipped')
                pipeline.setProgressText('已使用已有 AI 输出，流程结束')
            })
            .catch(async () => {
                // 重新进行AI智能体输出
                pipeline.jumpToStage(PipelineStep.GENERATE_AI, '重新生成AI智能体输出...')
                await executePipeline(PipelineStep.GENERATE_AI)
            })
    }
}

// 添加SKU
const handleAddSku = () => {
    if (transformedData.value && transformedData.value.sku_matrix && Array.isArray(transformedData.value.sku_matrix)) {
        const skuMatrix = transformedData.value.sku_matrix
        if (skuMatrix.length === 0) return
        const lastIndex = skuMatrix.length - 1

        // 复制最后一行数据
        const lastSku = skuMatrix[lastIndex]
        const newSku = JSON.parse(JSON.stringify(lastSku))

        // 生成新的货号前缀
        const newOfferIdPrefix = generateDefaultOfferidPrefix()
        newSku.offerid_prefix = newOfferIdPrefix

        // 追加到最后一行
        skuMatrix.push(newSku)
        skuVideoUrlList.value = {
            ...skuVideoUrlList.value,
            [skuMatrix.length - 1]: skuVideoUrlList.value[lastIndex] || ''
        }
        showToast('添加变体成功', 2000)
    }
}

const reindexMediaRecordAfterDelete = (
    source: Record<number, string>,
    deletedIndex: number
): Record<number, string> => {
    const next: Record<number, string> = {}
    Object.entries(source).forEach(([key, value]) => {
        const index = Number(key)
        if (!Number.isInteger(index) || index < 0 || !value) return
        if (index < deletedIndex) {
            next[index] = value
            return
        }
        if (index > deletedIndex) {
            next[index - 1] = value
        }
    })
    return next
}

// 删除SKU
const handleDeleteSku = (index: number | string) => {
    if (transformedData.value && transformedData.value.sku_matrix && Array.isArray(transformedData.value.sku_matrix)) {
        const numIndex = typeof index === 'string' ? parseInt(index, 10) : index
        if (!isNaN(numIndex) && numIndex >= 0 && numIndex < transformedData.value.sku_matrix.length) {
            // 获取要删除的SKU的图片URL
            const skuToDelete = transformedData.value.sku_matrix[numIndex]
            const skuImageUrl = skuToDelete?.sku_image_url

            // 删除SKU（先删除，再检查图片是否还被使用）
            transformedData.value.sku_matrix.splice(numIndex, 1)
            skuVideoUrlList.value = reindexMediaRecordAfterDelete(skuVideoUrlList.value, numIndex)

            // 如果SKU包含图片，检查是否还有其他地方使用该图片
            if (skuImageUrl) {
                // 获取原始图片URL（如果skuImageUrl是翻译后的URL，需要找到原始URL）
                // imageUrlMap存储的是 原始URL -> 翻译后URL 的映射
                let originalImageUrl = skuImageUrl
                for (const [originalUrl, translatedUrl] of imageUrlMap.value.entries()) {
                    if (translatedUrl === skuImageUrl) {
                        originalImageUrl = originalUrl
                        break
                    }
                }

                // 定义一个函数来检查两个URL是否指向同一张图片
                const isSameImage = (url1: string, url2: string): boolean => {
                    if (url1 === url2) return true
                    // 如果url1是原始URL，url2是翻译后的URL
                    if (imageUrlMap.value.get(url1) === url2) return true
                    // 如果url2是原始URL，url1是翻译后的URL
                    if (imageUrlMap.value.get(url2) === url1) return true
                    return false
                }

                // 检查其他SKU是否还在使用该图片
                const isUsedByOtherSku = transformedData.value.sku_matrix.some((sku: any) => {
                    const otherSkuImageUrl = sku?.sku_image_url
                    return otherSkuImageUrl && (isSameImage(skuImageUrl, otherSkuImageUrl) || isSameImage(originalImageUrl, otherSkuImageUrl))
                })

                // 检查main_images中是否包含该图片
                const mainImages = transformedData.value.global_data?.media_gallery?.main_images || []
                const isUsedInMainImages = mainImages.some((url: any) => {
                    return url && (isSameImage(skuImageUrl, url) || isSameImage(originalImageUrl, url))
                })

                // 只有当图片没有被其他SKU或main_images使用时，才从图片队列中删除
                if (!isUsedByOtherSku && !isUsedInMainImages) {
                    // 从 imageList 中删除对应的图片（使用原始URL查找，因为imageList存储的是原始URL）
                    const imageIndex = imageList.value.findIndex(img => img.url === originalImageUrl)
                    if (imageIndex === -1) {
                        // 如果找不到原始URL，也尝试用翻译后的URL（以防万一）
                        const imageIndexTranslated = imageList.value.findIndex(img => img.url === skuImageUrl)
                        if (imageIndexTranslated !== -1) {
                            imageList.value.splice(imageIndexTranslated, 1)
                        }
                    } else {
                        imageList.value.splice(imageIndex, 1)
                    }

                    // 从 selectedImagesForTranslate 中删除对应的URL
                    const selectedIndex = selectedImagesForTranslate.value.findIndex(url => url === originalImageUrl || url === skuImageUrl)
                    if (selectedIndex !== -1) {
                        selectedImagesForTranslate.value.splice(selectedIndex, 1)
                    }

                    // 如果图片已被翻译，也需要从 imageUrlMap 中删除（使用原始URL）
                    if (imageUrlMap.value.has(originalImageUrl)) {
                        imageUrlMap.value.delete(originalImageUrl)
                    }
                    // 该变体的改图映射也删除该图
                    const variantMap = imageUrlMapByVariant.value.get(numIndex)
                    if (variantMap?.has(originalImageUrl)) {
                        const nextByVariant = new Map(imageUrlMapByVariant.value)
                        const nextVariantMap = new Map(nextByVariant.get(numIndex))
                        nextVariantMap.delete(originalImageUrl)
                        nextByVariant.set(numIndex, nextVariantMap)
                        imageUrlMapByVariant.value = nextByVariant
                    }
                }
            }
        }
    }
}

// 批量设置售价
const handleBatchPriceConfirm = (data: { type: 'fixed' | 'multiplier', value: number }) => {
    if (!transformedData.value || !transformedData.value.sku_matrix) return

    transformedData.value.sku_matrix.forEach((sku: any) => {
        if (data.type === 'fixed') {
            // 固定值：直接设置为输入的值
            sku.sale_price = normalizeSkuPriceValue('sale_price', data.value)
        } else if (data.type === 'multiplier') {
            // 当前值倍数：使用当前售价（如果有）或采购价乘以倍数
            const currentPrice = sku.sale_price || sku.price_amount || 0
            sku.sale_price = normalizeSkuPriceValue('sale_price', currentPrice * data.value)
        }
    })
}

const showExecuteRecover = ref(false) // 是否显示恢复帮填信息按钮

// 工作台上下文：在 handleDeleteSku / handleBatchPriceConfirm 之后 provide，避免 “before initialization” 错误
provide('workbench', {
    pipeline,
    progressSteps,
    pipelineRunning,
    isManualSelect,
    waitingForCategoryChange,
    autoSelectItemLoading,
    categoryTemplate,
    categoryTemplates,
    featureAttrLoading,
    featureAttrError,
    featureAttrs,
    shops,
    selectedShops,
    shopWarehouseInventory,
    selectAllShops,
    isDataLoading,
    transformedData,
    aiOutput,
    aiLogOverlayVisible,
    aiLogOverlayText,
    closeAiLogOverlay,
    registerAiLogStream,
    prefilledFeatureAttrValues,
    workbenchFeatureAttrValues,
    featureAttrValidationErrors,
    skuAspectValidationErrors,
    skuVideoUrlList,
    submitResult,
    handleExecute, // 执行AI帮填信息
    handleGetExecuteResult, // 重新获取AI帮填信息结果
    showExecuteRecover, // 是否显示恢复按钮
    submitProductData: async () => {
        await submitProductData()
    },
    setWorkbenchFeatureAttrValue,
    clearFeatureAttrValidationError,
    resetWorkbenchFeatureAttrState,
    handleCategorySelect,
    handleSelectAll,
    handleToggleShop,
    handleUpdateSkuSalePrice,
    handleUpdateSkuPriceAmount,
    handleUpdateSkuOfferidPrefix,
    handleUpdateSkuPackagingLength,
    handleUpdateSkuPackagingWidth,
    handleUpdateSkuPackagingHeight,
    handleUpdateSkuPackagingWeight,
    handleBatchSetAllOfferidPrefix,
    handleAddSku,
    handleDeleteSku,
    handleBatchPriceConfirm,
    handleCopyOfferId,
    navigateToImageQueue: () => {
        activeMenu.value = 'imageQueue'
    },
    navigateToImageQueueWithVariant: (index: number) => { //点击sku列表主图触发
        skuListIndex.value = index // 当前选中的sku索引
        activeMenu.value = 'imageQueue'
    },
    navigateToWorkbench: handleNavigateToWorkbench,
    showVariantImageCountWarning: openVariantImageCountWarning,
    showVariantAspectWarning: openVariantAspectWarning,
})

function clearAutoSelectMode() {
    externalAutoSelectMode.value = false
    autoSelectSourceItemId.value = null
    autoSelectSourceOfferId.value = null
    autoSelectSourceItemTitle.value = ''
    autoSelectSaveCallback = null
    activeSession.value = null
    resetPipelineStepFailures()
}

/** 清理自动选品注入的数据，避免影响正常页面采集 */
function resetAutoSelectInjectedData() {
    isDataLoaded.value = false
    transformedData.value = null
    rawDataObj.value = null
}

/** 从当前选中类目模板解析 typeId / level2Id，供自动选品加载特征 */
function getCurrentCategoryMeta(): { typeId: string; level2Id: string } | null {
    if (!categoryTemplate.value || !categoryTemplates.value.length) return null
    const tpl = categoryTemplates.value.find((t) => t.id === categoryTemplate.value)
    const meta = tpl?.data?.metadata as { typeId?: unknown; level2Id?: unknown } | undefined
    if (!meta) return null
    const typeId = String(meta.typeId ?? '').trim()
    const level2Id = String(meta.level2Id ?? '').trim()
    if (!typeId && !level2Id) return null
    return { typeId, level2Id }
}

/** 自动选品编辑前：确保类目与特征属性均已加载（走 activeSession 数据层） */
async function ensureAutoSelectCategoryAndFeatureAttrs(
    item?: AiAutoSelectDraftItem,
): Promise<boolean> {
    if (activeSession.value) {
        const ready = await ensureSessionCategoryAndFeatureAttrs(activeSession.value, item)
        if (!ready) {
            showToast('类目特征加载失败，请稍后重试', 3000)
            return false
        }
        hydrateModalFromSession(activeSession.value, getModalSessionBindings())
        return true
    }

    if (!categoryTemplate.value) {
        const title = item?.title || transformedData.value?.global_data?.product_name || ''
        if (!title.trim()) {
            showToast('商品标题缺失，无法获取类目', 3000)
            return false
        }
        categoryLoading.value = true
        try {
            const ok = await applyAiCategoryFromTitle(title)
            if (!ok) {
                showToast('获取 AI 智选类目失败', 3000)
                return false
            }
        } finally {
            categoryLoading.value = false
        }
    }

    if (!featureAttrs.value?.length) {
        const meta = getCurrentCategoryMeta()
        if (!meta) {
            showToast('类目信息不完整，无法加载特征', 3000)
            return false
        }
        try {
            await loadFeatureAttrsFromCategory(meta.typeId, meta.level2Id)
        } catch (err) {
            console.error('[autoSelect] 加载类目特征失败:', err)
        }
    }

    if (!featureAttrs.value?.length) {
        showToast('类目特征加载失败，请稍后重试', 3000)
        return false
    }
    return true
}

function buildAutoSelectItemPatch(extra?: Partial<AiAutoSelectDraftItem>): Partial<AiAutoSelectDraftItem> {
    const aiStepFailures =
        extra?.aiStepFailures ??
        (externalAutoSelectMode.value && isExecuting.value ? getPipelineStepFailures() : undefined)

    // 自动选品编辑：经 activeSession 序列化，与 headless 批量帮填共用同一数据层
    if (externalAutoSelectMode.value && activeSession.value) {
        syncSessionFromModal(activeSession.value, getModalSessionBindings())
        if (isExecuting.value) {
            activeSession.value.pipelineStepFailures = getPipelineStepFailures()
        }
        const patch = sessionToAutoSelectPatch(activeSession.value, {
            ...extra,
            ...(aiStepFailures !== undefined ? { aiStepFailures } : {}),
        })
        if (aiStepFailures === undefined) {
            delete patch.aiStepFailures
        }
        return patch
    }

    // transformedData 暂不可用时仅回写状态字段，避免 title/transformed 被空值覆盖草稿
    if (!transformedData.value) {
        return {
            ...extra,
            ...(aiStepFailures !== undefined ? { aiStepFailures } : {}),
        }
    }

    const videoSnapshot = JSON.parse(JSON.stringify(skuVideoUrlList.value)) as Record<number, string>
    const transformed = JSON.parse(JSON.stringify(transformedData.value))
    syncSkuImagesFromImgListToTransformed(transformed)
    syncSkuVideoUrlsToTransformed(transformed, videoSnapshot)
    const editState = buildEditStateSnapshotFromCollectModal({
        categoryTemplateId: categoryTemplate.value,
        categoryTemplates: categoryTemplates.value,
        featureAttrs: featureAttrs.value,
        prefilledFeatureAttrValues: prefilledFeatureAttrValues.value,
        aiResultJsonList: aiResultJsonList.value,
        aiResultPublicFeatureData: aiResultPublicFeatureData.value,
        selectedShops: selectedShops.value,
        shopWarehouseInventory: shopWarehouseInventory.value,
        workbenchFeatureAttrValues: workbenchFeatureAttrValues.value,
        skuVideoUrlList: videoSnapshot,
    })
    const title = resolveDraftItemTitle({
        title: autoSelectSourceItemTitle.value,
        transformed,
    })
    const baseItem: AiAutoSelectDraftItem = {
        id: autoSelectSourceItemId.value || '',
        offerId: autoSelectSourceOfferId.value || '',
        title,
        listPrice: null,
        detailUrl: '',
        collectedAt: 0,
        transformed,
        editState,
        cardStatus: 'waiting_ai',
        needsManualEdit: false,
    }
    const merged = { ...baseItem, ...extra, transformed, editState, title }
    const evalResult = evaluateNeedsManualEdit(merged)
    const resolvedTitle = resolveDraftItemTitle({
        title: extra?.title ?? autoSelectSourceItemTitle.value,
        transformed,
    })
    return {
        ...extra,
        transformed,
        editState,
        title: resolvedTitle,
        needsManualEdit: evalResult.needsManualEdit,
        manualEditFocus: evalResult.manualEditFocus,
        aiStepFailures,
    }
}

function flushAutoSelectSave(extra?: Partial<AiAutoSelectDraftItem>) {
    if (!externalAutoSelectMode.value || !autoSelectSourceItemId.value || !autoSelectSaveCallback) return
    autoSelectSaveCallback(autoSelectSourceItemId.value, buildAutoSelectItemPatch(extra))
}

/** AI 帮填成功后回写草稿：同步 transformed、editState、cardStatus 与步骤失败徽章 */
function flushAutoSelectSaveAfterAiSuccess() {
    flushAutoSelectSave({
        cardStatus: 'ai_success',
        aiStepFailures: getPipelineStepFailures(),
        aiSessionId: undefined,
    })
}

async function focusAutoSelectManualField(focus?: AiAutoSelectDraftItem['manualEditFocus']) {
    if (!focus) return
    if (focus.kind === 'image_queue') {
        skuListIndex.value = focus.rowIndex ?? 0
        activeMenu.value = 'imageQueue'
        await nextTick()
        return
    }
    activeMenu.value = 'workbench'
    if (focus.kind === 'sku' && focus.rowIndex != null) {
        skuListIndex.value = focus.rowIndex
    }
    workbenchPageRef.value?.expandAll()
    await nextTick()
    await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
    })
    await workbenchPageRef.value?.focusManualEditField?.(focus)
}

/** 列表页自动选品：同步切到工作台并显示加载态，供先开弹窗再异步灌入草稿 */
function beginAutoSelectItemLoad(
    item: AiAutoSelectDraftItem,
    onSaved?: (itemId: string, patch: Partial<AiAutoSelectDraftItem>) => void,
    options?: {
        focus?: AiAutoSelectDraftItem['manualEditFocus']
        chineseMarks?: ChineseFieldMark[]
    },
) {
    // 切换商品前先保存上一商品，避免未关弹窗时丢失编辑
    if (
        externalAutoSelectMode.value &&
        autoSelectSourceItemId.value &&
        autoSelectSourceItemId.value !== item.id
    ) {
        flushAutoSelectSave()
    }

    externalAutoSelectMode.value = true
    autoSelectSourceItemId.value = item.id
    autoSelectSourceOfferId.value = item.offerId || null
    autoSelectSourceItemTitle.value = resolveDraftItemTitle(item)
    autoSelectSaveCallback = onSaved || null
    autoSelectItemLoading.value = true
    skuVideoUrlList.value = {}

    resetExecutionState()
    stopDetailImagesRetry()
    resetAutoSelectInjectedData()

    isDataLoading.value = true
    isDataLoaded.value = false
    activeMenu.value = 'workbench'
    void getExecuteRecover()
}

/** 从自动选品草稿加载商品到工作台（跳过页面 fetch） */
async function loadFromAutoSelectItem(
    item: AiAutoSelectDraftItem,
    onSaved?: (itemId: string, patch: Partial<AiAutoSelectDraftItem>) => void,
    options?: {
        focus?: AiAutoSelectDraftItem['manualEditFocus']
        chineseMarks?: ChineseFieldMark[]
    },
) {
    if (!externalAutoSelectMode.value) {
        beginAutoSelectItemLoad(item, onSaved, options)
    } else {
        autoSelectItemLoading.value = true
    }

    try {
        if (!item.transformed) {
            showToast('商品数据缺失，无法打开工作台', 3000)
            clearAutoSelectMode()
            resetAutoSelectInjectedData()
            return
        }

        activeSession.value = bindAutoSelectDraftItem(item)
        hydrateModalFromSession(activeSession.value, getModalSessionBindings())

        pipeline.setStepStatus(PipelineStep.FETCH_RAW_DATA, 'completed')
        if (categoryTemplate.value) {
            pipeline.setStepStatus(PipelineStep.FETCH_CATEGORY, 'completed')
        }

        const ready = await ensureAutoSelectCategoryAndFeatureAttrs(item)
        if (!ready) {
            return
        }

        // 合规弹窗「返回修改」：标红含中文字段并展开工作台
        if (options?.chineseMarks?.length) {
            const { featureErrors, skuErrors } = buildChineseValidationErrors(options.chineseMarks)
            featureAttrValidationErrors.value = featureErrors
            skuAspectValidationErrors.value = skuErrors
            workbenchPageRef.value?.expandAll()
        }

        if (options?.focus) {
            await focusAutoSelectManualField(options.focus)
        }

        // 灌入商品后同步运行态失败标记，与草稿条目对齐
        hydratePipelineStepFailuresFromItem(item)
    } finally {
        autoSelectItemLoading.value = false
        isDataLoading.value = false
    }
}

function snapshotAutoSelectItem(): Partial<AiAutoSelectDraftItem> {
    return buildAutoSelectItemPatch()
}

// 关闭
const handleClose = () => {
    // 变更说明：关闭弹窗时保留当前页草稿，重新打开直接回显；刷新页面时再统一清空。
    if (externalAutoSelectMode.value) {
        flushAutoSelectSave()
        clearAutoSelectMode()
        resetAutoSelectInjectedData()
    } else {
        flushAiCollectDraftPersistTimer()
        persistAiCollectDraft()
    }
    resetExecutionState()
    showOzonResultModal.value = false
    showUploadingModal.value = false
    closeValidationWarningModal()
    stopDetailImagesRetry()

    emit('update:visible', false)
    emit('close')
}

// 子组件修改aiStep
function emitUpdateAiStep(dataStr: string) {
    updateAiStepStatus(dataStr)
}

/** 仅设置页需要 updateAiStep，避免事件监听器落到其他页根节点 */
const activeMenuPageListeners = computed(() =>
    activeMenu.value === 'settings' ? { updateAiStep: emitUpdateAiStep } : {}
)

// 从 插件storage 加载执行选项
let imageTranslateCheck = false //是否开启图片翻译
// 兼容历史设置值：package 使用本地翻译服务，points 使用备用翻译服务
let imageTranslateType = ''
let imageTranslateSelect = '' //图片翻译内容 sku-全部变体图片 sku_and_other-全部变体图片+其他图片（详情图）

let imageRefineCheck = false //是否开启AI改图
let imageRefineTemplate = '' //选择的改图模板 列表选择
let imageRefineSelect = '' //改图内容类型 sku-全部变体图片 sku_and_other-全部变体图片+其他图片（详情图）

let imageRichContentCheck = false //是否开启富内容
let imageRichContentTemplate = '' //富内容类型 other-其他图片（详情图） sku-商品图 sku_and_other-商品图+其他图片（详情图）
let imageRichContentSelect = '' //富内容选择类型 sku-全部变体

function updateAiStepStatus(dataStr: string) {
    const step = JSON.parse(dataStr)
    imageTranslateCheck = step.imageTranslateCheck
    imageTranslateType = step.imageTranslateType
    imageTranslateSelect = step.imageTranslateSelect

    imageRefineCheck = step.imageRefineCheck
    imageRefineTemplate = step.imageRefineTemplate
    imageRefineSelect = step.imageRefineSelect

    imageRichContentCheck = step.imageRichContentCheck
    imageRichContentTemplate = step.imageRichContentTemplate
    imageRichContentSelect = step.imageRichContentSelect
}
async function loadExecuteOptionsFromStorage() {
    const aiStep = await readStorageValue('mjgd_ai_step')
    if (aiStep) {
        updateAiStepStatus(aiStep)
    }
}

function onUserSettingsCacheChanged() {
    void loadExecuteOptionsFromStorage()
}

// 初始化（移除模拟数据，改为从实际页面获取）
onMounted(() => {
    loadExecuteOptionsFromStorage()
    window.addEventListener(USER_SYSTEM_SETTINGS_CACHE_EVENT, onUserSettingsCacheChanged)
    restoreAiCollectDraft()
    window.addEventListener('beforeunload', handleAiCollectBeforeUnload)
    getExecuteRecover()
})

onUnmounted(() => {
    unlockPageScroll()
    flushAiCollectDraftPersistTimer()
    persistAiCollectDraft()
    closeAiAgentSse()
    window.removeEventListener(USER_SYSTEM_SETTINGS_CACHE_EVENT, onUserSettingsCacheChanged)
    window.removeEventListener('beforeunload', handleAiCollectBeforeUnload)
})

// ========== 图片翻译相关函数 ==========
/** 图片翻译：象寄批量接口（与 RuoYi /xiangji/translate/batchImage 一致）
 *  增加阿里云图片翻译
 * @param fromImageQueue 是否从图片处理中心翻译图片，默认false
 */
const translateImagesCore = async (
    fromImageQueue?: boolean,
    translateService?: string,
): Promise<{ failedCount: number; totalCount: number }> => {
    let urls: string[] = []
    if (fromImageQueue) {
        // 图片处理中心翻译图片
        urls = selectedImagesForTranslate.value
    } else {
        // 工作台执行一键流程，此时需要根据【AI执行流程】设置去选择翻译哪些图片
        const { goodsImgList, allImgList } = getGoodsImg()
        if (imageTranslateSelect === 'sku') {
            urls = goodsImgList
        } else if (imageTranslateSelect === 'sku_and_other') {
            urls = allImgList
        }
    }

    if (imageTranslateInProgress.value) return { failedCount: 0, totalCount: 0 }
    if (!urls.length) return { failedCount: 0, totalCount: 0 }
    imageTranslateInProgress.value = true

    appendAiLogOverlay('正在提交图片翻译任务...', true)
    const resultUrlList: ImgTranslateItem[] = []
    urls.forEach(url => {
        resultUrlList.push({ transformUrl: url, resultUrl: '' })
    })
    try {
        let service = 'xiangji'
        // 根据【AI执行流程】设置调用不同的翻译接口
        let setService = imageTranslateType
        // 在图片翻译中心调用时，有可能会指定不同的翻译服务
        if (translateService) {
            setService = translateService
        }
        if (setService === 'package') {
            service = 'xiangji'
        } else if (setService === 'points') {
            service = 'ali'
        }
        // 创建图片翻译任务
        let list: ImgTranslateItem[] = []
        switch (service) {
            case 'ali':
                list = await getImgTranslateResultALI(resultUrlList, service)
                break;
            case 'xiangji':
            default:
                list = await getImgTranslateResultXIANGJI(resultUrlList, service)
                break;
        }
        replaceImageUrls(list) //替换翻译后的图片地址
        const failedCount = list.filter((item) => !item.resultUrl).length
        appendAiLogOverlay('所有图片翻译任务已完成', true)
        pipeline.updateStage(PipelineStep.TRANSLATE_IMAGES, 'completed', '图片翻译完成')
        return { failedCount, totalCount: urls.length }
    } catch (error: any) {
        console.error('图片翻译失败:', error)
        const errText = `图片翻译失败: ${error.message || '未知错误'}`
        showToast(errText, 5000)
        appendAiLogOverlay(errText, true)
        // 图片处理中心需向上抛出，避免外层误提示「翻译完成」
        if (fromImageQueue) throw error
        return { failedCount: urls.length, totalCount: urls.length }
    } finally {
        imageTranslateInProgress.value = false
    }
}
// 图片翻译-阿里云
async function getImgTranslateResultALI(resultUrlList: ImgTranslateItem[], service: string): Promise<ImgTranslateItem[]> {
    return new Promise(async (resolve, reject) => {
        let sourceLang = 'zh'
        let targetLang = 'ru'
        switch (batchTranslateLanguage.value) {
            case 'CHS>ENG': //中文->英文
                sourceLang = 'zh'
                targetLang = 'en'
                break;
            case 'ENG>RUS': //英文->俄语
                sourceLang = 'en'
                targetLang = 'ru'
                break;
            case 'CHS>RUS': //中文->俄语
            default:
                sourceLang = 'zh'
                targetLang = 'ru'
                break;
        }
        for (let index = 0; index < resultUrlList.length; index++) {
            const urlItem = resultUrlList[index];
            const aliRes = await apiService.addBatchImageTranslateALI({ imageUrls: [urlItem.transformUrl], sourceLang, targetLang })
            if (aliRes.code == 200) {
                const taskIds = aliRes.data?.taskIds
                if (taskIds.length > 0) {
                    appendAiLogOverlay(`正在翻译第 ${index + 1} 张图片`, true)
                    try {
                        const list = await pollingImgTranslateResult(taskIds, service) // 查询图片翻译结果
                        resultUrlList[index].resultUrl = list[0].imageUrl
                        applySingleTranslateResult(resultUrlList[index])
                    } catch (error: any) {
                        appendAiLogOverlay(`图片 ${index + 1} ${error}`, true)
                    }
                } else {
                    appendAiLogOverlay(`图片 ${index + 1} 未获取到翻译任务ID`, true)
                }
            } else {
                // 本地服务拒绝创建任务时中断并抛出，避免外层误判为翻译完成
                const errMsg = aliRes.msg || `图片 ${index + 1} 翻译失败`
                appendAiLogOverlay(errMsg, true)
                reject(new Error(errMsg))
                return
            }
            notifyTranslateItemDone(
                resultUrlList[index].resultUrl || urlItem.transformUrl,
                !!resultUrlList[index].resultUrl
            )
        }
        resolve(resultUrlList)
    })
}
// 图片翻译-象寄
async function getImgTranslateResultXIANGJI(resultUrlList: ImgTranslateItem[], service: string): Promise<ImgTranslateItem[]> {
    return new Promise(async (resolve, reject) => {
        for (let index = 0; index < resultUrlList.length; index++) {
            const urlItem = resultUrlList[index];
            const aliRes = await apiService.addBatchImageTranslate({ urls: [urlItem.transformUrl], language: batchTranslateLanguage.value })
            if (aliRes.code == 200) {
                const content = aliRes.data?.content || []
                if (content.length > 0) {
                    appendAiLogOverlay(`正在翻译第 ${index + 1} 张图片`, true)
                    try {
                        const list = await pollingImgTranslateResult(content, service) // 查询图片翻译结果
                        resultUrlList[index].resultUrl = list[0].sslUrl
                        applySingleTranslateResult(resultUrlList[index])
                    } catch (error: any) {
                        appendAiLogOverlay(`图片 ${index + 1} ${error}`, true)
                    }
                } else {
                    appendAiLogOverlay(`图片 ${index + 1} 未获取到翻译任务ID`, true)
                }
            } else {
                // 本地服务拒绝创建任务时中断并抛出，避免外层误判为翻译完成
                const errMsg = aliRes.msg || `图片 ${index + 1} 翻译失败`
                appendAiLogOverlay(errMsg, true)
                reject(new Error(errMsg))
                return
            }
            notifyTranslateItemDone(
                resultUrlList[index].resultUrl || urlItem.transformUrl,
                !!resultUrlList[index].resultUrl
            )
        }
        resolve(resultUrlList)
    })
}
// 轮询图片翻译结果
function pollingImgTranslateResult(requestIds: string[], service: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
        let requestInterval: ReturnType<typeof setInterval> | null = null
        let attempt = 0
        const maxAttempts = 20 //最大轮询次数
        const interval = 3000 //轮询间隔，单位毫秒
        requestInterval = setInterval(async () => {
            attempt += 1
            if (attempt >= maxAttempts) {
                clearInterval(requestInterval!)
                reject(new Error("翻译任务超时"))
            }
            // 查询图片翻译结果
            switch (service) {
                case 'ali':
                    const aliRes = await apiService.queryBatchImageTranslateALI(requestIds)
                    if (aliRes.code === 200) {
                        const list = aliRes.data || []
                        if (list.length > 0) {
                            if (list[0].taskStatus === "SUCCEEDED") {
                                clearInterval(requestInterval!)
                                resolve(list)
                            } else if (list[0].taskStatus === "PENDING" || list[0].taskStatus === "RUNNING") {
                                appendAiLogOverlay(`图片翻译中`, true)
                            } else {
                                clearInterval(requestInterval!)
                                reject(new Error(`翻译失败，错误码：${list[0].taskStatus}`))
                            }
                        }
                    }
                    break;
                case 'xiangji':
                default:
                    const XjRes = await apiService.queryBatchImageTranslate(requestIds)
                    if (XjRes.code === 200) {
                        const data = XjRes.data?.content || {}
                        const value = data[requestIds[0]]
                        if (value.code == 200 && value.sslUrl) {
                            clearInterval(requestInterval!)
                            resolve([value])
                        } else if (value.code == 114) {
                            appendAiLogOverlay(`图片翻译中`, true)
                        } else {
                            clearInterval(requestInterval!)
                            reject(new Error(`翻译失败，错误码：${value.code}`))
                        }
                    }
                    break;
            }
        }, interval);
    })
}
// 图片处理中心调用
const translateImagesOnly = async (fromImageQueue: boolean, translateService: string) => {
    return await translateImagesCore(fromImageQueue, translateService)
}
// 替换图片地址
interface ImgTranslateItem {
    transformUrl: string;
    ossUrl?: string;
    resultUrl: string;
}
const applySingleTranslateResult = (item: ImgTranslateItem) => {
    if (!item.resultUrl || !transformedData.value) return
    transformedData.value.sku_matrix.forEach((sku: any) => {
        sku.skuImgList.forEach((skuItem: any) => {
            if (skuItem.transformUrl === item.transformUrl) {
                applyTransformUrl(skuItem, item.resultUrl)
            }
        })
    })
    transformedData.value.detailImgList.forEach((detailItem: any) => {
        if (detailItem.transformUrl === item.transformUrl) {
            applyTransformUrl(detailItem, item.resultUrl)
        }
    })
}
const notifyTranslateItemDone = (url: string, success: boolean) => {
    imageQueueContext.onTranslateItemDone?.(url, success)
}
const replaceImageUrls = (resultUrlList: ImgTranslateItem[])  => {
    if (!transformedData.value) return
    transformedData.value.sku_matrix.forEach((sku: any) => {
        sku.skuImgList.forEach((skuItem: any) => {
            resultUrlList.forEach((resItem: ImgTranslateItem) => {
                if (skuItem.transformUrl === resItem.transformUrl && resItem.resultUrl) {
                    applyTransformUrl(skuItem, resItem.resultUrl)
                }
            })
        })
    });
    transformedData.value.detailImgList.forEach((detailItem: any) => {
        resultUrlList.forEach((resItem: ImgTranslateItem) => {
            if (detailItem.transformUrl === resItem.transformUrl && resItem.resultUrl) {
                applyTransformUrl(detailItem, resItem.resultUrl)
            }
        })
    })
    console.log('图片地址已替换', transformedData.value)
}

// 图片翻译日志
const translateImagesLogInfo = ref<string>('');
// 图片队列上下文：仅提供共享数据与 pipeline 触发的翻译；其余逻辑在 ImageQueuePage 内
const imageQueueContext = {
    imageList,
    featureAttrs,
    selectedImagesForTranslate,
    isManualImageSelect,
    showStartTranslateBtn,
    pipelineRunning,
    imageTranslateInProgress,
    translateImagesOnly,
    translateVariantIndex,
    batchTranslateLanguage,
    transformedData,
    navigateToWorkbench: handleNavigateToWorkbench,
    skuListIndex, // 当前选中的sku索引
    translateImagesLogInfo, //图片翻译日志
    onTranslateItemDone: undefined as undefined | ((url: string, success: boolean) => void),
    getCollectOfferId: getCollectOfferIdForAiFill,
}
provide('imageQueue', imageQueueContext)

// 解析AI输出JSON（仅解析语言模型的JSON数据）
const parseAiOutput = (): any => {
    // 提取语言模型输出的部分（去掉开头的标记）
    let languageModelOutput = aiOutput.value

    // 查找"=== 语言模型输出 ==="标记，提取之后的内容
    const languageModelMarker = '=== 语言模型输出 ==='
    const markerIndex = languageModelOutput.indexOf(languageModelMarker)
    if (markerIndex !== -1) {
        // 提取标记之后的所有内容
        languageModelOutput = languageModelOutput.substring(markerIndex + languageModelMarker.length).trim()
    }

    try {
        // 尝试直接解析
        return JSON.parse(languageModelOutput)
    } catch (parseError) {
        // 如果直接解析失败，尝试提取JSON数组
        const jsonMatch = languageModelOutput.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0])
        } else {
            throw new Error('无法从 AI 输出中提取有效 JSON，请检查本地 AI 服务和 API Key 配置')
        }
    }
}

const workbenchPageRef = ref<any>(null) // 通过 ref 修改子组件展开全部特征属性
const imageQueuePageRef = ref<any>(null)
const settingsPageRef = ref<any>(null)

/** KeepAlive 切换时 ref 会短暂为 null，保留各页已缓存实例引用供提交校验等使用 */
function bindActiveMenuPageRef(el: unknown) {
    if (el == null) return
    if (activeMenu.value === 'workbench') workbenchPageRef.value = el
    else if (activeMenu.value === 'imageQueue') imageQueuePageRef.value = el
    else if (activeMenu.value === 'settings') settingsPageRef.value = el
}

const getWorkbenchReader = () => workbenchPageRef.value as {
    getFeatureAttrValue?: (attrId: number) => string
    getSkuAspectString?: (rowIndex: number, attrId: number) => string
    getSkuVariantFeatureValue?: (rowIndex: number, attrId: number) => string
    getSkuJsonRichText?: (rowIndex: number) => string
    getSkuVariantDescription?: (rowIndex: number) => string
    getSkuTitleValue?: (sku: any) => string
} | null

const createSubmitValidateContext = (): SubmitValidateContext => ({
    featureAttrs: featureAttrs.value,
    transformedData: transformedData.value,
    workbenchReader: getWorkbenchReader(),
    getFeatureAttrExistingValue,
    getVariantJsonRichTextValue,
})

const createOzonSubmitContext = (): OzonSubmitContext => ({
    categoryTemplates: categoryTemplates.value,
    categoryTemplateId: categoryTemplate.value,
    transformedData: transformedData.value,
    featureAttrs: featureAttrs.value,
    aiResultJsonList: aiResultJsonList.value,
    aiResultPublicFeatureData: aiResultPublicFeatureData.value,
    selectedShopIds: selectedShops.value,
    shopWarehouseInventory: shopWarehouseInventory.value,
    skuVideoUrlList: skuVideoUrlList.value,
    getFeatureAttrExistingValue,
    parseAiOutputFallback: () => {
        try {
            return parseAiOutput()
        } catch {
            return []
        }
    },
})

const createOzonSubmitHooks = (): OzonSubmitValidationHooks => ({
    debugLogPayload: true,
    setFeatureValidationErrors: (errors) => {
        featureAttrValidationErrors.value = errors
    },
    onValidationFailed: (message) => {
        showToast(message, 4500)
    },
    onVariantImageCountExceeded: (payload) => {
        openVariantImageCountWarning(payload)
    },
    onVariantAspectValidationFailed: (payload) => {
        openVariantAspectWarning(payload)
    },
    onChineseBlocked: (marks) => {
        validationWarningMode.value = 'chinese'
        validationWarningFields.value = marks.map(({ label, value }) => ({ label, value }))
        const { featureErrors, skuErrors } = buildChineseValidationErrors(marks)
        featureAttrValidationErrors.value = featureErrors
        skuAspectValidationErrors.value = skuErrors
        showValidationWarningModal.value = true
        workbenchPageRef.value?.expandAll()
    },
    onProgress: (text) => {
        pipeline.setProgressText(text)
    },
    onUploading: (show) => {
        showUploadingModal.value = show
    },
    onSuccess: (data) => {
        submitResult.value = data as typeof submitResult.value
        previousSubmittedCategoryTemplate.value = categoryTemplate.value
        featureAttrValidationErrors.value = {}
        skuAspectValidationErrors.value = {}
    },
    onError: (message) => {
        pipeline.setProgressText(`上传商品数据失败: ${message}`)
        showToast(`上传商品数据失败: ${message}`, 5000)
    },
})

// 提交商品数据（校验 + 上传，业务逻辑在 ozonAiFillAndSubmit）
const submitProductData = async () => {
    const result = await runOzonSubmitWithValidation(
        createSubmitValidateContext(),
        createOzonSubmitContext(),
        createOzonSubmitHooks()
    )
    if (result.status === 'submit_failed') {
        ozonResultMode.value = 'failure'
        ozonResultFailures.value = result.parsed.failures.map((f) => ({
            shopId: f.shopId,
            message: f.message,
        }))
        showOzonResultModal.value = true
    } else if (result.status === 'success') {
        const { collectPlatform, offerId } = getCollectOfferIdForAiFill()
        if (offerId) {
            clearImageEditDraft(buildProductKey(collectPlatform, offerId))
        }
        ozonResultMode.value = 'success'
        showOzonResultModal.value = true
    }
}

function isEditingAutoSelectItem(): boolean {
    return externalAutoSelectMode.value && Boolean(autoSelectSourceItemId.value)
}

/** 指定条目是否正在工作台内执行 AI 帮填 Pipeline */
function isAutoSelectItemFillActive(itemId: string): boolean {
    return (
        isExecuting.value &&
        externalAutoSelectMode.value &&
        autoSelectSourceItemId.value === itemId
    )
}

/** 是否有任意自动选品帮填 Pipeline 占用 Modal（恢复时需避让） */
function isAutoSelectPipelineBusy(): boolean {
    return isExecuting.value && externalAutoSelectMode.value
}

defineExpose({
    beginAutoSelectItemLoad,
    loadFromAutoSelectItem,
    snapshotAutoSelectItem,
    flushAutoSelectSave,
    isEditingAutoSelectItem,
    isAutoSelectItemFillActive,
    isAutoSelectPipelineBusy,
    dismiss: handleClose,
})
</script>

<style scoped lang="scss">

.mjgd-ai-overlay {
    display: flex;
    justify-content: center;
    align-items: center;
    overscroll-behavior: contain;
}

.mjgd-ai-modal {
    width: 1600px;
    max-width: 95vw;
    height: 92vh;
    background: #f4f7fa;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

// 顶部横栏（图2效果：白底、底部分隔线、右侧竖线+关闭）
.mjgd-ai-top-header {
    height: 75px;
    padding: 0 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #ffffff;
    border-bottom: 1px solid #cbd5e1;
    flex-shrink: 0;
}

.mjgd-ai-top-header-left {
    display: flex;
    align-items: center;
    gap: 6px;
}

.mjgd-ai-logo-icon {
    width: 45px;
    height: 45px;
    object-fit: contain;
    flex-shrink: 0;
}

.mjgd-ai-logo-text {
    font-size: 16px;
    font-weight: 700;
    color: #1e293b !important;
    letter-spacing: 0.5px;
}

.mjgd-ai-top-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
}

// 导航按钮：图2 白底、浅灰圆角边框、轻微阴影浮雕
.mjgd-ai-nav-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #475569;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

    &:hover {
        background: #f8fafc;
        color: #1e293b;
        border-color: #cbd5e1;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
    }

    &.mjgd-ai-nav-btn-active {
        background: #eff6ff;
        color: #2563eb;
        border-color: #2563eb;
        box-shadow: 0 1px 2px rgba(37, 99, 235, 0.15);
    }
}

// 关闭按钮前竖线分隔（图2）
.mjgd-ai-header-divider {
    width: 1px;
    height: 20px;
    background: #e2e8f0;
    flex-shrink: 0;
}

.mjgd-ai-nav-btn-icon {
    width: 18px;
    height: 18px;
    object-fit: contain;
    flex-shrink: 0;
    /* 默认灰，与按钮文字 #475569 一致，图标一直显示 */
    filter: brightness(0) saturate(100%) invert(38%) sepia(12%) saturate(1200%) hue-rotate(195deg) brightness(92%) contrast(88%);
}

.mjgd-ai-nav-btn-active .mjgd-ai-nav-btn-icon {
    /* 选中时改为蓝色 */
    filter: brightness(0) saturate(100%) invert(30%) sepia(98%) saturate(1639%) hue-rotate(212deg) brightness(97%) contrast(93%);
}

.mjgd-ai-nav-btn-text {
    white-space: nowrap;
}

// 下方内容区域（图3部分：工作台/图片队列/设置页面在下方）
.mjgd-ai-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #f4f7fa;
}

.mjgd-ai-content-body {
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    padding: 6px;
    overflow-y: auto;
    background: #f4f7fa;

    &::-webkit-scrollbar {
        width: 8px;
    }

    &::-webkit-scrollbar-track {
        background: #f5f7fa;
        border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb {
        background: #dcdfe6;
        border-radius: 4px;

        &:hover {
            background: #909399;
        }
    }
}

// 工作台页面样式
.mjgd-ai-page-workbench {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

// 页面通用样式
.mjgd-ai-page-title {
    margin-bottom: 0;
}

.mjgd-ai-page-title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
}

.mjgd-ai-page-title-text {
    font-size: 22px;
    font-weight: 600;
    color: #606266;
    margin: 0 0 8px 0;
    line-height: 1.4;
}

.mjgd-ai-page-subtitle {
    font-size: 14px;
    color: #909399;
    margin: 0;
}

.mjgd-ai-close-btn {
    cursor: pointer;
    font-size: 20px;
    color: #64748b;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 4px;
    transition: background 0.2s, color 0.2s;

    &:hover {
        background: rgba(0, 0, 0, 0.06);
        color: #1e293b;
    }
}

// 配置区域
.mjgd-ai-config-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 0;
}

.mjgd-ai-label {
    display: block;
    font-weight: 600;
    color: #606266;
    margin-bottom: 12px;
    font-size: 14px;
}

// 店铺选择和开关选项一行布局
.mjgd-ai-options-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    padding: 20px;
    background: #ffffff;
    border-radius: 8px;
    border: 1px solid #dcdfe6;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

    &.mjgd-ai-shop-select-disabled {
        opacity: 0.6;
        pointer-events: none;
        background: #f5f5f5;
    }
}

.mjgd-ai-options-col {
    display: flex;
    flex-direction: column;
}

.mjgd-ai-shop-select-content {
    flex: 1;
}

// 店铺选择（旧样式保留，用于兼容）
.mjgd-ai-shop-select {
    padding: 20px;
    background: #ffffff;
    border-radius: 8px;
    border: 1px solid #dcdfe6;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

    &.mjgd-ai-shop-select-disabled {
        opacity: 0.6;
        pointer-events: none;
        background: #f5f5f5;
    }
}

.mjgd-ai-shop-list {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 12px;
    background: #F7F9FB;
    border-radius: 8px;
}

.mjgd-ai-checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: #606266;

    input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: #2563EB;

        &:disabled {
            cursor: not-allowed;
            opacity: 0.5;
        }
    }

    span {
        user-select: none;
    }
}

// 禁用状态下的样式
.mjgd-ai-shop-select-disabled {
    .mjgd-ai-checkbox-label {
        cursor: not-allowed;
        opacity: 0.6;
    }
}

// 配置行
.mjgd-ai-config-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 16px;
    align-items: end;
}

// 开关行（单独一行）
.mjgd-ai-switch-row {
    display: flex;
    align-items: center;
    margin-top: 0;
    padding: 16px 20px;
    background: #ffffff;
    border-radius: 8px;
    border: 1px solid #dcdfe6;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.mjgd-ai-switch-group {
    display: flex;
    flex-direction: row;
    gap: 16px;

    // 确保 Tooltip 不影响 flex 布局
    > * {
        flex: 1;
        display: flex;
    }
}

.mjgd-ai-switch-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    background: #F7F9FB;
    border-radius: 8px;
    width: 100%;
}

.mjgd-ai-switch-label {
    font-size: 14px;
    font-weight: 500;
    color: #606266;
    white-space: nowrap;
}

// 问号图标样式
.mjgd-ai-icon-help {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #409EFF;
    border-radius: 50%;
    color: #409EFF;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    background: #ecf5ff;
    transition: all 0.3s;
    flex-shrink: 0;
    margin-left: 4px;

    &:hover {
        background: #b3d8ff;
        border-color: #66b1ff;
    }
}

.mjgd-ai-config-item {
    display: flex;
    flex-direction: column;
    gap: 8px;

    &.mjgd-ai-execute-btn-container {
        align-self: flex-end;
    }
}

.mjgd-ai-config-label {
    font-size: 13px;
    font-weight: 500;
    color: #606266;
    display: flex;
    align-items: center;
    gap: 8px;
}

// 状态指示器
.mjgd-ai-status-indicator {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 8px;
    flex-shrink: 0;

    &.mjgd-ai-status-waiting {
        background-color: #999999;
    }

    &.mjgd-ai-status-executing {
        background-color: #409EFF;
        animation: statusPulse 1.5s ease-in-out infinite;
    }

    &.mjgd-ai-status-completed {
        background-color: #67C23A;
    }
}

@keyframes statusPulse {
    0%, 100% {
        opacity: 1;
        transform: scale(1);
    }
    50% {
        opacity: 0.6;
        transform: scale(1.2);
    }
}

.mjgd-ai-link {
    color: #409EFF;
    text-decoration: none;
    font-size: 12px;
    font-weight: 400;
    cursor: pointer;

    &:hover {
        text-decoration: underline;
        color: #337ecc;
    }
}

.mjgd-ai-select {
    padding: 10px 12px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    font-size: 14px;
    color: #606266;
    background: #ffffff;
    transition: all 0.3s;
    width: 100%;
    cursor: pointer;

    &:focus {
        outline: none;
        border-color: #409EFF;
        box-shadow: 0 0 0 2px #ecf5ff;
    }

    &:hover {
        border-color: #66b1ff;
    }
}

.mjgd-ai-input {
    padding: 10px 12px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    font-size: 14px;
    color: #606266;
    background: #ffffff;
    transition: all 0.3s;
    width: 100%;

    &:focus {
        outline: none;
        border-color: #409EFF;
        box-shadow: 0 0 0 2px #ecf5ff;
    }

    &::placeholder {
        color: #909399;
    }
}

// 开关组件样式
.mjgd-ai-switch-wrapper {
    display: flex;
    align-items: center;
    height: 40px;
}

// 货号前缀输入框包装器
.mjgd-ai-offerid-prefix-input-wrapper {
    display: flex;
    align-items: center;
    height: 40px;
}

// 货号前缀输入框样式
.mjgd-ai-offerid-prefix-input {
    width: 200px;
    height: 40px;
    padding: 0 10px;
    font-size: 14px;
    color: #606266;
    background: #ffffff;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    transition: all 0.2s;
    outline: none;

    &:focus {
        border-color: #409EFF;
        box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
    }

    &:disabled {
        background: #f5f7fa;
        color: #909399;
        cursor: not-allowed;
        border-color: #e4e7ed;
    }

    &::placeholder {
        color: #909399;
    }
}

.mjgd-ai-switch-input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
}

.mjgd-ai-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    cursor: pointer;
    user-select: none;
}

.mjgd-ai-switch-slider {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #c0c4cc;
    border-radius: 12px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

    &::before {
        content: '';
        position: absolute;
        height: 20px;
        width: 20px;
        left: 2px;
        bottom: 2px;
        background-color: #ffffff;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
}

.mjgd-ai-switch-active {
    .mjgd-ai-switch-slider {
        background-color: #2563EB;

        &::before {
            transform: translateX(20px);
        }
    }

    &:hover .mjgd-ai-switch-slider {
        background-color: #1d4ed8;
    }
}

.mjgd-ai-switch:not(.mjgd-ai-switch-active):hover .mjgd-ai-switch-slider {
    background-color: #a8abb2;
}

.mjgd-ai-switch:active .mjgd-ai-switch-slider::before {
    transform: scale(0.9);
}

.mjgd-ai-switch-active:active .mjgd-ai-switch-slider::before {
    transform: translateX(20px) scale(0.9);
}

.mjgd-ai-execute-btn-container {
    display: flex;
    justify-content: flex-end;
    align-items: flex-end;
}

.mjgd-ai-execute-btn {
    padding: 14px 32px;
    background: #2563EB;
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    transition: all 0.3s;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
    white-space: nowrap;

    &:hover:not(:disabled) {
        transform: translateY(-1px);
        background: #1d4ed8;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
    }

    &:active:not(:disabled) {
        transform: translateY(0);
        background: #1e40af;
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.7;
        background: #9ca3af;
        box-shadow: none;
    }

    &.mjgd-ai-execute-btn-loading {
        background: #2563EB;
        opacity: 0.9;
    }
}

.mjgd-ai-execute-icon {
    width: 30px;
    height: 30px;
    display: inline-block;
    vertical-align: middle;
    object-fit: contain;
    filter: brightness(0) invert(1);
}

.mjgd-ai-execute-loading-icon {
    font-size: 16px;
    animation: rotate 1s linear infinite;
    display: inline-block;
}

@keyframes rotate {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

// 数据展示区域
.mjgd-ai-data-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 24px;
}

.mjgd-ai-data-left,
.mjgd-ai-data-right {
    display: flex;
    flex-direction: column;
    border: 1px solid #dcdfe6;
    border-radius: 8px;
    overflow: hidden;
    background: #ffffff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    min-height: 400px;
}

.mjgd-ai-data-header {
    padding: 14px 16px;
    background: #1E2939;
    border-bottom: 1px solid #364153;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
}

.mjgd-ai-data-title {
    font-size: 14px;
    font-weight: 600;
    color: #E5E7EB;
}

.mjgd-ai-copy-btn {
    padding: 4px 12px;
    background: #18493E;
    color: #05DF72;
    border: 1px solid #05DF72;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.3s;

    &:hover {
        background: #1a5a4d;
        border-color: #05DF72;
    }
}

.mjgd-ai-model-badge {
    padding: 4px 10px;
    background: #18493E;
    color: #05DF72;
    border: 1px solid #05DF72;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
}

.mjgd-ai-textarea {
    flex: 1;
    padding: 16px;
    border: none;
    outline: none;
    resize: none;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.6;
    color: #05DF72;
    background: #101828;
    overflow-y: auto;
    min-height: 350px;

    &::-webkit-scrollbar {
        width: 8px;
    }

    &::-webkit-scrollbar-track {
        background: #1a2332;
        border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb {
        background: #05DF72;
        border-radius: 4px;

        &:hover {
            background: #04c85f;
        }
    }
}

// 原始数据表格样式
.mjgd-ai-loading-container,
.mjgd-ai-empty-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
}

.mjgd-ai-loading-text,
.mjgd-ai-empty-text {
    font-size: 14px;
    color: #909399;
}

.mjgd-ai-table-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0;
}

.mjgd-ai-product-list-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid #dcdfe6;
    background: #ffffff;

    .mjgd-ai-product-list-icon {
        font-size: 18px;
        line-height: 1;
    }

    .mjgd-ai-product-list-title {
        font-size: 14px;
        font-weight: 600;
        color: #606266;
    }

    .mjgd-ai-sku-warning {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        border: 1px solid #f59e0b;
        border-radius: 6px;
        box-shadow: 0 2px 4px rgba(245, 158, 11, 0.1);

        .mjgd-ai-warning-icon {
            font-size: 14px;
            line-height: 1;
            animation: warning-pulse 2s infinite;
        }

        .mjgd-ai-warning-text {
            font-size: 12px;
            font-weight: 500;
            color: #92400e;
            line-height: 1.4;
        }
    }
}

.mjgd-ai-sku-table {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    background: #ffffff;
    table-layout: fixed;

    tbody {
        tr {
            border-bottom: 1px solid #dcdfe6;
            transition: background-color 0.2s;

            &:hover {
                background-color: rgba(64, 158, 255, 0.05);
            }

            &:last-child {
                border-bottom: none;
            }
        }

        td {
            padding: 12px 16px;
            font-size: 13px;
            color: #606266;
            vertical-align: top;
        }
    }
}


.mjgd-ai-sku-image-cell {
    width: 100px;
    max-width: 100px;

    .mjgd-ai-sku-image {
        width: 80px;
        height: 80px;
        object-fit: cover;
        border-radius: 4px;
        border: 1px solid #dcdfe6;
    }

    .mjgd-ai-sku-image-placeholder {
        width: 80px;
        height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f5f7fa;
        border: 1px solid #dcdfe6;
        border-radius: 4px;
        font-size: 12px;
        color: #909399;
    }
}

.mjgd-ai-sku-field-label {
    font-size: 11px;
    color: #909399;
    margin-bottom: 4px;
    font-weight: 400;
}

.mjgd-ai-sku-field-value {
    font-size: 13px;
    color: #606266;
    word-break: break-word;
}

.mjgd-ai-sku-name-cell {
    width: auto;
    min-width: 0;
    word-break: break-word;
    overflow: hidden;
}

.mjgd-ai-sku-price-cell {
    width: 120px;
    min-width: 120px;
    max-width: 120px;
}

.mjgd-ai-sku-sale-price-cell {
    width: 150px;
    min-width: 150px;
    max-width: 150px;
}

.mjgd-ai-batch-price-btn-trigger {
    padding: 6px 12px;
    background: #1890ff;
    color: #ffffff;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    outline: none;
    white-space: nowrap;
    flex-shrink: 0;

    &:hover {
        background: #40a9ff;
    }

    &:active {
        background: #096dd9;
    }
}

.mjgd-ai-sku-action-cell {
    width: 80px;
    min-width: 80px;
    max-width: 80px;
    text-align: center;
    vertical-align: top;

    .mjgd-ai-delete-btn {
        margin-top: 0;
    }
}

.mjgd-ai-delete-btn {
    padding: 6px 12px;
    background: #ff4757;
    color: #ffffff;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.3s;
    white-space: nowrap;

    &:hover {
        background: #ee5a6f;
    }

    &:active {
        transform: scale(0.98);
    }
}

.mjgd-ai-price-wrapper {
    display: inline-flex;
    align-items: center;
    background: #ffffff;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    padding: 0;
    transition: all 0.3s;
    width: fit-content;
    min-width: 100px;
    max-width: 100%;

    &:focus-within {
        border-color: #409EFF;
        box-shadow: 0 0 0 2px #ecf5ff;
    }

    &.mjgd-ai-price-wrapper-readonly {
        background: #F8FAFC;

        &:focus-within {
            border-color: #dcdfe6;
            box-shadow: none;
        }
    }

    .mjgd-ai-price-symbol {
        padding: 6px 4px 6px 10px;
        font-size: 13px;
        color: #606266;
        font-weight: 500;
        flex-shrink: 0;
    }

    .mjgd-ai-price-input {
        width: 80px;
        min-width: 60px;
        padding: 6px 10px 6px 4px;
        border: none;
        border-radius: 4px;
        font-size: 13px;
        color: #606266;
        background: transparent;
        -moz-appearance: textfield;
        appearance: textfield;

        &:focus {
            outline: none;
        }

        &[readonly] {
            background: #F8FAFC;
            cursor: not-allowed;
        }

        &::-webkit-inner-spin-button,
        &::-webkit-outer-spin-button {
            -webkit-appearance: none;
            appearance: none;
            margin: 0;
        }
    }
}

// 提交结果表格
.mjgd-ai-result-section {
    margin-top: 24px;
    padding: 20px;
    background: #ffffff;
    border: 1px solid #dcdfe6;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.mjgd-ai-result-header {
    margin-bottom: 12px;

    .mjgd-ai-data-title {
        font-size: 14px;
        font-weight: 600;
        color: #606266;
    }
}

.mjgd-ai-result-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.mjgd-ai-result-group {
    background: #ffffff;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    padding: 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.mjgd-ai-result-group-header {
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #dcdfe6;

    .mjgd-ai-result-shop,
    .mjgd-ai-result-task {
        font-size: 13px;
        font-weight: 500;
        color: #606266;
    }
}

.mjgd-ai-result-table {
    width: 100%;
    border-collapse: collapse;
    background: #f5f7fa;
    border-radius: 4px;
    overflow: hidden;

    thead {
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);

        th {
            padding: 12px 16px;
            text-align: left;
            font-size: 13px;
            font-weight: 600;
            color: #606266;
            border-bottom: 2px solid #dcdfe6;

            &:first-child {
                width: 60%;
            }

            &:last-child {
                width: 40%;
            }
        }
    }

    tbody {
        background: #ffffff;

        tr {
            border-bottom: 1px solid #dcdfe6;
            transition: background-color 0.2s;

            &:last-child {
                border-bottom: none;
            }

            &:hover {
                background-color: rgba(64, 158, 255, 0.05);
            }
        }

        td {
            padding: 12px 16px;
            font-size: 13px;
            color: #606266;
        }
    }
}

.mjgd-ai-result-sku-name {
    word-break: break-word;
    color: #606266;
}

.mjgd-ai-result-offer-id {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mjgd-ai-result-offer-text {
    flex: 1;
    font-family: 'Courier New', monospace;
    color: #409EFF;
    font-weight: 500;
    word-break: break-all;
}

.mjgd-ai-result-copy-btn {
    padding: 4px 12px;
    background: #409EFF;
    color: #ffffff;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.3s;
    white-space: nowrap;
    flex-shrink: 0;

    &:hover {
        background: #337ecc;
    }

    &:active {
        transform: scale(0.98);
    }
}

// 图片处理队列
.mjgd-ai-image-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 24px;
    padding: 16px;
    background: #ffffff;
    border: 1px solid #dcdfe6;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.mjgd-ai-image-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.mjgd-ai-image-complete {
    font-size: 13px;
    color: #67C23A;
    font-weight: 500;
}

.mjgd-ai-image-list {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding: 8px 0;

    &::-webkit-scrollbar {
        height: 6px;
    }

    &::-webkit-scrollbar-track {
        background: #f5f7fa;
        border-radius: 3px;
    }

    &::-webkit-scrollbar-thumb {
        background: #dcdfe6;
        border-radius: 3px;

        &:hover {
            background: #909399;
        }
    }
}

.mjgd-ai-image-item {
    position: relative;
    flex-shrink: 0;
    width: 120px;
    height: 120px;
    border-radius: 8px;
    overflow: hidden;
    border: 4px solid transparent;
    transition: all 0.3s;

    &.mjgd-ai-image-waiting {
        border-color: #CCCCCC;
        border-width: 4px;
    }

    &.mjgd-ai-image-processing {
        border-color: #409EFF;
        border-width: 4px;
        animation: pulse 2s infinite;
    }

    &.mjgd-ai-image-completed {
        border-color: #67C23A;
        border-width: 4px;
    }

    &.mjgd-ai-image-failed {
        border-color: #F56C6C;
        border-width: 4px;
    }
}

@keyframes pulse {
    0%, 100% {
        box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.4);
    }
    50% {
        box-shadow: 0 0 0 8px rgba(64, 158, 255, 0);
    }
}

@keyframes warning-pulse {
    0%, 100% {
        transform: scale(1);
        opacity: 1;
    }
    50% {
        transform: scale(1.1);
        opacity: 0.8;
    }
}

.mjgd-ai-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.mjgd-ai-image-status {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 4px;
    background: rgba(0, 0, 0, 0.7);
    color: #ffffff;
    font-size: 11px;
    text-align: center;
    font-weight: 500;
}

// 图片队列页面样式
.mjgd-ai-page-image-queue {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.mjgd-ai-image-queue-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 0;
}

.mjgd-ai-download-all-btn {
    padding: 10px 20px;
    background: #2563EB;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.3s;

    &:hover:not(:disabled) {
        background: #1d4ed8;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

.mjgd-ai-download-all-icon {
    width: 16px;
    height: 16px;
    display: inline-block;
    vertical-align: middle;
    object-fit: contain;
    filter: brightness(0) invert(1);
}

.mjgd-ai-continue-execute-btn {
    padding: 10px 20px;
    background: #409EFF;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.3s;

    &:hover:not(:disabled) {
        background: #337ecc;
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3);
    }

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
}

.mjgd-ai-continue-execute-icon {
    font-size: 16px;
    line-height: 1;
}

.mjgd-ai-start-translate-btn {
    padding: 12px 24px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    position: relative;
    overflow: hidden;

    &::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
        transition: left 0.5s;
    }

    &:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);

        &::before {
            left: 100%;
        }
    }

    &:active:not(:disabled) {
        transform: translateY(0);
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    }

    &:disabled {
        background: linear-gradient(135deg, #9ca3af 0%, #6b7280 100%);
        box-shadow: 0 2px 8px rgba(156, 163, 175, 0.3);
        cursor: not-allowed;
        transform: none;
    }
}

.mjgd-ai-start-translate-icon {
    width: 16px;
    height: 16px;
    vertical-align: middle;
}

.mjgd-ai-refresh-btn {
    padding: 10px 20px;
    background: #409EFF;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.3s;

    &:hover {
        background: #337ecc;
    }
}

.mjgd-ai-refresh-icon {
    font-size: 16px;

    &:hover {
        animation: rotate 1s linear infinite;
    }
}

.mjgd-ai-image-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-bottom: 0;
}

.mjgd-ai-stat-card {
    background: #ffffff;
    border: 1px solid #dcdfe6;
    border-radius: 8px;
    padding: 20px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    transition: all 0.3s;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);

    &:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
    }
}

.mjgd-ai-stat-icon {
    width: 32px;
    height: 32px;
    display: inline-block;
    flex-shrink: 0;
    object-fit: contain;
}

.mjgd-ai-stat-icon-waiting {
    filter: brightness(0) saturate(100%) invert(70%) sepia(89%) saturate(1352%) hue-rotate(348deg) brightness(102%) contrast(90%);
}

.mjgd-ai-stat-icon-processing {
    filter: brightness(0) saturate(100%) invert(55%) sepia(96%) saturate(1352%) hue-rotate(187deg) brightness(102%) contrast(101%);
}

.mjgd-ai-stat-icon-completed {
    filter: brightness(0) saturate(100%) invert(70%) sepia(89%) saturate(1352%) hue-rotate(75deg) brightness(102%) contrast(90%);
}

.mjgd-ai-stat-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
}

.mjgd-ai-stat-number {
    font-size: 28px;
    font-weight: bold;
    color: #606266;
    line-height: 1;
}

.mjgd-ai-stat-label {
    font-size: 14px;
    color: #909399;
    line-height: 1;
}

.mjgd-ai-image-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 20px;
}

.mjgd-ai-image-select-all {
    margin-top: 20px;
    padding: 12px;
    background: #f5f7fa;
    border-radius: 6px;
    display: flex;
    justify-content: center;
}

.mjgd-ai-image-grid-item {
    position: relative;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    border: 4px solid transparent;
    transition: all 0.3s;
    background: #ffffff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    cursor: pointer;

    &:hover {
        transform: scale(1.02);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
        border-color: #409EFF;

        .mjgd-ai-image-grid-img {
            opacity: 0.85;
        }

        .mjgd-ai-image-top-bar,
        .mjgd-ai-image-bottom-bar {
            background: linear-gradient(to bottom, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.4) 50%, transparent 100%);
        }

        .mjgd-ai-image-bottom-bar {
            background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.4) 50%, transparent 100%);
        }
    }

    // 顶部信息栏
    .mjgd-ai-image-top-bar {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 10;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 8px;
        background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.3) 50%, transparent 100%);
        pointer-events: none;
        transition: background 0.3s;

        > * {
            pointer-events: auto;
        }
    }

    // 状态徽章（优化版）
    .mjgd-ai-image-status-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        backdrop-filter: blur(8px);
        transition: all 0.2s;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);

        .mjgd-ai-image-status-icon {
            font-size: 12px;
            line-height: 1;
            display: flex;
            align-items: center;
        }

        .mjgd-ai-image-status-text {
            line-height: 1;
        }

        // 等待状态
        &.mjgd-ai-image-status-waiting {
            background: rgba(156, 163, 175, 0.9);
            color: #ffffff;
        }

        // 处理中状态
        &.mjgd-ai-image-status-processing {
            background: rgba(37, 99, 235, 0.9);
            color: #ffffff;
            animation: pulse-glow 2s ease-in-out infinite;
        }

        // 已完成状态
        &.mjgd-ai-image-status-completed {
            background: rgba(34, 197, 94, 0.9);
            color: #ffffff;
        }

        // 失败状态
        &.mjgd-ai-image-status-failed {
            background: rgba(239, 68, 68, 0.9);
            color: #ffffff;
        }
    }

    // 来源标签容器（优化版）
    .mjgd-ai-image-source-badges {
        display: flex;
        flex-direction: column;
        gap: 3px;
        align-items: flex-end;
    }

    // 单个来源标签（优化版）
    .mjgd-ai-image-source-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 6px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 600;
        backdrop-filter: blur(8px);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: default;
        white-space: nowrap;
        min-width: 20px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);

        .mjgd-ai-image-source-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            flex-shrink: 0;
            background: currentColor;
            opacity: 0.9;
        }

        .mjgd-ai-image-source-short {
            display: inline-block;
            transition: all 0.25s;
            line-height: 1;
        }

        .mjgd-ai-image-source-full {
            display: none;
            opacity: 0;
            transition: all 0.25s;
            line-height: 1;
        }

        // 悬停时展开
        &:hover {
            min-width: auto;
            padding-right: 8px;
            transform: translateX(-2px);

            .mjgd-ai-image-source-short {
                display: none;
            }

            .mjgd-ai-image-source-full {
                display: inline-block;
                opacity: 1;
            }
        }
    }

    // 主图标签样式（蓝色）
    .mjgd-ai-image-source-main {
        background: rgba(37, 99, 235, 0.9);
        color: #ffffff;

        &:hover {
            background: rgba(37, 99, 235, 1);
            box-shadow: 0 2px 6px rgba(37, 99, 235, 0.5);
        }
    }

    // 轮播图标签样式（绿色）
    .mjgd-ai-image-source-carousel {
        background: rgba(34, 197, 94, 0.9);
        color: #ffffff;

        &:hover {
            background: rgba(34, 197, 94, 1);
            box-shadow: 0 2px 6px rgba(34, 197, 94, 0.5);
        }
    }

    // 详情图标签样式（橙色）
    .mjgd-ai-image-source-detail {
        background: rgba(249, 115, 22, 0.9);
        color: #ffffff;

        &:hover {
            background: rgba(249, 115, 22, 1);
            box-shadow: 0 2px 6px rgba(249, 115, 22, 0.5);
        }
    }

    // 底部操作栏
    .mjgd-ai-image-bottom-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 10;
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        padding: 8px;
        background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.3) 50%, transparent 100%);
        pointer-events: none;
        transition: background 0.3s;

        > * {
            pointer-events: auto;
        }
    }

    // 删除按钮（优化版）
    .mjgd-ai-image-delete-btn {
        width: 28px;
        height: 28px;
        background: rgba(239, 68, 68, 0.95);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(8px);
        color: #ffffff;
        box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);

        &:hover {
            background: rgba(239, 68, 68, 1);
            transform: scale(1.1);
            box-shadow: 0 3px 8px rgba(239, 68, 68, 0.5);
        }

        &:active {
            transform: scale(0.95);
        }

        svg {
            width: 14px;
            height: 14px;
            stroke: currentColor;
        }
    }

    // 选择框容器（优化版）
    .mjgd-ai-image-checkbox-wrapper {
        width: 28px;
        height: 28px;
    }

    // 自定义选择框样式
    .mjgd-ai-image-checkbox-label {
        position: relative;
        display: block;
        width: 100%;
        height: 100%;
        cursor: pointer;
    }

    .mjgd-ai-image-checkbox {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
        pointer-events: none;
    }

    .mjgd-ai-image-checkbox-custom {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.95);
        border: 2px solid rgba(255, 255, 255, 0.8);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        backdrop-filter: blur(8px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);

        svg {
            width: 14px;
            height: 14px;
            color: #409EFF;
            opacity: 0;
            transform: scale(0);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
    }

    .mjgd-ai-image-checkbox:checked + .mjgd-ai-image-checkbox-custom {
        background: rgba(37, 99, 235, 0.95);
        border-color: rgba(37, 99, 235, 1);
        box-shadow: 0 2px 6px rgba(37, 99, 235, 0.4);

        svg {
            opacity: 1;
            transform: scale(1);
            color: #ffffff;
        }
    }

    .mjgd-ai-image-checkbox-label:hover .mjgd-ai-image-checkbox-custom {
        transform: scale(1.1);
        box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
    }

    // 处理中状态的脉冲动画
    @keyframes pulse-glow {
        0%, 100% {
            box-shadow: 0 2px 4px rgba(37, 99, 235, 0.4);
        }
        50% {
            box-shadow: 0 2px 8px rgba(37, 99, 235, 0.6), 0 0 12px rgba(37, 99, 235, 0.3);
        }
    }

    .mjgd-ai-image-grid-img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        transition: opacity 0.3s;
    }

    &.mjgd-ai-image-waiting {
        border-color: #CCCCCC;
        border-width: 4px;
    }

    &.mjgd-ai-image-processing {
        border-color: #409EFF;
        border-width: 4px;
        animation: pulse 2s infinite;
    }

    &.mjgd-ai-image-completed {
        border-color: #67C23A;
        border-width: 4px;
    }

    &.mjgd-ai-image-failed {
        border-color: #F56C6C;
        border-width: 4px;
    }
}


.mjgd-ai-image-grid-empty {
    background: #f5f7fa;
    border: 2px dashed #dcdfe6;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: none;

    &:hover {
        border-color: #66b1ff;
        background: rgba(64, 158, 255, 0.05);
    }
}

.mjgd-ai-image-grid-empty-text {
    font-size: 14px;
    color: #909399;
}

// 系统设置页面样式
.mjgd-ai-page-settings {
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
}

.mjgd-ai-settings-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0;
}

.mjgd-ai-save-btn {
    padding: 10px 24px;
    background: #2563EB;
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.3s;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);

    &:hover {
        background: #1d4ed8;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
    }
}

.mjgd-ai-save-icon {
    width: 16px;
    height: 16px;
    display: inline-block;
    vertical-align: middle;
    object-fit: contain;
    filter: brightness(0) invert(1);
}

.mjgd-ai-settings-section {
    background: #ffffff;
    border: 1px solid #dcdfe6;
    border-radius: 8px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.mjgd-ai-settings-section-title {
    font-size: 16px;
    font-weight: 600;
    color: #606266;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.mjgd-ai-settings-section-icon {
    width: 18px;
    height: 18px;
    display: inline-block;
    vertical-align: middle;
    object-fit: contain;
    flex-shrink: 0;
}

.mjgd-ai-settings-section-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.mjgd-ai-settings-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mjgd-ai-settings-label {
    font-size: 14px;
    font-weight: 500;
    color: #606266;
    display: flex;
    align-items: center;
    gap: 8px;
}

.mjgd-ai-settings-gear,
.mjgd-ai-settings-pin {
    font-size: 14px;
    opacity: 0.6;
}

.mjgd-ai-settings-hint {
    font-size: 12px;
    color: #909399;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
}

.mjgd-ai-hint-icon {
    font-size: 14px;
}

.mjgd-ai-settings-switch-wrapper {
    display: flex;
    align-items: center;
    height: 40px;
}

// 底部状态栏
.mjgd-ai-footer {
    height: 48px;
    padding: 0 24px;
    background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
    border-top: 1px solid #dcdfe6;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
}

.mjgd-ai-footer-left {
    display: flex;
    align-items: center;

    .mjgd-ai-progress {
        font-size: 13px;
        color: #606266;
        font-weight: 500;
    }
}

.mjgd-ai-footer-right {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #909399;

    .mjgd-ai-version {
        font-weight: 600;
        color: #409EFF;
    }
}

// 倒计时弹窗
.mjgd-ai-countdown-overlay {
    display: flex;
    justify-content: center;
    align-items: center;
    animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes slideUp {
    from {
        transform: translateY(20px);
        opacity: 0;
    }
    to {
        transform: translateY(0);
        opacity: 1;
    }
}

// 上传成功提示模态框样式
.mjgd-ai-success-modal {
    background: #ffffff;
    border-radius: 16px;
    padding: 40px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    min-width: 400px;
    text-align: center;
    animation: slideUp 0.3s ease-out;
}

.mjgd-ai-success-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
}

.mjgd-ai-success-icon {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: linear-gradient(135deg, #67c23a 0%, #85ce61 100%);
    color: #ffffff;
    font-size: 48px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    animation: successPulse 0.6s ease-out;
}

@keyframes successPulse {
    0% {
        transform: scale(0);
        opacity: 0;
    }
    50% {
        transform: scale(1.1);
    }
    100% {
        transform: scale(1);
        opacity: 1;
    }
}

.mjgd-ai-success-title {
    font-size: 24px;
    font-weight: 600;
    color: #606266;
}

.mjgd-ai-success-text {
    font-size: 16px;
    color: #909399;
    line-height: 1.5;
}

.mjgd-ai-success-btn {
    padding: 12px 48px;
    background: linear-gradient(135deg, #409EFF 0%, #337ecc 100%);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);

    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(64, 158, 255, 0.4);
    }

    &:active {
        transform: translateY(0);
    }
}

// 上传中模态框样式
.mjgd-ai-uploading-modal {
    background: #ffffff;
    border-radius: 16px;
    padding: 40px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    min-width: 400px;
    text-align: center;
    animation: slideUp 0.3s ease-out;
}

.mjgd-ai-uploading-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
}

.mjgd-ai-uploading-icon {
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

.mjgd-ai-uploading-spinner {
    width: 64px;
    height: 64px;
    border: 4px solid #f5f7fa;
    border-top-color: #409EFF;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}

.mjgd-ai-uploading-title {
    font-size: 24px;
    font-weight: 600;
    color: #606266;
}

.mjgd-ai-uploading-text {
    font-size: 16px;
    color: #909399;
    line-height: 1.5;
}

</style>

