<template>
  <div class="image-editor">
    <!-- Header -->
    <div class="editor-header">
      <span class="editor-title">🖼️ 图片编辑器</span>
      <n-space align="center" :size="12">
        <n-space align="center" :size="6">
          <n-text depth="3" style="font-size:12px">分辨率:</n-text>
          <n-select
            v-model:value="state.resolution"
            :options="resolutionOptions"
            size="small"
            style="width: 130px"
          />
        </n-space>
        <n-space align="center" :size="6">
          <n-text depth="3" style="font-size:12px">比例:</n-text>
          <n-select
            v-model:value="state.sizeRatio"
            :options="sizeRatioOptions"
            size="small"
            style="width: 130px"
          />
        </n-space>
        <n-button size="small" quaternary @click="emit('close')">✕ 关闭</n-button>
      </n-space>
    </div>

    <div class="editor-body">
      <!-- Canvas Area -->
      <div class="canvas-area">
        <ImageCanvas
          ref="canvasRef"
          :image-url="state.currentImageUrl"
          :tool="canvasTool"
          :brush-size="state.brushSize"
          :zoom="state.zoom"
          @update:zoom="state.zoom = $event"
          @mask-ready="onMaskReady"
          @selection-ready="onSelectionReady"
          @clear-mask="state.maskData = null"
        />
        <!-- Compare slider -->
        <div v-if="state.showCompare && originalUrl" class="compare-overlay">
          <img :src="originalUrl" class="compare-img" />
          <img :src="state.currentImageUrl" class="compare-img compare-img--after" />
        </div>
      </div>

      <!-- Right Tool Panel -->
      <div class="tool-panel">
        <!-- Prompt Input -->
        <div class="panel-section">
          <div class="section-title">📝 自然语言编辑</div>
          <n-input
            v-model:value="state.editPrompt"
            type="textarea"
            placeholder="描述你要的编辑效果，例如：把背景换成纯白色..."
            :rows="3"
            :disabled="state.processing"
          />
          <n-button
            type="primary"
            block
            :disabled="!state.editPrompt || state.processing"
            style="margin-top: 8px"
            @click="addPromptAction"
          >
            加入组合队列
          </n-button>
        </div>

        <!-- Quick Actions (组合操作) -->
        <div class="panel-section">
          <div class="section-title">⚡ 快捷操作</div>
          <n-space :wrap="true" :size="[6, 6]">
            <n-button size="small" @click="setTool('brush')">🖌️ 涂鸦</n-button>
            <n-button size="small" @click="setTool('rect')">⬜ 框选</n-button>
            <n-button size="small" :disabled="state.processing || isActionQueued('remove_bg')" @click="addAction('remove_bg')">去背景</n-button>
            <n-button size="small" :disabled="state.processing || isActionQueued('upscale')" @click="addAction('upscale')">高清修复</n-button>
            <n-button size="small" :disabled="state.processing || isActionQueued('expand')" @click="addAction('expand')">AI 扩图</n-button>
          </n-space>
          <div v-if="state.tool !== 'prompt'" style="margin-top: 8px">
            <n-space align="center" :size="8">
              <n-button size="tiny" :disabled="state.processing || isQueueFull" @click="addMaskAction">加入队列</n-button>
              <n-button size="tiny" @click="clearTool">取消</n-button>
              <span v-if="state.tool === 'brush'" style="font-size: 12px; color: #999">
                画笔:
                <n-slider
                  v-model:value="state.brushSize"
                  :min="5"
                  :max="60"
                  :step="1"
                  style="width: 80px; display: inline-block"
                />
              </span>
            </n-space>
          </div>
        </div>

        <!-- 操作队列 -->
        <div class="panel-section">
          <div class="section-title">
            操作队列
            <n-badge v-if="state.actionQueue.length > 0" :value="state.actionQueue.length" :max="99" />
          </div>
          <div v-if="state.actionQueue.length > 0" class="action-queue">
            <div
              v-for="(action, i) in state.actionQueue"
              :key="i"
              class="action-item"
              :class="{ 'action-item--editing': false }"
            >
              <span class="action-icon">{{ actionIcon(action.type) }}</span>
              <span class="action-label">{{ actionLabel(action) }}</span>
              <n-button size="tiny" quaternary @click="removeAction(i)" style="padding:0 4px">✕</n-button>
            </div>
          </div>
          <n-button
            v-if="state.actionQueue.length > 0"
            type="primary"
            block
            size="small"
            :loading="state.processing"
            :disabled="state.processing"
            @click="executeChain"
          >
            一次请求执行 ({{ state.actionQueue.length }} 步)
          </n-button>
          <n-button
            v-if="state.actionQueue.length > 0"
            size="tiny"
            quaternary
            block
            @click="clearQueue"
            style="margin-top:4px"
          >
            清空队列
          </n-button>
          <n-text v-else depth="3" style="font-size:12px">先混合添加自然语言、快捷操作、框选/涂鸦，最后统一请求一次 AI 编辑</n-text>
          <n-text depth="3" style="font-size:11px; display:block; margin-top:4px">
            最多 {{ MAX_ACTION_QUEUE }} 步；去背景 / 高清修复 / AI 扩图每次组合仅允许加入一次。
          </n-text>
        </div>

        <!-- Output Settings -->
        <div class="panel-section">
          <div class="section-title">🎨 输出设置</div>
          <div class="setting-row">
            <span>质量:</span>
            <n-slider
              v-model:value="state.outputQuality"
              :min="50"
              :max="100"
              :step="5"
              style="flex: 1"
            />
            <span style="font-size: 12px; color: #666">{{ state.outputQuality }}%</span>
          </div>
        </div>

        <!-- Version Timeline -->
        <div class="panel-section">
          <div class="section-title">📜 版本历史</div>
          <div class="version-list">
            <div
              v-for="(v, i) in state.versions"
              :key="v.version_id"
              class="version-item"
              :class="{ 'version-item--active': i === state.currentVersionIndex }"
              @click="restoreVersion(i)"
            >
              <span class="version-dot" />
              <span class="version-label">{{ v.description }}</span>
            </div>
          </div>
          <n-space style="margin-top: 8px">
            <n-button
              size="tiny"
              :disabled="state.currentVersionIndex <= 0"
              @click="undo"
            >
              ↩️ 撤销
            </n-button>
            <n-button
              size="tiny"
              :disabled="state.currentVersionIndex >= state.versions.length - 1"
              @click="redo"
            >
              ↪️ 重做
            </n-button>
          </n-space>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="editor-footer">
      <n-button size="small" @click="state.showCompare = !state.showCompare">
        {{ state.showCompare ? '← 编辑后' : '← 原图对比' }}
      </n-button>
      <n-space :size="8">
        <n-button size="small" @click="downloadImage">📥 下载</n-button>
        <n-button type="primary" size="small" @click="applyToProduct">💾 应用到商品</n-button>
      </n-space>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { NInput, NButton, NSlider, NSpace, NSelect, NBadge, NText, useMessage } from 'naive-ui'
import ImageCanvas from './ImageCanvas.vue'
import {
  assetUrl,
  editChain,
  RESOLUTION_PRESETS,
  SIZE_RATIOS,
  OUTPUT_PRESETS,
  calcOutputSize,
  type EditAction,
  type VersionNode,
} from '../../api/image'

const props = defineProps({
  imageUrl: { type: String, required: true },
  productId: { type: [String, Number], default: null },
})

const emit = defineEmits<{
  (e: 'apply', url: string): void
  (e: 'close'): void
}>()

const message = useMessage()
const canvasRef = ref<InstanceType<typeof ImageCanvas>>()

const MAX_ACTION_QUEUE = 8
const SINGLETON_ACTION_TYPES = new Set<EditAction['type']>(['remove_bg', 'upscale', 'expand'])

function normalizeImageUrl(url: string): string {
  return assetUrl(url)
}

const originalUrl = ref(normalizeImageUrl(props.imageUrl))

const state = reactive({
  currentImageUrl: normalizeImageUrl(props.imageUrl),
  versions: [] as VersionNode[],
  currentVersionIndex: -1,
  tool: 'prompt' as 'prompt' | 'brush' | 'rect',
  editPrompt: '',
  maskData: null as string | null,
  selectionRect: null as { x: number; y: number; w: number; h: number } | null,
  brushSize: 20,
  resolution: '1k',
  sizeRatio: '3:4',
  outputQuality: 90,
  processing: false,
  zoom: 1,
  showCompare: false,
  // 组合操作队列
  actionQueue: [] as EditAction[],
})

const resolutionOptions = Object.entries(RESOLUTION_PRESETS).map(([key, v]) => ({
  label: v.label,
  value: key,
}))

const sizeRatioOptions = Object.entries(SIZE_RATIOS).map(([key, v]) => ({
  label: v.label,
  value: key,
}))

/** 计算当前分辨率+比例对应的实际尺寸 */
const currentOutputSize = computed(() => calcOutputSize(state.resolution, state.sizeRatio))

const canvasTool = computed(() => {
  if (state.tool === 'brush' || state.tool === 'rect') return state.tool
  return 'prompt'
})

const isQueueFull = computed(() => state.actionQueue.length >= MAX_ACTION_QUEUE)

// Initialize first version
watch(
  () => props.imageUrl,
  (url) => {
    if (url) {
      const normalizedUrl = normalizeImageUrl(url)
      originalUrl.value = normalizedUrl
      state.currentImageUrl = normalizedUrl
      state.versions = [
        {
          version_id: 'v0',
          description: '原图',
          file: '',
          url: normalizedUrl,
          prompt: null,
          timestamp: new Date().toISOString(),
          parent_version: null,
          output_size: '',
        },
      ]
      state.currentVersionIndex = 0
    }
  },
  { immediate: true }
)

function setTool(tool: 'prompt' | 'brush' | 'rect') {
  state.tool = tool
  state.maskData = null
  state.selectionRect = null
}

function clearTool() {
  state.tool = 'prompt'
  state.maskData = null
  state.selectionRect = null
  canvasRef.value?.clearMask()
}

// ── 组合操作队列 ─────────────────────────────────────────────────────

function actionIcon(type: string): string {
  const icons: Record<string, string> = { prompt: '📝', remove_bg: '🧹', brush: '🖌️', rect: '⬜', upscale: '🔍', expand: '🖼️' }
  return icons[type] || '⚡'
}

function actionLabel(a: EditAction): string {
  const labels: Record<string, string> = { prompt: '编辑', remove_bg: '去背景', brush: '涂鸦', rect: '框选', upscale: '高清修复', expand: 'AI 扩图' }
  const label = labels[a.type] || a.type
  return a.prompt ? `${label}: ${a.prompt.slice(0, 15)}` : label
}

function buildMaskPrompt(type: 'brush' | 'rect'): string {
  const prompt = state.editPrompt.trim()
  if (prompt) return prompt
  return type === 'brush'
    ? 'Edit the brushed area naturally, matching surrounding texture and lighting.'
    : 'Remove the selected object, fill naturally matching surrounding background.'
}

function defaultActionPrompt(type: EditAction['type']): string | undefined {
  const prompts: Partial<Record<EditAction['type'], string>> = {
    remove_bg: 'Remove the background completely and keep the product cleanly isolated for e-commerce listing.',
    upscale: 'Enhance image sharpness, clarity, and fine details while preserving the product appearance.',
    expand: 'Extend the image canvas naturally. Match the original lighting, perspective, colors, and product photography style.',
  }
  return prompts[type]
}

function isActionQueued(type: EditAction['type']): boolean {
  return state.actionQueue.some((action) => action.type === type)
}

function enqueueAction(action: EditAction): boolean {
  if (state.processing) return false
  if (isQueueFull.value) {
    message.warning(`组合队列最多支持 ${MAX_ACTION_QUEUE} 步，请先执行或清理队列`)
    return false
  }
  if (SINGLETON_ACTION_TYPES.has(action.type) && isActionQueued(action.type)) {
    message.warning(`${actionLabel(action)} 已在队列中，不能重复加入`)
    return false
  }
  state.actionQueue.push(action)
  return true
}

function resolveOutputPreset(): string {
  const ratioPresetMap: Record<string, string> = {
    '1:1': 'ozon_detail_sq',
    '3:4': 'ozon_main',
    '4:3': 'ozon_detail_h',
    '16:9': 'ozon_banner',
  }
  const preset = ratioPresetMap[state.sizeRatio] || 'ozon_main'
  return OUTPUT_PRESETS[preset] ? preset : 'ozon_main'
}

function normalizeErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const detail = (e as any).detail || (e as any).message
    if (typeof detail === 'string') return detail
    try { return JSON.stringify(detail || e) } catch { /* ignore */ }
  }
  return '未知错误'
}

function addAction(type: EditAction['type']) {
  const action: EditAction = { type }
  const prompt = state.editPrompt.trim() || defaultActionPrompt(type)
  if (prompt) action.prompt = prompt
  if (type === 'expand') { action.direction = 'all'; action.expand_ratio = 0.5 }
  if (type === 'upscale') action.scale = 2
  if (!enqueueAction(action)) return
  if (state.editPrompt.trim()) state.editPrompt = ''
  message.success(`已添加: ${actionLabel(action)}`)
}

function addPromptAction() {
  const prompt = state.editPrompt.trim()
  if (!prompt) return
  if (!enqueueAction({ type: 'prompt', prompt })) return
  state.editPrompt = ''
  message.success(`已添加: 编辑: ${prompt.slice(0, 15)}`)
}

function addMaskAction() {
  if (!state.maskData && !state.selectionRect) {
    message.warning('请先在图片上涂鸦或框选区域')
    return
  }
  const type = state.tool as 'brush' | 'rect'
  const prompt = buildMaskPrompt(type)
  const action: EditAction = {
    type: type === 'brush' ? 'brush' : 'rect',
    mask_data: state.maskData || undefined,
    bbox: state.selectionRect ? { x1: state.selectionRect.x, y1: state.selectionRect.y, x2: state.selectionRect.x + state.selectionRect.w, y2: state.selectionRect.y + state.selectionRect.h } : undefined,
    prompt,
  }
  if (!enqueueAction(action)) return
  state.editPrompt = ''
  state.maskData = null
  state.selectionRect = null
  canvasRef.value?.clearMask()
  message.success(`已添加: ${actionLabel(action)}`)
  state.tool = 'prompt'
}

function removeAction(index: number) {
  state.actionQueue.splice(index, 1)
}

function clearQueue() {
  state.actionQueue.length = 0
}

async function executeChain() {
  if (state.actionQueue.length === 0) return
  state.processing = true
  try {
    const actions = state.actionQueue.map((action) => ({ ...action }))
    const outputSize = currentOutputSize.value
    const res = await editChain({
      image_url: state.currentImageUrl,
      actions,
      output_preset: resolveOutputPreset(),
      custom_width: outputSize.width,
      custom_height: outputSize.height,
      quality: state.outputQuality,
    })
    const resultUrl = normalizeImageUrl(res.result_url)
    state.currentImageUrl = resultUrl
    pushVersion(resultUrl, `组合操作 (${res.steps}步 / ${res.ai_calls ?? '?'}次AI)`, res.version_id, res.final_prompt || actionSummary(actions), res.output_size)
    state.actionQueue.length = 0
    message.success(`组合操作完成 (${res.steps}步，${res.ai_calls ?? 1}次AI调用)`)
  } catch (e: any) {
    message.error('组合操作失败: ' + normalizeErrorMessage(e))
  } finally {
    state.processing = false
  }
}

function actionSummary(actions: EditAction[]): string {
  return actions
    .map((action) => action.prompt || actionLabel(action))
    .filter(Boolean)
    .join(' | ')
}

function onMaskReady(base64: string) {
  state.maskData = base64
}

function onSelectionReady(rect: { x: number; y: number; w: number; h: number }) {
  state.selectionRect = rect
}

function pushVersion(url: string, description: string, versionId?: string, prompt?: string | null, outputSize?: string) {
  const versionNum = state.versions.length
  const normalizedUrl = normalizeImageUrl(url)
  const node: VersionNode = {
    version_id: versionId || `local_v${versionNum}`,
    description,
    file: '',
    url: normalizedUrl,
    prompt: prompt || null,
    timestamp: new Date().toISOString(),
    parent_version: state.versions[state.currentVersionIndex]?.version_id || null,
    output_size: outputSize || currentOutputSize.value.preset,
  }
  // Truncate forward history
  state.versions = state.versions.slice(0, state.currentVersionIndex + 1)
  state.versions.push(node)
  state.currentVersionIndex = state.versions.length - 1
}

function undo() {
  if (state.currentVersionIndex > 0) {
    state.currentVersionIndex--
    state.currentImageUrl = state.versions[state.currentVersionIndex].url
  }
}

function redo() {
  if (state.currentVersionIndex < state.versions.length - 1) {
    state.currentVersionIndex++
    state.currentImageUrl = state.versions[state.currentVersionIndex].url
  }
}

function restoreVersion(index: number) {
  state.currentVersionIndex = index
  state.currentImageUrl = state.versions[index].url
}

function downloadImage() {
  const a = document.createElement('a')
  a.href = state.currentImageUrl
  a.download = `edited_image.png`
  a.click()
}

function applyToProduct() {
  emit('apply', state.currentImageUrl)
  message.success('已应用到商品')
}
</script>

<style scoped>
.image-editor {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--bg-main, #1a1a2e);
  color: var(--text-primary, #e0e0e0);
  border-radius: 8px;
  overflow: hidden;
  box-sizing: border-box;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
  background: var(--bg-elevated, #16213e);
  flex-shrink: 0;
}

.editor-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #e0e0e0);
}

.editor-body {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.canvas-area {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  overflow: hidden;
  padding: 12px;
  position: relative;
  background: var(--bg-elevated, #16213e);
  min-width: 0;
  min-height: 0;
}

.tool-panel {
  width: 260px;
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
  border-left: 1px solid var(--border-color, rgba(255,255,255,0.08));
  overflow-y: auto;
  padding: 12px;
  background: var(--bg-elevated, #16213e);
}

.panel-section {
  margin-bottom: 14px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary, #aaa);
  margin-bottom: 6px;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-primary, #e0e0e0);
}

.version-list {
  max-height: 200px;
  overflow-y: auto;
}

.version-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.version-item:hover {
  background: rgba(255,255,255,0.06);
}

.version-item--active {
  background: rgba(64,158,255,0.15);
  color: #409eff;
  font-weight: 600;
}

.version-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #555;
  flex-shrink: 0;
}

.version-item--active .version-dot {
  background: #409eff;
}

.action-queue {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 6px;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  background: rgba(255,255,255,0.04);
  margin-bottom: 2px;
}

.action-icon {
  flex-shrink: 0;
}

.action-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--border-color, rgba(255,255,255,0.08));
  background: var(--bg-elevated, #16213e);
  flex-shrink: 0;
}

.compare-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  background: #000;
  z-index: 10;
}

.compare-img {
  max-width: 50%;
  max-height: 100%;
  object-fit: contain;
}

.compare-img--after {
  border-left: 2px solid #409eff;
}
</style>
