<template>
  <div v-if="visible" class="mjgd-overlay mjgd_plugin_overlay is_nested is_tier_inner">
    <div class="mjgd-media-modal">
      <div class="mjgd-modal-header">
        <div class="mjgd-header-title">
          <span class="mjgd-header-text">视频编辑</span>
        </div>
        <span class="mjgd-close-btn" @click="handleClose">&times;</span>
      </div>

      <div class="mjgd-modal-body">
        <div class="media-upload-content">
          <div class="media-info-tips">
            <div class="tip-row">
              <div class="tip-item"><span class="tip-label">格式：</span>MP4、MOV</div>
            </div>
            <div class="tip-row">
              <div class="tip-item"><span class="tip-label">大小：</span>不超过 20MB</div>
              <div class="tip-item"><span class="tip-label">时长：</span>不超过 30秒</div>
            </div>
          </div>

          <div class="upload-methods">
            <button type="button" class="mjgd-btn mjgd-upload-btn" @click="openFileSelect" :disabled="isUploading">{{ isUploading ? '上传中...' : '上传视频' }}</button>
            <span class="or-text">或</span>
            <div class="link-input-wrapper">
              <input type="text" v-model="mediaLinkInput" placeholder="粘贴链接地址" class="link-input" />
              <button type="button" v-if="mediaLinkInput" class="mjgd-btn mjgd-clear-link-btn" @click="handleClearLink">清除</button>
            </div>
          </div>

          <div class="media-preview-section" v-if="currentMediaUrl">
            <div class="video-preview-container">
              <video :src="currentMediaUrl" class="media-preview-video" controls></video>
            </div>
          </div>
        </div>

        <input ref="fileInput" type="file" :accept="VIDEO_ACCEPT" @change="handleFileChange" style="display: none" />
      </div>

      <div class="mjgd-modal-footer">
        <button class="mjgd-btn mjgd-cancel-btn" @click="handleClose" :disabled="isUploading">取 消</button>
        <button class="mjgd-btn mjgd-confirm-btn" @click="handleConfirm" :disabled="!currentMediaUrl || isUploading">确 认</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { apiService } from '../../utils/api'
import { Z } from '../styles/zIndex'

const props = defineProps<{
  visible: boolean
  value: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirm', url: string): void
  (e: 'preview', url: string): void
  (e: 'close'): void
}>()

const currentMediaUrl = ref('')
const mediaLinkInput = ref('')
const isUploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const VIDEO_ACCEPT = '.mp4,.mov,video/mp4,video/quicktime'
const MAX_VIDEO_SIZE_MB = 20
const MAX_VIDEO_DURATION_SECONDS = 30

const getVideoDuration = (file: File): Promise<number> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      video.removeAttribute('src')
    }

    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0
      cleanup()
      resolve(duration)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('视频时长读取失败'))
    }
    video.src = objectUrl
  })

watch(() => props.visible, (val) => {
  if (val) {
    currentMediaUrl.value = props.value || ''
    mediaLinkInput.value = props.value || ''
    isUploading.value = false
  }
})

watch(mediaLinkInput, (val) => {
  if (val && val.trim()) {
    currentMediaUrl.value = val.trim()
  }
})

const handleClose = () => {
  emit('update:visible', false)
  emit('close')
}

const openFileSelect = () => {
  fileInput.value?.click()
}

const validateFile = async (file: File): Promise<boolean> => {
  const fileName = file.name || ''
  const isVideo = /\.(mp4|mov)$/i.test(fileName)
  if (!isVideo) {
    showToast('仅支持上传视频文件（MP4、MOV）')
    return false
  }
  const fileSizeInMb = file.size / 1024 / 1024
  if (fileSizeInMb > MAX_VIDEO_SIZE_MB) {
    showToast(`视频大小不能超过 ${MAX_VIDEO_SIZE_MB}MB`)
    return false
  }
  try {
    const duration = await getVideoDuration(file)
    if (duration > MAX_VIDEO_DURATION_SECONDS) {
      showToast(`视频时长不能超过 ${MAX_VIDEO_DURATION_SECONDS}秒`)
      return false
    }
  } catch (error) {
    console.error('视频时长读取失败:', error)
    showToast('视频校验失败，请重新选择文件')
    return false
  }
  return true
}

const handleFileChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (!(await validateFile(file))) {
    target.value = ''
    return
  }

  isUploading.value = true

  try {
    const url = await apiService.uploadProductImage(file, file.name)
    currentMediaUrl.value = url
    mediaLinkInput.value = url
    showToast(`视频上传成功`)
  } catch (error) {
    console.error('上传失败:', error)
    showToast(`视频上传失败，请重试`)
  } finally {
    isUploading.value = false
    target.value = ''
  }
}

const handleClearLink = () => {
  const hadCommittedValue = Boolean((props.value || '').trim())

  mediaLinkInput.value = ''
  currentMediaUrl.value = ''

  // 编辑已有视频时，清除应直接回写父组件，避免当前行仍显示旧值。
  if (hadCommittedValue) {
    emit('confirm', '')
    handleClose()
  }
}

const handleConfirm = () => {
  if (!currentMediaUrl.value) {
    showToast('请先上传或粘贴链接')
    return
  }
  emit('confirm', currentMediaUrl.value)
  handleClose()
}

const showToast = (message: string) => {
  const toast = document.createElement('div')
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px 24px;
    border-radius: 4px;
    z-index: ${Z.TOAST};
    font-size: 14px;
    animation: fadeInOut 3s;
  `
  toast.textContent = message
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.remove()
  }, 3000)
}
</script>

<style scoped>
.mjgd-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
}

.mjgd-media-modal {
  width: 800px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

.mjgd-modal-header {
  padding: 12px 16px;
  background: #f5f5f5;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 8px 8px 0 0;
}

.mjgd-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mjgd-header-text {
  font-weight: bold;
  font-size: 16px;
}

.mjgd-close-btn {
  cursor: pointer;
  font-size: 24px;
  color: #999;
  line-height: 1;
}

.mjgd-close-btn:hover {
  color: #606266;
}

.mjgd-modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.mjgd-modal-footer {
  padding: 12px 16px;
  border-top: 1px solid #eee;
  text-align: right;
  background: #fafafa;
  border-radius: 0 0 8px 8px;
}

.mjgd-btn {
  box-sizing: border-box;
  height: 36px;
  padding: 0 24px;
  border-radius: 4px;
  border: none;
  font-size: 14px;
  line-height: 36px;
  cursor: pointer;
}

.mjgd-cancel-btn {
  background: #fff;
  border: 1px solid #ddd;
  margin-right: 8px;
  color: #606266;
  line-height: 34px;
}

.mjgd-confirm-btn {
  background: #409eff;
  color: white;
}

.mjgd-confirm-btn:hover:not(:disabled) {
  background: #66b1ff;
}

.mjgd-confirm-btn:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}

.mjgd-upload-btn {
  background: #409eff;
  color: white;
  padding: 0 20px;
}

.mjgd-upload-btn:hover:not(:disabled) {
  background: #66b1ff;
}

.mjgd-upload-btn:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}

.mjgd-clear-link-btn {
  background: #f56c6c;
  color: white;
  padding: 0 16px;
  white-space: nowrap;
}

.mjgd-clear-link-btn:hover {
  background: #f78989;
}

.media-upload-content {
  width: 100%;
}

.media-info-tips {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
  padding: 16px;
  background: #fafafa;
  border-radius: 6px;
  border: 1px solid #f0f0f0;
}

.tip-row {
  display: flex;
  gap: 24px;
}

.tip-item {
  font-size: 13px;
  color: #8c8c8c;
}

.tip-label {
  color: #595959;
  font-weight: 500;
}

.upload-methods {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.or-text {
  color: #8c8c8c;
  font-size: 14px;
}

.link-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.link-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.3s ease;
  box-sizing: border-box;
  height: 36px;
}

.link-input:focus {
  outline: none;
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.link-input::placeholder {
  color: #bfbfbf;
}

.media-preview-section {
  margin-top: 16px;
}

.video-preview-container {
  width: 100%;
  height: 360px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #e8e8e8;
  background: #000;
}

.media-preview-video {
  width: 100%;
  height: 100%;
  height: 360px;
  display: block;
}

@keyframes fadeInOut {

  0%,
  100% {
    opacity: 0;
  }

  10%,
  90% {
    opacity: 1;
  }
}
</style>
