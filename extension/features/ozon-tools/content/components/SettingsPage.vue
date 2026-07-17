<template>
    <div class="mjgd-ai-page-settings">
        <div class="mjgd-ai-page-title">
            <h2 class="mjgd-ai-page-title-text">系统设置</h2>
            <p class="mjgd-ai-page-subtitle">配置核心参数，修改后自动保存</p>
        </div>

        <div class="mjgd-ai-settings-header">
            <button class="mjgd-ai-save-btn" @click="saveToStorage"><img :src="bcIcon" alt="保存" class="mjgd-ai-save-icon" />保存配置</button>
        </div>

        <div class="mjgd-ai-settings-section">
            <div class="mjgd-ai-settings-section-title">
                <img :src="aiIcon" alt="AI" class="mjgd-ai-settings-section-icon" />
                AI 模型参数
            </div>
            <div class="mjgd-ai-settings-section-content">
                <div class="mjgd-ai-settings-item">
                    <label class="mjgd-ai-settings-label">AI执行流程<span class="mjgd-ai-settings-gear">⚙️</span></label>
                    <AiProcessStepBlock v-model="aiStepConfig" :refine-template-list="refineTemplateList" />
                </div>
                <div class="mjgd-ai-settings-item">
                    <label class="mjgd-ai-settings-label">AI 智选类目偏好 <span class="mjgd-ai-settings-pin">📍</span></label>
                    <select :value="categoryPreference" @change="onCategoryPreferenceChange" class="mjgd-ai-select">
                        <option value="auto">自动匹配 (默认)</option>
                    </select>
                </div>
                <div class="mjgd-ai-settings-item">
                    <label class="mjgd-ai-settings-label">最大执行变体数量</label>
                    <select :value="String(maxVariantExecutionCount)" @change="onMaxVariantExecutionCountChange" class="mjgd-ai-select">
                        <option value="30">30</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                    <div v-if="showMaxVariantRiskWarning" class="mjgd-ai-settings-warning">当前变体数量上限较高，AI 在长任务流程中更容易出现识别遗漏、字段缺失或提交过程中数据丢失。若商品信息较复杂，建议按 30 分批处理，稳定性会更高。</div>
                </div>
                <div class="mjgd-ai-settings-item">
                    <label class="mjgd-ai-settings-label">启用模型深度思考</label>
                    <div class="mjgd-ai-settings-switch-wrapper">
                        <input type="checkbox" :id="'deepThink-switch'" :checked="deepThinkEnabled" @change="onDeepThinkChange" class="mjgd-ai-switch-input" />
                        <label :for="'deepThink-switch'" class="mjgd-ai-switch" :class="{ 'mjgd-ai-switch-active': deepThinkEnabled }">
                            <span class="mjgd-ai-switch-slider"></span>
                        </label>
                    </div>
                    <div class="mjgd-ai-settings-hint">开启后使用深度思考模型模式，关闭则使用轻量模式</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, onActivated, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { showToast } from '../../utils/toast'
import { apiService } from '../../utils/api'
import { resolveAssetUrl } from '../../utils/runtime'
import fallbackBcIcon from '../../assets/bc.svg'
import fallbackAiIcon from '../../assets/ai.svg'
import AiProcessStepBlock from './AiProcessStepBlock.vue'
import {
    DEFAULT_AI_STEP_CONFIG,
    type AiAutoSelectAiStepConfig,
} from '../utils/aiAutoSelect/types'
import {
    DEFAULT_MAX_VARIANT_EXECUTION_COUNT,
    normalizeMaxVariantExecutionCount,
} from '../utils/maxVariantExecution'
import {
    isSettingsMissing,
    readSettingsCache,
    saveLocalAndRemote,
    saveLocalAndRemoteImmediate,
    syncFromServer,
    USER_SYSTEM_SETTINGS_CACHE_EVENT,
    type SettingsCacheChangeReason,
} from '../utils/userSystemSettings/userSystemSettingsSync'
import { type UserSystemSettingsPayload } from '../utils/userSystemSettings/types'
const bcIcon = resolveAssetUrl('src/assets/bc.svg', fallbackBcIcon)
const aiIcon = resolveAssetUrl('src/assets/ai.svg', fallbackAiIcon)

/** 连续改动 debounce，避免 deep watch 频繁触发多次 toast */
const AUTO_SAVE_DEBOUNCE_MS = 400

// 维护插件storage — AI 执行流程统一由 AiProcessStepBlock 管理
const aiStepConfig = ref<AiAutoSelectAiStepConfig>({ ...DEFAULT_AI_STEP_CONFIG })

// 子组件独立维护：从 localStorage 加载，保存时写入
const categoryPreference = ref('auto')
const deepThinkEnabled = ref(false)
const maxVariantExecutionCount = ref<number>(DEFAULT_MAX_VARIANT_EXECUTION_COUNT)
const showMaxVariantRiskWarning = computed(() => maxVariantExecutionCount.value >= 50)

// 初始化完成前禁止自动保存，避免加载/同步阶段误触发
let autoSaveEnabled = false
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
const refineTemplateList = ref<any[]>([])

/** 全自动独立字段由 AiAutoSelectModal 维护，SettingsPage 保存时原样带回避免冲掉 */
const cachedFullAutoAiStep = ref<AiAutoSelectAiStepConfig>({ ...DEFAULT_AI_STEP_CONFIG })
const cachedFullAutoMaxVariantExecutionCount = ref(DEFAULT_MAX_VARIANT_EXECUTION_COUNT)
const cachedListingPriceAdjust = ref<UserSystemSettingsPayload['listingPriceAdjust']>(undefined)

function buildSettingsPayload(): UserSystemSettingsPayload {
    return {
        aiStep: { ...aiStepConfig.value },
        categoryPreference: categoryPreference.value,
        deepThinkEnabled: deepThinkEnabled.value,
        maxVariantExecutionCount: maxVariantExecutionCount.value,
        fullAutoAiStep: { ...cachedFullAutoAiStep.value },
        fullAutoMaxVariantExecutionCount: cachedFullAutoMaxVariantExecutionCount.value,
        ...(cachedListingPriceAdjust.value ? { listingPriceAdjust: { ...cachedListingPriceAdjust.value } } : {}),
    }
}

function applySettingsPayload(payload: UserSystemSettingsPayload) {
    aiStepConfig.value = { ...payload.aiStep }
    categoryPreference.value = payload.categoryPreference
    deepThinkEnabled.value = payload.deepThinkEnabled
    maxVariantExecutionCount.value = payload.maxVariantExecutionCount
    cachedFullAutoAiStep.value = { ...payload.fullAutoAiStep }
    cachedFullAutoMaxVariantExecutionCount.value = payload.fullAutoMaxVariantExecutionCount
    cachedListingPriceAdjust.value = payload.listingPriceAdjust ? { ...payload.listingPriceAdjust } : undefined
}

function buildDefaultSettingsPayload(): UserSystemSettingsPayload {
    return {
        aiStep: { ...DEFAULT_AI_STEP_CONFIG },
        categoryPreference: 'auto',
        deepThinkEnabled: false,
        maxVariantExecutionCount: DEFAULT_MAX_VARIANT_EXECUTION_COUNT,
        fullAutoAiStep: { ...DEFAULT_AI_STEP_CONFIG },
        fullAutoMaxVariantExecutionCount: DEFAULT_MAX_VARIANT_EXECUTION_COUNT,
    }
}

async function loadFromStorage() {
    try {
        const payload = await readSettingsCache()
        applySettingsPayload(payload)
    } catch (e) {
        console.error('加载设置失败:', e)
    }
}

/** 任意配置项变更后 debounce 自动保存并提示 */
function triggerAutoSave() {
    if (!autoSaveEnabled) return
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null
        void performAutoSave()
    }, AUTO_SAVE_DEBOUNCE_MS)
}

async function performAutoSave() {
    const payload = buildSettingsPayload()
    const aiStepStr = JSON.stringify(payload.aiStep)
    emit('updateAiStep', aiStepStr)
    try {
        await saveLocalAndRemote(payload, { showSuccessToast: true })
    } catch (e) {
        console.error('保存设置失败:', e)
        showToast('保存配置失败', 2000)
    }
}

watch(aiStepConfig, triggerAutoSave, { deep: true })
watch(categoryPreference, triggerAutoSave)
watch(deepThinkEnabled, triggerAutoSave)
watch(maxVariantExecutionCount, triggerAutoSave)

const emit = defineEmits<{
    (e: 'updateAiStep', dataStr: string): void
}>()

/** 手动保存：立即写入扩展本地存储，同时取消待执行的自动保存。 */
function saveToStorage() {
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
        autoSaveTimer = null
    }
    const payload = buildSettingsPayload()
    const aiStepStr = JSON.stringify(payload.aiStep)
    emit('updateAiStep', aiStepStr)
    void saveLocalAndRemoteImmediate(payload).catch((e) => {
        console.error('保存设置失败:', e)
        showToast('保存配置失败', 2000)
    })
}

/** 从扩展本地存储重新加载配置。 */
async function refreshSettingsFromCache(options?: { resetToDefaults?: boolean; reloadOnly?: boolean }) {
    autoSaveEnabled = false
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
        autoSaveTimer = null
    }
    // 用户主动恢复默认设置时，仅重置当前内存态。
    if (options?.resetToDefaults) {
        applySettingsPayload(buildDefaultSettingsPayload())
        refineTemplateList.value = []
    } else {
        // reloadOnly：设置事件已完成持久化，此处只读本地，避免重复初始化。
        if (!options?.reloadOnly && (await isSettingsMissing())) {
            try {
                await syncFromServer()
            } catch (e) {
                console.warn('初始化本地配置失败:', e)
            }
        }
        await loadFromStorage()
        await fetchRefineTemplateList()
    }
    await nextTick()
    autoSaveEnabled = true
}

function onSettingsCacheChanged(event: Event) {
    const reason = (event as CustomEvent<{ reason?: SettingsCacheChangeReason }>).detail?.reason
    if (reason === 'cleared') {
        void refreshSettingsFromCache({ resetToDefaults: true })
        return
    }
    if (reason === 'synced') {
        void refreshSettingsFromCache({ reloadOnly: true })
        return
    }
    void refreshSettingsFromCache()
}

onActivated(() => {
    void refreshSettingsFromCache()
})

onMounted(() => {
    window.addEventListener(USER_SYSTEM_SETTINGS_CACHE_EVENT, onSettingsCacheChanged)
})

onUnmounted(() => {
    window.removeEventListener(USER_SYSTEM_SETTINGS_CACHE_EVENT, onSettingsCacheChanged)
})

// 从本地 API 加载改图模板；接口不可用时不阻断设置页。
async function fetchRefineTemplateList() {
    try {
        const res = await apiService.getRefineTemplateList();
        if (res?.code === 200 && Array.isArray(res?.rows)) {
            refineTemplateList.value = res.rows;
            if (res.rows.length > 0 && aiStepConfig.value.imageRefineTemplate === '') {
                aiStepConfig.value = {
                    ...aiStepConfig.value,
                    imageRefineTemplate: String(res.rows[0].id),
                }
            }
        }
    } catch (e: any) {
        console.log("获取精修模板列表失败", e);
    }
}

const apiKeyInputRef = ref<HTMLInputElement | null>(null)
defineExpose({ apiKeyInputRef })

function onCategoryPreferenceChange(e: Event) {
    categoryPreference.value = (e.target as HTMLSelectElement).value
}
/** 最大执行变体数量 */
function onMaxVariantExecutionCountChange(e: Event) {
    maxVariantExecutionCount.value = normalizeMaxVariantExecutionCount((e.target as HTMLSelectElement).value)
}
/** 启用模型深度思考 */
function onDeepThinkChange(e: Event) {
    deepThinkEnabled.value = (e.target as HTMLInputElement).checked
}
</script>

<style scoped lang="scss">
$primary-blue: #409EFF;
$primary-blue-dark: #337ecc;
$text-gray: #606266;
$text-gray-light: #909399;
$bg-white: #ffffff;
$border-color: #dcdfe6;
$bg-blue-light: #ecf5ff;

.mjgd-ai-page-settings {
    display: flex;
    flex-direction: column;
    gap: 24px;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
}

.mjgd-ai-page-title {
    margin-bottom: 0;
}

.mjgd-ai-page-title-text {
    font-size: 22px;
    font-weight: 600;
    color: $text-gray;
    margin: 0 0 8px 0;
    line-height: 1.4;
}

.mjgd-ai-page-subtitle {
    font-size: 14px;
    color: $text-gray-light;
    margin: 0;
}

.mjgd-ai-settings-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0;
}

.mjgd-ai-save-btn {
    padding: 10px 24px;
    background: #2563EB;
    color: $bg-white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
}

.mjgd-ai-save-icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
    filter: brightness(0) invert(1);
}

.mjgd-ai-settings-section {
    background: $bg-white;
    border: 1px solid $border-color;
    border-radius: 8px;
    padding: 24px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.mjgd-ai-settings-section-title {
    font-size: 16px;
    font-weight: 600;
    color: $text-gray;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.mjgd-ai-settings-section-icon {
    width: 18px;
    height: 18px;
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
    color: $text-gray;
    display: flex;
    align-items: center;
    gap: 8px;
}

.mjgd-ai-settings-gear,
.mjgd-ai-settings-pin {
    font-size: 14px;
    opacity: 0.6;
}

.mjgd-ai-link {
    color: $primary-blue;
    text-decoration: none;
    font-size: 12px;
    cursor: pointer;
}

.mjgd-ai-input {
    padding: 10px 12px;
    border: 1px solid $border-color;
    border-radius: 6px;
    font-size: 14px;
    color: $text-gray;
    background: $bg-white;
    width: 100%;
}

.mjgd-ai-select {
    padding: 10px 12px;
    border: 1px solid $border-color;
    border-radius: 6px;
    font-size: 14px;
    color: $text-gray;
    background: $bg-white;
    width: 100%;
    cursor: pointer;
}

.mjgd-ai-settings-hint {
    font-size: 12px;
    color: $text-gray-light;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
}

.mjgd-ai-settings-warning {
    margin-top: 6px;
    padding: 12px 14px;
    border: 1px solid #ff9f43;
    border-left: 4px solid #ff7a00;
    border-radius: 6px;
    background: linear-gradient(180deg, #fff3e0 0%, #ffe7cc 100%);
    color: #8a3b00;
    font-size: 12px;
    line-height: 1.6;
    font-weight: 500;
    box-shadow: 0 4px 10px rgba(255, 122, 0, 0.12);
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
    transition: all 0.3s;
}

.mjgd-ai-switch-slider::before {
    content: '';
    position: absolute;
    height: 20px;
    width: 20px;
    left: 2px;
    bottom: 2px;
    background-color: $bg-white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: all 0.3s;
}

.mjgd-ai-switch-active .mjgd-ai-switch-slider {
    background-color: #2563EB;
}

.mjgd-ai-switch-active .mjgd-ai-switch-slider::before {
    transform: translateX(20px);
}

.mjgd-ai-settings-switch-wrapper {
    display: flex;
    align-items: center;
    height: 40px;
}
</style>
