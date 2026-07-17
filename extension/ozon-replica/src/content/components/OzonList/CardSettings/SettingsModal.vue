<template>
  <Teleport to="body">
    <div
      v-if="state.visible"
      class="mjgd_card_settings_mask is_open"
      @click.self="closeSettings"
    >
      <div
        class="mjgd_card_settings_dialog"
        :class="{ mjgd_card_settings_dialog_wide: isWideModal }"
        role="dialog"
        aria-modal="true"
      >
        <div class="mjgd_card_settings_header">
          <h3 class="mjgd_card_settings_title">偏好设置</h3>
          <span class="mjgd_card_settings_close_btn" @click="closeSettings">×</span>
        </div>

        <div class="mjgd_card_settings_body">
          <div class="mjgd_card_settings_tab_nav">
            <div
              class="mjgd_card_settings_tab_item"
              :class="{ is_active: state.activeTab === 'card' }"
              @click="state.activeTab = 'card'"
            >
              卡片字段配置
            </div>
            <div
              class="mjgd_card_settings_tab_item"
              :class="{ is_active: state.activeTab === 'selection' }"
              @click="state.activeTab = 'selection'"
            >
              选品设置
            </div>
            <div
              class="mjgd_card_settings_tab_item"
              :class="{ is_active: state.activeTab === 'autoCrawl' }"
              @click="onSwitchToAutoCrawl"
            >
              自动爬取设置
            </div>
            <div
              class="mjgd_card_settings_tab_item"
              :class="{ is_active: state.activeTab === 'calcConfig' }"
              @click="onSwitchToCalcConfig"
            >
              计算器配置
            </div>
          </div>

          <div class="mjgd_card_settings_tab_stage">
          <!-- Tab1：卡片字段拖拽排序与显隐 -->
          <div
            v-show="state.activeTab === 'card'"
            class="mjgd_card_settings_tab_content mjgd_card_settings_tab_card"
          >
            <div class="mjgd_card_settings_fields_panel">
              <div
                v-if="state.loading"
                class="mjgd_card_settings_fields_loading"
              >
                <span class="mjgd_card_settings_spinner" aria-hidden="true"></span>
                <span>加载中...</span>
              </div>
              <div class="mjgd_card_settings_tips">
                💡 拖拽调整字段顺序，关闭开关可隐藏对应字段
              </div>
              <ul class="mjgd_card_settings_field_list">
                <li
                  v-for="(field, index) in visibleCardFields"
                  :key="field.key"
                  class="mjgd_card_settings_field_item"
                  :class="{ is_dragging: dragFromIndex === index }"
                  draggable="true"
                  @dragstart="onDragStart(index)"
                  @dragover.prevent
                  @drop="onDrop(index)"
                >
                  <div class="mjgd_card_settings_field_left">
                    <span class="mjgd_card_settings_drag_icon">⋮⋮</span>
                    <span class="mjgd_card_settings_field_name">
                      {{ cardFieldDisplayLabel(field.key) }}
                    </span>
                  </div>
                  <label class="mjgd_card_settings_toggle_switch">
                    <input
                      type="checkbox"
                      :checked="field.visible !== false"
                      @change="
                        toggleCardFieldVisible(
                          field.key,
                          ($event.target as HTMLInputElement).checked,
                        )
                      "
                    />
                    <span class="mjgd_card_settings_slider"></span>
                  </label>
                </li>
              </ul>
              <div class="mjgd_card_settings_btn_group">
                <button
                  type="button"
                  class="mjgd_card_settings_btn mjgd_card_settings_btn_reset"
                  @click="resetCardFieldsOrder"
                >
                  恢复默认
                </button>
                <button
                  type="button"
                  class="mjgd_card_settings_btn mjgd_card_settings_btn_save"
                  :disabled="state.loading || state.saving"
                  @click="saveSettings"
                >
                  {{ state.saving ? '保存中...' : '保存配置' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Tab2：选品规则 -->
          <div
            v-show="state.activeTab === 'selection'"
            class="mjgd_card_settings_tab_content mjgd_card_settings_tab_selection"
          >
            <div class="mjgd_card_settings_selection_panel">
              <div class="mjgd_card_settings_selection_toolbar">
                <div
                  class="mjgd_card_settings_tips mjgd_card_settings_selection_toolbar_tip"
                >
                  💡 最多可设 {{ SELECTION_MAX_RULES }} 条选品规则，保存后在商品列表页自动显示标签
                </div>
                <button
                  type="button"
                  class="mjgd_card_settings_btn_add"
                  :disabled="state.selectionRules.length >= SELECTION_MAX_RULES"
                  @click="openNewSelectionRuleEditor"
                >
                  <span class="mjgd_card_settings_btn_add_icon">+</span>新增规则
                </button>
              </div>
              <div class="mjgd_card_settings_selection_table_wrap">
                <table class="mjgd_card_settings_selection_table">
                  <thead>
                    <tr>
                      <th class="mjgd_card_settings_selection_th">标签名称</th>
                      <th
                        class="mjgd_card_settings_selection_th mjgd_card_settings_selection_th_center"
                      >
                        是否启用
                      </th>
                      <th
                        class="mjgd_card_settings_selection_th mjgd_card_settings_selection_th_center"
                      >
                        优先级
                      </th>
                      <th
                        class="mjgd_card_settings_selection_th mjgd_card_settings_selection_th_center"
                      >
                        更新时间
                      </th>
                      <th
                        class="mjgd_card_settings_selection_th mjgd_card_settings_selection_th_center"
                      >
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(rule, idx) in state.selectionRules"
                      :key="String(rule.id || idx)"
                    >
                      <td class="mjgd_card_settings_selection_td">
                        {{ rule.tagName || '未命名' }}
                      </td>
                      <td
                        class="mjgd_card_settings_selection_td mjgd_card_settings_selection_td_center"
                      >
                        <label class="mjgd_card_settings_ant_switch">
                          <input
                            type="checkbox"
                            :checked="rule.enabled !== false"
                            @change="
                              toggleSelectionRuleEnabled(
                                idx,
                                ($event.target as HTMLInputElement).checked,
                              )
                            "
                          />
                          <span class="mjgd_card_settings_ant_switch_inner">
                            <span class="mjgd_card_settings_ant_switch_text">
                              {{ rule.enabled !== false ? '启用' : '禁用' }}
                            </span>
                          </span>
                        </label>
                      </td>
                      <td
                        class="mjgd_card_settings_selection_td mjgd_card_settings_selection_td_center"
                      >
                        {{ rule.priority }}
                      </td>
                      <td
                        class="mjgd_card_settings_selection_td mjgd_card_settings_selection_td_center"
                      >
                        {{ formatRuleUpdatedAt(rule.updatedAt) }}
                      </td>
                      <td
                        class="mjgd_card_settings_selection_td mjgd_card_settings_selection_td_center"
                      >
                        <div class="mjgd_card_settings_sel_actions">
                          <a
                            v-if="rule.id != null"
                            class="mjgd_card_settings_sel_edit"
                            @click="openEditSelectionRuleEditor(rule.id)"
                          >
                            编辑
                          </a>
                          <a
                            class="mjgd_card_settings_sel_delete"
                            @click="removeSelectionRule(idx)"
                          >
                            删除
                          </a>
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!state.selectionRules.length">
                      <td colspan="5" class="mjgd_card_settings_selection_table_empty">
                        暂无选品规则，可点击「新增规则」创建
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div class="mjgd_card_settings_selection_table_meta">
                  <span class="mjgd_card_settings_selection_count">
                    共 <strong>{{ state.selectionRules.length }}</strong> 条规则
                  </span>
                </div>
              </div>
              <div class="mjgd_card_settings_selection_footer">
                <button
                  type="button"
                  class="mjgd_card_settings_btn_default"
                  @click="closeSettings"
                >
                  取消
                </button>
                <button
                  type="button"
                  class="mjgd_card_settings_btn_primary"
                  :disabled="state.loading || state.saving"
                  @click="handleSelectionSave"
                >
                  {{ state.saving ? '保存中...' : '保存设置(规则生效)' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Tab3：自动爬取导出字段 -->
          <div
            v-show="state.activeTab === 'autoCrawl'"
            class="mjgd_card_settings_tab_content mjgd_card_settings_tab_auto"
          >
            <div class="mjgd_card_settings_auto_panel_wrap">
              <div class="mjgd_card_settings_auto_content">
                <div class="mjgd_card_settings_auto_panel">
                  <div class="mjgd_card_settings_auto_panel_title">
                    爬取数据导出设置
                  </div>
                  <div class="mjgd_card_settings_auto_panel_desc">
                    请选择需要导出的字段，数据爬取完成后自动导出为 XML 文件
                  </div>
                  <div class="mjgd_card_settings_auto_panel_tip">
                    温馨提示：选择项数量会影响导出速度
                  </div>

                  <!-- 爬取起始位置：仅新任务生效，不影响续爬/恢复上次位置 -->
                  <div class="mjgd_card_settings_auto_export_speed">
                    <div class="mjgd_card_settings_auto_export_speed_header">
                      <span class="mjgd_card_settings_auto_export_speed_title">
                        爬取起始位置
                      </span>
                      <div class="mjgd_card_settings_tooltip_wrap">
                        <div class="mjgd_card_settings_help_icon">?</div>
                        <div class="mjgd_card_settings_auto_export_speed_tooltip">
                          从页面顶部开始：先滚动到列表最顶部，从第一个商品完整采集，避免漏采顶部商品<br />
                          从当前视口开始：从你当前看到的第一个商品开始向下采集
                        </div>
                      </div>
                    </div>
                    <div
                      class="mjgd_card_settings_auto_field_grid mjgd_card_settings_auto_export_speed_options"
                    >
                      <label
                        v-for="opt in CRAWL_START_MODE_OPTIONS"
                        :key="opt.value"
                        class="mjgd_card_settings_auto_field_card mjgd_card_settings_auto_speed_option"
                        :class="{
                          is_active: state.crawlStartMode === opt.value,
                        }"
                      >
                        <span class="mjgd_card_settings_auto_field_label">
                          {{ opt.label }}
                        </span>
                        <span
                          class="mjgd_card_settings_auto_speed_mark"
                          aria-hidden="true"
                        ></span>
                        <input
                          v-model="state.crawlStartMode"
                          type="radio"
                          name="bcs_crawl_start_mode"
                          :value="opt.value"
                          class="mjgd_card_settings_auto_speed_radio"
                        />
                      </label>
                    </div>
                  </div>

                  <!-- 爬取模式：控制列表滚动采集步进间隔，仅存本地 -->
                  <div class="mjgd_card_settings_auto_export_speed">
                    <div class="mjgd_card_settings_auto_export_speed_header">
                      <span class="mjgd_card_settings_auto_export_speed_title">
                        爬取模式
                      </span>
                    </div>
                    <div
                      class="mjgd_card_settings_auto_field_grid mjgd_card_settings_auto_export_speed_options mjgd_card_settings_auto_crawl_scroll_options"
                    >
                      <label
                        v-for="opt in CRAWL_SCROLL_MODE_OPTIONS"
                        :key="opt.value"
                        class="mjgd_card_settings_auto_field_card mjgd_card_settings_auto_speed_option mjgd_card_settings_auto_speed_option_with_hint"
                        :class="{
                          is_active: state.crawlScrollMode === opt.value,
                        }"
                      >
                        <span class="mjgd_card_settings_auto_speed_option_row">
                          <span class="mjgd_card_settings_auto_field_label">
                            {{ opt.label }}
                          </span>
                          <span
                            class="mjgd_card_settings_auto_speed_mark"
                            aria-hidden="true"
                          ></span>
                        </span>
                        <span class="mjgd_card_settings_auto_speed_hint">
                          {{ opt.hint }}
                        </span>
                        <input
                          v-model="state.crawlScrollMode"
                          type="radio"
                          name="bcs_crawl_scroll_mode"
                          :value="opt.value"
                          class="mjgd_card_settings_auto_speed_radio"
                        />
                      </label>
                    </div>
                  </div>

                  <template
                    v-for="cat in AUTO_CRAWL_CATEGORIES"
                    :key="cat.key"
                  >
                    <div class="mjgd_card_settings_auto_module">
                      <div class="mjgd_card_settings_auto_module_header">
                        <div class="mjgd_card_settings_auto_module_title_wrap">
                          <div class="mjgd_card_settings_auto_module_title">
                            {{ cat.title }}
                          </div>
                          <div class="mjgd_card_settings_auto_module_subtitle">
                            {{ cat.desc }}
                          </div>
                        </div>
                        <div
                          v-if="cat.showSelectAll"
                          class="mjgd_card_settings_auto_module_actions"
                        >
                          <button
                            type="button"
                            class="mjgd_card_settings_auto_mini_btn"
                            :class="{ is_disabled: isAutoCrawlCategoryCookieLocked(cat.key) }"
                            :disabled="isAutoCrawlCategoryCookieLocked(cat.key)"
                            @click="toggleAutoCrawlCategory(cat.key, true)"
                          >
                            全选
                          </button>
                          <button
                            type="button"
                            class="mjgd_card_settings_auto_mini_btn"
                            :class="{ is_disabled: isAutoCrawlCategoryCookieLocked(cat.key) }"
                            :disabled="isAutoCrawlCategoryCookieLocked(cat.key)"
                            @click="toggleAutoCrawlCategory(cat.key, false)"
                          >
                            取消全选
                          </button>
                        </div>
                      </div>
                      <div
                        v-if="getAutoCrawlCategoryCookieUi(cat.key) === 'loading'"
                        class="mjgd_card_settings_auto_cookie_loading"
                      >
                        <span class="mjgd_card_settings_spinner" aria-hidden="true"></span>
                        正在检测店铺Cookie可用性...
                      </div>
                      <div
                        v-else-if="getAutoCrawlCategoryCookieUi(cat.key) === 'tip'"
                        class="mjgd_card_settings_auto_cookie_tip"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" stroke="#f59e0b" stroke-width="2" fill="none" />
                          <line x1="12" y1="8" x2="12" y2="13" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" />
                          <circle cx="12" cy="16.5" r="1" fill="#f59e0b" />
                        </svg>
                        当前账号下没有有效的店铺Cookie，请至少给一个店铺添加Cookie后才可使用此模块
                      </div>
                      <div class="mjgd_card_settings_auto_module_body">
                        <div class="mjgd_card_settings_auto_field_grid">
                          <label
                            v-for="field in cat.fields"
                            :key="field.key"
                            class="mjgd_card_settings_auto_field_card"
                            :class="{
                              is_active: !!state.autoCrawlConfig[field.key],
                              is_disabled: isAutoCrawlCategoryCookieLocked(cat.key),
                            }"
                          >
                            <span class="mjgd_card_settings_auto_field_label">
                              {{ field.label }}
                            </span>
                            <input
                              type="checkbox"
                              class="mjgd_card_settings_auto_field_cb"
                              :checked="!!state.autoCrawlConfig[field.key]"
                              :disabled="isAutoCrawlCategoryCookieLocked(cat.key)"
                              @change="
                                toggleAutoCrawlField(
                                  field.key,
                                  ($event.target as HTMLInputElement).checked,
                                )
                              "
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    <div
                      v-if="cat.key === 'weight' && exportSpeedVisible"
                      class="mjgd_card_settings_auto_export_speed"
                    >
                      <div class="mjgd_card_settings_auto_export_speed_header">
                        <span class="mjgd_card_settings_auto_export_speed_title">
                          导出速度
                        </span>
                        <div class="mjgd_card_settings_tooltip_wrap">
                          <div class="mjgd_card_settings_help_icon">?</div>
                          <div class="mjgd_card_settings_auto_export_speed_tooltip">
                            稳速模式：基础导出速度，适合日常使用<br />
                            均衡模式：提升导出速度，速度与稳定性兼顾<br />
                            快速模式：导出速度较快，但容易触发 Ozon 访问限制
                          </div>
                        </div>
                      </div>
                      <div
                        class="mjgd_card_settings_auto_field_grid mjgd_card_settings_auto_export_speed_options"
                      >
                        <label
                          v-for="(mode, key) in EXPORT_SPEED_MODES"
                          :key="key"
                          class="mjgd_card_settings_auto_field_card mjgd_card_settings_auto_speed_option"
                          :class="{
                            is_active: state.autoCrawlConfig.exportSpeedMode === key,
                          }"
                        >
                          <span class="mjgd_card_settings_auto_field_label">
                            {{ mode.label }}
                          </span>
                          <span
                            class="mjgd_card_settings_auto_speed_mark"
                            aria-hidden="true"
                          ></span>
                          <input
                            v-model="state.autoCrawlConfig.exportSpeedMode"
                            type="radio"
                            name="bcs_export_speed"
                            :value="key"
                            class="mjgd_card_settings_auto_speed_radio"
                          />
                        </label>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
            <div class="mjgd_card_settings_auto_footer">
              <div class="mjgd_card_settings_auto_footer_left">
                <button
                  type="button"
                  class="mjgd_card_settings_auto_btn mjgd_card_settings_auto_btn_danger"
                  @click="handleAutoCrawlReset"
                >
                  重置
                </button>
                <div class="mjgd_card_settings_auto_selected_info">
                  当前已选择
                  <strong>{{ autoCrawlSelectedCount }}</strong>
                  个导出字段
                </div>
              </div>
              <div class="mjgd_card_settings_auto_footer_right">
                <button
                  type="button"
                  class="mjgd_card_settings_auto_btn mjgd_card_settings_auto_btn_default"
                  @click="closeSettings"
                >
                  取消
                </button>
                <button
                  type="button"
                  class="mjgd_card_settings_auto_btn mjgd_card_settings_auto_btn_primary"
                  :disabled="state.loading || state.saving"
                  @click="saveSettings"
                >
                  ↓ 确认应用
                </button>
              </div>
            </div>
          </div>

          <!-- Tab4：计算器配置 -->
          <div
            v-show="state.activeTab === 'calcConfig'"
            class="mjgd_card_settings_tab_content mjgd_card_settings_tab_calc"
          >
            <div class="bcs-pcc-wrap">
              <div v-if="state.calcConfigLoading" class="bcs-pcc-loading">
                <span class="mjgd_card_settings_spinner" aria-hidden="true"></span>
                <span>加载中...</span>
              </div>
              <div v-else class="bcs-pcc-content">
                <h2 class="bcs-pcc-title">计算器配置</h2>
                <p class="bcs-pcc-desc">用于预设利润计算器的默认成本项、售价公式、利润率口径和物流匹配规则。</p>

                <!-- 详情页默认展开 + 售价展示 -->
                <div class="bcs-pcc-top-config-row">
                  <div class="bcs-pcc-top-config-item">
                    <span class="bcs-pcc-top-config-label">商品详情页默认展开</span>
                    <label class="bcs-pcc-switch">
                      <input type="checkbox" v-model="state.calcLocalPrefs.detailExpandDefault" />
                      <span class="bcs-pcc-switch-slider"></span>
                    </label>
                  </div>
                  <div class="bcs-pcc-top-config-item">
                    <span class="bcs-pcc-top-config-label">
                      售价展示
                      <span
                        class="bcs-pcc-help"
                        data-tip="实际售价：融合黑、绿规格价格计算，贴合真实价格；&#10;推荐售价：实际售价降低一定比例，适合一键上架。"
                      >?</span>
                    </span>
                    <select
                      v-model="state.calcLocalPrefs.priceDisplayMode"
                      class="bcs-pcc-select bcs-pcc-top-select"
                    >
                      <option value="actual">实际售价</option>
                      <option value="recommend">推荐售价</option>
                    </select>
                  </div>
                </div>

                <!-- 计算公式设置 -->
                <div class="bcs-pcc-sub-card">
                  <div class="bcs-pcc-sub-card-header">
                    <div>
                      <div class="bcs-pcc-sub-card-title">计算公式设置</div>
                      <div class="bcs-pcc-sub-card-desc">变量由页面自动获取，用户仅可修改公式系数和利润率计算公式</div>
                    </div>
                  </div>
                  <div class="bcs-pcc-formula-list">
                    <div class="bcs-pcc-formula-item">
                      <div class="bcs-pcc-formula-label">
                        实际售价计算公式
                        <span class="bcs-pcc-help" data-tip="实际售价按照采集到的黑色价格和绿色价格计算得出。">?</span>
                      </div>
                      <div class="bcs-pcc-formula-edit-row">
                        <span class="bcs-pcc-formula-static">（黑色价格 - 绿色价格）×</span>
                        <input
                          type="number"
                          class="bcs-pcc-formula-mini-input"
                          step="0.01"
                          min="0.01"
                          v-model.number="state.calcLocalPrefs.realPriceCoeff"
                          @input="limitDecimalInput($event, state.calcLocalPrefs, 'realPriceCoeff', { min: 0 })"
                        />
                        <span class="bcs-pcc-formula-static">+ 黑色价格</span>
                      </div>
                    </div>
                    <div class="bcs-pcc-formula-item">
                      <div class="bcs-pcc-formula-label">
                        推荐售价计算公式
                        <span class="bcs-pcc-help" data-tip="推荐售价是在实际售价基础上，下调一定比例，用于提供更有竞争力的展示价格。">?</span>
                      </div>
                      <div class="bcs-pcc-formula-edit-row">
                        <span class="bcs-pcc-formula-static">实际售价 ×</span>
                        <input
                          type="number"
                          class="bcs-pcc-formula-mini-input"
                          step="0.01"
                          min="0"
                          max="100"
                          v-model.number="state.calcLocalPrefs.recommendRatePct"
                          @input="limitDecimalInput($event, state.calcLocalPrefs, 'recommendRatePct', { min: 0, max: 100 })"
                        />
                        <span class="bcs-pcc-formula-static">%</span>
                      </div>
                    </div>
                    <div class="bcs-pcc-formula-item">
                      <div class="bcs-pcc-formula-label">
                        利润率计算方式
                        <span class="bcs-pcc-help" data-tip="可选择利润率展示口径，影响页面利润率展示结果。">?</span>
                      </div>
                      <select
                        v-model="state.calcLocalPrefs.profitMarginMode"
                        class="bcs-pcc-select bcs-pcc-formula-select"
                      >
                        <option value="cost">利润 ÷ 总成本</option>
                        <option value="price">利润 ÷ 售价</option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- 基础费用预设 -->
                <div class="bcs-pcc-card">
                  <div class="bcs-pcc-card-header">
                    <div>
                      <div class="bcs-pcc-card-title">基础费用预设</div>
                    </div>
                  </div>
                  <div class="bcs-pcc-form-grid bcs-pcc-form-grid--single">
                    <div class="bcs-pcc-form-item">
                      <label class="bcs-pcc-label">
                        <span><span class="bcs-pcc-required">*</span>国内运费 + 代贴单</span>
                        <span class="bcs-pcc-help" data-tip="国内运输、揽收及代贴单等费用总和，按单件成本填写。">?</span>
                      </label>
                      <div class="bcs-pcc-input-wrap">
                        <input
                          type="number"
                          class="bcs-pcc-input bcs-pcc-input--has-suffix"
                          min="0"
                          step="0.01"
                          placeholder="请输入"
                          v-model.number="state.calcConfig.domesticCostCny"
                          @input="limitDecimalInput($event, state.calcConfig, 'domesticCostCny', { min: 0 })"
                        />
                        <span class="bcs-pcc-suffix">元</span>
                      </div>
                    </div>
                  </div>
                  <div class="bcs-pcc-subgroup">
                    <div class="bcs-pcc-subgroup-title">
                      经营成本占比<span class="bcs-pcc-subgroup-hint">（广告占比 + 其他占比）</span>
                    </div>
                    <div class="bcs-pcc-form-grid bcs-pcc-form-grid--two">
                      <div class="bcs-pcc-form-item">
                        <label class="bcs-pcc-label">
                          <span><span class="bcs-pcc-required">*</span>广告占比</span>
                          <span class="bcs-pcc-help" data-tip="广告成本占售价的比例，例如 5 表示广告费为售价的 5%。">?</span>
                        </label>
                        <div class="bcs-pcc-input-wrap">
                          <input
                            type="number"
                            class="bcs-pcc-input bcs-pcc-input--has-suffix"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="请输入"
                            v-model.number="state.calcConfig.adsRatePct"
                            @input="limitDecimalInput($event, state.calcConfig, 'adsRatePct', { min: 0, max: 100 })"
                          />
                          <span class="bcs-pcc-suffix">%</span>
                        </div>
                      </div>
                      <div class="bcs-pcc-form-item">
                        <label class="bcs-pcc-label">
                          <span><span class="bcs-pcc-required">*</span>其他占比</span>
                          <span class="bcs-pcc-help" data-tip="提现手续费、货损等其他成本占售价的比例。">?</span>
                        </label>
                        <div class="bcs-pcc-input-wrap">
                          <input
                            type="number"
                            class="bcs-pcc-input bcs-pcc-input--has-suffix"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="请输入"
                            v-model.number="state.calcConfig.otherRatePct"
                            @input="limitDecimalInput($event, state.calcConfig, 'otherRatePct', { min: 0, max: 100 })"
                          />
                          <span class="bcs-pcc-suffix">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="bcs-pcc-info-tip">
                    <span class="bcs-pcc-info-icon">i</span>
                    <span>商品的类目佣金、包裹重量、包裹体积将根据商品 SKU 匹配自动爬取。</span>
                  </div>
                </div>

                <!-- 默认物流商 -->
                <div class="bcs-pcc-card">
                  <div class="bcs-pcc-card-header">
                    <div>
                      <div class="bcs-pcc-card-title">默认物流商</div>
                      <div class="bcs-pcc-card-sub">所有卡片利润计算器默认使用此承运商进行运费试算，可在单个卡片里临时改。</div>
                    </div>
                  </div>
                  <div class="bcs-pcc-form-grid bcs-pcc-form-grid--single">
                    <div class="bcs-pcc-form-item">
                      <label class="bcs-pcc-label">
                        <span><span class="bcs-pcc-required">*</span>默认物流商</span>
                        <span class="bcs-pcc-help" data-tip="此处保存后，所有商品卡片利润计算器的物流商会同步切换并重新计算运费。">?</span>
                      </label>
                      <select v-model="state.calcConfig.defaultCarrier" class="bcs-pcc-select">
                        <option v-if="!state.calcCarrierDict.length" value="">--</option>
                        <option
                          v-for="o in state.calcCarrierDict"
                          :key="String(o.dictValue)"
                          :value="String(o.dictValue)"
                        >
                          {{ o.dictLabel || o.dictValue }}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>

                <!-- 物流配置（分类 -> 服务类型） -->
                <div class="bcs-pcc-card">
                  <div class="bcs-pcc-card-header">
                    <div>
                      <div class="bcs-pcc-card-title">物流配置</div>
                      <div class="bcs-pcc-card-sub">按物流分类预设默认运输方式，所有分类默认使用 Standard。</div>
                    </div>
                    <div class="bcs-pcc-tools">
                      <button
                        type="button"
                        class="bcs-pcc-ghost-btn"
                        @click="setAllCalcServiceType('Standard')"
                      >
                        全部 Standard
                      </button>
                      <button
                        type="button"
                        class="bcs-pcc-ghost-btn"
                        @click="setAllCalcServiceType('Economy')"
                      >
                        全部 Economy
                      </button>
                      <button
                        type="button"
                        class="bcs-pcc-ghost-btn"
                        @click="setAllCalcServiceType('Express')"
                      >
                        全部 Express
                      </button>
                    </div>
                  </div>
                  <table class="bcs-pcc-table">
                    <thead>
                      <tr>
                        <th style="width:55%">物流分类</th>
                        <th style="width:45%">物流类型</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-if="!state.calcConfig.categoryPrefs.length">
                        <td colspan="2" class="bcs-pcc-empty">暂无物流分类字典</td>
                      </tr>
                      <tr
                        v-for="pref in state.calcConfig.categoryPrefs"
                        :key="pref.logisticsCategory"
                      >
                        <td>
                          <div class="bcs-pcc-category-name">{{ pref.logisticsCategory }}</div>
                          <div
                            v-if="categoryRemark(pref.logisticsCategory)"
                            class="bcs-pcc-category-desc"
                          >
                            {{ categoryRemark(pref.logisticsCategory) }}
                          </div>
                        </td>
                        <td>
                          <select v-model="pref.defaultServiceType" class="bcs-pcc-select">
                            <option
                              v-for="o in serviceTypeOptionsFor(pref.defaultServiceType)"
                              :key="String(o.dictValue)"
                              :value="String(o.dictValue)"
                            >
                              {{ o.dictLabel || o.dictValue }}
                            </option>
                          </select>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div class="bcs-pcc-footer">
              <div class="bcs-pcc-footer-left">
                <button type="button" class="bcs-pcc-danger-btn" @click="handleCalcReset">
                  重置
                </button>
                <span class="bcs-pcc-count-text">
                  当前已配置
                  <strong>{{ state.calcConfig.categoryPrefs.length }}</strong>
                  个物流分类
                </span>
              </div>
              <div class="bcs-pcc-footer-right">
                <button type="button" class="bcs-pcc-cancel-btn" @click="closeSettings">
                  取消
                </button>
                <button
                  type="button"
                  class="bcs-pcc-primary-btn"
                  :disabled="state.calcConfigSaving"
                  @click="applyCalcConfig"
                >
                  {{ state.calcConfigSaving ? '保存中...' : '↓ 确认应用' }}
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  AUTO_CRAWL_CATEGORIES,
  buildDefaultAutoCrawlConfig,
  CRAWL_SCROLL_MODE_OPTIONS,
  CRAWL_START_MODE_OPTIONS,
  DEFAULT_CRAWL_SCROLL_MODE,
  DEFAULT_CRAWL_START_MODE,
  EXPORT_SPEED_MODES,
  isExportSpeedVisible as checkExportSpeedVisible,
  countCheckedAutoCrawlFields,
} from '../../../utils/ozonBatchCrawl/autoCrawlFields'
import {
  activateSelectionRulesFromSettings,
  applyCalcConfig,
  applyCookieStateToAutoCrawl,
  cardFieldDisplayLabel,
  closeSettings,
  formatRuleUpdatedAt,
  getAutoCrawlCategoryCookieUi,
  isAutoCrawlCategoryCookieLocked,
  loadCalcConfigTabIfNeeded,
  moveCardField,
  openEditSelectionRuleEditor,
  openNewSelectionRuleEditor,
  removeSelectionRule,
  resetCalcConfigForm,
  resetCardFieldsOrder,
  saveSettings,
  setAllCalcServiceType,
  settingsState as state,
  switchToAutoCrawlTab,
  toggleAutoCrawlCategory,
  toggleAutoCrawlField,
  toggleCardFieldVisible,
  toggleSelectionRuleEnabled,
  visibleCardFieldsForSettings,
} from '../../../utils/ozonCardSettings/settingsController'
import { SELECTION_MAX_RULES } from '../../../utils/ozonCardSettings/selectionRulesApi'
import type { DictItem } from '../../../utils/ozonProfitCalc/profitCalcApi'

const dragFromIndex = ref(-1)

const visibleCardFields = computed(() => visibleCardFieldsForSettings())

/**
 * 与旧版一致：「卡片字段配置」走窄版（450px），其他三个 tab 走宽版（800px）。
 * 旧版逻辑见 ozon_old/src/ozon/ozon/crawler.js Tab 切换处的 addClass/removeClass('bcs-modal-wide')。
 */
const isWideModal = computed(() => state.activeTab !== 'card')

const exportSpeedVisible = computed(() => checkExportSpeedVisible(state.autoCrawlConfig))

const autoCrawlSelectedCount = computed(() =>
  countCheckedAutoCrawlFields(state.autoCrawlConfig),
)

function onDragStart(index: number) {
  dragFromIndex.value = index
  state.dragFromIndex = index
}

function onDrop(toIndex: number) {
  const from = dragFromIndex.value
  if (from < 0 || from === toIndex) return
  const fromKey = visibleCardFields.value[from]?.key
  const toKey = visibleCardFields.value[toIndex]?.key
  if (!fromKey || !toKey) return
  const realFrom = state.cardFields.findIndex((f) => f.key === fromKey)
  const realTo = state.cardFields.findIndex((f) => f.key === toKey)
  moveCardField(realFrom, realTo)
  dragFromIndex.value = -1
  state.dragFromIndex = -1
}

/**
 * 对齐旧版 #bcs_selection_save：从后端拉最新规则 → 写本地缓存 → 关弹窗 → location.reload()。
 * 旧版选择刷新页面而不是局部重打，是因为卡片数据要等接口逐个回填，
 * 直接 reload 让所有卡片从头按"最新规则 + 已落库数据"重渲，最可靠。
 */
async function handleSelectionSave() {
  await activateSelectionRulesFromSettings()
  closeSettings()
  // 微延时确保 closeSettings 的状态更新落地后再刷新，避免 reload 时偶发的事件丢失
  setTimeout(() => {
    window.location.reload()
  }, 0)
}

function handleAutoCrawlReset() {
  state.autoCrawlConfig = buildDefaultAutoCrawlConfig()
  state.crawlStartMode = DEFAULT_CRAWL_START_MODE
  state.crawlScrollMode = DEFAULT_CRAWL_SCROLL_MODE
  applyCookieStateToAutoCrawl()
}

/**
 * 数字输入限制：截断到最多两位小数，并按需夹取最小/最大值（越界回填输入框），结果写回 state。
 * 百分比字段传 { min: 0, max: 100 }；普通金额/系数传 { min: 0 }。
 */
function limitDecimalInput(
  e: Event,
  obj: Record<string, any>,
  key: string,
  opts: { min?: number; max?: number; maxDecimals?: number } = {},
) {
  const maxDecimals = opts.maxDecimals ?? 2
  const el = e.target as HTMLInputElement
  let raw = el.value
  const dot = raw.indexOf('.')
  if (dot >= 0 && raw.length - dot - 1 > maxDecimals) {
    raw = raw.slice(0, dot + maxDecimals + 1)
    el.value = raw
  }
  if (raw === '' || raw === '-' || raw === '.') {
    obj[key] = undefined
    return
  }
  let num = Number(raw)
  if (!isFinite(num)) {
    obj[key] = undefined
    return
  }
  if (opts.min != null && num < opts.min) {
    num = opts.min
    el.value = String(num)
  }
  if (opts.max != null && num > opts.max) {
    num = opts.max
    el.value = String(num)
  }
  obj[key] = num
}

function onSwitchToCalcConfig() {
  state.activeTab = 'calcConfig'
  void loadCalcConfigTabIfNeeded()
}

function onSwitchToAutoCrawl() {
  switchToAutoCrawlTab()
}

function handleCalcReset() {
  if (
    !window.confirm(
      '确定将计算器配置全部重置？此操作仅影响本地表单，确认应用后才会保存到服务器。',
    )
  ) {
    return
  }
  resetCalcConfigForm()
}

/** 物流分类下方的中文描述（取自字典 remark/dictLabel） */
function categoryRemark(catVal: string): string {
  const cat = state.calcCategoryDict.find((c) => String(c.dictValue) === catVal)
  const remark =
    typeof cat?.remark === 'string' && cat.remark.trim() ? cat.remark.trim() : ''
  if (remark) return remark
  const label = cat?.dictLabel && cat.dictLabel.trim() ? cat.dictLabel.trim() : ''
  return label && label !== catVal ? label : ''
}

/** 物流类型下拉：字典为空时给三档兜底；保留服务端未在字典里的值 */
function serviceTypeOptionsFor(currentValue: string): DictItem[] {
  const list = state.calcServiceTypeDict
  if (!list.length) {
    return [
      { dictValue: 'Standard', dictLabel: 'Standard' },
      { dictValue: 'Economy', dictLabel: 'Economy' },
      { dictValue: 'Express', dictLabel: 'Express' },
    ]
  }
  const has = list.some((o) => String(o.dictValue || '') === currentValue)
  if (!has && currentValue) {
    return [{ dictValue: currentValue, dictLabel: currentValue }, ...list]
  }
  return list
}
</script>
