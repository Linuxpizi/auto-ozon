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
            :loading="state.processing"
            :disabled="!state.editPrompt"
            style="margin-top: 8px"
            @click="executeEdit"
          >
            执行编辑
          </n-button>
        </div>

        <!-- Quick Actions (组合操作) -->
        <div class="panel-section">
          <div class="section-title">⚡ 快捷操作</div>
          <n-space :wrap="true" :size="[6, 6]">
            <n-button size="small" @click="setTool('brush')">🖌️ 涂鸦</n-button>
            <n-button size="small" @click="setTool('rect')">⬜ 框选</n-button>
            <n-button size="small" @click="addAction('remove_bg')">去背景</n-button>
            <n-button size="small" @click="addAction('upscale')">高清修复</n-button>
            <n-button size="small" @click="addAction('expand')">AI 扩图</n-button>
          </n-space>
          <div v-if="state.tool !== 'prompt'" style="margin-top: 8px">
            <n-space align="center" :size="8">
              <n-button size="tiny" @click="executeWithMask">执行</n-button>
              <n-button size="tiny" @click="addMaskAction">加入队列</n-button>
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
            @click="executeChain"
          >
            一键执行 ({{ state.actionQueue.length }} 步)
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
          <n-text v-else depth="3" style="font-size:12px">点击快捷操作或框选/涂鸦后加入队列</n-text>
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
  editImage,
  editChain,
  removeBackground as apiRemoveBg,
  expandImage as apiExpand,
  upscaleImage as apiUpscale,
  RESOLUTION_PRESETS,
  SIZE_RATIOS,
  calcOutputSize,
  OUTPUT_PRESETS,
  type EditAction,
  type VersionNode,
} from '../../api/image'
import { translateImage } from '../../api/ai'

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

const originalUrl = ref(props.imageUrl)

const state = reactive({
  currentImageUrl: props.imageUrl,
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

// Initialize first version
watch(
  () => props.imageUrl,
  (url) => {
    if (url) {
      originalUrl.value = url
      state.currentImageUrl = url
      state.versions = [
        {
          version_id: 'v0',
          description: '原图',
          file: '',
          url,
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

function addAction(type: EditAction['type']) {
  const action: EditAction = { type }
  if (type === 'prompt' && state.editPrompt) action.prompt = state.editPrompt
  if (type === 'expand') { action.direction = 'all'; action.expand_ratio = 0.5 }
  if (type === 'upscale') action.scale = 2
  state.actionQueue.push(action)
  message.success(`已添加: ${actionLabel(action)}`)
}

function addMaskAction() {
  if (!state.maskData && !state.selectionRect) {
    message.warning('请先在图片上涂鸦或框选区域')
    return
  }
  const type = state.tool as 'brush' | 'rect'
  const action: EditAction = {
    type: type === 'brush' ? 'brush' : 'rect',
    mask_data: state.maskData || undefined,
    bbox: state.selectionRect ? { x1: state.selectionRect.x, y1: state.selectionRect.y, x2: state.selectionRect.x + state.selectionRect.w, y2: state.selectionRect.y + state.selectionRect.h } : undefined,
    prompt: type === 'brush' ? 'Edit the brushed area naturally, matching surrounding texture and lighting.' : 'Remove the selected object, fill naturally matching surrounding background.',
  }
  state.actionQueue.push(action)
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
    const res = await editChain({
      image_url: state.currentImageUrl,
      actions: state.actionQueue,
      custom_width: currentOutputSize.value.width,
      custom_height: currentOutputSize.value.height,
      quality: state.outputQuality,
    })
    pushVersion(res.result_url, `组合操作 (${res.steps}步)`)
    state.currentImageUrl = res.result_url
    state.actionQueue.length = 0
    message.success(`组合操作完成 (${res.steps}步)`)
  } catch (e: any) {
    message.error('组合操作失败: ' + e.message)
  } finally {
    state.processing = false
  }
}

function onMaskReady(base64: string) {
  state.maskData = base64
}

function onSelectionReady(rect: { x: number; y: number; w: number; h: number }) {
  state.selectionRect = rect
}

async function executeEdit() {
  if (!state.editPrompt || state.processing) return
  state.processing = true
  try {
    const res = await editImage({
      image_url: state.currentImageUrl,
      prompt: state.editPrompt,
      mask: state.maskData || undefined,
      output_preset: currentOutputSize.value.preset,
      custom_width: currentOutputSize.value.width,
      custom_height: currentOutputSize.value.height,
      quality: state.outputQuality,
    })
    pushVersion(res.result_url, state.editPrompt)
    state.currentImageUrl = res.result_url
    state.editPrompt = ''
    state.maskData = null
    state.tool = 'prompt'
    message.success('编辑完成')
  } catch (e: any) {
    message.error('编辑失败: ' + e.message)
  } finally {
    state.processing = false
  }
}

async function removeBackground() {
  state.processing = true
  try {
    const res = await apiRemoveBg({
      image_url: state.currentImageUrl,
      bg_color: 'white',
      output_preset: currentOutputSize.value.preset,
    })
    pushVersion(res.result_url, '去背景')
    state.currentImageUrl = res.result_url
    message.success('去背景完成')
  } catch (e: any) {
    message.error('去背景失败: ' + e.message)
  } finally {
    state.processing = false
  }
}

async function upscaleImage() {
  state.processing = true
  try {
    const res = await apiUpscale({
      image_url: state.currentImageUrl,
      scale: 2,
      output_preset: currentOutputSize.value.preset,
    })
    pushVersion(res.result_url, '高清修复')
    state.currentImageUrl = res.result_url
    message.success('高清修复完成')
  } catch (e: any) {
    message.error('高清修复失败: ' + e.message)
  } finally {
    state.processing = false
  }
}

async function expandImage() {
  state.processing = true
  try {
    const res = await apiExpand({
      image_url: state.currentImageUrl,
      direction: 'all',
      expand_ratio: 0.5,
      output_preset: currentOutputSize.value.preset,
    })
    pushVersion(res.result_url, 'AI 扩图')
    state.currentImageUrl = res.result_url
    message.success('扩图完成')
  } catch (e: any) {
    message.error('扩图失败: ' + e.message)
  } finally {
    state.processing = false
  }
}

async function executeWithMask() {
  if (!state.maskData && !state.selectionRect) {
    message.warning('请先在图片上涂鸦或框选区域')
    return
  }

  let prompt = ''
  switch (state.tool) {
    case 'brush':
      prompt = 'Seamlessly remove the selected object. Fill the area naturally matching the surrounding background, texture, and lighting.'
      break
    case 'rect':
      prompt = 'Seamlessly remove the selected object. Fill the area naturally matching the surrounding background, texture, and lighting.'
      break
  }

  state.processing = true
  try {
    const res = await editImage({
      image_url: state.currentImageUrl,
      prompt,
      mask: state.maskData || undefined,
      output_preset: currentOutputSize.value.preset,
      custom_width: currentOutputSize.value.width,
      custom_height: currentOutputSize.value.height,
      quality: state.outputQuality,
    })
    pushVersion(res.result_url, state.tool === 'brush' ? '涂鸦编辑' : '框选编辑')
    state.currentImageUrl = res.result_url
    state.maskData = null
    state.selectionRect = null
    state.tool = 'prompt'
    canvasRef.value?.clearMask()
    message.success('编辑完成')
  } catch (e: any) {
    message.error('编辑失败: ' + e.message)
  } finally {
    state.processing = false
  }
}

function pushVersion(url: string, description: string) {
  const versionNum = state.versions.length
  const node: VersionNode = {
    version_id: `v${versionNum}`,
    description,
    file: '',
    url,
    prompt: state.editPrompt || null,
    timestamp: new Date().toISOString(),
    parent_version: state.versions[state.currentVersionIndex]?.version_id || null,
    output_size: currentOutputSize.value.preset,
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
  height: 100%;
  background: var(--bg-main, #1a1a2e);
  color: var(--text-primary, #e0e0e0);
  border-radius: 8px;
  overflow: hidden;
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
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 12px;
  position: relative;
  background: var(--bg-elevated, #16213e);
  min-width: 0;
}

.tool-panel {
  width: 260px;
  flex-shrink: 0;
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
