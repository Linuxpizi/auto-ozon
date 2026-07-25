<script setup lang="ts">
import { computed, ref } from 'vue'
import { NAlert, NButton, NSwitch, NTag } from 'naive-ui'
import {
  PANEL_SELECTION_RULES_STORAGE_KEY,
  requirePanelToolData,
  type PanelSelectionConditions,
  type PanelSelectionRule,
  type PanelSelectionRuleInput,
  type PanelToolRequest,
} from '@/lib/ozonbox/panel-tools-contract'

type SelectionNumberKey = Exclude<keyof PanelSelectionConditions, 'brandOption' | 'salesSchema'>
type SalesSchemaDraft = '__unset' | '' | 'FBO' | 'FBS'

interface SelectionConditionGroup {
  label: string
  min: SelectionNumberKey
  max: SelectionNumberKey
  minPlaceholder: string
  maxPlaceholder: string
  precision: 0 | 2
  maxForMin?: number
  maxForMax?: number
  addonBefore?: string
  addonAfter?: string
}

interface SelectionRuleDraft {
  name: string
  tag: string
  sort: number
  color?: string
  colorSet: boolean
  autoFavorite: boolean
  enabled: boolean
  conditions: PanelSelectionConditions
  salesSchema: SalesSchemaDraft
}

const props = defineProps<{
  rules: PanelSelectionRule[]
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:rules': [rules: PanelSelectionRule[]]
}>()

const SELECTION_CONDITION_GROUPS: SelectionConditionGroup[] = [
  { label: '月销量范围', min: 'soldCountMin', max: 'soldCountMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0 },
  { label: '月销售额范围', min: 'soldSumMin', max: 'soldSumMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, addonBefore: '¥' },
  { label: '价格范围', min: 'priceMin', max: 'priceMax', minPlaceholder: '最小价格', maxPlaceholder: '最大价格', precision: 0, addonBefore: '¥' },
  { label: '重量范围', min: 'weightMin', max: 'weightMax', minPlaceholder: '最小重量', maxPlaceholder: '最大重量', precision: 0, addonAfter: 'g' },
  { label: '上架时间', min: 'listedDaysMin', max: 'listedDaysMax', minPlaceholder: '最小天数', maxPlaceholder: '最大天数', precision: 0, addonAfter: '天' },
  { label: '月周转动态', min: 'salesDynamicsMin', max: 'salesDynamicsMax', minPlaceholder: '最小', maxPlaceholder: '最大', precision: 0, maxForMin: 100, maxForMax: 1000, addonAfter: '%' },
  { label: '广告费占比', min: 'drrMin', max: 'drrMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '参与促销天数', min: 'daysInPromoMin', max: 'daysInPromoMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, addonAfter: '天' },
  { label: '参与促销的折扣', min: 'discountMin', max: 'discountMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '促销活动的转化率', min: 'promoRevenueShareMin', max: 'promoRevenueShareMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '付费推广天数', min: 'daysWithTrafaretsMin', max: 'daysWithTrafaretsMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, addonAfter: '天' },
  { label: '商品卡浏览量', min: 'qtyViewPdpMin', max: 'qtyViewPdpMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0 },
  { label: '商品卡加购率', min: 'convToCartPdpMin', max: 'convToCartPdpMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '搜索目录浏览量', min: 'sessionCountSearchMin', max: 'sessionCountSearchMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0 },
  { label: '搜索目录加购率', min: 'convToCartSearchMin', max: 'convToCartSearchMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '展示转化率', min: 'convViewToOrderMin', max: 'convViewToOrderMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '退货取消率', min: 'cancelRateMin', max: 'cancelRateMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 100, maxForMax: 100, addonAfter: '%' },
  { label: '跟卖人数', min: 'sellerCountMin', max: 'sellerCountMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 0, maxForMin: 2000, maxForMax: 2000, addonAfter: '人' },
  { label: '跟卖最低价', min: 'minimumPriceFollowMin', max: 'minimumPriceFollowMax', minPlaceholder: '最小值', maxPlaceholder: '最大值', precision: 2 },
]

const editingRuleId = ref<number | null>(null)
const deletingRuleId = ref<number | null>(null)
const editorOpen = ref(false)
const operation = ref('')
const operationError = ref('')
const operationNotice = ref('')
const draft = ref<SelectionRuleDraft>(createRuleDraft())

const editorTitle = computed(() => editingRuleId.value === null ? '新增选品规则' : '编辑选品规则')

function createRuleDraft(rule?: PanelSelectionRule): SelectionRuleDraft {
  const conditions: PanelSelectionConditions = rule
    ? { ...rule.conditions }
    : { brandOption: 2 }
  return {
    name: rule?.name ?? '',
    tag: rule?.tag ?? '',
    sort: rule?.sort ?? 0,
    color: rule?.color,
    colorSet: Boolean(rule?.color),
    autoFavorite: rule?.autoFavorite ?? false,
    enabled: rule?.enabled ?? true,
    conditions,
    salesSchema: conditions.salesSchema ?? '__unset',
  }
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function showOperationNotice(message: string) {
  operationError.value = ''
  operationNotice.value = message
}

function showOperationError(reason: unknown) {
  operationNotice.value = ''
  operationError.value = errorMessage(reason)
}

async function requestPanelTool<T>(request: PanelToolRequest): Promise<T> {
  const response = await browser.runtime.sendMessage(request)
  return requirePanelToolData<T>(response).data
}

function openCreateEditor() {
  editingRuleId.value = null
  deletingRuleId.value = null
  draft.value = createRuleDraft()
  operationError.value = ''
  editorOpen.value = true
}

function openEditEditor(rule: PanelSelectionRule) {
  editingRuleId.value = rule.id
  deletingRuleId.value = null
  draft.value = createRuleDraft(rule)
  operationError.value = ''
  editorOpen.value = true
}

function closeEditor() {
  if (operation.value === 'submit') return
  editorOpen.value = false
  editingRuleId.value = null
}

function setCondition(key: SelectionNumberKey, event: Event) {
  const raw = (event.target as HTMLInputElement).value.trim()
  if (!raw) {
    delete draft.value.conditions[key]
    return
  }
  draft.value.conditions[key] = Number(raw)
}

function clearColor() {
  draft.value.colorSet = false
  draft.value.color = undefined
}

function setColorEnabled(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked
  draft.value.colorSet = enabled
  draft.value.color = enabled ? (draft.value.color ?? '#ffffff') : undefined
}

function selectionInputFromDraft(): PanelSelectionRuleInput {
  const name = draft.value.name.trim()
  const tag = draft.value.tag.trim()
  if (!name) throw new Error('请输入规则名称')
  if (name.length > 15) throw new Error('规则名称最多15个字符')
  if (!tag) throw new Error('请输入标签名称')
  if (tag.length > 6) throw new Error('标签名称最多6个字符')
  const sort = Number(draft.value.sort)
  if (!Number.isInteger(sort) || sort < 0 || sort > 100) throw new Error('优先级范围为0-100')
  const brandOption = Number(draft.value.conditions.brandOption)
  if (brandOption !== 0 && brandOption !== 1 && brandOption !== 2) throw new Error('品牌选项无效')

  const conditions: PanelSelectionConditions = { brandOption }
  for (const group of SELECTION_CONDITION_GROUPS) {
    const values = [
      { key: group.min, value: draft.value.conditions[group.min], maximum: group.maxForMin },
      { key: group.max, value: draft.value.conditions[group.max], maximum: group.maxForMax },
    ] as const
    for (const item of values) {
      if (item.value === undefined) continue
      const value = Number(item.value)
      if (!Number.isFinite(value) || value < 0 || (group.precision === 0 && !Number.isInteger(value))) {
        throw new Error(`${group.label}请输入有效的${group.precision === 0 ? '非负整数' : '非负数字'}`)
      }
      if (item.maximum !== undefined && value > item.maximum) throw new Error(`${group.label}不能大于${item.maximum}`)
      conditions[item.key] = value
    }
    const minimum = conditions[group.min]
    const maximum = conditions[group.max]
    if (minimum !== undefined && maximum !== undefined && minimum > maximum) throw new Error(`${group.label}最小值不能大于最大值`)
  }

  if (draft.value.salesSchema === 'FBO' || draft.value.salesSchema === 'FBS') conditions.salesSchema = draft.value.salesSchema
  const color = draft.value.colorSet ? draft.value.color?.trim() : undefined
  if (color && !/^#[\da-f]{6}$/i.test(color)) throw new Error('卡片背景颜色无效')
  return {
    name,
    tag,
    sort,
    color,
    autoFavorite: draft.value.autoFavorite,
    enabled: draft.value.enabled,
    conditions,
  }
}

async function submitRule() {
  operationError.value = ''
  operationNotice.value = ''
  operation.value = 'submit'
  try {
    const input = selectionInputFromDraft()
    const id = editingRuleId.value
    const savedRule = id === null
      ? await requestPanelTool<PanelSelectionRule>({ type: 'PANEL_SELECTION_CREATE', input })
      : await requestPanelTool<PanelSelectionRule>({ type: 'PANEL_SELECTION_UPDATE', id, input })
    const nextRules = id === null
      ? [...props.rules, savedRule]
      : props.rules.map(rule => rule.id === id ? savedRule : rule)
    emit('update:rules', nextRules)
    editorOpen.value = false
    editingRuleId.value = null
    showOperationNotice(id === null ? '规则已创建；如需用于本次采集，请在上方主动勾选。' : '规则已更新，本次启动配置已保留。')
  } catch (reason) {
    showOperationError(reason)
  } finally {
    operation.value = ''
  }
}

async function toggleRule(rule: PanelSelectionRule, enabled: boolean) {
  operationError.value = ''
  operationNotice.value = ''
  operation.value = `toggle-${rule.id}`
  try {
    const updatedRule = await requestPanelTool<PanelSelectionRule>({ type: 'PANEL_SELECTION_TOGGLE', id: rule.id, enabled })
    emit('update:rules', props.rules.map(item => item.id === rule.id ? updatedRule : item))
    showOperationNotice(enabled ? '规则已启用；本次采集仍需在上方主动勾选。' : '规则已禁用，并已从本次采集选择中移除。')
  } catch (reason) {
    showOperationError(reason)
  } finally {
    operation.value = ''
  }
}

async function deleteRule(id: number) {
  operationError.value = ''
  operationNotice.value = ''
  operation.value = `delete-${id}`
  try {
    await requestPanelTool<{ deleted: boolean }>({ type: 'PANEL_SELECTION_DELETE', id })
    emit('update:rules', props.rules.filter(rule => rule.id !== id))
    deletingRuleId.value = null
    showOperationNotice('规则已删除，并已从本次采集选择中移除。')
  } catch (reason) {
    showOperationError(reason)
  } finally {
    operation.value = ''
  }
}

async function saveRuleSettings() {
  operationError.value = ''
  operationNotice.value = ''
  operation.value = 'save'
  try {
    const enabledRules = props.rules.filter(rule => rule.enabled)
    await browser.storage.local.set({ [PANEL_SELECTION_RULES_STORAGE_KEY]: enabledRules })
    showOperationNotice(enabledRules.length ? `规则设置已保存，共启用 ${enabledRules.length} 条规则；本次启动配置已保留。` : '已清除所有启用规则设置。')
  } catch (reason) {
    showOperationError(reason)
  } finally {
    operation.value = ''
  }
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <section class="rules-manager" aria-label="选品规则管理">
    <div class="manager-heading">
      <div>
        <div class="manager-title">选品规则管理</div>
        <div class="manager-subtitle">新增、编辑、启停和删除均在启动页内完成</div>
      </div>
      <NButton size="tiny" type="primary" :disabled="loading || Boolean(operation)" @click="openCreateEditor">
        新增规则
      </NButton>
    </div>

    <NAlert v-if="operationError" type="error" closable :bordered="false" @close="operationError = ''">
      {{ operationError }}
    </NAlert>
    <NAlert v-if="operationNotice" type="success" closable :bordered="false" @close="operationNotice = ''">
      {{ operationNotice }}
    </NAlert>

    <p v-if="loading" class="empty-hint">正在读取全部选品规则…</p>
    <p v-else-if="rules.length === 0" class="empty-hint">暂无规则，可直接在这里新增。</p>
    <div v-else class="rule-cards">
      <article v-for="rule in rules" :key="rule.id" class="rule-card">
        <div class="rule-summary">
          <div class="rule-name-line">
            <strong>{{ rule.name }}</strong>
            <NTag size="tiny" :color="rule.color ? { color: rule.color, textColor: '#262626', borderColor: rule.color } : undefined">
              {{ rule.tag }}
            </NTag>
          </div>
          <div class="rule-meta">优先级 {{ rule.sort }} · 自动收藏 {{ rule.autoFavorite ? '是' : '否' }}</div>
          <div class="rule-meta">更新于 {{ formatUpdatedAt(rule.updatedAt) }}</div>
        </div>
        <div class="rule-controls">
          <NSwitch
            :value="rule.enabled"
            size="small"
            :loading="operation === `toggle-${rule.id}`"
            :disabled="Boolean(operation)"
            :aria-label="`${rule.name}是否启用`"
            @update:value="toggleRule(rule, $event)"
          />
          <NButton text type="primary" size="tiny" :disabled="Boolean(operation)" @click="openEditEditor(rule)">编辑</NButton>
          <NButton text type="error" size="tiny" :disabled="Boolean(operation)" @click="deletingRuleId = rule.id">删除</NButton>
        </div>
        <div v-if="deletingRuleId === rule.id" class="delete-confirm" role="alertdialog" aria-label="确认删除规则">
          <span>删除后无法恢复，确定吗？</span>
          <div>
            <NButton size="tiny" :disabled="Boolean(operation)" @click="deletingRuleId = null">取消</NButton>
            <NButton size="tiny" type="error" :loading="operation === `delete-${rule.id}`" @click="deleteRule(rule.id)">确定</NButton>
          </div>
        </div>
      </article>
    </div>

    <NButton block secondary size="small" :loading="operation === 'save'" :disabled="loading || Boolean(operation)" @click="saveRuleSettings">
      保存规则设置
    </NButton>

    <div v-if="editorOpen" class="editor-layer">
      <section class="rule-editor" role="dialog" aria-modal="true" :aria-label="editorTitle">
        <header class="editor-header">
          <strong>{{ editorTitle }}</strong>
          <button type="button" class="editor-close" aria-label="关闭规则编辑器" @click="closeEditor">×</button>
        </header>
        <div class="editor-body">
          <NAlert v-if="operationError" type="error" :bordered="false">{{ operationError }}</NAlert>

          <label class="field-label" for="popup-selection-name">规则名称 <span>*</span></label>
          <input id="popup-selection-name" v-model="draft.name" class="text-input" maxlength="15" placeholder="请输入规则名称">
          <div class="field-count">{{ draft.name.length }}/15</div>

          <label class="field-label" for="popup-selection-tag">标签名称 <span>*</span></label>
          <input id="popup-selection-tag" v-model="draft.tag" class="text-input" maxlength="6" placeholder="请输入标签名称">
          <div class="field-count">{{ draft.tag.length }}/6</div>

          <label class="field-label" for="popup-selection-sort">优先级</label>
          <input id="popup-selection-sort" v-model.number="draft.sort" class="text-input" type="number" min="0" max="100" step="1">
          <p class="field-help">0–100，数值越大，多规则命中时卡片颜色优先级越高。</p>

          <div class="field-label">卡片背景颜色</div>
          <div class="color-row">
            <input :checked="draft.colorSet" type="checkbox" @change="setColorEnabled">
            <input v-model="draft.color" type="color" :disabled="!draft.colorSet" aria-label="卡片背景颜色">
            <span>{{ draft.colorSet ? draft.color : '不设置' }}</span>
            <button v-if="draft.colorSet" type="button" class="text-action" @click="clearColor">清除</button>
          </div>

          <div class="field-label">是否自动收藏</div>
          <div class="radio-row">
            <label><input v-model="draft.autoFavorite" type="radio" :value="true"> 是</label>
            <label><input v-model="draft.autoFavorite" type="radio" :value="false"> 否</label>
          </div>

          <div class="field-label">是否启用</div>
          <div class="radio-row">
            <label><input v-model="draft.enabled" type="radio" :value="true"> 启用</label>
            <label><input v-model="draft.enabled" type="radio" :value="false"> 禁用</label>
          </div>

          <div class="field-label">品牌选项</div>
          <div class="radio-row wrap">
            <label><input v-model.number="draft.conditions.brandOption" type="radio" :value="1"> 有品牌</label>
            <label><input v-model.number="draft.conditions.brandOption" type="radio" :value="0"> 无品牌</label>
            <label><input v-model.number="draft.conditions.brandOption" type="radio" :value="2"> 不限</label>
          </div>

          <template v-for="group in SELECTION_CONDITION_GROUPS" :key="group.min">
            <label class="field-label">{{ group.label }}</label>
            <div class="range-row">
              <div class="range-control">
                <span v-if="group.addonBefore" class="addon">{{ group.addonBefore }}</span>
                <input
                  :name="group.min"
                  :value="draft.conditions[group.min] ?? ''"
                  class="range-input"
                  type="number"
                  min="0"
                  :max="group.maxForMin"
                  :step="group.precision === 0 ? 1 : 0.01"
                  :placeholder="group.minPlaceholder"
                  @input="setCondition(group.min, $event)"
                >
                <span v-if="group.addonAfter" class="addon">{{ group.addonAfter }}</span>
              </div>
              <span>—</span>
              <div class="range-control">
                <span v-if="group.addonBefore" class="addon">{{ group.addonBefore }}</span>
                <input
                  :name="group.max"
                  :value="draft.conditions[group.max] ?? ''"
                  class="range-input"
                  type="number"
                  min="0"
                  :max="group.maxForMax"
                  :step="group.precision === 0 ? 1 : 0.01"
                  :placeholder="group.maxPlaceholder"
                  @input="setCondition(group.max, $event)"
                >
                <span v-if="group.addonAfter" class="addon">{{ group.addonAfter }}</span>
              </div>
            </div>

            <template v-if="group.max === 'convViewToOrderMax'">
              <label class="field-label" for="popup-selection-sales-schema">发货模式</label>
              <select id="popup-selection-sales-schema" v-model="draft.salesSchema" class="text-input">
                <option value="__unset" disabled>请选择发货模式</option>
                <option value="">不限</option>
                <option value="FBO">FBO</option>
                <option value="FBS">FBS</option>
              </select>
            </template>
          </template>
        </div>
        <footer class="editor-footer">
          <NButton :disabled="operation === 'submit'" @click="closeEditor">取消</NButton>
          <NButton type="primary" :loading="operation === 'submit'" @click="submitRule">
            {{ editingRuleId === null ? '创建规则' : '保存修改' }}
          </NButton>
        </footer>
      </section>
    </div>
  </section>
</template>

<style scoped>
.rules-manager { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid #f0f0f0; }
.manager-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.manager-title { color: #262626; font-size: 12px; font-weight: 700; }
.manager-subtitle, .empty-hint { margin: 2px 0 0; color: #8c8c8c; font-size: 10px; line-height: 1.45; }
.rule-cards { display: flex; max-height: 210px; flex-direction: column; gap: 6px; overflow-y: auto; }
.rule-card { padding: 8px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fafafa; }
.rule-summary { min-width: 0; }
.rule-name-line { display: flex; align-items: center; gap: 6px; min-width: 0; }
.rule-name-line strong { overflow: hidden; color: #262626; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.rule-meta { margin-top: 3px; color: #8c8c8c; font-size: 10px; }
.rule-controls { display: flex; align-items: center; gap: 10px; margin-top: 7px; }
.delete-confirm { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 7px; padding-top: 7px; border-top: 1px solid #fee2e2; color: #b91c1c; font-size: 10px; }
.delete-confirm > div { display: flex; gap: 4px; }
.editor-layer { position: fixed; z-index: 1000; inset: 0; display: flex; justify-content: flex-end; background: rgb(0 0 0 / 40%); }
.rule-editor { display: flex; width: 100%; height: 100%; flex-direction: column; background: #fff; }
.editor-header, .editor-footer { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; border-bottom: 1px solid #eee; }
.editor-footer { justify-content: flex-end; border-top: 1px solid #eee; border-bottom: 0; }
.editor-close { width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: #595959; font-size: 22px; cursor: pointer; }
.editor-body { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 6px; overflow-y: auto; padding: 12px 14px 20px; }
.field-label { margin-top: 5px; color: #262626; font-size: 11px; font-weight: 600; }
.field-label span { color: #ef4444; }
.text-input, .range-input { box-sizing: border-box; height: 32px; min-width: 0; border: 1px solid #d9d9d9; border-radius: 6px; background: #fff; color: #262626; font-size: 12px; outline: none; }
.text-input { width: 100%; padding: 0 9px; }
.text-input:focus, .range-input:focus { border-color: #1677ff; box-shadow: 0 0 0 2px rgb(22 119 255 / 12%); }
.field-count { margin-top: -4px; color: #a3a3a3; font-size: 9px; text-align: right; }
.field-help { margin: -2px 0 0; color: #8c8c8c; font-size: 9px; line-height: 1.4; }
.color-row, .radio-row { display: flex; align-items: center; gap: 10px; color: #595959; font-size: 11px; }
.radio-row.wrap { flex-wrap: wrap; }
.color-row input[type='color'] { width: 38px; height: 28px; padding: 2px; border: 1px solid #d9d9d9; border-radius: 5px; }
.text-action { border: 0; background: transparent; color: #1677ff; font-size: 10px; cursor: pointer; }
.range-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 5px; }
.range-control { display: flex; min-width: 0; align-items: center; gap: 4px; }
.range-input { width: 100%; padding: 0 6px; }
.addon { color: #8c8c8c; font-size: 10px; }
</style>