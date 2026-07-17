<template>
  <div v-if="visible" class="mjgd_ai_auto_select_preview_overlay mjgd_plugin_overlay is_nested is_tier_nested" @click.self="emit('close')">
    <div class="mjgd_ai_auto_select_preview_box">
      <button type="button" class="mjgd_ai_auto_select_preview_close" @click="emit('close')">×</button>
      <img :src="imageUrl" alt="" class="mjgd_ai_auto_select_preview_img" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean
  imageUrl: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<style scoped lang="scss">
.mjgd_ai_auto_select_preview_overlay {
  display: flex;
  align-items: center;
  justify-content: center;
}

.mjgd_ai_auto_select_preview_box {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}

.mjgd_ai_auto_select_preview_close {
  position: absolute;
  top: -36px;
  right: 0;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 28px;
  cursor: pointer;
}

.mjgd_ai_auto_select_preview_img {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
}
</style>
