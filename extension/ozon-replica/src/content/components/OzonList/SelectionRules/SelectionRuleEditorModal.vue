<template>
  <Teleport to="body">
    <div
      v-if="state.visible"
      class="mjgd_sel_edit_mask"
      @click.self="closeRuleEditor"
    >
      <div class="mjgd_sel_edit_modal" role="dialog" aria-modal="true">
        <div class="mjgd_sel_edit_header">
          <h4 class="mjgd_sel_edit_title">
            {{ state.isNew ? '新增选品规则' : '编辑选品规则' }}
          </h4>
          <button
            type="button"
            class="mjgd_sel_edit_close"
            aria-label="关闭"
            @click="closeRuleEditor"
          >
            ×
          </button>
        </div>

        <div class="mjgd_sel_edit_body">
          <div
            v-if="state.loading"
            class="mjgd_sel_edit_loading"
          >
            <span class="mjgd_sel_edit_spinner" aria-hidden="true"></span>
            <span class="mjgd_sel_edit_loading_text">加载中...</span>
          </div>

          <div class="mjgd_sel_edit_form mjgd_sel_edit_form_horizontal">
            <div class="mjgd_sel_edit_form_item">
              <label class="mjgd_sel_edit_form_label is_required">标签名称</label>
              <div class="mjgd_sel_edit_form_control">
                <span class="mjgd_sel_edit_input_affix mjgd_sel_edit_input_affix_tag">
                  <input
                    v-model="state.tagName"
                    type="text"
                    class="mjgd_sel_edit_input_affix_field"
                    maxlength="6"
                    placeholder="请输入标签名称，将在卡片中显示"
                  />
                  <span class="mjgd_sel_edit_input_affix_suffix" aria-hidden="true">
                    <span class="mjgd_sel_edit_show_count">
                      <span>{{ state.tagName.length }}</span> / 6
                    </span>
                  </span>
                </span>
              </div>
            </div>

            <div class="mjgd_sel_edit_form_item">
              <label class="mjgd_sel_edit_form_label">优先级</label>
              <div class="mjgd_sel_edit_form_control mjgd_sel_edit_priority_wrap">
                <input
                  v-model.number="state.priority"
                  type="number"
                  class="mjgd_sel_edit_input mjgd_sel_edit_input_num"
                  step="1"
                  min="0"
                  max="100"
                />
                <span class="mjgd_sel_edit_hint_wrap">
                  <span class="mjgd_sel_edit_hint">数值越大优先匹配</span>
                  <span
                    class="mjgd_sel_edit_priority_tooltip_wrap"
                    @mouseenter="showPriorityTip = true"
                    @mouseleave="showPriorityTip = false"
                  >
                    <span
                      class="mjgd_sel_edit_help_icon"
                      tabindex="0"
                      aria-label="优先级说明"
                      @focus="showPriorityTip = true"
                      @blur="showPriorityTip = false"
                    >?</span>
                    <div
                      v-show="showPriorityTip"
                      class="mjgd_sel_edit_priority_body_tip is_visible"
                      role="tooltip"
                    >
                      <p class="mjgd_sel_edit_priority_tip_main">
                        当商品命中多条规则时，卡片背景色以优先级高的规则为准。
                      </p>
                      <p>如不理解，保持默认即可。</p>
                    </div>
                  </span>
                </span>
              </div>
            </div>

            <div class="mjgd_sel_edit_form_item">
              <label class="mjgd_sel_edit_form_label">选品标签背景颜色</label>
              <div
                class="mjgd_sel_edit_form_control mjgd_sel_edit_color_wrap"
                :class="{ is_set: state.tagBgSet }"
              >
                <div class="mjgd_sel_edit_color_main">
                  <input
                    type="color"
                    :value="state.tagBgSet ? state.tagBg : '#ffffff'"
                    title="选择选品标签背景颜色"
                    @input="
                      setRuleEditorTagColor(
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                  <span class="mjgd_sel_edit_color_hint">
                    {{ state.tagBgSet ? state.tagBg : '不设置' }}
                  </span>
                  <button
                    v-if="state.tagBgSet"
                    type="button"
                    class="mjgd_sel_edit_color_clear"
                    @click="setRuleEditorTagColor('')"
                  >
                    清除
                  </button>
                </div>
                <div class="mjgd_sel_edit_color_presets">
                  <button
                    v-for="color in SELECTION_TAG_COLOR_PRESETS"
                    :key="color"
                    type="button"
                    class="mjgd_sel_edit_color_swatch"
                    :class="{
                      is_active: state.tagBgSet && state.tagBg === color,
                    }"
                    :style="{ backgroundColor: color }"
                    :title="color"
                    :aria-label="`标签颜色 ${color}`"
                    @click="setRuleEditorTagColor(color)"
                  />
                </div>
              </div>
            </div>

            <div class="mjgd_sel_edit_form_item">
              <label class="mjgd_sel_edit_form_label">品牌选项</label>
              <div class="mjgd_sel_edit_form_control mjgd_sel_edit_radio_group">
                <label class="mjgd_sel_edit_radio">
                  <input v-model="state.brand" type="radio" value="has" />有品牌
                </label>
                <label class="mjgd_sel_edit_radio">
                  <input v-model="state.brand" type="radio" value="none" />无品牌
                </label>
                <label class="mjgd_sel_edit_radio">
                  <input v-model="state.brand" type="radio" value="any" />不限
                </label>
              </div>
            </div>

            <div class="mjgd_sel_edit_form_item">
              <label class="mjgd_sel_edit_form_label">发货模式</label>
              <div class="mjgd_sel_edit_form_control">
                <select v-model="state.shipMode" class="mjgd_sel_edit_select">
                  <option
                    v-for="opt in SELECTION_SHIP_MODE_OPTIONS"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>

            <div
              v-for="spec in SELECTION_ALL_RANGE_SPECS"
              :key="spec.inputId"
              class="mjgd_sel_edit_form_item"
            >
              <label class="mjgd_sel_edit_form_label">
                {{ spec.formLabel || `${spec.label}范围` }}
              </label>
              <div class="mjgd_sel_edit_form_control mjgd_sel_edit_range">
                <span class="mjgd_sel_edit_input_group">
                  <span
                    v-if="spec.unitPrefix"
                    class="mjgd_sel_edit_input_group_addon mjgd_sel_edit_input_group_addon_before"
                  >
                    {{ spec.unitPrefix }}
                  </span>
                  <input
                    type="number"
                    class="mjgd_sel_edit_input_group_field"
                    :placeholder="spec.placeholderMin || '最小值'"
                    :value="getRangeFilterValue(spec, 'min')"
                    @input="
                      setRangeFilterValue(
                        spec,
                        'min',
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                  <span
                    v-if="spec.unitSuffix"
                    class="mjgd_sel_edit_input_group_addon mjgd_sel_edit_input_group_addon_after"
                  >
                    {{ spec.unitSuffix }}
                  </span>
                </span>
                <span class="mjgd_sel_edit_range_sep">至</span>
                <span class="mjgd_sel_edit_input_group">
                  <span
                    v-if="spec.unitPrefix"
                    class="mjgd_sel_edit_input_group_addon mjgd_sel_edit_input_group_addon_before"
                  >
                    {{ spec.unitPrefix }}
                  </span>
                  <input
                    type="number"
                    class="mjgd_sel_edit_input_group_field"
                    :placeholder="spec.placeholderMax || '最大值'"
                    :value="getRangeFilterValue(spec, 'max')"
                    @input="
                      setRangeFilterValue(
                        spec,
                        'max',
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  />
                  <span
                    v-if="spec.unitSuffix"
                    class="mjgd_sel_edit_input_group_addon mjgd_sel_edit_input_group_addon_after"
                  >
                    {{ spec.unitSuffix }}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="mjgd_sel_edit_footer">
          <button
            type="button"
            class="mjgd_sel_edit_btn_default"
            :disabled="state.saving"
            @click="closeRuleEditor"
          >
            取消
          </button>
          <button
            type="button"
            class="mjgd_sel_edit_btn_primary"
            :disabled="state.loading || state.saving"
            @click="saveRuleFromEditor"
          >
            {{ state.saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  SELECTION_ALL_RANGE_SPECS,
  SELECTION_SHIP_MODE_OPTIONS,
  SELECTION_TAG_COLOR_PRESETS,
} from '../../../utils/ozonSelectionRules'
import {
  closeRuleEditor,
  getRangeFilterValue,
  ruleEditorState as state,
  saveRuleFromEditor,
  setRangeFilterValue,
  setRuleEditorTagColor,
} from '../../../utils/ozonSelectionRules/ruleEditorController'

const showPriorityTip = ref(false)
</script>
