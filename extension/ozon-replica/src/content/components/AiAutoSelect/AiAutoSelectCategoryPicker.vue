<template>
  <div ref="root_ref" class="mjgd_ai_category_picker">
    <div class="mjgd_ai_category_picker_trigger_row">
      <button
        type="button"
        class="mjgd_ai_category_picker_unlimited_btn"
        :class="{ is_active: modelValue === UNLIMITED_CATEGORY }"
        @click="selectCategory(UNLIMITED_CATEGORY)"
      >
        不限类目
      </button>
      <div
        class="mjgd_ai_category_picker_trigger"
        :class="{ is_open: panel_open }"
        role="button"
        tabindex="0"
        @click="togglePanel"
        @keydown.enter.prevent="togglePanel"
      >
        <input
          class="mjgd_ai_category_picker_input"
          type="text"
          :value="display_text"
          placeholder="请选择类目"
          readonly
        />
        <span class="mjgd_ai_category_picker_arrow" aria-hidden="true">▼</span>
      </div>
    </div>

    <div v-if="panel_open" class="mjgd_ai_category_picker_panel">
      <div class="mjgd_ai_category_picker_sidebar">
        <div class="mjgd_ai_category_picker_sidebar_title">全部类目</div>
        <ul class="mjgd_ai_category_picker_main_list">
          <li
            v-for="(group, group_idx) in CATEGORY_1688_TREE"
            :key="group.id"
            class="mjgd_ai_category_picker_main_item"
            :class="{ is_hovered: active_group_idx === group_idx }"
            @mouseenter="onRowHover(group_idx)"
          >
            <button
              v-for="name in group.mains"
              :key="name"
              type="button"
              class="mjgd_ai_category_picker_main_name"
              :class="{ is_selected: modelValue === name }"
              @click.stop="selectCategory(name)"
            >
              {{ name }}
            </button>
          </li>
        </ul>
      </div>

      <div class="mjgd_ai_category_picker_content">
        <template v-if="active_group">
          <div
            v-for="section in active_group.sections"
            :key="section.title"
            class="mjgd_ai_category_picker_section_row"
          >
            <button
              type="button"
              class="mjgd_ai_category_picker_section_title"
              :class="{ is_selected: modelValue === section.title }"
              @click="selectCategory(section.title)"
            >
              {{ section.title }}
            </button>
            <div class="mjgd_ai_category_picker_section_items">
              <button
                v-for="item in section.items"
                :key="item"
                type="button"
                class="mjgd_ai_category_picker_section_item"
                :class="{ is_selected: modelValue === item }"
                @click="selectCategory(item)"
              >
                {{ item }}
              </button>
            </div>
          </div>
        </template>
        <div v-else class="mjgd_ai_category_picker_empty">请选择左侧主类目</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CATEGORY_1688_TREE } from '../../utils/aiAutoSelect/category1688'
import { UNLIMITED_CATEGORY } from '../../utils/aiAutoSelect/types'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}>()

const root_ref = ref<HTMLElement | null>(null)
const panel_open = ref(false)
/** 当前激活的主类目组：控制右侧子类目与左侧行背景高亮，打开面板时按已选类目恢复 */
const active_group_idx = ref(0)

const active_group = computed(() => CATEGORY_1688_TREE[active_group_idx.value] ?? null)

/** 根据已选类目名反查所属主类目组索引 */
function findGroupIdxByCategory(name: string): number {
  if (!name || name === UNLIMITED_CATEGORY) return 0

  for (let i = 0; i < CATEGORY_1688_TREE.length; i += 1) {
    const group = CATEGORY_1688_TREE[i]
    if (group.mains.includes(name)) return i
    for (const section of group.sections) {
      if (section.title === name) return i
      if (section.items.includes(name)) return i
    }
  }
  return 0
}

/** 鼠标移入主类目整行：切换左侧行背景高亮与右侧子类目 */
function onRowHover(group_idx: number) {
  active_group_idx.value = group_idx
}

/** 打开面板时按当前选中类目恢复主类目行高亮与右侧内容 */
function syncPanelStateOnOpen() {
  active_group_idx.value = findGroupIdxByCategory(props.modelValue)
}

const display_text = computed(() => {
  if (props.modelValue === UNLIMITED_CATEGORY) {
    return ''
  }
  return props.modelValue
})

function togglePanel() {
  panel_open.value = !panel_open.value
  if (panel_open.value) {
    syncPanelStateOnOpen()
  }
}

function selectCategory(name: string) {
  active_group_idx.value = findGroupIdxByCategory(name)
  emit('update:modelValue', name)
  emit('change', name)
  panel_open.value = false
}

/** 点击组件外部时关闭下拉面板 */
function handleClickOutside(e: MouseEvent) {
  if (!panel_open.value) return
  const root = root_ref.value
  if (root && !root.contains(e.target as Node)) {
    panel_open.value = false
  }
}

watch(panel_open, (open) => {
  if (open) {
    document.addEventListener('click', handleClickOutside, true)
  } else {
    document.removeEventListener('click', handleClickOutside, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside, true)
})
</script>

<style scoped lang="scss">
.mjgd_ai_category_picker {
  position: relative;
  width: 100%;
}

.mjgd_ai_category_picker_trigger_row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mjgd_ai_category_picker_unlimited_btn {
  flex-shrink: 0;
  height: 40px;
  padding: 0 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  white-space: nowrap;
}

.mjgd_ai_category_picker_unlimited_btn:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.mjgd_ai_category_picker_unlimited_btn.is_active {
  border-color: #ff6a00;
  color: #ff6a00;
  background: #fff7f0;
}

.mjgd_ai_category_picker_trigger {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  height: 40px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.mjgd_ai_category_picker_trigger.is_open {
  border-color: #ff6a00;
}

.mjgd_ai_category_picker_input {
  flex: 1;
  height: 100%;
  border: none;
  outline: none;
  padding: 0 32px 0 12px;
  font-size: 14px;
  color: #0f172a;
  background: transparent;
  cursor: pointer;
}

.mjgd_ai_category_picker_arrow {
  position: absolute;
  right: 12px;
  font-size: 10px;
  color: #94a3b8;
  pointer-events: none;
}

.mjgd_ai_category_picker_panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  height: 360px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.mjgd_ai_category_picker_sidebar {
  width: 200px;
  flex-shrink: 0;
  background: #f5f5f5;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mjgd_ai_category_picker_sidebar_title {
  padding: 10px 12px;
  font-size: 14px;
  font-weight: 700;
  color: #333;
  border-bottom: 1px solid #e8e8e8;
}

.mjgd_ai_category_picker_main_list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}

.mjgd_ai_category_picker_main_item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 4px;
  padding: 6px 10px;
  line-height: 22px;
  cursor: default;
  transition: background-color 0.15s ease;
}

.mjgd_ai_category_picker_main_item.is_hovered {
  background: #fff;
}

.mjgd_ai_category_picker_main_name {
  border: none;
  background: none;
  padding: 0 2px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  transition: color 0.15s ease;
}

/* 文字高亮：仅鼠标移入该按钮或已选中时 */
.mjgd_ai_category_picker_main_name:hover,
.mjgd_ai_category_picker_main_name.is_selected {
  color: #ff6a00;
}

.mjgd_ai_category_picker_content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  background: #fff;
}

.mjgd_ai_category_picker_section_row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #f0f0f0;
}

.mjgd_ai_category_picker_section_row:last-child {
  border-bottom: none;
}

.mjgd_ai_category_picker_section_title {
  flex-shrink: 0;
  width: 72px;
  border: none;
  background: none;
  padding: 2px 0;
  font-size: 13px;
  color: #333;
  text-align: left;
  cursor: pointer;
}

.mjgd_ai_category_picker_section_title:hover,
.mjgd_ai_category_picker_section_title.is_selected {
  color: #ff6a00;
}

.mjgd_ai_category_picker_section_items {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.mjgd_ai_category_picker_section_item {
  border: none;
  background: none;
  padding: 2px 0;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  white-space: nowrap;
}

.mjgd_ai_category_picker_section_item:hover,
.mjgd_ai_category_picker_section_item.is_selected {
  color: #ff6a00;
}

.mjgd_ai_category_picker_empty {
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
}
</style>
