<template>
  <div class="mjgd-ai-page-workbench" @click.outside="closeAllDropdowns">
    <div class="mjgd-ai-page-title">
      <div class="mjgd-ai-page-title-row">
        <div class="mjgd-ai-header-category">
          <span class="mjgd-ai-header-category-label">AI智选类目</span>
          <div class="mjgd-category-selector mjgd-category-selector-header">
            <div class="mjgd-category-selector-container mjgd-category-picker-input-wrap" :class="{ 'is-disabled': categorySelectorDisabled }" role="button" tabindex="0" @click="openCategoryDialog"
              @keydown.enter.prevent="openCategoryDialog">
              <input class="mjgd-category-picker-input" type="text" :value="selectedCategoryDisplayName" placeholder="请选择类目" readonly :disabled="categorySelectorDisabled" />
            </div>
          </div>

          <!-- 类目选择弹窗 -->
          <Teleport to="body">
            <div v-if="categoryDialogVisible" class="mjgd-category-dialog-layer mjgd_plugin_overlay is_nested is_tier_category" @click.self="closeCategoryDialog">
              <div class="mjgd-category-dialog">
                <div class="mjgd-category-dialog-header">
                  <div class="mjgd-category-dialog-title">类目选择</div>
                  <button type="button" class="mjgd-category-dialog-close" @click="closeCategoryDialog" title="关闭">×</button>
                </div>

                <div class="mjgd-category-dialog-body">
                  <!-- AI 智能帮选：来自当前默认下拉框数据 -->
                  <section class="mjgd-category-dialog-section">
                    <div class="mjgd-category-dialog-section-title">AI智能帮选</div>
                    <div class="mjgd-category-ai-list">
                      <button v-for="t in categoryTemplates" :key="t.id" type="button" class="mjgd-category-ai-pill" :class="{ active: pendingAiTemplate?.id === t.id }"
                        @click="selectPendingAiTemplate(t)" :title="t.name">{{ t.name }}</button>
                      <div v-if="categoryTemplates.length === 0" class="mjgd-category-ai-empty">暂无推荐类目</div>
                    </div>
                  </section>

                  <!-- 所有类目：树形 + 搜索 -->
                  <section class="mjgd-category-dialog-section">
                    <div class="mjgd-category-dialog-section-title">所有类目</div>
                    <div class="mjgd-category-tree-search">
                      <input v-model="categoryTreeFilterText" class="mjgd-category-tree-search-input" type="text" placeholder="类目名称、商品、类型" autocomplete="off" />
                    </div>
                    <div ref="categoryTreeWrapRef" class="mjgd-category-tree-wrap">
                      <div v-if="categoryTreeLoading" class="mjgd-category-tree-empty">正在加载类目数据...</div>
                      <div v-else-if="filteredCategoryTree.length === 0" class="mjgd-category-tree-empty">暂无类目数据</div>
                      <ul v-else class="mjgd-category-tree">
                        <CategoryTreeNode v-for="node in filteredCategoryTree" :key="node.id" :node="node" :level="1" :path="node.label" :level1-id="node.descriptionCategoryId ?? node.id" :level2-id="undefined"
                          :expanded-ids="expandedCategoryNodeIds" :active-leaf-id="selectedLeaf?.id ?? null" :filter-text="categoryTreeFilterText" @toggle="toggleCategoryNode" @pickLeaf="pickLeaf" />
                      </ul>
                    </div>
                  </section>
                </div>

                <div class="mjgd-category-dialog-footer">
                  <button type="button" class="mjgd-category-dialog-btn" @click="closeCategoryDialog">取 消</button>
                  <button type="button" class="mjgd-category-dialog-btn mjgd-category-dialog-btn-primary" :disabled="!pendingAiTemplate && !selectedLeaf" @click="confirmCategoryDialog">确 定</button>
                </div>
              </div>
            </div>
          </Teleport>
        </div>
        <div class="mjgd-ai-header-group">
          <!-- 恢复帮填信息按钮 -->
          <button class="mjgd-ai-execute-btn mjgd-ai-execute-btn-recover" @click="onGetExecuteResult" v-if="showExecuteRecover">
            <span class="mjgd-ai-execute-btn-icon" aria-hidden="true">
              <svg t="1777284225761" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1166" width="200" height="200">
                <path
                  d="M863.60644531 309.85595703l-118.57324219 118.57324219-46.66992187-46.70947266 95.19873047-95.23828125-95.23828125-95.23828125L745.03320313 144.57324219l141.9477539 141.90820312-23.33496094 23.33496094z"
                  fill="#999999" p-id="1167"></path>
                <path
                  d="M444.76367187 807.24658203h187.19384766v66.04980469H444.76367187a309.88037109 309.88037109 0 1 1 1e-8-619.76074219h355.95703124v66.04980469h-355.95703124a243.83056641 243.83056641 0 0 0-1e-8 487.66113281z"
                  fill="#999999" p-id="1168"></path>
              </svg>
            </span>
            恢复帮填信息
          </button>
          <!-- AI帮填信息按钮 -->
          <button class="mjgd-ai-execute-btn mjgd-ai-execute-btn-secondary" :class="{'mjgd-ai-execute-btn-loading': pipelineRunning && !isManualSelect && !waitingForCategoryChange}"
              :disabled="(pipelineRunning && !isManualSelect && !waitingForCategoryChange) || (isManualSelect && !categoryTemplate) || (waitingForCategoryChange && !categoryTemplate)"
              @click="onExecuteClick" v-if="showExecute">
            <span class="mjgd-ai-execute-btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M4 20h4l9.7-9.7a2.1 2.1 0 0 0 0-3L16.7 6a2.1 2.1 0 0 0-3 0L4 15.7V20Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <path d="m12.8 7 4.2 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            {{ executeButtonText }}
          </button>
          <!-- 上架至ozon按钮 -->
          <button class="mjgd-ai-execute-btn mjgd-ai-execute-btn-ozon" @click="onSubmitToOzonClick">
            <span class="mjgd-ai-execute-btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 5v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                <path d="m8.5 11.5 3.5 3.5 3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </span>
            上架至ozon
          </button>
        </div>
      </div>
    </div>

    <div class="mjgd-ai-config-section">
      <div class="mjgd-ai-options-row" :class="{ 'mjgd-ai-shop-select-disabled': pipelineRunning }">
        <div class="mjgd-ai-shop-select-section">
          <div class="mjgd-ai-shop-select-header">
            <div class="mjgd-ai-shop-select-title-row">
              <span class="mjgd-ai-shop-select-title-bar"></span>
              <label class="mjgd-ai-label">选择店铺</label>
              <!-- <span class="mjgd-ai-shop-select-tip">温馨提示：添加库存会在商品添加成功10分钟后执行！</span> -->
            </div>
            <label class="mjgd-ai-checkbox-label mjgd-ai-shop-select-all-label">
              <input type="checkbox" :checked="selectAllShops" @change="workbench.handleSelectAll()" :disabled="pipelineRunning" />
              <span>全选</span>
            </label>
          </div>
          <div v-if="!shops.length" class="mjgd-ai-shop-card-empty">暂无店铺</div>
          <div v-else class="mjgd-ai-shop-card-grid">
            <div v-for="shop in shops" :key="shop.id" class="mjgd-ai-shop-card" :class="{ is_selected: selectedShops.includes(shop.id) }">
              <div class="mjgd-ai-shop-card-head">
                <label class="mjgd-ai-checkbox-label mjgd-ai-shop-card-label">
                  <input type="checkbox" :value="shop.id" :checked="selectedShops.includes(shop.id)" @change="workbench.handleToggleShop(shop.id)" :disabled="pipelineRunning" />
                  <span class="mjgd-ai-shop-card-name">{{ shop.name }}</span>
                </label>
              </div>
              <template v-if="selectedShops.includes(shop.id)">
                <div class="mjgd-ai-shop-quota-list">
                  <span class="mjgd-ai-shop-quota-item"><span class="mjgd-ai-shop-quota-label">今日可创建：</span><span class="mjgd-ai-shop-quota-value">{{ getQuotaDisplay(shop.id, 'daily_create') }}</span></span>
                  <span class="mjgd-ai-shop-quota-item"><span class="mjgd-ai-shop-quota-label">今日可更新：</span><span class="mjgd-ai-shop-quota-value">{{ getQuotaDisplay(shop.id, 'daily_update') }}</span></span>
                  <span class="mjgd-ai-shop-quota-item"><span class="mjgd-ai-shop-quota-label">共计可创建：</span><span class="mjgd-ai-shop-quota-value">{{ getQuotaDisplay(shop.id, 'total') }}</span></span>
                </div>
                <div class="mjgd-ai-shop-card-controls">
                  <select class="mjgd-ai-shop-extra-select" :value="warehouseSelectValue(shop.id)" @change="onWarehouseSelectChange(shop.id, $event)" :disabled="pipelineRunning || isWarehouseLoading(shop.id)">
                    <option value="" v-if="warehouseSelectPlaceholder(shop.id)">{{ warehouseSelectPlaceholder(shop.id) }}</option>
                    <option v-for="w in warehousesForShop(shop.id)" :key="w.warehouse_id" :value="String(w.warehouse_id)">Ozon仓库名称：{{ w.name }}</option>
                  </select>
                  <div class="mjgd-ai-shop-stock-stepper">
                    <button type="button" class="mjgd-ai-shop-stepper-btn" :disabled="pipelineRunning" @click="adjustShopStock(shop.id, -1)">−</button>
                    <input type="text" inputmode="numeric" class="mjgd-ai-shop-extra-input" :value="getShopStockQuantity(shop.id)" :disabled="pipelineRunning" @input="onShopStockInput(shop.id, $event)" />
                    <button type="button" class="mjgd-ai-shop-stepper-btn" :disabled="pipelineRunning" @click="adjustShopStock(shop.id, 1)">+</button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mjgd-ai-product-basic">
      <div class="mjgd-ai-data-header">
        <span class="mjgd-ai-data-title">产品基础信息</span>
      </div>
      <div class="mjgd-ai-product-basic-body">
        <div class="mjgd-ai-product-basic-note">
          <div class="mjgd-ai-product-basic-note-title">商品标题已切换为按变体输出</div>
          <div class="mjgd-ai-product-basic-note-text">标题字段已进入下方变体表格中，每个变体可以单独填写。</div>
        </div>
        <div class="mjgd-ai-product-basic-field">
          <div class="mjgd-ai-product-basic-label-row">
            <label class="mjgd-ai-product-basic-label">描述</label>
            <span v-if="!isVariantField(DESCRIPTION_FIELD_KEY)" class="mjgd-ai-link-action" @click="switchDescriptionToVariant">按变体编辑</span>
          </div>
          <textarea v-if="!isVariantField(DESCRIPTION_FIELD_KEY)" :value="transformedData?.global_data?.description_clean_text ?? ''" class="mjgd-ai-product-basic-textarea"
            :class="{ 'is-error': getFeatureAttrError(FEATURE_ATTR_ID_DESCRIPTION) }" placeholder="输入描述" :disabled="pipelineRunning" @input="onProductBasicDescriptionInput"></textarea>
          <div v-else class="mjgd-ai-product-basic-note mjgd-ai-product-basic-note-compact">
            <div class="mjgd-ai-product-basic-note-title">描述已切换为按变体输出</div>
            <div class="mjgd-ai-product-basic-note-text">描述字段已进入下方变体表格中，每个变体可以单独填写。</div>
          </div>
        </div>
      </div>
    </div>

    <div class="mjgd-ai-feature-attr">
      <div class="mjgd-ai-feature-attr-header">
        <div class="mjgd-ai-feature-attr-title-row">
          <span class="mjgd-ai-feature-attr-title">特征属性</span>
        </div>
        <span v-if="categoryTemplate && featureAttrs.length > 0 && optionalAttrs.length > 0"
          class="mjgd-ai-feature-attr-expand" @click="featureAttrExpandAll = !featureAttrExpandAll">{{ featureAttrExpandAll ? "收起" : "展开全部" }}</span>
      </div>
      <div class="mjgd-ai-feature-attr-body">
      <template v-if="!categoryTemplate">
        <div class="mjgd-ai-feature-attr-empty">
          <template v-if="isDataLoading">
            <div class="mjgd_ai_data_loading"></div>
            <div class="mjgd-ai-loading-text">正在获取数据，请稍等...</div>
          </template>
          <template v-else>暂无属性，请先选择类目！</template>
        </div>
      </template>
      <template v-else-if="featureAttrLoading">
        <div class="mjgd-ai-feature-attr-loading">正在加载属性...</div>
      </template>
      <template v-else-if="featureAttrError">
        <div class="mjgd-ai-feature-attr-error">{{ featureAttrError }}</div>
      </template>
      <template v-else-if="visibleAttrs.length === 0">
        <div class="mjgd-ai-feature-attr-empty">暂无属性</div>
      </template>
      <template v-else>
        <div class="mjgd-ai-feature-attr-sections">
            <!-- 必填特征 -->
            <section v-if="requiredAttrs.length > 0" class="mjgd-ai-feature-attr-section">
              <h4 class="mjgd-ai-feature-attr-section-title mjgd-ai-feature-attr-section-required">
                <span class="mjgd-ai-feature-attr-dot">●</span> 必填特征
              </h4>
              <div class="mjgd-ai-feature-attr-grid">
                <div v-for="attr in requiredAttrs" :key="attr.id" class="mjgd-ai-feature-attr-row" :data-feature-attr-id="attr.id">
                  <label class="mjgd-ai-feature-attr-label" :data-ellipsis-full="attr.name" @mouseenter="onEllipsisTextEnter" @mouseleave="onEllipsisTextLeave">{{ attr.name }}</label>
                  <div class="mjgd-ai-feature-attr-cell">
                    <div class="mjgd-ai-feature-attr-cell-main">
                      <!-- 输入框 -->
                      <template v-if="attr.dictionary_id === 0">
                        <input type="text" class="mjgd-ai-feature-attr-input" :class="{ 'is-error': hasFeatureAttrError(attr.id) }" placeholder="请输入" :value="getFeatureAttrValue(attr.id)"
                          @input="onFeatureAttrInput(attr.id, $event)" />
                      </template>
                      <!-- 可搜索单选框 -->
                      <template v-else-if="(attr.dictionary_id ?? 0) !== 0 && !attr.is_collection">
                        <div class="mjgd-searchable-select searchable-select">
                          <div class="mjgd-ai-feature-attr-select select-input" :class="{
                            'is-open': showDropdownMap[attr.id],
                            'is-error': hasFeatureAttrError(attr.id),
                            'is-placeholder': !getFeatureAttrSingleLabel(attr),
                          }" @click.stop="toggleDropdown(attr.id)">{{ getFeatureAttrSingleLabel(attr) || '请选择' }}</div>
                          <div v-if="showDropdownMap[attr.id]" class="select-dropdown">
                            <!-- 搜索框：品牌走远程搜索，其他属性本地过滤 -->
                            <template v-if="isBrandFeatureAttr(attr)">
                              <input v-model="searchKeywordMap[attr.id]" placeholder="输入品牌名搜索" class="search-input" @click.stop @input="onBrandSearchInput(attr)" />
                              <div class="options">
                                <div v-if="brandRemoteLoadingMap[attr.id]" class="option-item option-item-none">搜索中...</div>
                                <template v-else>
                                  <div v-for="opt in getBrandSelectOptions(attr)" :key="opt.id" class="option-item" @click.stop="selectOption(attr.id, opt.id, opt.value)">{{ opt.value }}</div>
                                  <div v-if="getBrandSelectOptions(attr).length === 0" class="option-item option-item-none" @click.stop>{{ (searchKeywordMap[attr.id] || '').trim() ? '暂无匹配品牌' : '无匹配选项' }}</div>
                                </template>
                              </div>
                            </template>
                            <template v-else>
                              <input v-model="searchKeywordMap[attr.id]" placeholder="搜索选项" class="search-input" @click.stop />
                              <div class="options">
                                <div v-for="opt in filterOptions(attr.dictionary_values || [], attr.id)" :key="opt.id" class="option-item" @click.stop="selectOption(attr.id, opt.id, opt.value)">{{ opt.value }}</div>
                                <div v-if="filterOptions(attr.dictionary_values || [], attr.id).length === 0" class="option-item option-item-none" @click.stop="selectOption(attr.id)">无匹配选项</div>
                              </div>
                            </template>
                          </div>
                          <span class="mjgd-ai-feature-attr-multi-arrow" aria-hidden="true">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                          </span>
                        </div>
                      </template>
                      <!-- 多选框 -->
                      <template v-else>
                        <template v-if="attr.dictionary_values?.length">
                          <div class="mjgd-ai-feature-attr-multi">
                            <div class="mjgd-ai-feature-attr-multi-control" :class="{
                              'is-open': isMultiDropdownOpen(attr.id),
                              'is-error': hasFeatureAttrError(attr.id),
                            }" role="button" tabindex="0" @click.stop="toggleMultiDropdown(attr.id)">
                              <div class="mjgd-ai-feature-attr-multi-tags">
                                <template v-if="getFeatureAttrMultiValue(attr.id).length === 0">
                                  <span class="mjgd-ai-feature-attr-multi-placeholder">请选择（多选）</span>
                                </template>
                                <template v-else>
                                  <span v-for="sid in getFeatureAttrMultiValue(attr.id)" :key="String(attr.id) + '-' + sid" class="mjgd-ai-feature-attr-multi-tag" @click.stop>
                                    <span class="mjgd-ai-feature-attr-multi-tag-text" :data-ellipsis-full="getFeatureAttrOptionLabel(attr, sid)" @mouseenter="onEllipsisTextEnter"
                                      @mouseleave="onEllipsisTextLeave">{{ getFeatureAttrOptionLabel(attr, sid) }}</span>
                                    <button type="button" class="mjgd-ai-feature-attr-multi-tag-remove" title="移除" @click.stop="removeFeatureAttrMultiOption(attr.id, sid)">×</button>
                                  </span>
                                </template>
                              </div>
                              <span class="mjgd-ai-feature-attr-multi-arrow" aria-hidden="true">
                                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                                </svg>
                              </span>
                            </div>
                            <!-- 自定义的多选框 -->
                            <div v-if="isMultiDropdownOpen(attr.id)" class="mjgd-ai-feature-attr-multi-dropdown" @click.stop>
                              <input v-model="searchKeywordMap[attr.id]" placeholder="搜索选项" class="search-input" @click.stop />
                              <div v-for="opt in filterOptions(attr.dictionary_values || [], attr.id)" :key="opt.id" class="mjgd-ai-feature-attr-multi-option"
                                :class="{'is-selected': getFeatureAttrMultiValue(attr.id).includes(String(opt.id))}" role="option" @click="toggleFeatureAttrMultiOption(attr.id, String(opt.id))">
                                <span class="mjgd-ai-feature-attr-multi-check">{{ getFeatureAttrMultiValue(attr.id).includes(String(opt.id)) ? "✓" : "" }}</span>
                                <span class="mjgd-ai-feature-attr-multi-option-label" :data-ellipsis-full="opt.value" @mouseenter="onEllipsisTextEnter" @mouseleave="onEllipsisTextLeave">{{ opt.value }}</span>
                              </div>
                              <div v-if="filterOptions(attr.dictionary_values || [], attr.id).length === 0" class="mjgd-ai-feature-attr-multi-option option-item-none" @click.stop>无匹配选项</div>
                            </div>
                          </div>
                        </template>
                        <span v-else class="mjgd-ai-feature-attr-noopts">无可选项</span>
                      </template>
                      <span class="mjgd-ai-link-action mjgd-ai-feature-attr-action" @click="switchFeatureAttrToVariant(attr)">按变体编辑</span>
                    </div>
                    <div v-if="getFeatureAttrError(attr.id)" class="mjgd-ai-feature-attr-field-error">{{ getFeatureAttrError(attr.id) }}</div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 非必填特征（展开全部时显示） -->
            <section v-if="featureAttrExpandAll && optionalAttrs.length > 0" class="mjgd-ai-feature-attr-section">
              <h4 class="mjgd-ai-feature-attr-section-title mjgd-ai-feature-attr-section-optional">
                <span class="mjgd-ai-feature-attr-dot">●</span> 非必填特征
              </h4>
              <div class="mjgd-ai-feature-attr-grid">
                <div v-for="attr in optionalAttrs" :key="attr.id" class="mjgd-ai-feature-attr-row" :data-feature-attr-id="attr.id">
                  <label class="mjgd-ai-feature-attr-label mjgd-ai-feature-attr-label-optional" :data-ellipsis-full="attr.name" @mouseenter="onEllipsisTextEnter" @mouseleave="onEllipsisTextLeave">{{ attr.name }}</label>
                  <div class="mjgd-ai-feature-attr-cell">
                    <div class="mjgd-ai-feature-attr-cell-main">
                      <!-- 输入框 -->
                      <template v-if="attr.dictionary_id === 0">
                        <input type="text" class="mjgd-ai-feature-attr-input" :class="{ 'is-error': hasFeatureAttrError(attr.id) }" placeholder="请输入" :value="getFeatureAttrValue(attr.id)"
                          @input="onFeatureAttrInput(attr.id, $event)" />
                      </template>
                      <!-- 可搜索单选框 -->
                      <template v-else-if="(attr.dictionary_id ?? 0) !== 0 && !attr.is_collection">
                        <div class="mjgd-searchable-select searchable-select">
                          <div class="mjgd-ai-feature-attr-select select-input" :class="{
                            'is-open': showDropdownMap[attr.id],
                            'is-error': hasFeatureAttrError(attr.id),
                            'is-placeholder': !getFeatureAttrSingleLabel(attr),
                          }" @click.stop="toggleDropdown(attr.id)">{{ getFeatureAttrSingleLabel(attr) || '请选择' }}</div>
                          <div v-if="showDropdownMap[attr.id]" class="select-dropdown">
                            <!-- 搜索框 -->
                            <input v-model="searchKeywordMap[attr.id]" placeholder="搜索选项" class="search-input" @click.stop />
                            <!-- 选项列表 -->
                            <div class="options">
                              <div v-for="opt in filterOptions(attr.dictionary_values || [], attr.id)" :key="opt.id" class="option-item" @click.stop="selectOption(attr.id, opt.id, opt.value)">{{ opt.value }}</div>
                              <div v-if="filterOptions(attr.dictionary_values || [], attr.id).length === 0" class="option-item option-item-none" @click.stop="selectOption(attr.id)">无匹配选项</div>
                            </div>
                          </div>
                          <span class="mjgd-ai-feature-attr-multi-arrow" aria-hidden="true">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                          </span>
                        </div>
                      </template>
                      <!-- 多选框 -->
                      <template v-else>
                        <template v-if="attr.dictionary_values?.length">
                          <div class="mjgd-ai-feature-attr-multi">
                            <div class="mjgd-ai-feature-attr-multi-control" :class="{
                              'is-open': isMultiDropdownOpen(attr.id),
                              'is-error': hasFeatureAttrError(attr.id),
                            }" role="button" tabindex="0" @click.stop="toggleMultiDropdown(attr.id)">
                              <div class="mjgd-ai-feature-attr-multi-tags">
                                <template v-if="getFeatureAttrMultiValue(attr.id).length === 0">
                                  <span class="mjgd-ai-feature-attr-multi-placeholder">请选择（多选）</span>
                                </template>
                                <template v-else>
                                  <span v-for="sid in getFeatureAttrMultiValue(attr.id)" :key="String(attr.id) + '-' + sid" class="mjgd-ai-feature-attr-multi-tag" @click.stop>
                                    <span class="mjgd-ai-feature-attr-multi-tag-text" :data-ellipsis-full="getFeatureAttrOptionLabel(attr, sid)" @mouseenter="onEllipsisTextEnter"
                                      @mouseleave="onEllipsisTextLeave">{{ getFeatureAttrOptionLabel(attr, sid) }}</span>
                                    <button type="button" class="mjgd-ai-feature-attr-multi-tag-remove" title="移除" @click.stop="removeFeatureAttrMultiOption(attr.id, sid)">×</button>
                                  </span>
                                </template>
                              </div>
                              <span class="mjgd-ai-feature-attr-multi-arrow" aria-hidden="true">
                                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                                </svg>
                              </span>
                            </div>
                            <!-- 自定义的多选框 -->
                            <div v-if="isMultiDropdownOpen(attr.id)" class="mjgd-ai-feature-attr-multi-dropdown" @click.stop>
                              <input v-model="searchKeywordMap[attr.id]" placeholder="搜索选项" class="search-input" @click.stop />
                              <div v-for="opt in filterOptions(attr.dictionary_values || [], attr.id)" :key="opt.id" class="mjgd-ai-feature-attr-multi-option"
                                :class="{'is-selected': getFeatureAttrMultiValue(attr.id).includes(String(opt.id))}" role="option" @click="toggleFeatureAttrMultiOption(attr.id, String(opt.id))">
                                <span class="mjgd-ai-feature-attr-multi-check">{{ getFeatureAttrMultiValue(attr.id).includes(String(opt.id)) ? "✓" : "" }}</span>
                                <span class="mjgd-ai-feature-attr-multi-option-label" :data-ellipsis-full="opt.value" @mouseenter="onEllipsisTextEnter" @mouseleave="onEllipsisTextLeave">{{ opt.value }}</span>
                              </div>
                              <div v-if="filterOptions(attr.dictionary_values || [], attr.id).length === 0" class="mjgd-ai-feature-attr-multi-option option-item-none" @click.stop>无匹配选项</div>
                            </div>
                          </div>
                        </template>
                        <span v-else class="mjgd-ai-feature-attr-noopts">无可选项</span>
                      </template>
                      <span class="mjgd-ai-link-action mjgd-ai-feature-attr-action" @click="switchFeatureAttrToVariant(attr)">按变体编辑</span>
                    </div>
                    <div v-if="getFeatureAttrError(attr.id)" class="mjgd-ai-feature-attr-field-error">{{ getFeatureAttrError(attr.id) }}</div>
                  </div>
                </div>
              </div>
            </section>
        </div>
      </template>
      </div>
    </div>

    <div class="mjgd-ai-data-section">
      <div class="mjgd-ai-data-left">
        <div v-if="isDataLoading" class="mjgd-ai-loading-container">
          <div class="mjgd_ai_data_loading"></div>
          <div class="mjgd-ai-loading-text">正在获取数据，请稍等...</div>
        </div>
        <div v-else-if="transformedData && transformedData.sku_matrix" ref="tableContainerRef" class="mjgd-ai-table-container">
          <div class="mjgd-ai-product-list-header">
            <span class="mjgd-ai-product-list-title">商品列表</span>
            <div class="mjgd-ai-product-list-actions">
              <button type="button" class="mjgd-ai-action-btn mjgd-ai-action-btn-image" @click="goToImageQueue">
                <span class="mjgd-ai-action-btn-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 7h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-3"></path>
                    <path d="M3 16V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <path d="M8 11l2.5 2.5L14 10l3 4"></path>
                    <circle cx="9" cy="7.5" r="1"></circle>
                  </svg>
                </span>
                <span>图片处理中心</span>
              </button>
              <button type="button" class="mjgd-ai-action-btn mjgd-ai-action-btn-add" @click="onAddVariant">
                <span class="mjgd-ai-action-btn-icon">+</span>
                <span>添加变体</span>
              </button>
              <button type="button" class="mjgd-ai-action-btn mjgd-ai-action-btn-delete" @click="onBatchDelete">
                <span class="mjgd-ai-action-btn-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </span>
                <span>批量删除</span>
              </button>
            </div>
          </div>
          <!-- 列表区域 -->
          <div ref="skuTableScrollRef" class="mjgd-ai-sku-table-scroll" @wheel="onSkuTableWheel" @scroll="onSkuTableScroll">
            <table ref="skuTableRef" class="mjgd-ai-sku-table">
              <!-- 表头 -->
              <thead>
                <tr class="mjgd-ai-sku-tr-header">
                  <th class="mjgd-ai-sku-th-checkbox mjgd-ai-sku-sticky-col mjgd-ai-sku-sticky-col--checkbox">
                    <label class="mjgd-ai-sku-checkbox-label">
                      <input type="checkbox" :checked="selectedSkuIndices.length > 0 && selectedSkuIndices.length === (transformedData?.sku_matrix?.length ?? 0)"
                        :indeterminate="selectedSkuIndices.length > 0 && selectedSkuIndices.length < (transformedData?.sku_matrix?.length ?? 0)" @change="toggleSelectAllSku" />
                    </label>
                  </th>
                  <th class="mjgd-ai-sku-image-th mjgd-ai-sku-sticky-col mjgd-ai-sku-sticky-col--image">图片</th>
                  <th class="mjgd-ai-sku-name-th mjgd-ai-sku-sticky-col mjgd-ai-sku-sticky-col--name">
                    <div class="mjgd-ai-sku-th-inner">
                      <span class="mjgd-ai-sku-th-title">标题</span>
                      <span class="mjgd-ai-sku-th-action" @click="applySkuTitleFromFirstRow">一键同首行</span>
                    </div>
                  </th>
                  <th class="mjgd-ai-sku-th-with-action mjgd-ai-sku-video-th">
                    <div class="mjgd-ai-sku-th-inner">
                      <span class="mjgd-ai-sku-th-title">视频</span>
                      <span class="mjgd-ai-sku-th-action" @click="handleBatchVideo">一键同首行</span>
                    </div>
                  </th>
                  <!-- v-if="hasSkuJsonRichTextColumn" -->
                  <th class="mjgd-ai-sku-th-with-action mjgd-ai-sku-rich-text-th">
                    <div class="mjgd-ai-sku-th-inner">
                      <span class="mjgd-ai-sku-th-title">富文本</span>
                      <span class="mjgd-ai-sku-th-action" @click="applySkuRichTextFromFirstRow">一键同首行</span>
                    </div>
                  </th>
                  <th class="mjgd-ai-sku-th-with-action mjgd-ai-sku-offerid-th">
                    <div class="mjgd-ai-sku-th-inner">
                      <span class="mjgd-ai-sku-th-title">货号</span>
                      <span ref="resetAllSkuOfferIdsPopoverRefRef" class="mjgd-ai-sku-th-action" @click="onShowResetAllSkuOfferIdsPopover">一键设置货号</span>
                    </div>
                  </th>
                  <th class="mjgd-ai-sku-price-th">采购价</th>
                  <th class="mjgd-ai-sku-th-with-action mjgd-ai-sku-sale-price-th">
                    <div class="mjgd-ai-sku-th-inner">
                      <span class="mjgd-ai-sku-th-title">售价</span>
                      <span ref="batchPriceRefRef" class="mjgd-ai-sku-th-action" @click="setShowBatchPricePopover(!showBatchPricePopover)">一键设置价格</span>
                    </div>
                  </th>
                  <th class="mjgd-ai-sku-th-with-action mjgd-ai-sku-th-pack-dims">
                    <div class="mjgd-ai-sku-th-inner">
                      <span class="mjgd-ai-sku-th-title">包装尺寸(长*宽*高mm)</span>
                      <span ref="batchPackDimsRefRef" class="mjgd-ai-sku-th-action" @click="setShowBatchPackDimsPopover(!showBatchPackDimsPopover)">一键设置包装尺寸</span>
                    </div>
                  </th>
                  <th class="mjgd-ai-sku-th-with-action mjgd-ai-sku-th-pack-weight">
                    <div class="mjgd-ai-sku-th-inner">
                      <span class="mjgd-ai-sku-th-title">包装重量(g)</span>
                      <span ref="batchPackWeightRefRef" class="mjgd-ai-sku-th-action" @click="setShowBatchPackWeightPopover(!showBatchPackWeightPopover)">一键设置包装重量</span>
                    </div>
                  </th>
                  <th v-if="isVariantField(DESCRIPTION_FIELD_KEY)" class="mjgd-ai-sku-aspect-th">
                    <div class="mjgd-ai-sku-th-inner">
                      <span class="mjgd-ai-sku-th-title">描述</span>
                      <span class="mjgd-ai-sku-th-action" @click="switchDescriptionToCommon">恢复通用</span>
                    </div>
                  </th>
                  <th v-for="attr in variantOutputFeatureAttrs" :key="'variant-th-' + attr.id" class="mjgd-ai-sku-aspect-th">
                    <div class="mjgd-ai-sku-th-inner">
                      <span class="mjgd-ai-sku-th-title">{{ attr.name }}</span>
                      <span class="mjgd-ai-sku-th-action" @click="switchFeatureAttrToCommon(attr)">恢复通用</span>
                    </div>
                  </th>
                  <th v-for="attr in aspectFeatureAttrs" :key="'aspect-th-' + attr.id" class="mjgd-ai-sku-aspect-th">
                    <div class="mjgd-ai-sku-th-inner">
                      <span class="mjgd-ai-sku-th-title">{{ attr.name }}</span>
                      <span class="mjgd-ai-sku-th-action" @click="applyAspectValueFromFirstRow(attr.id)">一键同首行</span>
                    </div>
                  </th>
                  <th class="mjgd-ai-sku-action-th mjgd-ai-sku-sticky-col-right">操作</th>
                </tr>
              </thead>
              <!-- 列表内容 -->
              <tbody>
                <VirtualRows ref="skuVirtualRowsRef" :items="transformedData.sku_matrix" :row-height="skuVirtualRowHeight" :overscan="skuVirtualOverscan" :scroll-target="skuTableScrollRef"
                  :min-items-to-enable="skuVirtualMinItemsToEnable" v-slot="{visibleItems, topSpacerHeight, bottomSpacerHeight, setRowRef}">
                  <tr v-if="topSpacerHeight > 0" class="mjgd-ai-sku-spacer-row" aria-hidden="true">
                    <td :colspan="skuTableColumnCount" class="mjgd-ai-sku-spacer-cell">
                      <div :style="{ height: `${topSpacerHeight}px` }"></div>
                    </td>
                  </tr>
                  <tr v-for="{ item: sku, index } in visibleItems" :key="index" :ref="(el) => setRowRef(index, el)">
                    <td class="mjgd-ai-sku-checkbox-cell mjgd-ai-sku-sticky-col mjgd-ai-sku-sticky-col--checkbox">
                      <label class="mjgd-ai-sku-checkbox-label">
                        <input type="checkbox" :checked="selectedSkuIndices.includes(index as number)" @change="toggleSkuSelection(index as number)" />
                      </label>
                    </td>
                    <!-- 列表主图 -->
                    <td class="mjgd-ai-sku-image-cell mjgd-ai-sku-sticky-col mjgd-ai-sku-sticky-col--image" @click.stop="workbench.navigateToImageQueueWithVariant?.(index as number)">
                      <CspSafeImg v-if="sku.skuImgList[0] && sku.skuImgList[0].transformUrl" :src="sku.skuImgList[0].transformUrl" class="mjgd-ai-sku-image" />
                      <div v-else class="mjgd-ai-sku-image-placeholder">无图片</div>
                    </td>
                    <!-- 列表标题 -->
                    <td class="mjgd-ai-sku-name-cell mjgd-ai-sku-sticky-col mjgd-ai-sku-sticky-col--name">
                      <div class="mjgd-ai-sku-title-input-wrapper">
                        <textarea :value="getSkuTitleValue(sku)" class="mjgd-ai-sku-title-textarea" :class="{ 'is-error': hasSkuTableFieldError(getSkuTitleFieldKey(Number(index))) }" rows="2" maxlength="250" placeholder="请输入标题" :disabled="pipelineRunning"
                          @input="onSkuTitleInput(index as number, $event)"></textarea>
                        <span class="mjgd-ai-sku-title-count">{{ getSkuTitleValue(sku).length }}/250</span>
                      </div>
                    </td>
                    <!-- 列表视频 -->
                    <td v-memo="[index, skuVideoUrlList[index]]" class="mjgd-ai-sku-video-cell">
                      <div class="mjgd-ai-sku-video-wrapper">
                        <div class="mjgd-ai-sku-video-status" v-if="skuVideoUrlList[index]" aria-hidden="true"><i class="el-icon-check"></i></div>
                        <div class="mjgd-ai-sku-video-container" @click="handleVideoClick(index)">
                          <div v-if="!skuVideoUrlList[index]" class="mjgd-ai-sku-video-placeholder small">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                              <rect x="4" y="5" width="16" height="14" rx="2" ry="2"></rect>
                              <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor"></circle>
                              <path d="M15 7L17 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
                              <path d="M15 17L17 19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
                            </svg>
                          </div>
                          <div v-else class="mjgd-ai-sku-video-thumb-shell">
                            <div class="mjgd-ai-sku-video-preview-card">
                              <video :src="skuVideoUrlList[index]" class="mjgd-ai-sku-video-preview" muted playsinline preload="metadata"></video>
                              <span class="mjgd-ai-sku-video-preview-mask">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                  <polygon points="8 5 19 12 8 19 8 5"></polygon>
                                </svg>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                    <!-- 列表富内容 -->
                    <!-- v-if="hasSkuJsonRichTextColumn" -->
                    <td class="mjgd-ai-sku-rich-text-cell" :class="{'is-error': jsonRichTextAttr && hasSkuTableFieldError(getSkuVariantFeatureFieldKey(Number(index), jsonRichTextAttr.id))}">
                      <JsonRichTextPreview mode="compact" :model-value="getSkuJsonRichText(Number(index))" :disabled="pipelineRunning" @update:model-value="onSkuJsonRichTextConfirm(Number(index), $event)"
                        @confirm="onSkuJsonRichTextConfirm(Number(index), $event)" />
                    </td>
                    <!-- 列表货号前缀 -->
                    <td class="mjgd-ai-sku-offerid-cell">
                      <div class="mjgd-ai-offerid-prefix-input-wrapper">
                        <input type="text" :value="skuOfferidPrefix(sku)" @input="onSkuOfferidPrefixInput(index, $event)" class="mjgd-ai-offerid-prefix-input" :class="{ 'is-error': hasSkuTableFieldError(getSkuOfferidPrefixFieldKey(Number(index))) }" placeholder="货号前缀" />
                      </div>
                    </td>
                    <td class="mjgd-ai-sku-price-cell">
                      <div class="mjgd-ai-price-wrapper">
                        <span class="mjgd-ai-price-symbol">¥</span>
                        <input type="number" step="0.01" :value="sku.price_amount" @input="onSkuPriceAmountInput(index, $event)" @blur="onSkuPriceAmountBlur(index, $event)" class="mjgd-ai-price-input"
                          placeholder="原价" />
                      </div>
                    </td>
                    <td class="mjgd-ai-sku-sale-price-cell">
                      <div class="mjgd-ai-price-wrapper">
                        <span class="mjgd-ai-price-symbol">¥</span>
                        <input type="number" step="0.01" :value="sku.sale_price" @input="onSkuSalePriceInput(index, $event)" @blur="onSkuSalePriceBlur(index, $event)" class="mjgd-ai-price-input"
                          placeholder="请输入售价" />
                      </div>
                    </td>
                    <td class="mjgd-ai-sku-pack-dims-cell">
                      <div class="mjgd-ai-sku-pack-dims-inner">
                        <input type="number" step="0.01" class="mjgd-ai-sku-pack-dims-input" :value="sku.length" @input="onSkuPackLengthInput(index, $event)" placeholder="长" />
                        <span class="mjgd-ai-sku-pack-dims-mul">×</span>
                        <input type="number" step="0.01" class="mjgd-ai-sku-pack-dims-input" :value="sku.width" @input="onSkuPackWidthInput(index, $event)" placeholder="宽" />
                        <span class="mjgd-ai-sku-pack-dims-mul">×</span>
                        <input type="number" step="0.01" class="mjgd-ai-sku-pack-dims-input" :value="sku.height" @input="onSkuPackHeightInput(index, $event)" placeholder="高" />
                      </div>
                    </td>
                    <td class="mjgd-ai-sku-pack-weight-cell">
                      <div class="mjgd-ai-sku-pack-weight-inner">
                        <input type="number" step="0.01"class="mjgd-ai-sku-pack-weight-input" :value="sku.weight" @input="onSkuPackWeightInput(index, $event)" placeholder="重量(g)" />
                      </div>
                    </td>
                    <td v-if="isVariantField(DESCRIPTION_FIELD_KEY)" class="mjgd-ai-sku-aspect-cell">
                      <textarea :value="getSkuVariantDescription(Number(index))" class="mjgd-ai-sku-title-textarea mjgd-ai-sku-description-textarea"
                      :class="{'is-error': hasSkuTableFieldError(getSkuVariantDescriptionFieldKey(Number(index)))}" rows="2" maxlength="5000" placeholder="请输入描述"
                      :data-sku-variant-field-key="getSkuVariantDescriptionFieldKey(Number(index))" @input="onSkuVariantDescriptionInput(Number(index), $event)"></textarea>
                    </td>

                    <!-- 特征里点击按变体编辑后会到这里来，在表头点击恢复通用会回到特征里 -->
                    <td v-for="attr in variantOutputFeatureAttrs" :key="'variant-td-' + index + '-' + attr.id" class="mjgd-ai-sku-aspect-cell">
                      <template v-if="attr.dictionary_id === 0">
                        <input type="text" class="mjgd-ai-sku-aspect-input" :class="{ 'is-error': hasSkuTableFieldError(getSkuVariantFeatureFieldKey(Number(index), attr.id)) }" placeholder="请输入"
                          :value="getSkuVariantFeatureValue(Number(index), attr.id)" :data-sku-variant-field-key="getSkuVariantFeatureFieldKey(Number(index), attr.id)"
                          @input="onSkuVariantFeatureInput(Number(index), attr.id, $event)" />
                      </template>
                      <template v-else-if="(attr.dictionary_id ?? 0) !== 0 && !attr.is_collection">
                        <div class="mjgd-ai-sku-variant-single">
                          <button type="button" class="mjgd-ai-sku-aspect-select" :class="{
                            'is-open': isSkuVariantSingleOpen(Number(index), attr.id),
                            'is-placeholder': !getSkuVariantFeatureValue(Number(index), attr.id),
                            'is-error': hasSkuTableFieldError(getSkuVariantFeatureFieldKey(Number(index), attr.id)),
                          }" :data-sku-variant-field-key="getSkuVariantFeatureFieldKey(Number(index), attr.id)" :disabled="!(attr.dictionary_values?.length)"
                            @click.stop="toggleSkuVariantSingleDropdown(Number(index), attr, $event)" @keydown.enter.prevent="toggleSkuVariantSingleDropdown(Number(index), attr, $event)"
                            @keydown.space.prevent="toggleSkuVariantSingleDropdown(Number(index), attr, $event)">
                            <span class="mjgd-ai-sku-aspect-select-label">{{ getSkuVariantFeatureValue(Number(index), attr.id) ? getSkuVariantSingleLabel(Number(index), attr) : "请选择" }}</span>
                            <span class="mjgd-ai-sku-aspect-select-arrow" :class="{ 'is-open': isSkuVariantSingleOpen(Number(index), attr.id) }" aria-hidden="true">
                              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                              </svg>
                            </span>
                          </button>
                        </div>
                      </template>
                      <template v-else>
                        <template v-if="attr.dictionary_values?.length">
                          <div class="mjgd-ai-sku-variant-multi">
                            <button type="button" class="mjgd-ai-sku-aspect-select" :class="{
                              'is-error': hasSkuTableFieldError(getSkuVariantFeatureFieldKey(Number(index), attr.id)),
                              'is-open': isSkuVariantMultiOpen(Number(index), attr.id),
                              'is-placeholder': getSkuVariantMultiSummary(Number(index), attr).length === 0
                            }" :data-sku-variant-field-key="getSkuVariantFeatureFieldKey(Number(index), attr.id)" @click.stop="toggleSkuVariantMultiDropdown(Number(index), attr, $event)">
                              <span class="mjgd-ai-sku-aspect-select-label">{{ getSkuVariantMultiSummary(Number(index), attr) || "请选择" }}</span>
                              <span class="mjgd-ai-sku-aspect-select-arrow" :class="{ 'is-open': isSkuVariantMultiOpen(Number(index), attr.id) }" aria-hidden="true">
                                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                                </svg>
                              </span>
                            </button>
                          </div>
                        </template>
                        <span v-else class="mjgd-ai-feature-attr-noopts">无可选项</span>
                      </template>
                    </td>

                    <!-- sku的属性 -->
                    <td v-for="attr in aspectFeatureAttrs" :key="'aspect-td-' + index + '-' + attr.id" class="mjgd-ai-sku-aspect-cell">
                      <template v-if="attr.dictionary_id === 0">
                        <input type="text" class="mjgd-ai-sku-aspect-input" :class="{ 'is-error': hasSkuAspectFieldError(Number(index), attr.id), }" placeholder="请输入"
                          :value="getSkuAspectString(Number(index), attr.id)" :data-sku-aspect-field-key="getSkuAspectFieldKey(Number(index), attr.id)"
                          @input="onSkuAspectInput(Number(index), attr.id, $event)" />
                      </template>
                      <template v-else-if="(attr.dictionary_id ?? 0) !== 0 && !attr.is_collection">
                        <div class="mjgd-ai-sku-aspect-single">
                          <button type="button" class="mjgd-ai-sku-aspect-select" :class="{
                            'is-open': isSkuAspectSingleOpen(Number(index), attr.id),
                            'is-placeholder': !getSkuAspectString(Number(index), attr.id),
                            'is-error': hasSkuAspectFieldError(Number(index), attr.id),
                          }" :data-sku-aspect-field-key="getSkuAspectFieldKey(Number(index), attr.id)" :disabled="!(attr.dictionary_values?.length)"
                            @click.stop="toggleSkuAspectSingleDropdown(Number(index), attr, $event)" @keydown.enter.prevent="toggleSkuAspectSingleDropdown(Number(index), attr, $event)"
                            @keydown.space.prevent="toggleSkuAspectSingleDropdown(Number(index), attr, $event)">
                            <span class="mjgd-ai-sku-aspect-select-label">{{ getSkuAspectString(Number(index), attr.id) ? getSkuAspectSingleLabel(Number(index), attr) : "请选择" }}</span>
                            <span class="mjgd-ai-sku-aspect-select-arrow" :class="{ 'is-open': isSkuAspectSingleOpen(Number(index), attr.id), }" aria-hidden="true">
                              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                              </svg>
                            </span>
                          </button>
                        </div>
                      </template>
                      <template v-else>
                        <template v-if="attr.dictionary_values?.length">
                          <div class="mjgd-ai-feature-attr-multi mjgd-ai-sku-aspect-multi">
                            <div class="mjgd-ai-feature-attr-multi-control"
                              :class="{ 'is-open': isSkuAspectMultiOpen(Number(index), attr.id), 'is-error': hasSkuAspectFieldError(Number(index), attr.id) }"
                              :data-sku-aspect-field-key="getSkuAspectFieldKey(Number(index), attr.id)" role="button" tabindex="0"
                              @click.stop="toggleSkuAspectMultiDropdown(Number(index), attr, $event)" @keydown.enter.prevent="toggleSkuAspectMultiDropdown(Number(index), attr, $event)"
                              @keydown.space.prevent="toggleSkuAspectMultiDropdown(Number(index), attr, $event)">
                              <div class="mjgd-ai-feature-attr-multi-tags">
                                <span v-if="getSkuAspectMultiSummary(Number(index), attr).length === 0" class="mjgd-ai-feature-attr-multi-placeholder">请选择</span>
                                <span v-else class="mjgd-ai-sku-aspect-select-label" :data-ellipsis-full="getSkuAspectMultiFullSummary(Number(index), attr)" @mouseenter="onEllipsisTextEnter"
                                  @mouseleave="onEllipsisTextLeave">{{ getSkuAspectMultiSummary(Number(index), attr) }}</span>
                              </div>
                              <span class="mjgd-ai-feature-attr-multi-arrow" aria-hidden="true">
                                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                                </svg>
                              </span>
                            </div>
                          </div>
                        </template>
                        <span v-else class="mjgd-ai-feature-attr-noopts">无可选项</span>
                      </template>
                    </td>

                    <td class="mjgd-ai-sku-action-cell mjgd-ai-sku-sticky-col-right">
                      <button class="mjgd-ai-delete-btn" @click="onDeleteSku(index)" title="删除SKU">删除</button>
                    </td>
                  </tr>
                  <tr v-if="bottomSpacerHeight > 0" class="mjgd-ai-sku-spacer-row" aria-hidden="true">
                    <td :colspan="skuTableColumnCount" class="mjgd-ai-sku-spacer-cell">
                      <div :style="{ height: `${bottomSpacerHeight}px` }"></div>
                    </td>
                  </tr>
                </VirtualRows>
              </tbody>
            </table>
          </div>

          <!-- SKU 属性多选弹窗 -->
          <Teleport to="body">
            <div v-if="openSkuAspectSingleAttr && openSkuAspectSingleRowIndex !== null" ref="skuAspectSinglePopoverRef" class="mjgd-ai-sku-aspect-single-dropdown"
              :class="{ 'is-top': skuAspectSinglePlacement === 'top', 'is-bottom': skuAspectSinglePlacement === 'bottom' }" :style="skuAspectSinglePopoverStyle" @click.stop>
              <input v-model="openSkuAspectSingleSearchText" placeholder="搜索选项" class="search-input" @click.stop />
              <div v-for="opt in skuDictionaryFilterOptions(openSkuAspectSingleAttr.dictionary_values || [], openSkuAspectSingleSearchText)" :key="opt.id" class="mjgd-ai-sku-aspect-single-option"
                :class="{ 'is-selected': getSkuAspectString(openSkuAspectSingleRowIndex, openSkuAspectSingleAttr.id) === String(opt.id) }" role="option"
                @click="selectSkuAspectSingleOption(String(opt.id))">
                <span class="mjgd-ai-sku-aspect-single-check">{{ getSkuAspectString(openSkuAspectSingleRowIndex, openSkuAspectSingleAttr.id) === String(opt.id) ? "✓" : "" }}</span>
                <span class="mjgd-ai-sku-aspect-single-option-label" :data-ellipsis-full="opt.value" @mouseenter="onEllipsisTextEnter" @mouseleave="onEllipsisTextLeave">{{ opt.value }}</span>
              </div>
              <div v-if="skuDictionaryFilterOptions(openSkuAspectSingleAttr.dictionary_values || [], openSkuAspectSingleSearchText).length === 0"
                class="mjgd-ai-sku-aspect-single-option option-item-none" @click.stop>无匹配选项</div>
            </div>
          </Teleport>

          <!-- 单选弹窗-特征里点击按变体编辑后会到这里来，在表头点击恢复通用会回到特征里 -->
          <Teleport to="body">
            <div v-if="openSkuVariantSingleAttr && openSkuVariantSingleRowIndex !== null" ref="skuVariantSinglePopoverRef"
              class="mjgd-ai-sku-aspect-single-dropdown mjgd-ai-sku-variant-single-popover"
              :class="{ 'is-top': skuVariantSinglePlacement === 'top', 'is-bottom': skuVariantSinglePlacement === 'bottom' }" :style="skuVariantSinglePopoverStyle" @click.stop>
              <input v-model="openSkuVariantSingleSearchText" placeholder="搜索选项" class="search-input" @click.stop />
              <div v-for="opt in skuDictionaryFilterOptions(openSkuVariantSingleAttr.dictionary_values || [], openSkuVariantSingleSearchText)" :key="opt.id" class="mjgd-ai-sku-aspect-single-option"
                :class="{ 'is-selected': getSkuVariantFeatureValue(openSkuVariantSingleRowIndex, openSkuVariantSingleAttr.id) === String(opt.id) }" role="option"
                @click="selectSkuVariantSingleOption(String(opt.id))">
                <span class="mjgd-ai-sku-aspect-single-option-label" :data-ellipsis-full="opt.value" @mouseenter="onEllipsisTextEnter" @mouseleave="onEllipsisTextLeave">{{ opt.value }}</span>
              </div>
              <div v-if="skuDictionaryFilterOptions(openSkuVariantSingleAttr.dictionary_values || [], openSkuVariantSingleSearchText).length === 0"
                class="mjgd-ai-sku-aspect-single-option option-item-none" @click.stop>无匹配选项</div>
            </div>
          </Teleport>
          <!-- 多选弹窗-特征里点击按变体编辑后会到这里来，在表头点击恢复通用会回到特征里 -->
          <Teleport to="body">
            <div v-if="openSkuVariantMultiAttr && openSkuVariantMultiRowIndex !== null" ref="skuVariantMultiPopoverRef" class="mjgd-ai-feature-attr-multi-dropdown mjgd-ai-sku-variant-multi-popover"
              :class="{ 'is-top': skuVariantMultiPlacement === 'top', 'is-bottom': skuVariantMultiPlacement === 'bottom' }" :style="skuVariantMultiPopoverStyle" @click.stop>
              <input v-model="openSkuVariantMultiSearchText" placeholder="搜索选项" class="search-input" @click.stop />
              <div v-for="opt in skuDictionaryFilterOptions(openSkuVariantMultiAttr.dictionary_values || [], openSkuVariantMultiSearchText)" :key="opt.id" class="mjgd-ai-feature-attr-multi-option"
                :class="{ 'is-selected': getSkuVariantFeatureMultiValue(openSkuVariantMultiRowIndex, openSkuVariantMultiAttr.id).includes(String(opt.id)) }" role="option"
                @click="toggleSkuVariantFeatureMultiOption(openSkuVariantMultiRowIndex, openSkuVariantMultiAttr.id, String(opt.id))">
                <span class="mjgd-ai-feature-attr-multi-check">{{ getSkuVariantFeatureMultiValue(openSkuVariantMultiRowIndex, openSkuVariantMultiAttr.id).includes(String(opt.id)) ? "✓" : "" }}</span>
                <span class="mjgd-ai-feature-attr-multi-option-label" :data-ellipsis-full="opt.value" @mouseenter="onEllipsisTextEnter" @mouseleave="onEllipsisTextLeave">{{ opt.value }}</span>
              </div>
              <div v-if="skuDictionaryFilterOptions(openSkuVariantMultiAttr.dictionary_values || [], openSkuVariantMultiSearchText).length === 0"
                class="mjgd-ai-feature-attr-multi-option option-item-none" @click.stop>无匹配选项</div>
            </div>
          </Teleport>

          <!-- 列表固定属性的多选框弹窗 -->
          <Teleport to="body">
            <div v-if="openSkuAspectMultiAttr && openSkuAspectMultiRowIndex !== null" ref="skuAspectMultiPopoverRef"
              class="mjgd-ai-feature-attr-multi-dropdown mjgd-ai-sku-aspect-multi-popover"
              :class="{'is-top': skuAspectMultiPlacement === 'top', 'is-bottom': skuAspectMultiPlacement === 'bottom'}"
              :style="skuAspectMultiPopoverStyle" @click.stop>
                <input v-model="openSkuAspectMultiSearchText" placeholder="搜索选项" class="search-input" @click.stop />
                <div v-for="opt in openSkuAspectMultiAttrFilterOptions(openSkuAspectMultiAttr.dictionary_values || [])" :key="opt.id"
                  class="mjgd-ai-feature-attr-multi-option" :class="{'is-selected': getSkuAspectMultiValue(openSkuAspectMultiRowIndex, openSkuAspectMultiAttr.id).includes(String(opt.id))}"
                  role="option" @click="toggleSkuAspectMultiOption(openSkuAspectMultiRowIndex, openSkuAspectMultiAttr.id, String(opt.id))">
                    <span class="mjgd-ai-feature-attr-multi-check">{{ getSkuAspectMultiValue(openSkuAspectMultiRowIndex, openSkuAspectMultiAttr.id).includes(String(opt.id)) ? "✓" : "" }}</span>
                    <span class="mjgd-ai-feature-attr-multi-option-label" :data-ellipsis-full="opt.value" @mouseenter="onEllipsisTextEnter" @mouseleave="onEllipsisTextLeave">{{ opt.value }}</span>
                </div>
                <div v-if="openSkuAspectMultiAttrFilterOptions(openSkuAspectMultiAttr.dictionary_values || []).length === 0" class="mjgd-ai-feature-attr-multi-option option-item-none" @click.stop>无匹配选项</div>
            </div>
          </Teleport>
          <!-- 底部固定水平滚动条 -->
          <div
            v-if="transformedData?.sku_matrix?.length"
            ref="bottomScrollbarRef"
            class="mjgd-ai-bottom-scrollbar"
            :class="{ 'is-visible': bottomScrollbarVisible }"
            :style="bottomScrollbarStyle"
            @scroll="onBottomScrollbarScroll"
          >
            <div class="mjgd-ai-bottom-scrollbar-inner" :style="{ width: bottomScrollbarWidth }"></div>
          </div>
        </div>
        <div v-else class="mjgd-ai-empty-container">
          <div class="mjgd-ai-empty-text">暂无数据</div>
        </div>
      </div>
    </div>

    <!-- <div v-if="submitResult.length > 0" class="mjgd-ai-result-section">
      <div class="mjgd-ai-result-header">
        <span class="mjgd-ai-data-title">提交结果</span>
      </div>
      <div class="mjgd-ai-result-content">
        <div
          v-for="(item, index) in submitResult"
          :key="index"
          class="mjgd-ai-result-group"
        >
          <div class="mjgd-ai-result-group-header">
            <span class="mjgd-ai-result-shop">店铺ID: {{ item.shopId }}</span>
            <span class="mjgd-ai-result-task">任务ID: {{ item.taskId }}</span>
          </div>
          <table class="mjgd-ai-result-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>货号</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(mapping, mi) in item.skuOfferMapping" :key="mi">
                <td
                  class="mjgd-ai-result-sku-name"
                  @mouseenter="
                    showHoverTooltip($event, mapping.sku_name)
                  "
                  @mouseleave="hideHoverTooltip"
                >
                  {{ mapping.sku_name }}
                </td>
                <td class="mjgd-ai-result-offer-id">
                  <span class="mjgd-ai-result-offer-text">{{
                    mapping.offer_id
                  }}</span>
                  <button
                    class="mjgd-ai-result-copy-btn"
                    @click="workbench.handleCopyOfferId(mapping.offer_id)"
                    title="复制货号"
                  >
                    复制
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div> -->
  </div>

  <!-- 批量设置售价弹窗（由表头「售价」列触发，Teleport 置于根级避免条件块重渲染导致输入失焦） -->
  <Teleport to="body">
    <div v-if="showBatchPricePopover" ref="batchPricePopoverRef" class="mjgd-ai-popover mjgd-ai-popover-bottom" :style="batchPricePopoverStyle" @mousedown.stop @click.stop>
      <div class="mjgd-ai-batch-price-setting">
        <div class="mjgd-ai-batch-price-header">
          <span class="mjgd-ai-batch-price-title">批量设置售价</span>
        </div>
        <div class="mjgd-ai-batch-price-radio-group">
          <label class="mjgd-ai-batch-price-radio-label">
            <input type="radio" value="fixed" v-model="batchPriceType" class="mjgd-ai-batch-price-radio" />
            <span>固定值</span>
          </label>
          <label class="mjgd-ai-batch-price-radio-label">
            <input type="radio" value="multiplier" v-model="batchPriceType" class="mjgd-ai-batch-price-radio" />
            <span>当前值倍数</span>
          </label>
        </div>
        <div class="mjgd-ai-batch-price-input-wrapper">
          <input v-model.number="batchPriceInputValue" :placeholder="batchPriceType === 'fixed' ? '请输入固定售价' : '请输入倍数'"
            class="mjgd-ai-batch-price-input" type="number" step="0.01" min="0" />
          <span v-if="batchPriceType === 'multiplier'" class="mjgd-ai-batch-price-append">倍</span>
        </div>
        <div class="mjgd-ai-batch-price-actions">
          <button class="mjgd-ai-batch-price-btn mjgd-ai-batch-price-btn-cancel" @click="batchPriceCancel">取消</button>
          <button class="mjgd-ai-batch-price-btn mjgd-ai-batch-price-btn-confirm" @click="batchPriceConfirm" :disabled="!batchPriceIsValid">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
  <!-- 批量设置包装尺寸弹窗（由表头「包装尺寸」列触发） -->
  <Teleport to="body">
    <div v-if="showBatchPackDimsPopover" ref="batchPackDimsPopoverRef" class="mjgd-ai-popover mjgd-ai-popover-bottom" :style="batchPackDimsPopoverStyle" @mousedown.stop @click.stop>
      <div class="mjgd-ai-batch-price-setting">
        <div class="mjgd-ai-batch-price-header">
          <span class="mjgd-ai-batch-price-title">批量设置包装尺寸</span>
        </div>
        <div class="mjgd-ai-batch-pack-dims-fields">
          <div class="mjgd-ai-batch-pack-dims-field">
            <span class="mjgd-ai-batch-pack-dims-label">包装长度(mm)</span>
            <input type="number" step="0.01" :value="batchPackLengthInputValue" @input="onBatchPackLengthFieldInput" placeholder="请输入长度" class="mjgd-ai-batch-price-input" />
          </div>
          <div class="mjgd-ai-batch-pack-dims-field">
            <span class="mjgd-ai-batch-pack-dims-label">包装宽度(mm)</span>
            <input type="number" step="0.01" :value="batchPackWidthInputValue" @input="onBatchPackWidthFieldInput" placeholder="请输入宽度" class="mjgd-ai-batch-price-input" />
          </div>
          <div class="mjgd-ai-batch-pack-dims-field">
            <span class="mjgd-ai-batch-pack-dims-label">包装高度(mm)</span>
            <input type="number" step="0.01" :value="batchPackHeightInputValue" @input="onBatchPackHeightFieldInput" placeholder="请输入高度" class="mjgd-ai-batch-price-input" />
          </div>
        </div>
        <div class="mjgd-ai-batch-price-actions">
          <button class="mjgd-ai-batch-price-btn mjgd-ai-batch-price-btn-cancel" @click="batchPackDimsCancel">取消</button>
          <button class="mjgd-ai-batch-price-btn mjgd-ai-batch-price-btn-confirm" @click="batchPackDimsConfirm" :disabled="!batchPackDimsIsValid">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
  <!-- 批量设置包装重量弹窗（由表头「包装重量」列触发） -->
  <Teleport to="body">
    <div v-if="showBatchPackWeightPopover" ref="batchPackWeightPopoverRef" class="mjgd-ai-popover mjgd-ai-popover-bottom" :style="batchPackWeightPopoverStyle" @mousedown.stop @click.stop>
      <div class="mjgd-ai-batch-price-setting">
        <div class="mjgd-ai-batch-price-header">
          <span class="mjgd-ai-batch-price-title">批量设置包装重量</span>
        </div>
        <div class="mjgd-ai-batch-pack-weight-field">
          <span class="mjgd-ai-batch-pack-dims-label">包装重量(g)</span>
          <input type="number" step="0.01" :value="batchPackWeightInputValue" @input="onBatchPackWeightFieldInput" placeholder="请输入重量" class="mjgd-ai-batch-price-input" />
        </div>
        <div class="mjgd-ai-batch-price-actions">
          <button class="mjgd-ai-batch-price-btn mjgd-ai-batch-price-btn-cancel" @click="batchPackWeightCancel">取消</button>
          <button class="mjgd-ai-batch-price-btn mjgd-ai-batch-price-btn-confirm" @click="batchPackWeightConfirm" :disabled="!batchPackWeightIsValid">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
  <!-- 一键设置货号前缀弹窗（由表头「货号」列触发） -->
  <Teleport to="body">
    <div v-if="showResetAllSkuOfferIdsPopover" ref="resetAllSkuOfferIdsPopoverRef" class="mjgd-ai-popover mjgd-ai-popover-bottom" :style="resetAllSkuOfferIdsPopoverStyle" @mousedown.stop @click.stop>
      <div class="mjgd-ai-batch-price-setting">
        <div class="mjgd-ai-batch-price-header">
          <span class="mjgd-ai-batch-price-title">一键设置货号前缀</span>
        </div>
        <div class="mjgd-ai-batch-pack-weight-field">
          <span class="mjgd-ai-batch-pack-dims-label">货号（前缀+自动生成8位字符）</span>
          <div class="mjgd-ai-batch-price-input-wrapper">
            <input type="text" v-model="resetAllSkuOfferIdsInputValue" placeholder="货号前缀（仅支持英文和数字）" class="mjgd-ai-batch-price-input" />
          </div>
        </div>
        <div class="mjgd-ai-batch-price-actions">
          <button class="mjgd-ai-batch-price-btn mjgd-ai-batch-price-btn-cancel" @click="resetAllSkuOfferIdsCancel">取消</button>
          <button class="mjgd-ai-batch-price-btn mjgd-ai-batch-price-btn-confirm" @click="resetAllSkuOfferIdsConfirm" :disabled="!resetAllSkuOfferIdsIsValid">确定</button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <Transition name="mjgd-tooltip-fade">
      <div v-if="hoverTooltipVisible" ref="hoverTooltipRef" class="mjgd-tooltip" :style="hoverTooltipStyle">
        <div class="mjgd-tooltip-content">{{ hoverTooltipText }}</div>
        <div class="mjgd-tooltip-arrow mjgd-tooltip-arrow-top"></div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <div v-if="aiLogOverlayVisible" class="mjgd-ai-workbench-log-overlay mjgd_plugin_overlay is_nested is_tier_inner" @click.self="workbench.closeAiLogOverlay()">
      <div class="mjgd-ai-workbench-log-panel">
        <div class="mjgd-ai-workbench-log-header">
          <span class="mjgd-ai-workbench-log-title">AI 智能体日志</span>
          <span class="mjgd-ai-workbench-log-warning" v-if="showModalTipText">⚠ AI帮填中，请勿关闭或刷新浏览器页面，否则可能导致任务中断或结果无法恢复</span>
          <button type="button" class="mjgd-ai-workbench-log-close" @click="workbench.closeAiLogOverlay()">×</button>
        </div>
        <!-- 弃用 :value 绑定与 textarea：流式输出改 rAF 增量直写 DOM -->
        <div ref="aiLogViewportRef" class="mjgd_ai_workbench_log_viewport" role="log" aria-live="polite"></div>
      </div>
    </div>
  </Teleport>

  <MediaUpload
    :visible="mediaUploadDialogVisible"
    :value="mediaUploadValue"
    @update:visible="mediaUploadDialogVisible = $event"
    @confirm="handleMediaUploadConfirm"
    @preview="handleMediaPreview"
    @close="mediaUploadDialogVisible = false"
  />

  <Teleport to="body">
    <div v-if="mediaPreviewImageVisible" class="mjgd-media-preview-overlay mjgd_plugin_overlay is_nested is_tier_inner" @click="mediaPreviewImageVisible = false">
      <div class="mjgd-media-preview-container" @click.stop>
        <CspSafeImg :src="mediaPreviewImageUrl" class="mjgd-media-preview-img" alt="预览" />
        <span class="mjgd-media-preview-close" @click="mediaPreviewImageVisible = false">&times;</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed, onUnmounted, onMounted, inject, defineComponent, h, type Ref } from "vue";
import { apiService } from "../../utils/api";
import { roundPrice } from "../../utils/price";
import { showToast } from "../../utils/toast";
import { resolveAssetUrl } from "../../utils/runtime";
import { proxyFetchJson } from "../../utils/proxyFetch";
import { API_CONFIG } from "../../utils/api-config";
import { Z } from "../styles/zIndex";
import VirtualRows from "./common/VirtualRows.vue";
import MediaUpload from "./MediaUpload.vue";
import fallbackDyIcon from "../../assets/dy.svg";
import {
  formatVariantLimitExceededMessage,
  getMaxVariantExecutionCount,
  getSkuVariantCount,
  isVariantCountOverLimit,
} from "../utils/maxVariantExecution";
import { fetchShopRecordQuotaData, formatQuotaRemainLimit } from "../utils/ozonQuickShelve/quickShelveApi";
import type { ShopRecordQuotaData } from "../utils/ozonQuickShelve/types";
import { searchBrand } from "../utils/ozonQuickShelve/quickShelveApi";
import {
  validateVariantImageCountBeforeSubmit,
  validateSkuAspectBeforeSubmit as validateSkuAspectBeforeSubmitShared,
  type VariantAspectValidationItem,
} from "../utils/ozonAiFillAndSubmit";
import CspSafeImg from "./common/CspSafeImg.vue";
import { useAiLogStream } from "../composables/useAiLogStream";

// 工作台逻辑由父组件 provide，子组件只负责展示与调用，无 props 传递
const dyIcon = resolveAssetUrl("src/assets/dy.svg", fallbackDyIcon);
const workbench = inject<{
  pipeline: any;
  progressSteps: { value: any[] };
  pipelineRunning: { value: boolean };
  isManualSelect: { value: boolean };
  waitingForCategoryChange: { value: boolean };
  autoSelectItemLoading?: { value: boolean };
  categoryTemplate: { value: number | null };
  categoryTemplates: { value: Array<{ id: number; name: string; data?: any }> };
  featureAttrLoading: { value: boolean };
  featureAttrError: { value: string | null };
  featureAttrs: { value: any[] };
  shops: { value: Array<{ id: number; name: string }> };
  selectedShops: { value: number[] };
  shopWarehouseInventory: Ref<
    Record<number, { warehouseId: number | null; quantity: number }>
  >;
  selectAllShops: { value: boolean };
  isDirectSale: { value: boolean };
  imageTranslate: { value: boolean };
  isDataLoading: { value: boolean };
  transformedData: { value: any };
  aiOutput: { value: string };
  aiLogOverlayVisible: { value: boolean };
  aiLogOverlayText: { value: string };
  registerAiLogStream: (sink: import("../composables/useAiLogStream").AiLogStreamSink | null) => void;
  prefilledFeatureAttrValues: Ref<Record<string, string | number | string[]>>;
  workbenchFeatureAttrValues: Ref<Record<string, string | number | string[]>>;
  featureAttrValidationErrors: Ref<Record<string, string>>;
  skuAspectValidationErrors: Ref<Record<string, string>>;
  skuVideoUrlList: Ref<Record<number, string>>;
  closeAiLogOverlay: () => void;
  submitResult: {
    value: Array<{
      shopId: number;
      taskId: number;
      skuOfferMapping: Array<{ sku_name: string; offer_id: string }>;
    }>;
  };
  handleExecute: () => Promise<void>; // 执行AI帮填信息
  handleGetExecuteResult: () => Promise<void>; // 获取AI帮填信息结果
  showExecuteRecover: { value: boolean }; // 是否显示恢复按钮
  submitProductData: () => Promise<void>;
  showVariantImageCountWarning: (payload: {
    message: string;
    items: Array<{ variantIndex: number; imageCount: number }>;
  }) => void;
  showVariantAspectWarning: (payload: {
    message: string;
    items: VariantAspectValidationItem[];
  }) => void;
  setWorkbenchFeatureAttrValue: (
    attrId: number,
    value: string | number | string[]
  ) => void;
  clearFeatureAttrValidationError: (attrId: number) => void;
  resetWorkbenchFeatureAttrState: () => void;
  handleCategorySelect: (item: {
    id: number;
    name: string;
    data?: any;
  }) => void;
  handleSelectAll: () => void;
  handleToggleShop: (shopId: number) => void;
  handleUpdateSkuSalePrice: (index: number, value: number) => void;
  handleUpdateSkuPriceAmount: (index: number, value: number) => void;
  handleUpdateSkuOfferidPrefix: (index: number, value: string) => void;
  handleUpdateSkuPackagingLength?: (index: number, value: number) => void;
  handleUpdateSkuPackagingWidth?: (index: number, value: number) => void;
  handleUpdateSkuPackagingHeight?: (index: number, value: number) => void;
  handleUpdateSkuPackagingWeight?: (index: number, value: number) => void;
  handleBatchSetAllOfferidPrefix: (prefix: string) => void;
  handleAddSku: () => void;
  handleDeleteSku: (index: number) => void;
  handleBatchPriceConfirm: (data: {
    type: "fixed" | "multiplier";
    value: number;
  }) => void;
  handleCopyOfferId: (offerId: string) => void;
  navigateToImageQueue: () => void;
  navigateToImageQueueWithVariant?: (index: number) => void;
}>("workbench")!;

// 兼容模板：提供响应式访问（inject 得到的是 ref/computed，模板中需 .value 或直接解包）
const showExecuteRecover = computed(() => workbench.showExecuteRecover?.value ?? false); // 是否显示恢复按钮
const progressSteps = computed(() => workbench.progressSteps?.value ?? []);
const pipelineRunning = computed(
  () => workbench.pipelineRunning?.value ?? false
);
const isManualSelect = computed(() => workbench.isManualSelect?.value ?? false);
const waitingForCategoryChange = computed(
  () => workbench.waitingForCategoryChange?.value ?? false
);
const categoryTemplate = computed(
  () => workbench.categoryTemplate?.value ?? null
);
const categoryTemplates = computed(
  () => workbench.categoryTemplates?.value ?? []
);
const featureAttrLoading = computed(
  () => workbench.featureAttrLoading?.value ?? false
);
const featureAttrError = computed(
  () => workbench.featureAttrError?.value ?? null
);
const featureAttrs = computed(() => workbench.featureAttrs?.value ?? []);
const shops = computed(() => workbench.shops?.value ?? []);
const selectedShops = computed(() => workbench.selectedShops?.value ?? []);
const selectAllShops = computed(() => workbench.selectAllShops?.value ?? false);
const isDirectSale = computed(() => workbench.isDirectSale?.value ?? true);
const imageTranslate = computed(() => workbench.imageTranslate?.value ?? false);
const isDataLoading = computed(() => workbench.isDataLoading?.value ?? false);
const transformedData = computed(
  () => workbench.transformedData?.value ?? null
);
const aiOutput = computed(() => workbench.aiOutput?.value ?? "");
const aiLogOverlayVisible = computed(
  () => workbench.aiLogOverlayVisible?.value ?? false
);
const aiLogViewportRef = ref<HTMLElement | null>(null);
const { sink: aiLogStreamSink } = useAiLogStream(aiLogViewportRef);
const prefilledFeatureAttrValues = computed(
  () => workbench.prefilledFeatureAttrValues?.value ?? {}
);
const workbenchFeatureAttrValues = computed(
  () => workbench.workbenchFeatureAttrValues?.value ?? {}
);
const featureAttrValidationErrors = computed(
  () => workbench.featureAttrValidationErrors?.value ?? {}
);
const skuAspectValidationErrors = workbench.skuAspectValidationErrors;
const submitResult = computed(() => workbench.submitResult?.value ?? []);
const tableContainerRef = ref<HTMLElement | null>(null);
const skuTableScrollRef = ref<HTMLElement | null>(null);
const skuTableRef = ref<HTMLElement | null>(null);
const skuVirtualRowsRef = ref<{
  refresh: () => Promise<void>;
  scrollToIndex: (
    index: number,
    align?: "auto" | "start" | "center" | "end"
  ) => void;
  isVirtualizing: () => boolean;
} | null>(null);
const bottomScrollbarRef = ref<HTMLElement | null>(null);
let isTableScrollingHorizontally = false;
let tableScrollTimeout: number | null = null;
let isSyncingScroll = false;
let skuAspectDropdownRepositionTimers: number[] = [];
const bottomScrollbarWidth = ref("0px");
const bottomScrollbarVisible = ref(false);
/** 与弹窗底边的间距（过小易贴边框，略留 2px） */
const BOTTOM_SCROLLBAR_VIEWPORT_GAP = 2;

const bottomScrollbarStyle = ref<Record<string, string>>({
  left: "0px",
  width: "0px",
  bottom: `${BOTTOM_SCROLLBAR_VIEWPORT_GAP}px`,
});

let bottomScrollbarResizeObserver: ResizeObserver | null = null;
let bottomScrollbarUpdateRaf: number | null = null;

/** 仅在被省略号截断时设置 title，未截断则不显示悬停提示 */
function onEllipsisTextEnter(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement;
  requestAnimationFrame(() => {
    const truncated = el.scrollWidth > el.clientWidth + 1;
    if (truncated) {
      const full =
        el.getAttribute("data-ellipsis-full")?.trim() ||
        el.textContent?.trim() ||
        "";
      if (full) el.setAttribute("title", full);
    } else {
      el.removeAttribute("title");
    }
  });
}
function onEllipsisTextLeave(e: MouseEvent) {
  (e.currentTarget as HTMLElement).removeAttribute("title");
}

type OzonWarehouseRow = { warehouse_id: number; name: string };

const whInv = workbench.shopWarehouseInventory;

type QuotaField = "daily_create" | "daily_update" | "total";

const shopQuotaMap = ref<Record<number, { data: ShopRecordQuotaData | null; loading: boolean }>>({});

const shopWarehouseMap = ref<Record<number, OzonWarehouseRow[]>>({});
const warehouseLoadingIds = ref<Set<number>>(new Set());

function warehousesForShop(shopId: number): OzonWarehouseRow[] {
  return shopWarehouseMap.value[shopId] ?? [];
}

function isWarehouseLoading(shopId: number): boolean {
  return warehouseLoadingIds.value.has(shopId);
}

function warehouseSelectPlaceholder(shopId: number): string {
  if (isWarehouseLoading(shopId)) return "加载中...";
  const list = warehousesForShop(shopId);
  if (!list.length && shopId in shopWarehouseMap.value) return "暂无仓库";
  const shopName = shops.value.find((s) => s.id === shopId)?.name?.trim() || "该店铺";
  if (warehouseSelectValue(shopId) === "") return `请选择${shopName}的仓库`;
  return "";
}

function warehouseSelectValue(shopId: number): string {
  const id = whInv.value[shopId]?.warehouseId;
  return id != null ? String(id) : "";
}

function getShopStockQuantity(shopId: number): number {
  return whInv.value[shopId]?.quantity ?? 0;
}

function onWarehouseSelectChange(shopId: number, e: Event): void {
  const val = (e.target as HTMLSelectElement).value;
  const wid = val === "" ? null : Number(val);
  const prev = whInv.value[shopId] ?? { warehouseId: null, quantity: 0 };
  whInv.value = {
    ...whInv.value,
    [shopId]: { ...prev, warehouseId: wid },
  };
}

function onShopStockInput(shopId: number, e: Event): void {
  const raw = (e.target as HTMLInputElement).value;
  const num = Math.max(0, parseInt(raw, 10) || 0);
  const prev = whInv.value[shopId] ?? { warehouseId: null, quantity: 0 };
  whInv.value = {
    ...whInv.value,
    [shopId]: { ...prev, quantity: num },
  };
}

// 调整店铺库存
function adjustShopStock(shopId: number, delta: number): void {
  const prev = whInv.value[shopId] ?? { warehouseId: null, quantity: 0 };
  const quantity = Math.max(0, (prev.quantity ?? 0) + delta);
  whInv.value = { ...whInv.value, [shopId]: { ...prev, quantity } };
}
// 店铺配额显示
function getQuotaDisplay(shopId: number, field: QuotaField): string {
  const entry = shopQuotaMap.value[shopId];
  if (!entry || entry.loading) return "--/--";
  if (!entry.data) return "--/--";
  return formatQuotaRemainLimit(entry.data[field]);
}
// 获取店铺配额数据
async function fetchShopQuotaForShop(shopId: number): Promise<void> {
  const cached = shopQuotaMap.value[shopId];
  if (cached?.data && !cached.loading) return;
  shopQuotaMap.value = { ...shopQuotaMap.value, [shopId]: { data: cached?.data ?? null, loading: true } };
  try {
    const data = await fetchShopRecordQuotaData(shopId);
    shopQuotaMap.value = { ...shopQuotaMap.value, [shopId]: { data, loading: false } };
  } catch {
    shopQuotaMap.value = { ...shopQuotaMap.value, [shopId]: { data: null, loading: false } };
  }
}

/** 变更说明：店铺有仓库数据时，默认选中第一个仓库；库存仍保持 0，交由用户后续填写。 */
function applyDefaultWarehouseForShop(shopId: number): void {
  const list = warehousesForShop(shopId);
  if (list.length === 0) return;
  const inv = whInv.value[shopId];
  if (inv?.warehouseId == null || !list.some((w) => w.warehouse_id === inv.warehouseId)) {
    whInv.value = {
      ...whInv.value,
      [shopId]: {
        warehouseId: list[0].warehouse_id,
        quantity: inv?.quantity ?? 0,
      },
    };
  }
}

async function fetchWarehousesForShop(shopId: number): Promise<void> {
  if (Object.prototype.hasOwnProperty.call(shopWarehouseMap.value, shopId)) {
    applyDefaultWarehouseForShop(shopId);
    return;
  }
  if (warehouseLoadingIds.value.has(shopId)) return;
  const nextLoading = new Set(warehouseLoadingIds.value);
  nextLoading.add(shopId);
  warehouseLoadingIds.value = nextLoading;
  try {
    const res = await apiService.getWarehouse(shopId);
    let list: OzonWarehouseRow[] = [];
    if (res.code === 200) {
      const raw = (res as any).data?.result ?? (res as any).data;
      list = Array.isArray(raw) ? raw : [];
    } else {
      showToast(res.msg || "获取仓库失败", 4000);
    }
    shopWarehouseMap.value = { ...shopWarehouseMap.value, [shopId]: list };
    applyDefaultWarehouseForShop(shopId);
  } catch (err: any) {
    showToast(err?.msg || err?.message || "获取仓库列表失败", 4000);
    shopWarehouseMap.value = { ...shopWarehouseMap.value, [shopId]: [] };
  } finally {
    const done = new Set(warehouseLoadingIds.value);
    done.delete(shopId);
    warehouseLoadingIds.value = done;
  }
}

watch(
  selectedShops,
  (ids) => {
    ids.forEach((id) => {
      void fetchWarehousesForShop(id);
      void fetchShopQuotaForShop(id);
    });
  },
  { immediate: true }
);

// 子组件独立读取：AI 模型展示（与系统设置同源 localStorage）
const aiModel = computed(
  () =>
    (typeof localStorage !== "undefined"
      ? localStorage.getItem("mjgd_ai_model")
      : null) || "qwen3-max"
);

/** 执行AI帮填信息 */
let handleExecuteFlag = false
let showModalTipText = ref(false)
async function onExecuteClick() {
  if (handleExecuteFlag) return;
  handleExecuteFlag = true;
  setTimeout(() => {
    handleExecuteFlag = false;
  }, 2000)
  const skuCount = getSkuVariantCount(transformedData.value);
  const maxVariantExecutionCount = await getMaxVariantExecutionCount();

  if (isVariantCountOverLimit(skuCount, maxVariantExecutionCount)) {
    showToast(formatVariantLimitExceededMessage(skuCount, maxVariantExecutionCount), 3500);
    return;
  }
  showModalTipText.value = true
  await workbench.handleExecute();
}
/** 重新获取AI帮填信息结果 */
async function onGetExecuteResult() {
  showModalTipText.value = false
  await workbench.handleGetExecuteResult();
}

// ozon网站不显示ai帮填信息按钮
const showExecute = computed(() => {
  const host = window.location.hostname;
  return !(host.includes('ozon.ru') || host.includes('ozon.kz'));
});

// 执行按钮文案（子组件内部计算）
const executeButtonText = computed(() => {
  if (isManualSelect.value || waitingForCategoryChange.value) return "继续";
  if (pipelineRunning.value) return "执行中...";
  if (submitResult.value?.length) return "重新上传";
  return "AI帮填信息";
});

function isAspectValueFilled(raw: unknown): boolean {
  if (Array.isArray(raw)) {
    return raw.some((item) => String(item ?? "").trim() !== "");
  }
  if (typeof raw === "string") {
    return raw.trim() !== "";
  }
  if (raw == null) return false;
  return String(raw).trim() !== "";
}

function getSkuAspectFieldKey(rowIndex: number, attrId: number): string {
  return `${rowIndex}-${attrId}`;
}

function getSkuTitleFieldKey(rowIndex: number): string {
  return `title-${rowIndex}`;
}

function getSkuOfferidPrefixFieldKey(rowIndex: number): string {
  return `offerid-prefix-${rowIndex}`;
}

function clearSkuTableFieldError(fieldKey: string) {
  if (!skuAspectValidationErrors.value[fieldKey]) return;
  const nextErrors = { ...skuAspectValidationErrors.value };
  delete nextErrors[fieldKey];
  skuAspectValidationErrors.value = nextErrors;
}

function getSkuAspectFieldError(rowIndex: number, attrId: number): string {
  return skuAspectValidationErrors.value[getSkuAspectFieldKey(rowIndex, attrId)] ?? "";
}

function hasSkuAspectFieldError(rowIndex: number, attrId: number): boolean {
  return Boolean(getSkuAspectFieldError(rowIndex, attrId));
}

function clearSkuAspectFieldError(rowIndex: number, attrId: number) {
  const key = getSkuAspectFieldKey(rowIndex, attrId);
  if (!skuAspectValidationErrors.value[key]) return;
  const nextErrors = { ...skuAspectValidationErrors.value };
  delete nextErrors[key];
  skuAspectValidationErrors.value = nextErrors;
}

function hasSkuTableFieldError(fieldKey: string): boolean {
  return Boolean(skuAspectValidationErrors.value[fieldKey]);
}

async function focusSkuTableFieldBySelector(selector: string, rowIndex: number) {
  skuVirtualRowsRef.value?.scrollToIndex(rowIndex, "center");
  await nextTick();
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const field = (skuTableScrollRef.value?.querySelector(selector) ||
      document.querySelector(selector)) as HTMLElement | null;
    if (field) {
      field.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
      requestAnimationFrame(() => {
        field.focus?.({ preventScroll: true });
      });
      return;
    }
    await nextTick();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}
async function focusSkuAspectField(rowIndex: number, attrId: number) {
  const fieldKey = getSkuAspectFieldKey(rowIndex, attrId);
  await focusSkuTableFieldBySelector(
    `[data-sku-aspect-field-key="${fieldKey}"]`,
    rowIndex
  );
}
async function focusSkuVariantField(rowIndex: number, fieldKey: string) {
  await focusSkuTableFieldBySelector(
    `[data-sku-variant-field-key="${fieldKey}"]`,
    rowIndex
  );
}

function applySkuAspectValidationErrorsFromItems(items: VariantAspectValidationItem[]) {
  const nextErrors: Record<string, string> = {};
  const attrs = aspectFeatureAttrs.value ?? [];
  items.forEach((item) => {
    const rowIndex = item.variantIndex - 1;
    if (rowIndex < 0) return;
    switch (item.issueType) {
      case "missing_required_aspect":
        if (item.attrId != null) {
          nextErrors[getSkuAspectFieldKey(rowIndex, item.attrId)] = `${item.attrName || "变体特征"}为必填项`;
        }
        break;
      case "missing_any_aspect":
        // 未填任何变体特征时，标红该行全部 aspect 字段，便于用户定位
        attrs.forEach((attr) => {
          nextErrors[getSkuAspectFieldKey(rowIndex, attr.id)] = "请填写变体特征";
        });
        break;
      case "missing_description":
        nextErrors[getSkuVariantDescriptionFieldKey(rowIndex)] = "变体描述不能为空";
        break;
      case "missing_variant_attr":
        if (item.attrId != null) {
          nextErrors[getSkuVariantFeatureFieldKey(rowIndex, item.attrId)] = `${item.attrName || "变体属性"}为必填项`;
        }
        break;
    }
  });
  skuAspectValidationErrors.value = nextErrors;
}

function validateSkuAspectBeforeSubmit() {
  const result = validateSkuAspectBeforeSubmitShared({
    featureAttrs: featureAttrs.value ?? [],
    transformedData: transformedData.value,
  });
  if (result.valid) {
    skuAspectValidationErrors.value = {};
    return result;
  }
  if (result.items?.length) {
    applySkuAspectValidationErrorsFromItems(result.items);
  }
  return result;
}

async function onSubmitToOzonClick() {
  if (selectedShops.value.length === 0) {
    showToast("请至少选择一个店铺", 2500);
    return;
  }
  for (const shopId of selectedShops.value) {
    const row = whInv.value?.[shopId];
    const warehouseLoaded = Object.prototype.hasOwnProperty.call(
      shopWarehouseMap.value,
      shopId
    );
    const hasWarehouseOptions = warehousesForShop(shopId).length > 0;
    // 变更说明：仅当店铺实际返回了仓库列表时，才校验仓库必选；无仓库数据时允许直接上架。
    if (warehouseLoaded && hasWarehouseOptions && (row == null || row.warehouseId == null)) {
      const shopName =
        shops.value.find((shop) => shop.id === shopId)?.name || `店铺${shopId}`;
      showToast(`请先为${shopName}选择仓库`, 3000);
      return;
    }
  }
  const imageCountValidation = validateVariantImageCountBeforeSubmit({
    transformedData: transformedData.value,
  });
  if (!imageCountValidation.valid) {
    workbench.showVariantImageCountWarning({
      message: imageCountValidation.message || "变体图片数量超出限制",
      items: imageCountValidation.items || [],
    });
    return;
  }
  const aspectValidation = validateSkuAspectBeforeSubmit();
  if (!aspectValidation.valid) {
    workbench.showVariantAspectWarning({
      message: aspectValidation.message || "变体特征未完善",
      items: aspectValidation.items || [],
    });
    return;
  }
  await workbench.submitProductData();
}

// ---------- 内联 ProgressBar ----------
const progressPercentage = computed(() => {
  const steps = progressSteps.value;
  const totalSteps = steps.length;
  let lastCompletedIndex = -1;
  let activeIndex = -1;
  steps.forEach((step: { status: string }, index: number) => {
    if (step.status === "completed") lastCompletedIndex = index;
    else if (step.status === "active" && activeIndex === -1)
      activeIndex = index;
  });
  if (activeIndex !== -1) return ((activeIndex + 0.5) / totalSteps) * 100;
  if (lastCompletedIndex !== -1)
    return ((lastCompletedIndex + 1) / totalSteps) * 100;
  return 0;
});

// ---------- 内联 CategorySelector ----------
const categorySelectorDisabled = computed(
  () =>
    pipelineRunning.value &&
    !isManualSelect.value &&
    !waitingForCategoryChange.value
);
const selectedCategoryDisplayName = computed(() => {
  const id = categoryTemplate.value;
  if (id == null) return "";
  const t = categoryTemplates.value.find((x) => x.id === id);
  return t?.name ?? "";
});

// ---------- 类目选择弹窗（AI帮选 + 树形类目） ----------
interface CategoryTreeNodeItem {
  id: number;
  label: string;
  children?: CategoryTreeNodeItem[];
  disabled?: boolean;
  descriptionCategoryId?: number;
  typeId?: number;
}
interface SelectedLeaf {
  id: number;
  label: string;
  fullPath: string;
  level1Id: number;
  level2Id: number;
  descriptionCategoryId: number;
  typeId: number;
}

interface OzonCategoryTreeNode {
  category_id?: number | string;
  category_name?: string;
  description_category_id?: number | string;
  type_id?: number | string;
  type_name?: string;
  name?: string;
  disabled?: boolean;
  children?: OzonCategoryTreeNode[];
  types?: OzonCategoryTreeNode[];
}

const categoryDialogVisible = ref(false);
const categoryTreeFilterText = ref("");
const categoryTreeLoading = ref(false);
const categoryTreeData = ref<{ result: CategoryTreeNodeItem[] } | null>(null);
const categoryTreeStoreId = ref<number | null>(null);
let categoryTreeRequestVersion = 0;
const expandedCategoryNodeIds = ref<Set<number>>(new Set());
const selectedLeaf = ref<SelectedLeaf | null>(null);
const categoryTreeWrapRef = ref<HTMLElement | null>(null);
/** 弹窗内待确认的 AI 类目（点确定后才提交） */
const pendingAiTemplate = ref<{
  id: number;
  name: string;
  data?: any;
} | null>(null);

function scrollCategoryTreeToActiveLeaf(opts?: { behavior?: ScrollBehavior }) {
  const wrap = categoryTreeWrapRef.value;
  if (!wrap) return;
  const activeEl = wrap.querySelector(
    ".mjgd-category-tree-node-row.is-active"
  ) as HTMLElement | null;
  if (!activeEl) return;
  activeEl.scrollIntoView({
    block: "nearest",
    inline: "nearest",
    behavior: opts?.behavior ?? "smooth",
  });
}

function getCategoryMetadataFromTemplate(tpl: { data?: any } | null): any | null {
  if (!tpl?.data) return null;
  // 兼容不同数据结构：优先 data.metadata，其次 data.data.metadata
  return tpl.data?.metadata ?? tpl.data?.data?.metadata ?? null;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** 将 Ozon 官方类目树归一为工作台树，并保留上架所需的两个独立 ID。 */
function normalizeOzonCategoryTree(
  nodes: OzonCategoryTreeNode[],
  inheritedDescriptionCategoryId: number | null = null
): CategoryTreeNodeItem[] {
  const normalized: CategoryTreeNodeItem[] = [];

  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== "object") continue;

    const descriptionCategoryId =
      toPositiveInteger(node.description_category_id ?? node.category_id) ??
      inheritedDescriptionCategoryId;
    const typeId = toPositiveInteger(node.type_id);
    const childSource = [
      ...(Array.isArray(node.children) ? node.children : []),
      ...(Array.isArray(node.types) ? node.types : []),
    ];
    const children = normalizeOzonCategoryTree(
      childSource,
      descriptionCategoryId
    );
    const label = String(
      (typeId ? node.type_name : "") ||
        node.category_name ||
        node.type_name ||
        node.name ||
        ""
    ).trim();

    if (!label) {
      normalized.push(...children);
      continue;
    }

    // 类目 ID 与类型 ID 属于不同命名空间；类型节点使用负数作为纯 UI key。
    const uiId = typeId
      ? -typeId
      : descriptionCategoryId ?? -(normalized.length + 1_000_000_000);
    normalized.push({
      id: uiId,
      label,
      children,
      disabled: Boolean(node.disabled),
      descriptionCategoryId: descriptionCategoryId ?? undefined,
      typeId: typeId ?? undefined,
    });
  }

  return normalized;
}

/** 在本地加载的 Ozon 官方类目树中按 typeId 查找路径。 */
function findCategoryPathInTree(
  nodes: CategoryTreeNodeItem[],
  targetId: number,
  path: CategoryTreeNodeItem[] = []
): CategoryTreeNodeItem[] | null {
  for (const node of nodes) {
    if (!node || node.disabled) continue;
    const nextPath = [...path, node];
    if (node.typeId === targetId) {
      return nextPath;
    }
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length) {
      const found = findCategoryPathInTree(children, targetId, nextPath);
      if (found) return found;
    }
  }
  return null;
}

function applyTreeSelectionFromPath(path: CategoryTreeNodeItem[]) {
  if (!path.length) return;
  const leaf = path[path.length - 1];
  const level1 = path[0];
  const typeId = leaf.typeId;
  const descriptionCategoryId =
    leaf.descriptionCategoryId ??
    [...path]
      .reverse()
      .map((node) => node.descriptionCategoryId)
      .find((id): id is number => Number.isFinite(id));
  if (!typeId || !descriptionCategoryId) return;
  const expandIds = path
    .slice(0, -1)
    .map((n) => n.id)
    .filter((id) => Number.isFinite(id));

  expandedCategoryNodeIds.value = new Set<number>([
    ...expandedCategoryNodeIds.value,
    ...expandIds,
  ]);

  selectedLeaf.value = {
    id: typeId,
    label: leaf.label,
    fullPath: path.map((n) => n.label).join("/"),
    level1Id: level1.descriptionCategoryId ?? descriptionCategoryId,
    level2Id: descriptionCategoryId,
    descriptionCategoryId,
    typeId,
  };
}

function syncTreeSelectionFromAiTemplate(tpl: { id: number; name: string; data?: any } | null) {
  const md = getCategoryMetadataFromTemplate(tpl);
  const typeId = md?.typeId != null ? Number(md.typeId) : NaN;

  // 优先用 typeId 在类目树中反查路径（sku/shops 的 level4 id 不在树中，不能用于展开）
  const treeNodes = categoryTreeData.value?.result ?? [];
  if (Number.isFinite(typeId) && treeNodes.length) {
    const path = findCategoryPathInTree(treeNodes, typeId);
    if (path && path.length >= 2) {
      applyTreeSelectionFromPath(path);
      return;
    }
  }

  const level1Id = md?.level1Id != null ? Number(md.level1Id) : NaN;
  const level2Id = md?.level2Id != null ? Number(md.level2Id) : NaN;
  const descriptionCategoryId = Number(
    md?.descriptionCategoryId ?? md?.description_category_id ?? md?.level2Id
  );
  if (!Number.isFinite(level1Id) || !Number.isFinite(level2Id) || !Number.isFinite(typeId)) {
    return;
  }

  // 展开到二级（一级节点 id、二级节点 id）
  expandedCategoryNodeIds.value = new Set<number>([
    ...expandedCategoryNodeIds.value,
    level1Id,
    level2Id,
  ]);

  const level1Name = String(md?.level1NameZh ?? md?.level1Name ?? "").trim();
  const level2Name = String(md?.level2NameZh ?? md?.level2Name ?? "").trim();
  const typeName = String(md?.typeNameZh ?? md?.typeName ?? tpl?.name ?? "").trim();
  const fullPath = [level1Name, level2Name, typeName].filter(Boolean).join("/");

  // 让树高亮对应三级叶子
  selectedLeaf.value = {
    id: typeId,
    label: typeName || String(tpl?.name ?? ""),
    fullPath: fullPath || String(tpl?.name ?? ""),
    level1Id,
    level2Id,
    descriptionCategoryId: Number.isFinite(descriptionCategoryId)
      ? descriptionCategoryId
      : level2Id,
    typeId,
  };
}

async function ensureCategoryTreeLoaded() {
  const storeId = Number(selectedShops.value[0] ?? shops.value[0]?.id);
  if (!Number.isInteger(storeId) || storeId <= 0) {
    categoryTreeData.value = { result: [] };
    categoryTreeStoreId.value = null;
    showToast("请先配置并选择 Ozon 店铺", 2500);
    return;
  }
  if (categoryTreeData.value && categoryTreeStoreId.value === storeId) return;

  const requestVersion = ++categoryTreeRequestVersion;
  categoryTreeLoading.value = true;
  try {
    const url =
      `${API_CONFIG.LOCAL_API_BASE_URL}/selection/ozon-categories` +
      `?store_id=${encodeURIComponent(String(storeId))}&language=ZH_HANS`;
    const data = await proxyFetchJson<{ categories?: OzonCategoryTreeNode[] }>(
      url,
      { method: "GET", preset: "local_auth", timeout: 15000 }
    );
    if (requestVersion !== categoryTreeRequestVersion) return;
    categoryTreeData.value = {
      result: normalizeOzonCategoryTree(data?.categories ?? []),
    };
    categoryTreeStoreId.value = storeId;
  } catch (e) {
    if (requestVersion !== categoryTreeRequestVersion) return;
    console.error("加载类目树失败:", e);
    categoryTreeData.value = { result: [] };
    categoryTreeStoreId.value = storeId;
    showToast("Ozon 类目加载失败，请检查本地服务和店铺凭证", 3000);
  } finally {
    if (requestVersion === categoryTreeRequestVersion) {
      categoryTreeLoading.value = false;
    }
  }
}

function openCategoryDialog() {
  if (categorySelectorDisabled.value) return;
  categoryDialogVisible.value = true;
  categoryTreeFilterText.value = "";
  selectedLeaf.value = null;
  pendingAiTemplate.value = null;
  const curId = categoryTemplate.value;
  if (curId != null) {
    const fromAi = categoryTemplates.value.find((x) => x.id === curId);
    if (fromAi) pendingAiTemplate.value = { ...fromAi };
  }
  void ensureCategoryTreeLoaded();
}

function closeCategoryDialog() {
  categoryDialogVisible.value = false;
  categoryTreeFilterText.value = "";
  selectedLeaf.value = null;
  pendingAiTemplate.value = null;
}

function selectPendingAiTemplate(t: { id: number; name: string; data?: any }) {
  pendingAiTemplate.value = { id: t.id, name: t.name, data: t.data };
  // AI 与树互斥：点击 AI 后同步展开/高亮树（若 metadata 可用）
  selectedLeaf.value = null;
  syncTreeSelectionFromAiTemplate(pendingAiTemplate.value);
  nextTick(() => scrollCategoryTreeToActiveLeaf());
}

function toggleCategoryNode(nodeId: number) {
  const next = new Set(expandedCategoryNodeIds.value);
  if (next.has(nodeId)) next.delete(nodeId);
  else next.add(nodeId);
  expandedCategoryNodeIds.value = next;
}

function pickLeaf(payload: SelectedLeaf) {
  pendingAiTemplate.value = null;
  selectedLeaf.value = payload;
  nextTick(() => scrollCategoryTreeToActiveLeaf());
}

// AI/树联动：树数据异步加载时补一次同步；以及打开弹窗后有默认 AI 时同步
watch(
  [categoryDialogVisible, pendingAiTemplate, categoryTreeData],
  ([visible, tpl]) => {
    if (!visible) return;
    if (!tpl) return;
    // tree data 可能还没到，这里在 data 更新时会再次触发
    nextTick(() => {
      syncTreeSelectionFromAiTemplate(tpl);
      nextTick(() => scrollCategoryTreeToActiveLeaf());
    });
  },
  { deep: false }
);

function confirmCategoryDialog() {
  const ai = pendingAiTemplate.value;
  if (ai) {
    workbench.handleCategorySelect({
      id: ai.id,
      name: ai.name,
      data: ai.data,
    });
    closeCategoryDialog();
    return;
  }
  if (!selectedLeaf.value) {
    showToast("请先选择类目（AI 推荐或树形三级类目）", 2500);
    return;
  }
  const leaf = selectedLeaf.value;
  const newId = -(Math.abs(leaf.id) + 1000000);
  const parts = leaf.fullPath.split("/").map((s) => s.trim());
  const newItem = {
    id: newId,
    name: leaf.fullPath,
    data: {
      metadata: {
        level1NameZh: parts[0] ?? "",
        level2NameZh: parts[1] ?? "",
        typeNameZh: parts[2] ?? leaf.label,
        level1Id: String(leaf.level1Id),
        level2Id: String(leaf.level2Id),
        descriptionCategoryId: String(leaf.descriptionCategoryId),
        typeId: String(leaf.typeId),
      },
    },
  };
  workbench.handleCategorySelect({
    id: newId,
    name: leaf.fullPath,
    data: newItem.data,
  });
  closeCategoryDialog();
}

const filteredCategoryTree = computed<CategoryTreeNodeItem[]>(() => {
  const nodes = categoryTreeData.value?.result ?? [];
  const q = (categoryTreeFilterText.value || "").trim().toLowerCase();
  if (!q) return nodes;

  const match = (text: string) => text.toLowerCase().includes(q);
  const walk = (list: CategoryTreeNodeItem[], prefixPath: string): CategoryTreeNodeItem[] => {
    const out: CategoryTreeNodeItem[] = [];
    for (const n of list) {
      if (!n || n.disabled) continue;
      const currentPath = prefixPath ? `${prefixPath}/${n.label}` : n.label;
      const children = Array.isArray(n.children) ? n.children : [];
      const filteredChildren = children.length ? walk(children, currentPath) : [];
      const hit = match(n.label) || match(currentPath);
      if (hit || filteredChildren.length) {
        out.push({ ...n, children: filteredChildren });
      }
    }
    return out;
  };
  return walk(nodes, "");
});

// 递归树节点：使用内联组件（避免引入额外文件）
const CategoryTreeNode: any = defineComponent({
  name: "CategoryTreeNode",
  props: {
    node: { type: Object as any, required: true },
    level: { type: Number, required: true },
    path: { type: String, required: true },
    level1Id: { type: Number, required: true },
    level2Id: { type: Number, required: false },
    expandedIds: { type: Object as any, required: true },
    activeLeafId: { type: Number, required: false, default: null },
    filterText: { type: String, required: true },
  },
  emits: ["toggle", "pickLeaf"],
  setup(props: any, { emit }: any): () => any {
    const hasChildren = computed(
      () => Array.isArray(props.node.children) && props.node.children.length > 0
    );
    const expanded = computed(() => props.expandedIds.has(props.node.id));
    const shouldAutoExpand = computed(
      () => (props.filterText || "").trim() !== ""
    );
    const isSelectableLeaf = computed(
      () =>
        !hasChildren.value &&
        Number(props.node.typeId) > 0 &&
        Number(props.node.descriptionCategoryId) > 0
    );
    const isActiveLeaf = computed(
      () => isSelectableLeaf.value && props.activeLeafId === props.node.typeId
    );

    function onToggle() {
      emit("toggle", props.node.id);
    }
    function onClickLabel() {
      if (isSelectableLeaf.value) {
        emit("pickLeaf", {
          id: props.node.typeId,
          label: props.node.label,
          fullPath: props.path,
          level1Id:
            Number(props.level1Id) > 0
              ? props.level1Id
              : props.node.descriptionCategoryId,
          level2Id: props.node.descriptionCategoryId,
          descriptionCategoryId: props.node.descriptionCategoryId,
          typeId: props.node.typeId,
        });
        return;
      }
      if (hasChildren.value) onToggle();
    }

    return () => {
      const children: any[] = Array.isArray(props.node.children)
        ? props.node.children
        : [];
      const showChildren = shouldAutoExpand.value || expanded.value;

      const row = h(
        "div",
        {
          class: [
            "mjgd-category-tree-node-row",
            isActiveLeaf.value ? "is-active" : "",
            isSelectableLeaf.value ? "is-leaf" : "",
          ],
          onClick: onClickLabel,
          title: props.node.label,
          role: "button",
          tabindex: 0,
        },
        [
          h(
            "span",
            {
              class: [
                "mjgd-category-tree-node-caret",
                !hasChildren.value ? "is-placeholder" : "",
              ],
            },
            hasChildren.value ? (showChildren ? "▾" : "▸") : ""
          ),
          h(
            "span",
            { class: "mjgd-category-tree-node-label" },
            props.node.label
          ),
        ]
      );

      const nextLevel = props.level + 1;
      const childList: any =
        hasChildren.value && showChildren
          ? h(
              "ul",
              { class: "mjgd-category-tree-children" },
              children.map((c: any) => {
                const nextPath = `${props.path}/${c.label}`;
                // level1Id: 根节点 id；level2Id: 第二层节点 id
                const nextLevel1Id =
                  props.level === 1
                    ? props.node.descriptionCategoryId ?? props.node.id
                    : props.level1Id;
                const nextLevel2Id =
                  props.level === 1
                    ? c.id
                    : props.level === 2
                      ? props.node.id
                      : props.level2Id;
                return h(CategoryTreeNode as any, {
                  key: c.id,
                  node: c,
                  level: nextLevel,
                  path: nextPath,
                  level1Id: nextLevel1Id,
                  level2Id: nextLevel2Id,
                  expandedIds: props.expandedIds,
                  activeLeafId: props.activeLeafId,
                  filterText: props.filterText,
                  onToggle: (id: number) => emit("toggle", id),
                  onPickLeaf: (payload: any) => emit("pickLeaf", payload),
                });
              })
            )
          : null;

      return h(
        "li",
        { class: ["mjgd-category-tree-node", `lvl-${props.level}`] },
        [row, childList]
      );
    };
  },
});

// ---------- 特征属性（由父组件 AiCollectModal 拉取并 provide，此处仅展示与编辑值）----------
interface FeatureAttrDictValue {
  id: number;
  value: string;
  info?: string;
  picture?: string;
}
interface FeatureAttrItem {
  id: number;
  name: string;
  type?: string;
  is_required?: boolean;
  is_aspect?: boolean;
  is_collection?: boolean;
  dictionary_id?: number;
  dictionary_values?: FeatureAttrDictValue[];
  value?: string;
  [key: string]: any;
}
const DESCRIPTION_FIELD_KEY = "description";
const FIELD_SCOPE_STORAGE_KEY = "__mjgd_field_scope";
const FEATURE_SCOPE_STORAGE_KEY = "__mjgd_feature_scope";
const SKU_VARIANT_FEATURE_STORAGE_KEY = "__mjgd_variant_feature_values";
const SKU_VARIANT_DESCRIPTION_STORAGE_KEY = "__mjgd_variant_description";
const FEATURE_ATTR_ID_DESCRIPTION = 4191; //商品描述字段对应的id
/** 类型：由类目 metadata.typeId 自动回填，不在必填特征区展示 */
const FEATURE_ATTR_ID_TYPE = 8229;

/** 品牌（必填特征远程搜索） */
const FEATURE_ATTR_ID_BRAND_TYPE = 85; // 品牌
const FEATURE_ATTR_ID_FASHION_BRAND = 31; // 服装和鞋类品牌

const FEATURE_ATTR_ID_VIDEO_URL = 21841;
const MANAGED_BY_SKU_MEDIA_ATTR_IDS = new Set<number>([
  FEATURE_ATTR_ID_VIDEO_URL,
]);
const featureAttrExpandAll = ref(false);
// start 此处用于展开所有特征属性
const expandAll = () => {
  featureAttrExpandAll.value = true
}
async function focusFeatureAttrField(attrId: number) {
  expandAll();
  await nextTick();
  const field = document.querySelector(`[data-feature-attr-id="${attrId}"]`);
  if (field instanceof HTMLElement) {
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = field.querySelector("input, select, textarea, [tabindex]");
    if (input instanceof HTMLElement) {
      input.focus();
    }
  }
}

async function focusManualEditField(focus: {
  kind: "feature" | "sku";
  attrId?: number;
  rowIndex?: number;
  skuField?: "aspect" | "variant_feature" | "variant_description";
}) {
  if (focus.kind === "feature" && focus.attrId != null) {
    await focusFeatureAttrField(focus.attrId);
    return;
  }
  const rowIndex = focus.rowIndex ?? 0;
  if (focus.kind === "sku") {
    if (focus.skuField === "variant_description") {
      await focusSkuVariantField(rowIndex, getSkuVariantDescriptionFieldKey(rowIndex));
      return;
    }
    if (focus.skuField === "variant_feature" && focus.attrId != null) {
      await focusSkuVariantField(rowIndex, getSkuVariantFeatureFieldKey(rowIndex, focus.attrId));
      return;
    }
    if (focus.attrId != null) {
      await focusSkuAspectField(rowIndex, focus.attrId);
      return;
    }
    skuVirtualRowsRef.value?.scrollToIndex(rowIndex, "center");
  }
}

defineExpose({
  expandAll,
  focusFeatureAttrField,
  focusSkuAspectField,
  focusSkuVariantField,
  focusManualEditField,
  getFeatureAttrValue,
  getSkuAspectString,
  getSkuVariantFeatureValue,
  getSkuJsonRichText,
  getSkuVariantDescription,
  getSkuTitleValue,
})
// end
const featureAttrValues = ref<Record<string, string | number | string[]>>({});
const selectedCategoryTemplate = computed(() => {
  const id = categoryTemplate.value;
  if (id == null) return null;
  return categoryTemplates.value.find((t) => t.id === id) ?? null;
});
/** 主变体特征：仅在 SKU 表格中按行填写 */
const aspectFeatureAttrs = computed(() =>
  featureAttrs.value.filter((a: FeatureAttrItem) => a.is_aspect === true)
);
const jsonRichTextAttr = computed<FeatureAttrItem | null>(() =>
  featureAttrs.value.find((attr: FeatureAttrItem) =>
    String(attr?.name || "").includes("JSON富内容")
  ) ?? null
);
function isIntroFeatureAttr(attr: FeatureAttrItem | null | undefined): boolean {
  return String(attr?.name || "").includes("简介");
}
function isManagedBySkuMediaAttr(
  attr: FeatureAttrItem | null | undefined
): boolean {
  return MANAGED_BY_SKU_MEDIA_ATTR_IDS.has(Number(attr?.id));
}
const jsonRichTextValue = computed(() => {
  const attr = jsonRichTextAttr.value;
  if (attr) {
    return getFeatureAttrValue(attr.id);
  }
  return String(transformedData.value?.global_data?.json_rich_text || "");
});
const hasSkuJsonRichTextColumn = computed(() =>
  Boolean(jsonRichTextAttr.value)
);
const skuVirtualRowHeight = 104;
const skuVirtualOverscan = 8;
const skuVirtualMinItemsToEnable = 30;
const skuTableColumnCount = computed(
  () =>
    10 +
    (hasSkuJsonRichTextColumn.value ? 1 : 0) +
    aspectFeatureAttrs.value.length +
    featureAttrs.value.filter(
      (a: FeatureAttrItem) =>
        !a.is_aspect &&
        !isJsonRichTextFeatureAttr(a) &&
        !isIntroFeatureAttr(a) &&
        !isManagedBySkuMediaAttr(a) &&
        isVariantFeature(a.id)
    ).length +
    (isVariantField(DESCRIPTION_FIELD_KEY) ? 1 : 0)
);

function getRootGlobalData(): Record<string, any> {
  const root = workbench.transformedData?.value;
  if (!root || typeof root !== "object") return {};
  if (!root.global_data || typeof root.global_data !== "object") {
    root.global_data = {};
  }
  return root.global_data;
}
function getFieldScopeMap(): Record<string, string> {
  const globalData = getRootGlobalData();
  const raw = globalData[FIELD_SCOPE_STORAGE_KEY];
  return raw && typeof raw === "object"
    ? raw
    : { title: "variant", [DESCRIPTION_FIELD_KEY]: "common" };
}
function setFieldScope(field: string, scope: "common" | "variant") {
  const globalData = getRootGlobalData();
  globalData[FIELD_SCOPE_STORAGE_KEY] = {
    ...getFieldScopeMap(),
    [field]: scope,
  };
}
function isVariantField(field: string): boolean {
  return getFieldScopeMap()[field] === "variant";
}
function getFeatureScopeMap(): Record<string, string> {
  const globalData = getRootGlobalData();
  const raw = globalData[FEATURE_SCOPE_STORAGE_KEY];
  return raw && typeof raw === "object" ? raw : {};
}
function setFeatureScope(attrId: number, scope: "common" | "variant") {
  const globalData = getRootGlobalData();
  globalData[FEATURE_SCOPE_STORAGE_KEY] = {
    ...getFeatureScopeMap(),
    [String(attrId)]: scope,
  };
}
function isVariantFeature(attrId: number): boolean {
  return getFeatureScopeMap()[String(attrId)] === "variant";
}
function getSkuScopedFeatureMap(sku: any): Record<string, any> {
  if (!sku || typeof sku !== "object") return {};
  if (
    !sku[SKU_VARIANT_FEATURE_STORAGE_KEY] ||
    typeof sku[SKU_VARIANT_FEATURE_STORAGE_KEY] !== "object"
  ) {
    sku[SKU_VARIANT_FEATURE_STORAGE_KEY] = {};
  }
  return sku[SKU_VARIANT_FEATURE_STORAGE_KEY];
}
function normalizeScopedAttrValue(attr: FeatureAttrItem, value: unknown): string | string[] {
  if (attr.is_collection) {
    return parseMultiValue(value);
  }
  if (value == null) return "";
  return String(value);
}
const variantOutputFeatureAttrs = computed(() =>
  featureAttrs.value.filter(
    (a: FeatureAttrItem) =>
      !a.is_aspect &&
      !isJsonRichTextFeatureAttr(a) &&
      !isIntroFeatureAttr(a) &&
      !isManagedBySkuMediaAttr(a) &&
      isVariantFeature(a.id)
  )
);

const skuVideoUrlList = workbench.skuVideoUrlList;
const mediaUploadDialogVisible = ref(false);
const mediaUploadValue = ref('');
const mediaEditingIndex = ref<number | null>(null);
const mediaPreviewImageVisible = ref(false);
const mediaPreviewImageUrl = ref('');

function normalizeSkuMediaValue(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string" || typeof raw === "number") {
    return String(raw).trim();
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const normalized = normalizeSkuMediaValue(item);
      if (normalized) return normalized;
    }
    return "";
  }
  if (typeof raw !== "object") return "";
  const record = raw as Record<string, unknown>;
  const candidates = [
    record.value,
    record.url,
    record.link,
    record.src,
    record.media_url,
    record.mediaUrl,
    record.video_url,
    record.videoUrl,
    record.cover_url,
    record.coverUrl,
    record.poster,
    record.poster_url,
    record.posterUrl,
    record.file_url,
    record.fileUrl,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeSkuMediaValue(candidate);
    if (normalized) return normalized;
  }
  return "";
}

function getSkuMediaValueByAttrId(sku: any, attrId: number): string {
  if (!sku || typeof sku !== "object") return "";
  const attrKey = String(attrId);
  const variantFeatureValue = normalizeSkuMediaValue(
    sku?.[SKU_VARIANT_FEATURE_STORAGE_KEY]?.[attrKey]
  );
  if (variantFeatureValue) return variantFeatureValue;
  const aspectValue = normalizeSkuMediaValue(sku?.aspect_feature_values?.[attrKey]);
  if (aspectValue) return aspectValue;

  const attrCollections = [
    sku?.attributes,
    sku?.attribute_values,
    sku?.attributeValues,
    sku?.feature_values,
    sku?.featureValues,
  ];
  for (const collection of attrCollections) {
    if (!Array.isArray(collection)) continue;
    const matched = collection.find(
      (item: any) =>
        Number(item?.id ?? item?.attribute_id ?? item?.attr_id) === attrId
    );
    if (!matched) continue;
    const normalized = normalizeSkuMediaValue(
      matched?.values ??
        matched?.attribute_values ??
        matched?.attributeValues ??
        matched?.value ??
        matched?.url
    );
    if (normalized) return normalized;
  }
  return "";
}

function collectSkuVideoMapFromData(data: any): Record<number, string> {
  const videoMap: Record<number, string> = {};
  const skuList = data?.sku_matrix;
  if (!Array.isArray(skuList)) return videoMap;

  skuList.forEach((sku: any, index: number) => {
    const videoValue = String(
      skuVideoUrlList.value[index] ||
        getSkuMediaValueByAttrId(sku, FEATURE_ATTR_ID_VIDEO_URL)
    ).trim();
    if (videoValue) videoMap[index] = videoValue;
  });

  return videoMap;
}

function hydrateSkuVideoMapFromData(data: any, replace = false) {
  const videoMap = collectSkuVideoMapFromData(data);
  // replace=true：切换商品时以当前 transformed 为准，避免旧商品视频泄漏
  skuVideoUrlList.value = replace
    ? videoMap
    : {
        ...videoMap,
        ...skuVideoUrlList.value,
      };
}

function isJsonRichTextFeatureAttr(attr: FeatureAttrItem): boolean {
  return String(attr?.name || "").includes("JSON富内容");
}

// start 可搜索下拉选择器
// 控制下拉框显示隐藏
const showDropdownMap = ref<Record<number, boolean>>({})
// 搜索关键词
const searchKeywordMap = ref<Record<number, string>>({})
// 品牌远程搜索结果与加载态（attr.id=85/31）
const brandRemoteOptionsMap = ref<Record<number, FeatureAttrDictValue[]>>({})
const brandRemoteLoadingMap = ref<Record<number, boolean>>({})
let brandSearchTimer: number | null = null
let brandSearchSeq = 0

function isBrandFeatureAttr(attr: FeatureAttrItem): boolean {
  const attrId = Number(attr.id)
  return attrId === FEATURE_ATTR_ID_BRAND_TYPE || attrId === FEATURE_ATTR_ID_FASHION_BRAND
}

function clearBrandRemoteState(attrId?: number) {
  if (brandSearchTimer != null) {
    window.clearTimeout(brandSearchTimer)
    brandSearchTimer = null
  }
  if (attrId != null) {
    const nextOptions = { ...brandRemoteOptionsMap.value }
    const nextLoading = { ...brandRemoteLoadingMap.value }
    delete nextOptions[attrId]
    delete nextLoading[attrId]
    brandRemoteOptionsMap.value = nextOptions
    brandRemoteLoadingMap.value = nextLoading
    return
  }
  brandRemoteOptionsMap.value = {}
  brandRemoteLoadingMap.value = {}
}

function onBrandSearchInput(attr: FeatureAttrItem) {
  const attrId = attr.id
  const keyword = (searchKeywordMap.value[attrId] || '').trim()
  if (brandSearchTimer != null) {
    window.clearTimeout(brandSearchTimer)
    brandSearchTimer = null
  }
  if (!keyword) {
    clearBrandRemoteState(attrId)
    return
  }
  brandSearchTimer = window.setTimeout(() => {
    void runBrandSearch(attrId, keyword)
  }, 500)
}

async function runBrandSearch(attrId: number, keyword: string) {
  const seq = ++brandSearchSeq
  brandRemoteLoadingMap.value = { ...brandRemoteLoadingMap.value, [attrId]: true }
  try {
    const results = await searchBrand(keyword)
    if (seq !== brandSearchSeq) return
    brandRemoteOptionsMap.value = {
      ...brandRemoteOptionsMap.value,
      [attrId]: results
        .map((item) => ({ id: Number(item.id), value: item.value }))
        .filter((item) => Number.isFinite(item.id)),
    }
  } finally {
    if (seq === brandSearchSeq) {
      brandRemoteLoadingMap.value = { ...brandRemoteLoadingMap.value, [attrId]: false }
    }
  }
}

function getBrandSelectOptions(attr: FeatureAttrItem): FeatureAttrDictValue[] {
  const local = attr.dictionary_values || []
  const keyword = (searchKeywordMap.value[attr.id] || '').trim()
  if (!keyword) return local
  const localMatched = filterOptions(local, attr.id)
  const remote = brandRemoteOptionsMap.value[attr.id] || []
  const seen = new Set<string>()
  const merged: FeatureAttrDictValue[] = []
  for (const opt of [...localMatched, ...remote]) {
    const key = String(opt.id)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(opt)
  }
  return merged
}

// 关闭所有可搜索选择器
const closeAllDropdowns = () => {
  for (const key in showDropdownMap.value) {
    showDropdownMap.value[Number(key)] = false
  }
}
// 切换下拉
const toggleDropdown = (attrId: number) => {
  if (openMultiAttrId.value) { //如果有已打开的多选框则关闭
    openMultiAttrId.value = null
  }
  for (const key in showDropdownMap.value) {
    if (Number(key) === attrId) continue
    showDropdownMap.value[Number(key)] = false
  }
  const willOpen = !showDropdownMap.value[attrId]
  showDropdownMap.value[attrId] = willOpen
  if (!willOpen) {
    searchKeywordMap.value[attrId] = ''
    clearBrandRemoteState(attrId)
  }
}
// 选择选项
const selectOption = (attrId: number, optId?: number, optValue?: string) => {
  showDropdownMap.value[attrId] = false
  searchKeywordMap.value[attrId] = ''
  clearBrandRemoteState(attrId)
  if (optId && optValue) setFeatureAttrValue(attrId, String(optId))
}
// 过滤搜索
const filterOptions = (options: any[], attrId: number) => {
  const keyword = searchKeywordMap.value[attrId] || ''
  if (!keyword) return options
  return options.filter(opt => opt.value.includes(keyword))
}
// end 可搜索下拉选择器

const requiredAttrs = computed(() => {
  return featureAttrs.value.filter(
    (a: FeatureAttrItem) =>
      a.is_required === true &&
      a.id !== FEATURE_ATTR_ID_TYPE &&
      !a.is_aspect &&
      !isJsonRichTextFeatureAttr(a) &&
      !isIntroFeatureAttr(a) &&
      !isManagedBySkuMediaAttr(a) &&
      !isVariantFeature(a.id)
  )
});
const optionalAttrs = computed(() =>
  featureAttrs.value.filter(
    (a: FeatureAttrItem) =>
      a.is_required !== true &&
      !a.is_aspect &&
      !isJsonRichTextFeatureAttr(a) &&
      !isIntroFeatureAttr(a) &&
      !isManagedBySkuMediaAttr(a) &&
      !isVariantFeature(a.id)
  )
);
// 展开全部时：必填项在前、非必填项在后，不覆盖原有必填项区域
const visibleAttrs = computed(() =>
  featureAttrExpandAll.value
    ? [...requiredAttrs.value, ...optionalAttrs.value]
    : requiredAttrs.value
);

const openSkuAspectSingleKey = ref<string | null>(null);
const openSkuAspectSingleRowIndex = ref<number | null>(null);
const openSkuAspectSingleSearchText = ref(""); // SKU 列表单选弹窗搜索文本
const openSkuAspectSingleAttr = ref<FeatureAttrItem | null>(null);
const skuAspectSingleTriggerEl = ref<HTMLElement | null>(null);
const skuAspectSinglePopoverRef = ref<HTMLElement | null>(null);
const skuAspectSinglePopoverStyle = ref<Record<string, string>>({});
const skuAspectSinglePlacement = ref<"top" | "bottom">("bottom");
const openSkuAspectMultiKey = ref<string | null>(null);
const openSkuAspectMultiRowIndex = ref<number | null>(null);
const openSkuAspectMultiSearchText = ref<string>('') // 列表单选框搜索文本
const openSkuAspectMultiAttr = ref<FeatureAttrItem | null>(null);
const skuAspectMultiTriggerEl = ref<HTMLElement | null>(null);
const skuAspectMultiPopoverRef = ref<HTMLElement | null>(null);
const skuAspectMultiPopoverStyle = ref<Record<string, string>>({});
const skuAspectMultiPlacement = ref<"top" | "bottom">("bottom");
const openSkuVariantSingleKey = ref<string | null>(null);
const openSkuVariantSingleRowIndex = ref<number | null>(null);
const openSkuVariantSingleSearchText = ref(""); // SKU 变体单选弹窗搜索文本
const openSkuVariantSingleAttr = ref<FeatureAttrItem | null>(null);
const skuVariantSingleTriggerEl = ref<HTMLElement | null>(null);
const skuVariantSinglePopoverRef = ref<HTMLElement | null>(null);
const skuVariantSinglePopoverStyle = ref<Record<string, string>>({});
const skuVariantSinglePlacement = ref<"top" | "bottom">("bottom");
const openSkuVariantMultiKey = ref<string | null>(null);
const openSkuVariantMultiRowIndex = ref<number | null>(null);
const openSkuVariantMultiSearchText = ref(""); // SKU 变体多选弹窗搜索文本
const openSkuVariantMultiAttr = ref<FeatureAttrItem | null>(null);
const skuVariantMultiTriggerEl = ref<HTMLElement | null>(null);
const skuVariantMultiPopoverRef = ref<HTMLElement | null>(null);
const skuVariantMultiPopoverStyle = ref<Record<string, string>>({});
const skuVariantMultiPlacement = ref<"top" | "bottom">("bottom");

// 类目切换时清空本地填写的属性值，避免沿用上一类目
watch(categoryTemplate, () => {
  if (workbench.autoSelectItemLoading?.value) return;
  const data = workbench.transformedData?.value;
  const videoMap = collectSkuVideoMapFromData(data);
  featureAttrValues.value = {};
  skuAspectValidationErrors.value = {};
  featureAttrExpandAll.value = false;
  clearBrandRemoteState();
  closeSkuVariantMultiDropdown();
  closeSkuVariantSingleDropdown();
  closeSkuAspectSingleDropdown();
  openSkuAspectMultiKey.value = null;
  workbench.resetWorkbenchFeatureAttrState();
  skuVideoUrlList.value = videoMap;
  if (data?.sku_matrix?.length) {
    data.sku_matrix.forEach((sku: any, index: number) => {
      sku.aspect_feature_values = {};
      const nextVariantFeatureValues: Record<string, string> = {};
      if (videoMap[index]) {
        nextVariantFeatureValues[String(FEATURE_ATTR_ID_VIDEO_URL)] =
          videoMap[index];
      }
      sku[SKU_VARIANT_FEATURE_STORAGE_KEY] = nextVariantFeatureValues;
      sku[SKU_VARIANT_DESCRIPTION_STORAGE_KEY] = "";
    });
  }
  const globalData = getRootGlobalData();
  globalData[FIELD_SCOPE_STORAGE_KEY] = {
    title: "variant",
    [DESCRIPTION_FIELD_KEY]: "common",
  };
  globalData[FEATURE_SCOPE_STORAGE_KEY] = {};
});
watch(
  [() => transformedData.value, () => transformedData.value?.sku_matrix?.length ?? 0],
  ([data]) => {
    hydrateSkuVideoMapFromData(data, true);
  },
  { immediate: true }
);
watch(
  [
    () => categoryTemplate.value,
    () => jsonRichTextAttr.value?.id ?? null,
    () => transformedData.value?.sku_matrix?.length ?? 0,
  ],
  () => {
    ensureSkuJsonRichTextScope();
  },
  { immediate: true }
);

function isFeatureAttrInputOrSingle(attr: FeatureAttrItem): boolean {
  return (
    attr.dictionary_id === 0 ||
    ((attr.dictionary_id ?? 0) !== 0 && !attr.is_collection)
  );
}

function parseMultiValue(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[;；,，|/]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function getFeatureAttrError(attrId: number): string {
  return featureAttrValidationErrors.value[String(attrId)] ?? "";
}

function hasFeatureAttrError(attrId: number): boolean {
  return Boolean(getFeatureAttrError(attrId));
}

function clearFeatureAttrError(attrId: number) {
  workbench.clearFeatureAttrValidationError(attrId);
}

function getFeatureAttrValue(attrId: number): string {
  const key = String(attrId);
  const localVal = featureAttrValues.value[key];
  const cachedWorkbenchVal = workbenchFeatureAttrValues.value[key];
  const attrValue = featureAttrs.value.find(
    (item: FeatureAttrItem) => Number(item?.id) === Number(attrId)
  )?.value;
  const v =
    localVal !== undefined
      ? localVal
      : cachedWorkbenchVal !== undefined
        ? cachedWorkbenchVal
        : prefilledFeatureAttrValues.value[key] !== undefined
          ? prefilledFeatureAttrValues.value[key]
          : attrValue;
  if (Array.isArray(v)) return v.map((item) => String(item ?? "").trim()).join(";");
  if (v == null) return "";
  return String(v);
}
function setFeatureAttrValue(attrId: number, val: string) {
  const next = { ...featureAttrValues.value };
  next[String(attrId)] = val;
  featureAttrValues.value = next;
  workbench.setWorkbenchFeatureAttrValue(attrId, val);
  clearFeatureAttrError(attrId);
}
function setFeatureAttrMultiValue(attrId: number, val: string[]) {
  const next = { ...featureAttrValues.value };
  next[String(attrId)] = val;
  featureAttrValues.value = next;
  workbench.setWorkbenchFeatureAttrValue(attrId, val);
  clearFeatureAttrError(attrId);
}
function switchFeatureAttrToVariant(attr: FeatureAttrItem) {
  if (!attr) return;
  const currentValue = attr.is_collection
    ? getFeatureAttrMultiValue(attr.id)
    : getFeatureAttrValue(attr.id);
  clearFeatureAttrError(attr.id);
  setFeatureScope(attr.id, "variant");
  const skuList = transformedData.value?.sku_matrix ?? [];
  skuList.forEach((sku: any) => {
    const scopedMap = getSkuScopedFeatureMap(sku);
    scopedMap[String(attr.id)] = normalizeScopedAttrValue(attr, currentValue);
  });
}
function switchFeatureAttrToCommon(attr: FeatureAttrItem) {
  if (!attr) return;
  const skuList = transformedData.value?.sku_matrix ?? [];
  let fallback: string | string[] = attr.is_collection ? [] : "";
  for (let i = 0; i < skuList.length; i++) {
    const scopedValue = getSkuScopedFeatureMap(skuList[i])[String(attr.id)];
    if (attr.is_collection) {
      const next = parseMultiValue(scopedValue);
      if (next.length) {
        fallback = next;
        break;
      }
    } else if (String(scopedValue ?? "").trim()) {
      fallback = String(scopedValue);
      break;
    }
  }
  setFeatureScope(attr.id, "common");
  if (attr.is_collection) {
    setFeatureAttrMultiValue(attr.id, fallback as string[]);
  } else {
    setFeatureAttrValue(attr.id, String(fallback || ""));
  }
}
function onFeatureAttrInput(attrId: number, e: Event) {
  const el = e.target as HTMLInputElement;
  setFeatureAttrValue(attrId, el?.value ?? "");
}
function ensureSkuJsonRichTextScope() {
  const attr = jsonRichTextAttr.value;
  const skuList = transformedData.value?.sku_matrix;
  if (!attr || !Array.isArray(skuList) || !skuList.length) return;
  if (!isVariantFeature(attr.id)) {
    setFeatureScope(attr.id, "variant");
  }
  const seedValue = String(jsonRichTextValue.value || "");
  skuList.forEach((sku: any) => {
    const scopedMap = getSkuScopedFeatureMap(sku);
    const key = String(attr.id);
    if (!String(scopedMap[key] || "").trim()) {
      scopedMap[key] = seedValue;
    }
  });
}
function getSkuJsonRichText(rowIndex: number): string {
  const attr = jsonRichTextAttr.value;
  if (!attr) return "";
  const sku = transformedData.value?.sku_matrix?.[rowIndex] as any;
  if (!sku) return "";
  const scopedMap = getSkuScopedFeatureMap(sku);
  const key = String(attr.id);
  if (Object.prototype.hasOwnProperty.call(scopedMap, key)) {
    const currentValue = scopedMap[key];
    return currentValue == null ? "" : String(currentValue);
  }
  return String(jsonRichTextValue.value || "");
}
function setSkuJsonRichText(rowIndex: number, value: string) {
  const attr = jsonRichTextAttr.value;
  if (!attr) return;
  setSkuVariantFeatureValue(rowIndex, attr.id, String(value || ""));
}
function onSkuJsonRichTextConfirm(rowIndex: number, value: unknown) {
  setSkuJsonRichText(rowIndex, typeof value === "string" ? value : "");
  const attr = jsonRichTextAttr.value;
  if (attr) {
    clearSkuTableFieldError(getSkuVariantFeatureFieldKey(rowIndex, attr.id));
  }
}
function applySkuRichTextFromFirstRow() {
  const attr = jsonRichTextAttr.value;
  const skuList = transformedData.value?.sku_matrix;
  if (!attr || !Array.isArray(skuList) || skuList.length === 0) {
    showToast("当前没有变体可以设置", 2000);
    return;
  }
  const firstValue = getSkuJsonRichText(0);
  if (!firstValue.trim()) {
    showToast("请先为首行设置富文本", 2000);
    return;
  }
  skuList.forEach((_: any, index: number) => {
    setSkuJsonRichText(index, firstValue);
  });
  showToast("富文本已一键同首行", 2000);
}
function getSkuVariantDescription(rowIndex: number): string {
  const sku = transformedData.value?.sku_matrix?.[rowIndex] as any;
  if (!sku) return "";
  const rowDesc = sku?.[SKU_VARIANT_DESCRIPTION_STORAGE_KEY];
  if (typeof rowDesc === "string" && rowDesc.trim()) return rowDesc;
  const rootDesc = transformedData.value?.global_data?.description_clean_text;
  return typeof rootDesc === "string" ? rootDesc : "";
}
function setSkuVariantDescription(rowIndex: number, value: string) {
  const sku = transformedData.value?.sku_matrix?.[rowIndex] as any;
  if (!sku) return;
  sku[SKU_VARIANT_DESCRIPTION_STORAGE_KEY] = String(value || "");
}
function switchDescriptionToVariant() {
  const rootDesc = String(
    transformedData.value?.global_data?.description_clean_text || ""
  );
  setFieldScope(DESCRIPTION_FIELD_KEY, "variant");
  const skuList = transformedData.value?.sku_matrix ?? [];
  skuList.forEach((sku: any) => {
    if (!String(sku?.[SKU_VARIANT_DESCRIPTION_STORAGE_KEY] || "").trim()) {
      sku[SKU_VARIANT_DESCRIPTION_STORAGE_KEY] = rootDesc;
    }
  });
}
function switchDescriptionToCommon() {
  const skuList = transformedData.value?.sku_matrix ?? [];
  const firstFilled = skuList.find((sku: any) =>
    String(sku?.[SKU_VARIANT_DESCRIPTION_STORAGE_KEY] || "").trim()
  );
  const root = workbench.transformedData?.value;
  if (root) {
    if (!root.global_data) root.global_data = {};
    root.global_data.description_clean_text = String(
      firstFilled?.[SKU_VARIANT_DESCRIPTION_STORAGE_KEY] ||
        root.global_data.description_clean_text ||
        ""
    );
  }
  setFieldScope(DESCRIPTION_FIELD_KEY, "common");
}
function getFeatureAttrMultiValue(attrId: number): string[] {
  const key = String(attrId);
  const localVal = featureAttrValues.value[key];
  const cachedWorkbenchVal = workbenchFeatureAttrValues.value[key];
  const attrValue = featureAttrs.value.find(
    (item: FeatureAttrItem) => Number(item?.id) === Number(attrId)
  )?.value;
  const v =
    localVal !== undefined
      ? localVal
      : cachedWorkbenchVal !== undefined
        ? cachedWorkbenchVal
        : prefilledFeatureAttrValues.value[key] !== undefined
          ? prefilledFeatureAttrValues.value[key]
          : attrValue;
  return parseMultiValue(v);
}
function getSkuVariantFeatureValue(rowIndex: number, attrId: number): string {
  const sku = transformedData.value?.sku_matrix?.[rowIndex] as any;
  if (!sku) return "";
  const scopedMap = getSkuScopedFeatureMap(sku);
  const value = scopedMap[String(attrId)];
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean).join(";");
  }
  if (value == null) return "";
  return String(value);
}
function getSkuVariantFeatureMultiValue(rowIndex: number, attrId: number): string[] {
  const sku = transformedData.value?.sku_matrix?.[rowIndex] as any;
  if (!sku) return [];
  const scopedMap = getSkuScopedFeatureMap(sku);
  return parseMultiValue(scopedMap[String(attrId)]);
}
function setSkuVariantFeatureValue(rowIndex: number, attrId: number, value: string) {
  const sku = transformedData.value?.sku_matrix?.[rowIndex] as any;
  if (!sku) return;
  const scopedMap = getSkuScopedFeatureMap(sku);
  scopedMap[String(attrId)] = value;
}
function setSkuVariantFeatureMultiValue(
  rowIndex: number,
  attrId: number,
  value: string[]
) {
  const sku = transformedData.value?.sku_matrix?.[rowIndex] as any;
  if (!sku) return;
  const scopedMap = getSkuScopedFeatureMap(sku);
  scopedMap[String(attrId)] = [...value];
}

const openMultiAttrId = ref<number | null>(null);
function isMultiDropdownOpen(attrId: number): boolean {
  return openMultiAttrId.value === attrId;
}
function toggleMultiDropdown(attrId: number) {
  closeSkuVariantMultiDropdown();
  closeSkuVariantSingleDropdown();
  closeSkuAspectSingleDropdown();
  closeAllDropdowns(); //关闭所有可搜索选择器
  openSkuAspectMultiKey.value = null;
  const wasOpen = openMultiAttrId.value === attrId;
  openMultiAttrId.value = wasOpen ? null : attrId;
  // 关闭多选弹窗时清空搜索词，与单选下拉行为一致
  if (wasOpen) searchKeywordMap.value[attrId] = "";
}
function closeMultiDropdown() {
  if (openMultiAttrId.value != null) {
    searchKeywordMap.value[openMultiAttrId.value] = "";
  }
  openMultiAttrId.value = null;
}
function skuAspectSingleKey(rowIndex: number, attrId: number) {
  return `${rowIndex}-${attrId}`;
}
function isSkuAspectSingleOpen(rowIndex: number, attrId: number) {
  return openSkuAspectSingleKey.value === skuAspectSingleKey(rowIndex, attrId);
}
function skuAspectMultiKey(rowIndex: number, attrId: number) {
  return `${rowIndex}-${attrId}`;
}
function isSkuAspectMultiOpen(rowIndex: number, attrId: number) {
  return openSkuAspectMultiKey.value === skuAspectMultiKey(rowIndex, attrId);
}
function skuVariantSingleKey(rowIndex: number, attrId: number) {
  return `${rowIndex}-${attrId}`;
}
function isSkuVariantSingleOpen(rowIndex: number, attrId: number) {
  return openSkuVariantSingleKey.value === skuVariantSingleKey(rowIndex, attrId);
}
function skuVariantMultiKey(rowIndex: number, attrId: number) {
  return `${rowIndex}-${attrId}`;
}
function isSkuVariantMultiOpen(rowIndex: number, attrId: number) {
  return openSkuVariantMultiKey.value === skuVariantMultiKey(rowIndex, attrId);
}
function getMultiFullSummaryLabels(
  attr: FeatureAttrItem,
  selectedIds: string[]
): string {
  return selectedIds
    .map((id) => getFeatureAttrOptionLabel(attr, String(id)))
    .filter(Boolean)
    .join("、");
}
function getMultiSummaryLabels(attr: FeatureAttrItem, selectedIds: string[]): string {
  const labels = selectedIds
    .map((id) => getFeatureAttrOptionLabel(attr, String(id)))
    .filter(Boolean);
  if (labels.length <= 2) return labels.join("、");
  return `${labels.slice(0, 2).join("、")} +${labels.length - 2}`;
}
function getSkuVariantMultiSummary(rowIndex: number, attr: FeatureAttrItem): string {
  return getMultiSummaryLabels(attr, getSkuVariantFeatureMultiValue(rowIndex, attr.id));
}
function getSkuAspectMultiSummary(rowIndex: number, attr: FeatureAttrItem): string {
  return getMultiSummaryLabels(attr, getSkuAspectMultiValue(rowIndex, attr.id));
}
function getSkuAspectMultiFullSummary(rowIndex: number, attr: FeatureAttrItem): string {
  return getMultiFullSummaryLabels(attr, getSkuAspectMultiValue(rowIndex, attr.id));
}

// 打开列表单选框
function toggleSkuAspectMultiDropdown(
  rowIndex: number,
  attr: FeatureAttrItem,
  e: MouseEvent | KeyboardEvent
) {
  const k = skuAspectMultiKey(rowIndex, attr.id);
  closeSkuAspectSingleDropdown();
  closeSkuVariantSingleDropdown();
  closeSkuVariantMultiDropdown();
  openMultiAttrId.value = null;
  if (openSkuAspectMultiKey.value === k) {
    closeSkuAspectMultiDropdown();
    return;
  }
  openSkuAspectMultiKey.value = k;
  openSkuAspectMultiRowIndex.value = rowIndex;
  openSkuAspectMultiSearchText.value = ''; // 清空列表单选框搜索文本
  openSkuAspectMultiAttr.value = attr;
  skuAspectMultiTriggerEl.value = e.currentTarget as HTMLElement | null;
  scheduleSkuAspectDropdownReposition(
    () => updateSkuAspectMultiDropdownPosition(),
    () => openSkuAspectMultiKey.value === k
  );
}
// SKU 表格弹窗选项按展示文案过滤（空关键词返回全部）
function skuDictionaryFilterOptions(options: any[], keyword: string) {
  if (!keyword) return options;
  return options.filter((opt) => String(opt?.value ?? "").includes(keyword));
}
// 列表多选框搜索过滤
function openSkuAspectMultiAttrFilterOptions(options: any[]) {
  return skuDictionaryFilterOptions(options, openSkuAspectMultiSearchText.value);
}

function toggleSkuVariantMultiDropdown(
  rowIndex: number,
  attr: FeatureAttrItem,
  e: MouseEvent | KeyboardEvent
) {
  const k = skuVariantMultiKey(rowIndex, attr.id);
  closeSkuAspectSingleDropdown();
  closeSkuVariantSingleDropdown();
  closeSkuAspectMultiDropdown();
  openMultiAttrId.value = null;
  if (openSkuVariantMultiKey.value === k) {
    closeSkuVariantMultiDropdown();
    return;
  }
  openSkuVariantMultiKey.value = k;
  openSkuVariantMultiRowIndex.value = rowIndex;
  openSkuVariantMultiSearchText.value = "";
  openSkuVariantMultiAttr.value = attr;
  skuVariantMultiTriggerEl.value = e.currentTarget as HTMLElement | null;
  scheduleSkuAspectDropdownReposition(
    () => updateSkuVariantMultiDropdownPosition(),
    () => openSkuVariantMultiKey.value === k
  );
}
function closeSkuAspectMultiDropdown() {
  skuAspectDropdownRepositionTimers.forEach((timer) => {
    window.clearTimeout(timer);
  });
  skuAspectDropdownRepositionTimers = [];
  openSkuAspectMultiKey.value = null;
  openSkuAspectMultiRowIndex.value = null;
  openSkuAspectMultiAttr.value = null;
  skuAspectMultiTriggerEl.value = null;
  skuAspectMultiPopoverStyle.value = {};
  skuAspectMultiPlacement.value = "bottom";
}
function closeSkuVariantMultiDropdown() {
  skuAspectDropdownRepositionTimers.forEach((timer) => {
    window.clearTimeout(timer);
  });
  skuAspectDropdownRepositionTimers = [];
  openSkuVariantMultiKey.value = null;
  openSkuVariantMultiRowIndex.value = null;
  openSkuVariantMultiSearchText.value = "";
  openSkuVariantMultiAttr.value = null;
  skuVariantMultiTriggerEl.value = null;
  skuVariantMultiPopoverStyle.value = {};
  skuVariantMultiPlacement.value = "bottom";
}
function getSkuAspectRow(rowIndex: number): any | null {
  const data = workbench.transformedData?.value;
  const sku = data?.sku_matrix?.[rowIndex];
  if (!sku) return null;
  if (!sku.aspect_feature_values || typeof sku.aspect_feature_values !== "object") {
    sku.aspect_feature_values = {};
  }
  return sku;
}
function getSkuAspectString(rowIndex: number, attrId: number): string {
  const sku = getSkuAspectRow(rowIndex);
  if (!sku) return "";
  const v = sku.aspect_feature_values[String(attrId)];
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(";") : "";
}
function getSkuVariantFeatureFieldKey(rowIndex: number, attrId: number) {
  return `variant-${rowIndex}-${attrId}`;
}
function getSkuVariantDescriptionFieldKey(rowIndex: number) {
  return `description-${rowIndex}`;
}
function setSkuAspectValue(rowIndex: number, attrId: number, val: string) {
  const sku = getSkuAspectRow(rowIndex);
  if (!sku) return;
  sku.aspect_feature_values = {
    ...sku.aspect_feature_values,
    [String(attrId)]: val,
  };
  if (isAspectValueFilled(val)) {
    clearSkuAspectFieldError(rowIndex, attrId);
  }
}
function onSkuVariantDescriptionInput(rowIndex: number, e: Event) {
  setSkuVariantDescription(
    rowIndex,
    (e.target as HTMLTextAreaElement).value.slice(0, 5000)
  );
  clearSkuTableFieldError(getSkuVariantDescriptionFieldKey(rowIndex));
}
function onSkuVariantFeatureInput(rowIndex: number, attrId: number, e: Event) {
  setSkuVariantFeatureValue(
    rowIndex,
    attrId,
    (e.target as HTMLInputElement).value
  );
}
function getSkuVariantSingleLabel(rowIndex: number, attr: FeatureAttrItem): string {
  const current = getSkuVariantFeatureValue(rowIndex, attr.id);
  return current ? getFeatureAttrOptionLabel(attr, current) : "";
}
function closeSkuVariantSingleDropdown() {
  skuAspectDropdownRepositionTimers.forEach((timer) => {
    window.clearTimeout(timer);
  });
  skuAspectDropdownRepositionTimers = [];
  openSkuVariantSingleKey.value = null;
  openSkuVariantSingleRowIndex.value = null;
  openSkuVariantSingleSearchText.value = "";
  openSkuVariantSingleAttr.value = null;
  skuVariantSingleTriggerEl.value = null;
  skuVariantSinglePopoverStyle.value = {};
  skuVariantSinglePlacement.value = "bottom";
}
function toggleSkuVariantFeatureMultiOption(
  rowIndex: number,
  attrId: number,
  optId: string
) {
  const current = getSkuVariantFeatureMultiValue(rowIndex, attrId);
  const id = String(optId);
  const nextSelected = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id];
  setSkuVariantFeatureMultiValue(rowIndex, attrId, nextSelected);
  updateSkuVariantMultiDropdownPosition();
}
function getSkuAspectSingleLabel(rowIndex: number, attr: FeatureAttrItem): string {
  const current = getSkuAspectString(rowIndex, attr.id);
  return current ? getFeatureAttrOptionLabel(attr, current) : "";
}
function closeSkuAspectSingleDropdown() {
  skuAspectDropdownRepositionTimers.forEach((timer) => {
    window.clearTimeout(timer);
  });
  skuAspectDropdownRepositionTimers = [];
  openSkuAspectSingleKey.value = null;
  openSkuAspectSingleRowIndex.value = null;
  openSkuAspectSingleSearchText.value = "";
  openSkuAspectSingleAttr.value = null;
  skuAspectSingleTriggerEl.value = null;
  skuAspectSinglePopoverStyle.value = {};
  skuAspectSinglePlacement.value = "bottom";
}

function handleVideoClick(index: number) {
  openMediaUpload(index);
}

function openMediaUpload(index: number) {
  mediaEditingIndex.value = index;
  mediaUploadValue.value = skuVideoUrlList.value[index] || '';
  mediaUploadDialogVisible.value = true;
}

function handleMediaUploadConfirm(url: string) {
  const idx = mediaEditingIndex.value;
  if (idx !== null) {
    skuVideoUrlList.value = { ...skuVideoUrlList.value, [idx]: url };
    showToast('视频设置成功', 2000);
  }
}

function handleMediaPreview(url: string) {
  mediaPreviewImageUrl.value = url;
  mediaPreviewImageVisible.value = true;
}

function handleBatchVideo() {
  const skuList = transformedData.value?.sku_matrix;
  if (!skuList || skuList.length === 0) {
    showToast("当前没有变体可以设置", 2000);
    return;
  }
  const firstVideoUrl = skuVideoUrlList.value[0];
  if (!firstVideoUrl) {
    showToast("请先为首行设置视频", 2000);
    return;
  }
  const nextVideoMap = { ...skuVideoUrlList.value };
  skuList.forEach((_: any, i: number) => {
    nextVideoMap[i] = firstVideoUrl;
  });
  skuVideoUrlList.value = nextVideoMap;
  showToast("视频已一键同首行", 2000);
}
function scheduleSkuAspectDropdownReposition(
  updater: () => void,
  isStillOpen: () => boolean
) {
  skuAspectDropdownRepositionTimers.forEach((timer) => {
    window.clearTimeout(timer);
  });
  skuAspectDropdownRepositionTimers = [];

  updater();
  requestAnimationFrame(() => {
    if (isStillOpen()) updater();
  });

  [0, 32, 96, 180].forEach((delay) => {
    const timer = window.setTimeout(() => {
      if (isStillOpen()) updater();
    }, delay);
    skuAspectDropdownRepositionTimers.push(timer);
  });
}
function updateSkuAspectMultiDropdownPosition(retry = 0) {
  nextTick().then(() => {
    if (!openSkuAspectMultiKey.value) return;
    const triggerEl = skuAspectMultiTriggerEl.value;
    const popoverEl = skuAspectMultiPopoverRef.value;
    if (!triggerEl || !popoverEl || !document.body.contains(triggerEl)) {
      closeSkuAspectMultiDropdown();
      return;
    }

    const triggerRect = triggerEl.getBoundingClientRect();
    const popRect = popoverEl.getBoundingClientRect();
    if ((popRect.width === 0 || popRect.height === 0) && retry < 10) {
      requestAnimationFrame(() =>
        setTimeout(() => updateSkuAspectMultiDropdownPosition(retry + 1), 10)
      );
      return;
    }

    const pad = 8;
    const gap = 6;
    const topGap = 14;
    const bottomSafeArea = 24;
    const width = Math.min(
      Math.max(triggerRect.width, 180),
      window.innerWidth - pad * 2
    );
    const belowSpace = Math.max(
      80,
      Math.floor(
        window.innerHeight - bottomSafeArea - triggerRect.bottom - gap - pad
      )
    );
    const aboveSpace = Math.max(80, Math.floor(triggerRect.top - gap - pad));
    let placement: "top" | "bottom" =
      belowSpace >= 240 || belowSpace >= aboveSpace ? "bottom" : "top";
    let maxHeight = Math.min(280, placement === "bottom" ? belowSpace : aboveSpace);
    const measuredHeight =
      popRect.height > 0 ? Math.min(popRect.height, maxHeight) : maxHeight;

    if (placement === "bottom" && measuredHeight > belowSpace && aboveSpace > belowSpace) {
      placement = "top";
      maxHeight = Math.min(280, aboveSpace);
    } else if (
      placement === "top" &&
      measuredHeight > aboveSpace &&
      belowSpace > aboveSpace
    ) {
      placement = "bottom";
      maxHeight = Math.min(280, belowSpace);
    }

    const dropdownHeight =
      popRect.height > 0 ? Math.min(popRect.height, maxHeight) : maxHeight;
    let top =
      placement === "bottom"
        ? triggerRect.bottom + gap
        : triggerRect.top - dropdownHeight - topGap;
    let left = triggerRect.left;

    if (left + width > window.innerWidth - pad) {
      left = window.innerWidth - width - pad;
    }
    if (left < pad) {
      left = pad;
    }
    if (top < pad) {
      top = pad;
    }
    if (top + dropdownHeight > window.innerHeight - pad - bottomSafeArea) {
      top = window.innerHeight - dropdownHeight - pad - bottomSafeArea;
    }

    skuAspectMultiPlacement.value = placement;
    skuAspectMultiPopoverStyle.value = {
      position: "fixed",
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      maxHeight: `${Math.floor(maxHeight)}px`,
      zIndex: String(Z.POPPER),
    };
  });
}
function updateSkuVariantMultiDropdownPosition(retry = 0) {
  nextTick().then(() => {
    if (!openSkuVariantMultiKey.value) return;
    const triggerEl = skuVariantMultiTriggerEl.value;
    const popoverEl = skuVariantMultiPopoverRef.value;
    if (!triggerEl || !popoverEl || !document.body.contains(triggerEl)) {
      closeSkuVariantMultiDropdown();
      return;
    }

    const triggerRect = triggerEl.getBoundingClientRect();
    const popRect = popoverEl.getBoundingClientRect();
    if ((popRect.width === 0 || popRect.height === 0) && retry < 10) {
      requestAnimationFrame(() =>
        setTimeout(() => updateSkuVariantMultiDropdownPosition(retry + 1), 10)
      );
      return;
    }

    const pad = 8;
    const gap = 6;
    const topGap = 14;
    const bottomSafeArea = 24;
    const width = Math.min(
      Math.max(triggerRect.width, 180),
      window.innerWidth - pad * 2
    );
    const belowSpace = Math.max(
      80,
      Math.floor(
        window.innerHeight - bottomSafeArea - triggerRect.bottom - gap - pad
      )
    );
    const aboveSpace = Math.max(80, Math.floor(triggerRect.top - gap - pad));
    let placement: "top" | "bottom" =
      belowSpace >= 240 || belowSpace >= aboveSpace ? "bottom" : "top";
    let maxHeight = Math.min(280, placement === "bottom" ? belowSpace : aboveSpace);
    const measuredHeight =
      popRect.height > 0 ? Math.min(popRect.height, maxHeight) : maxHeight;

    if (placement === "bottom" && measuredHeight > belowSpace && aboveSpace > belowSpace) {
      placement = "top";
      maxHeight = Math.min(280, aboveSpace);
    } else if (
      placement === "top" &&
      measuredHeight > aboveSpace &&
      belowSpace > aboveSpace
    ) {
      placement = "bottom";
      maxHeight = Math.min(280, belowSpace);
    }

    const dropdownHeight =
      popRect.height > 0 ? Math.min(popRect.height, maxHeight) : maxHeight;
    let top =
      placement === "bottom"
        ? triggerRect.bottom + gap
        : triggerRect.top - dropdownHeight - topGap;
    let left = triggerRect.left;

    if (left + width > window.innerWidth - pad) {
      left = window.innerWidth - width - pad;
    }
    if (left < pad) {
      left = pad;
    }
    if (top < pad) {
      top = pad;
    }
    if (top + dropdownHeight > window.innerHeight - pad - bottomSafeArea) {
      top = window.innerHeight - dropdownHeight - pad - bottomSafeArea;
    }

    skuVariantMultiPlacement.value = placement;
    skuVariantMultiPopoverStyle.value = {
      position: "fixed",
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      maxHeight: `${Math.floor(maxHeight)}px`,
      zIndex: String(Z.POPPER),
    };
  });
}
function updateSkuAspectSingleDropdownPosition(retry = 0) {
  nextTick().then(() => {
    if (!openSkuAspectSingleKey.value) return;
    const triggerEl = skuAspectSingleTriggerEl.value;
    const popoverEl = skuAspectSinglePopoverRef.value;
    if (!triggerEl || !popoverEl || !document.body.contains(triggerEl)) {
      closeSkuAspectSingleDropdown();
      return;
    }

    const triggerRect = triggerEl.getBoundingClientRect();
    const popRect = popoverEl.getBoundingClientRect();
    if ((popRect.width === 0 || popRect.height === 0) && retry < 10) {
      requestAnimationFrame(() =>
        setTimeout(() => updateSkuAspectSingleDropdownPosition(retry + 1), 10)
      );
      return;
    }

    const pad = 8;
    const gap = 6;
    const topGap = 14;
    const bottomSafeArea = 24;
    const width = Math.min(
      Math.max(triggerRect.width, 140),
      window.innerWidth - pad * 2
    );
    const belowSpace = Math.max(
      80,
      Math.floor(
        window.innerHeight - bottomSafeArea - triggerRect.bottom - gap - pad
      )
    );
    const aboveSpace = Math.max(80, Math.floor(triggerRect.top - gap - pad));
    let placement: "top" | "bottom" =
      belowSpace >= 220 || belowSpace >= aboveSpace ? "bottom" : "top";
    let maxHeight = Math.min(280, placement === "bottom" ? belowSpace : aboveSpace);
    const measuredHeight =
      popRect.height > 0 ? Math.min(popRect.height, maxHeight) : maxHeight;

    if (placement === "bottom" && measuredHeight > belowSpace && aboveSpace > belowSpace) {
      placement = "top";
      maxHeight = Math.min(280, aboveSpace);
    } else if (
      placement === "top" &&
      measuredHeight > aboveSpace &&
      belowSpace > aboveSpace
    ) {
      placement = "bottom";
      maxHeight = Math.min(280, belowSpace);
    }

    const dropdownHeight =
      popRect.height > 0 ? Math.min(popRect.height, maxHeight) : maxHeight;
    let top =
      placement === "bottom"
        ? triggerRect.bottom + gap
        : triggerRect.top - dropdownHeight - topGap;
    let left = triggerRect.left;

    if (left + width > window.innerWidth - pad) {
      left = window.innerWidth - width - pad;
    }
    if (left < pad) {
      left = pad;
    }

    if (top < pad) {
      top = pad;
    }
    if (top + dropdownHeight > window.innerHeight - pad - bottomSafeArea) {
      top = window.innerHeight - dropdownHeight - pad - bottomSafeArea;
    }

    skuAspectSinglePlacement.value = placement;
    skuAspectSinglePopoverStyle.value = {
      position: "fixed",
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      maxHeight: `${Math.floor(maxHeight)}px`,
      zIndex: String(Z.POPPER),
    };
  });
}
function updateSkuVariantSingleDropdownPosition(retry = 0) {
  nextTick().then(() => {
    if (!openSkuVariantSingleKey.value) return;
    const triggerEl = skuVariantSingleTriggerEl.value;
    const popoverEl = skuVariantSinglePopoverRef.value;
    if (!triggerEl || !popoverEl || !document.body.contains(triggerEl)) {
      closeSkuVariantSingleDropdown();
      return;
    }

    const triggerRect = triggerEl.getBoundingClientRect();
    const popRect = popoverEl.getBoundingClientRect();
    if ((popRect.width === 0 || popRect.height === 0) && retry < 10) {
      requestAnimationFrame(() =>
        setTimeout(() => updateSkuVariantSingleDropdownPosition(retry + 1), 10)
      );
      return;
    }

    const pad = 8;
    const gap = 6;
    const topGap = 14;
    const bottomSafeArea = 24;
    const width = Math.min(
      Math.max(triggerRect.width, 140),
      window.innerWidth - pad * 2
    );
    const belowSpace = Math.max(
      80,
      Math.floor(
        window.innerHeight - bottomSafeArea - triggerRect.bottom - gap - pad
      )
    );
    const aboveSpace = Math.max(80, Math.floor(triggerRect.top - gap - pad));
    let placement: "top" | "bottom" =
      belowSpace >= 220 || belowSpace >= aboveSpace ? "bottom" : "top";
    let maxHeight = Math.min(280, placement === "bottom" ? belowSpace : aboveSpace);
    const measuredHeight =
      popRect.height > 0 ? Math.min(popRect.height, maxHeight) : maxHeight;

    if (placement === "bottom" && measuredHeight > belowSpace && aboveSpace > belowSpace) {
      placement = "top";
      maxHeight = Math.min(280, aboveSpace);
    } else if (
      placement === "top" &&
      measuredHeight > aboveSpace &&
      belowSpace > aboveSpace
    ) {
      placement = "bottom";
      maxHeight = Math.min(280, belowSpace);
    }

    const dropdownHeight =
      popRect.height > 0 ? Math.min(popRect.height, maxHeight) : maxHeight;
    let top =
      placement === "bottom"
        ? triggerRect.bottom + gap
        : triggerRect.top - dropdownHeight - topGap;
    let left = triggerRect.left;

    if (left + width > window.innerWidth - pad) {
      left = window.innerWidth - width - pad;
    }
    if (left < pad) {
      left = pad;
    }
    if (top < pad) {
      top = pad;
    }
    if (top + dropdownHeight > window.innerHeight - pad - bottomSafeArea) {
      top = window.innerHeight - dropdownHeight - pad - bottomSafeArea;
    }

    skuVariantSinglePlacement.value = placement;
    skuVariantSinglePopoverStyle.value = {
      position: "fixed",
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      maxHeight: `${Math.floor(maxHeight)}px`,
      zIndex: String(Z.POPPER),
    };
  });
}
function toggleSkuVariantSingleDropdown(
  rowIndex: number,
  attr: FeatureAttrItem,
  e: MouseEvent | KeyboardEvent
) {
  const nextKey = skuVariantSingleKey(rowIndex, attr.id);
  if (openSkuVariantSingleKey.value === nextKey) {
    closeSkuVariantSingleDropdown();
    return;
  }
  closeMultiDropdown();
  closeSkuVariantMultiDropdown();
  closeSkuAspectSingleDropdown();
  closeSkuAspectMultiDropdown();
  openSkuVariantSingleKey.value = nextKey;
  openSkuVariantSingleRowIndex.value = rowIndex;
  openSkuVariantSingleSearchText.value = "";
  openSkuVariantSingleAttr.value = attr;
  skuVariantSingleTriggerEl.value = e.currentTarget as HTMLElement | null;
  scheduleSkuAspectDropdownReposition(
    () => updateSkuVariantSingleDropdownPosition(),
    () => openSkuVariantSingleKey.value === nextKey
  );
}
function selectSkuVariantSingleOption(optId: string) {
  const rowIndex = openSkuVariantSingleRowIndex.value;
  const attr = openSkuVariantSingleAttr.value;
  if (rowIndex === null || !attr) return;
  setSkuVariantFeatureValue(rowIndex, attr.id, optId);
  closeSkuVariantSingleDropdown();
}
function toggleSkuAspectSingleDropdown(
  rowIndex: number,
  attr: FeatureAttrItem,
  e: MouseEvent | KeyboardEvent
) {
  const nextKey = skuAspectSingleKey(rowIndex, attr.id);
  if (openSkuAspectSingleKey.value === nextKey) {
    closeSkuAspectSingleDropdown();
    return;
  }
  closeMultiDropdown();
  closeSkuVariantMultiDropdown();
  closeSkuVariantSingleDropdown();
  closeSkuAspectMultiDropdown();
  openSkuAspectSingleKey.value = nextKey;
  openSkuAspectSingleRowIndex.value = rowIndex;
  openSkuAspectSingleSearchText.value = "";
  openSkuAspectSingleAttr.value = attr;
  skuAspectSingleTriggerEl.value = e.currentTarget as HTMLElement | null;
  scheduleSkuAspectDropdownReposition(
    () => updateSkuAspectSingleDropdownPosition(),
    () => openSkuAspectSingleKey.value === nextKey
  );
}
function selectSkuAspectSingleOption(optId: string) {
  const rowIndex = openSkuAspectSingleRowIndex.value;
  const attr = openSkuAspectSingleAttr.value;
  if (rowIndex === null || !attr) return;
  setSkuAspectValue(rowIndex, attr.id, optId);
  closeSkuAspectSingleDropdown();
}
function onSkuAspectInput(rowIndex: number, attrId: number, e: Event) {
  const sku = getSkuAspectRow(rowIndex);
  if (!sku) return;
  const val = (e.target as HTMLInputElement).value;
  sku.aspect_feature_values = {
    ...sku.aspect_feature_values,
    [String(attrId)]: val,
  };
  if (isAspectValueFilled(val)) {
    clearSkuAspectFieldError(rowIndex, attrId);
  }
}
function getSkuAspectMultiValue(rowIndex: number, attrId: number): string[] {
  const sku = getSkuAspectRow(rowIndex);
  if (!sku) return [];
  const v = sku.aspect_feature_values[String(attrId)];
  return parseMultiValue(v);
}
// 单选框选择选项
function toggleSkuAspectMultiOption(rowIndex: number, attrId: number, optId: string) {
  const sku = getSkuAspectRow(rowIndex);
  if (!sku) return;
  const current = getSkuAspectMultiValue(rowIndex, attrId);
  const id = String(optId);
  const nextSelected = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id];
  sku.aspect_feature_values = {
    ...sku.aspect_feature_values,
    [String(attrId)]: nextSelected,
  };
  if (isAspectValueFilled(nextSelected)) {
    clearSkuAspectFieldError(rowIndex, attrId);
  }
  updateSkuAspectMultiDropdownPosition();
  closeSkuVariantSingleDropdown();
}

  // 变更说明：每个主变体特征列均可「同首行」，把首行该列当前值复制到后续所有行。
function applyAspectValueFromFirstRow(attrId: number) {
  const data = workbench.transformedData?.value;
  const skuList = data?.sku_matrix;
  if (!Array.isArray(skuList) || skuList.length < 2) return;
  const firstRow = getSkuAspectRow(0);
  if (!firstRow) return;
  const sourceValue = firstRow.aspect_feature_values?.[String(attrId)];
  if (!isAspectValueFilled(sourceValue)) {
    showToast("请输入首行内容", 2000);
    return;
  }
  const clonedValue = Array.isArray(sourceValue)
    ? [...sourceValue]
    : sourceValue ?? "";
  for (let i = 1; i < skuList.length; i++) {
    const sku = getSkuAspectRow(i);
    if (!sku) continue;
    sku.aspect_feature_values = {
      ...sku.aspect_feature_values,
      [String(attrId)]: Array.isArray(clonedValue)
        ? [...clonedValue]
        : clonedValue,
    };
  }
}
function getFeatureAttrOptionLabel(
  attr: FeatureAttrItem,
  optId: string
): string {
  const list = attr.dictionary_values ?? [];
  const found = list.find((o) => String(o.id) === String(optId));
  return found?.value ?? optId;
}
// 单选下拉展示：与多选一致，统一从 prefilled/workbench 取值链反查 label
function getFeatureAttrSingleLabel(attr: FeatureAttrItem): string {
  const id = getFeatureAttrValue(attr.id);
  return id ? getFeatureAttrOptionLabel(attr, id) : "";
}
function toggleFeatureAttrMultiOption(attrId: number, optId: string) {
  const current = getFeatureAttrMultiValue(attrId);
  const id = String(optId);
  const nextSelected = current.includes(id)
    ? current.filter((x) => x !== id)
    : [...current, id];
  setFeatureAttrMultiValue(attrId, nextSelected);
}
function removeFeatureAttrMultiOption(attrId: number, optId: string) {
  const current = getFeatureAttrMultiValue(attrId);
  const id = String(optId);
  const nextSelected = current.filter((x) => x !== id);
  setFeatureAttrMultiValue(attrId, nextSelected);
}

onMounted(() => {
  document.addEventListener("click", onMultiDropdownDocumentClick);
  workbench.registerAiLogStream?.(aiLogStreamSink);
});

function onMultiDropdownDocumentClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (target.closest(".mjgd-ai-feature-attr-multi")) return;
  if (target.closest(".mjgd-ai-sku-variant-multi")) return;
  if (target.closest(".mjgd-ai-sku-variant-multi-popover")) return;
  if (target.closest(".mjgd-ai-sku-variant-single")) return;
  if (target.closest(".mjgd-ai-sku-variant-single-popover")) return;
  if (target.closest(".mjgd-ai-sku-aspect-multi")) return;
  if (target.closest(".mjgd-ai-sku-aspect-single")) return;
  if (target.closest(".mjgd-ai-sku-aspect-single-dropdown")) return;
  closeMultiDropdown();
  closeSkuVariantMultiDropdown();
  closeSkuVariantSingleDropdown();
  closeSkuAspectMultiDropdown();
  closeSkuAspectSingleDropdown();
}

function onSkuAspectSingleDocumentKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (
    !openSkuAspectSingleKey.value &&
    !openSkuAspectMultiKey.value &&
    !openSkuVariantSingleKey.value &&
    !openSkuVariantMultiKey.value
  ) return;
  e.preventDefault();
  closeSkuAspectSingleDropdown();
  closeSkuAspectMultiDropdown();
  closeSkuVariantSingleDropdown();
  closeSkuVariantMultiDropdown();
}

onUnmounted(() => {
  document.removeEventListener("click", onMultiDropdownDocumentClick);
  clearBrandRemoteState();
  workbench.registerAiLogStream?.(null);
});

// ---------- 内联 Tooltip ----------
const hoverTooltipVisible = ref(false);
const hoverTooltipText = ref("");
const hoverTooltipStyle = ref<{ left?: string; top?: string }>({});
const hoverTooltipRef = ref<HTMLElement | null>(null);
let hoverTooltipTarget: HTMLElement | null = null;
let hoverTooltipShowTimer: ReturnType<typeof setTimeout> | null = null;
let hoverTooltipHideTimer: ReturnType<typeof setTimeout> | null = null;
const TOOLTIP_DELAY = 100;
const TOOLTIP_GAP = 8;

function updateHoverTooltipPosition() {
  const target = hoverTooltipTarget;
  const tip = hoverTooltipRef.value;
  if (!target || !tip) return;
  nextTick().then(() => {
    const wr = target.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    const left = Math.min(
      Math.max(wr.left + wr.width / 2 - tr.width / 2, 8),
      Math.max(8, window.innerWidth - tr.width - 8)
    );
    const top = Math.max(8, wr.top - tr.height - TOOLTIP_GAP);
    hoverTooltipStyle.value = { left: `${left}px`, top: `${top}px` };
  });
}

function showHoverTooltip(e: MouseEvent, text: string | null | undefined) {
  const target = e.currentTarget as HTMLElement | null;
  const content = String(text || "").trim();
  if (!target || !content) return;

  if (hoverTooltipHideTimer) {
    clearTimeout(hoverTooltipHideTimer);
    hoverTooltipHideTimer = null;
  }
  if (hoverTooltipShowTimer) {
    clearTimeout(hoverTooltipShowTimer);
    hoverTooltipShowTimer = null;
  }

  const isOverflowing =
    target.scrollWidth > target.clientWidth ||
    target.scrollHeight > target.clientHeight;
  if (!isOverflowing) {
    hoverTooltipVisible.value = false;
    hoverTooltipTarget = null;
    return;
  }

  hoverTooltipTarget = target;
  hoverTooltipText.value = content;
  hoverTooltipShowTimer = setTimeout(async () => {
    hoverTooltipVisible.value = true;
    await nextTick();
    updateHoverTooltipPosition();
    hoverTooltipShowTimer = null;
  }, TOOLTIP_DELAY);
}

function hideHoverTooltip() {
  if (hoverTooltipShowTimer) {
    clearTimeout(hoverTooltipShowTimer);
    hoverTooltipShowTimer = null;
  }
  hoverTooltipHideTimer = setTimeout(() => {
    hoverTooltipVisible.value = false;
    hoverTooltipTarget = null;
    hoverTooltipHideTimer = null;
  }, 50);
}

function hoverTooltipUpdatePosition() {
  if (hoverTooltipVisible.value) updateHoverTooltipPosition();
}

watch(hoverTooltipVisible, (visible) => {
  if (visible) {
    window.addEventListener("scroll", hoverTooltipUpdatePosition, true);
    window.addEventListener("resize", hoverTooltipUpdatePosition);
  } else {
    window.removeEventListener("scroll", hoverTooltipUpdatePosition, true);
    window.removeEventListener("resize", hoverTooltipUpdatePosition);
  }
});
onUnmounted(() => {
  [hoverTooltipShowTimer, hoverTooltipHideTimer].forEach(
    (t) => t && clearTimeout(t)
  );
  window.removeEventListener("scroll", hoverTooltipUpdatePosition, true);
  window.removeEventListener("resize", hoverTooltipUpdatePosition);
});

// ---------- 内联 Popover + BatchPriceSetting ----------
const aiOutputTextareaRef = ref<HTMLTextAreaElement | null>(null);
const showBatchPricePopover = ref(false);
const batchPriceRefRef = ref<HTMLElement | null>(null);
const batchPricePopoverRef = ref<HTMLElement | null>(null);
const batchPricePopoverStyle = ref<Record<string, string>>({});
const batchPriceType = ref<"fixed" | "multiplier">("fixed");
const batchPriceInputValue = ref<number | null>(null);
const batchPriceIsValid = computed(
  () => batchPriceInputValue.value !== null && batchPriceInputValue.value > 0
);
function updateBatchPricePopoverPosition(retry = 0) {
  nextTick().then(() => {
    if (!batchPriceRefRef.value || !batchPricePopoverRef.value) {
      if (retry < 10)
        setTimeout(() => updateBatchPricePopoverPosition(retry + 1), 20);
      return;
    }
    const refRect = batchPriceRefRef.value.getBoundingClientRect();
    const popRect = batchPricePopoverRef.value.getBoundingClientRect();
    if ((popRect.width === 0 || popRect.height === 0) && retry < 10) {
      requestAnimationFrame(() =>
        setTimeout(() => updateBatchPricePopoverPosition(retry + 1), 10)
      );
      return;
    }
    let top = refRect.bottom + 8;
    let left = refRect.left + refRect.width / 2 - 280 / 2;
    const pad = 10;
    if (left < pad) left = pad;
    else if (left + 280 > window.innerWidth - pad)
      left = window.innerWidth - 280 - pad;
    if (top < pad) top = pad;
    else if (top + popRect.height > window.innerHeight - pad)
      top = window.innerHeight - popRect.height - pad;
    batchPricePopoverStyle.value = {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: "280px",
      zIndex: String(Z.POPPER),
    };
  });
}
function handleBatchPriceClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (
    batchPricePopoverRef.value?.contains(target) ||
    batchPriceRefRef.value?.contains(target)
  )
    return;
  showBatchPricePopover.value = false;
}
watch(showBatchPricePopover, (v) => {
  if (v) {
    updateBatchPricePopoverPosition();
    setTimeout(
      () => document.addEventListener("click", handleBatchPriceClickOutside),
      0
    );
  } else document.removeEventListener("click", handleBatchPriceClickOutside);
});
const batchPricePopoverPositionHandler = () =>
  updateBatchPricePopoverPosition();
function batchPriceConfirm() {
  if (!batchPriceIsValid.value) return;
  workbench.handleBatchPriceConfirm({
    type: batchPriceType.value,
    value: batchPriceInputValue.value!,
  });
  batchPriceInputValue.value = null;
  batchPriceType.value = "fixed";
  showBatchPricePopover.value = false;
}
function batchPriceCancel() {
  batchPriceInputValue.value = null;
  batchPriceType.value = "fixed";
  showBatchPricePopover.value = false;
}

// ---------- 批量设置包装尺寸弹窗（由表头触发）----------
const showBatchPackDimsPopover = ref(false);
const batchPackDimsRefRef = ref<HTMLElement | null>(null);
const batchPackDimsPopoverRef = ref<HTMLElement | null>(null);
const batchPackDimsPopoverStyle = ref<Record<string, string>>({});

const batchPackLengthInputValue = ref<string>("");
const batchPackWidthInputValue = ref<string>("");
const batchPackHeightInputValue = ref<string>("");

// 弹窗内包装尺寸输入：使用 :value + @input，与表格行内输入模式一致，避免 v-model 重渲染失焦
function onBatchPackLengthFieldInput(e: Event) {
  batchPackLengthInputValue.value = (e.target as HTMLInputElement).value;
}
function onBatchPackWidthFieldInput(e: Event) {
  batchPackWidthInputValue.value = (e.target as HTMLInputElement).value;
}
function onBatchPackHeightFieldInput(e: Event) {
  batchPackHeightInputValue.value = (e.target as HTMLInputElement).value;
}

const batchPackDimsIsValid = computed(
  () =>
    batchPackLengthInputValue.value.trim() !== "" &&
    batchPackWidthInputValue.value.trim() !== "" &&
    batchPackHeightInputValue.value.trim() !== ""
);

function updateBatchPackDimsPopoverPosition(retry = 0) {
  nextTick().then(() => {
    if (!batchPackDimsRefRef.value || !batchPackDimsPopoverRef.value) {
      if (retry < 10)
        setTimeout(() => updateBatchPackDimsPopoverPosition(retry + 1), 20);
      return;
    }
    const refRect = batchPackDimsRefRef.value.getBoundingClientRect();
    const popRect = batchPackDimsPopoverRef.value.getBoundingClientRect();
    if ((popRect.width === 0 || popRect.height === 0) && retry < 10) {
      requestAnimationFrame(() =>
        setTimeout(() => updateBatchPackDimsPopoverPosition(retry + 1), 10)
      );
      return;
    }
    let top = refRect.bottom + 8;
    let left = refRect.left + refRect.width / 2 - 320 / 2;
    const pad = 10;
    if (left < pad) left = pad;
    else if (left + 320 > window.innerWidth - pad)
      left = window.innerWidth - 320 - pad;
    if (top < pad) top = pad;
    else if (top + popRect.height > window.innerHeight - pad)
      top = window.innerHeight - popRect.height - pad;
    batchPackDimsPopoverStyle.value = {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: "320px",
      zIndex: String(Z.POPPER),
    };
  });
}

function handleBatchPackDimsClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (
    batchPackDimsPopoverRef.value?.contains(target) ||
    batchPackDimsRefRef.value?.contains(target)
  )
    return;
  showBatchPackDimsPopover.value = false;
}

watch(showBatchPackDimsPopover, (v) => {
  if (v) {
    updateBatchPackDimsPopoverPosition();
    setTimeout(
      () => document.addEventListener("click", handleBatchPackDimsClickOutside),
      0
    );
  } else {
    document.removeEventListener(
      "click",
      handleBatchPackDimsClickOutside
    );
  }
});

function setShowBatchPackDimsPopover(v: boolean) {
  showBatchPackDimsPopover.value = v;
  if (v) {
    const m = workbench.transformedData?.value?.sku_matrix;
    const first = m?.[0];
    batchPackLengthInputValue.value =
      first?.length !== undefined && first?.length !== null
        ? String(first.length)
        : "";
    batchPackWidthInputValue.value =
      first?.width !== undefined && first?.width !== null
        ? String(first.width)
        : "";
    batchPackHeightInputValue.value =
      first?.height !== undefined && first?.height !== null
        ? String(first.height)
        : "";
  }
}

function batchPackDimsConfirm() {
  if (!batchPackDimsIsValid.value) {
    showToast("不能为空值（可为0）", 2000);
    return;
  }
  const m = workbench.transformedData?.value?.sku_matrix ?? [];
  const lengthNum = Number(batchPackLengthInputValue.value);
  const widthNum = Number(batchPackWidthInputValue.value);
  const heightNum = Number(batchPackHeightInputValue.value);
  if (
    Number.isNaN(lengthNum) ||
    Number.isNaN(widthNum) ||
    Number.isNaN(heightNum)
  ) {
    showToast("请输入数字", 2000);
    return;
  }

  m.forEach((_sku: any, idx: number) => {
    workbench.handleUpdateSkuPackagingLength?.(idx, lengthNum);
    workbench.handleUpdateSkuPackagingWidth?.(idx, widthNum);
    workbench.handleUpdateSkuPackagingHeight?.(idx, heightNum);
  });
  showBatchPackDimsPopover.value = false;
}

function batchPackDimsCancel() {
  batchPackLengthInputValue.value = "";
  batchPackWidthInputValue.value = "";
  batchPackHeightInputValue.value = "";
  showBatchPackDimsPopover.value = false;
}

const batchPackDimsPopoverPositionHandler = () =>
  updateBatchPackDimsPopoverPosition();

// ---------- 批量设置包装重量弹窗（由表头触发）----------
const showBatchPackWeightPopover = ref(false);
const batchPackWeightRefRef = ref<HTMLElement | null>(null);
const batchPackWeightPopoverRef = ref<HTMLElement | null>(null);
const batchPackWeightPopoverStyle = ref<Record<string, string>>({});

const batchPackWeightInputValue = ref<string>("");
// 弹窗内包装重量输入：与表格行内输入模式一致，避免 v-model 重渲染失焦
function onBatchPackWeightFieldInput(e: Event) {
  batchPackWeightInputValue.value = (e.target as HTMLInputElement).value;
}
const batchPackWeightIsValid = computed(
  () => batchPackWeightInputValue.value.trim() !== ""
);

function updateBatchPackWeightPopoverPosition(retry = 0) {
  nextTick().then(() => {
    if (!batchPackWeightRefRef.value || !batchPackWeightPopoverRef.value) {
      if (retry < 10)
        setTimeout(
          () => updateBatchPackWeightPopoverPosition(retry + 1),
          20
        );
      return;
    }
    const refRect = batchPackWeightRefRef.value.getBoundingClientRect();
    const popRect = batchPackWeightPopoverRef.value.getBoundingClientRect();
    if ((popRect.width === 0 || popRect.height === 0) && retry < 10) {
      requestAnimationFrame(() =>
        setTimeout(
          () => updateBatchPackWeightPopoverPosition(retry + 1),
          10
        )
      );
      return;
    }
    let top = refRect.bottom + 8;
    let left = refRect.left + refRect.width / 2 - 280 / 2;
    const pad = 10;
    if (left < pad) left = pad;
    else if (left + 280 > window.innerWidth - pad)
      left = window.innerWidth - 280 - pad;
    if (top < pad) top = pad;
    else if (top + popRect.height > window.innerHeight - pad)
      top = window.innerHeight - popRect.height - pad;
    batchPackWeightPopoverStyle.value = {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: "280px",
      zIndex: String(Z.POPPER),
    };
  });
}

function handleBatchPackWeightClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (
    batchPackWeightPopoverRef.value?.contains(target) ||
    batchPackWeightRefRef.value?.contains(target)
  )
    return;
  showBatchPackWeightPopover.value = false;
}

watch(showBatchPackWeightPopover, (v) => {
  if (v) {
    updateBatchPackWeightPopoverPosition();
    setTimeout(
      () =>
        document.addEventListener(
          "click",
          handleBatchPackWeightClickOutside
        ),
      0
    );
  } else {
    document.removeEventListener(
      "click",
      handleBatchPackWeightClickOutside
    );
  }
});

// 设置包装重量弹窗
function setShowBatchPackWeightPopover(v: boolean) {
  showBatchPackWeightPopover.value = v;
  if (v) {
    const m = workbench.transformedData?.value?.sku_matrix;
    const first = m?.[0];
    batchPackWeightInputValue.value =
      first?.weight !== undefined && first?.weight !== null
        ? String(first.weight)
        : "";
  }
}

function batchPackWeightConfirm() {
  if (!batchPackWeightIsValid.value) {
    showToast("不能为空值（可为0）", 2000);
    return;
  }
  const m = workbench.transformedData?.value?.sku_matrix ?? [];
  const weightNum = Number(batchPackWeightInputValue.value);
  if (Number.isNaN(weightNum)) {
    showToast("请输入数字", 2000);
    return;
  }
  m.forEach((_sku: any, idx: number) => {
    workbench.handleUpdateSkuPackagingWeight?.(idx, weightNum);
  });
  showBatchPackWeightPopover.value = false;
}

function batchPackWeightCancel() {
  batchPackWeightInputValue.value = "";
  showBatchPackWeightPopover.value = false;
}

// ---------- 批量设置货号弹窗（由表头触发）----------
const showResetAllSkuOfferIdsPopover = ref(false);
const resetAllSkuOfferIdsPopoverRefRef = ref<HTMLElement | null>(null);
const resetAllSkuOfferIdsPopoverRef = ref<HTMLElement | null>(null);
const resetAllSkuOfferIdsPopoverStyle = ref<Record<string, string>>({});

const resetAllSkuOfferIdsInputValue = ref<string>("");
const resetAllSkuOfferIdsIsValid = computed(
  () => resetAllSkuOfferIdsInputValue.value.trim() !== ""
);

function updateResetAllSkuOfferIdsPopoverPosition(retry = 0) {
  nextTick().then(() => {
    if (!resetAllSkuOfferIdsPopoverRefRef.value || !resetAllSkuOfferIdsPopoverRef.value) {
      if (retry < 10)
        setTimeout(
          () => updateResetAllSkuOfferIdsPopoverPosition(retry + 1),
          20
        );
      return;
    }
    const refRect = resetAllSkuOfferIdsPopoverRefRef.value.getBoundingClientRect();
    const popRect = resetAllSkuOfferIdsPopoverRef.value.getBoundingClientRect();
    if ((popRect.width === 0 || popRect.height === 0) && retry < 10) {
      requestAnimationFrame(() =>
        setTimeout(
          () => updateResetAllSkuOfferIdsPopoverPosition(retry + 1),
          10
        )
      );
      return;
    }
    let top = refRect.bottom + 8;
    let left = refRect.left + refRect.width / 2 - 280 / 2;
    const pad = 10;
    if (left < pad) left = pad;
    else if (left + 280 > window.innerWidth - pad)
      left = window.innerWidth - 280 - pad;
    if (top < pad) top = pad;
    else if (top + popRect.height > window.innerHeight - pad)
      top = window.innerHeight - popRect.height - pad;
    resetAllSkuOfferIdsPopoverStyle.value = {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: "280px",
      zIndex: String(Z.POPPER),
    };
  });
}

function handleResetAllSkuOfferIdsClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (
    resetAllSkuOfferIdsPopoverRef.value?.contains(target) ||
    resetAllSkuOfferIdsPopoverRefRef.value?.contains(target)
  )
    return;
  showResetAllSkuOfferIdsPopover.value = false;
}

watch(showResetAllSkuOfferIdsPopover, (v) => {
  if (v) {
    updateResetAllSkuOfferIdsPopoverPosition();
    setTimeout(
      () =>
        document.addEventListener(
          "click",
          handleResetAllSkuOfferIdsClickOutside
        ),
      0
    );
  } else {
    document.removeEventListener(
      "click",
      handleResetAllSkuOfferIdsClickOutside
    );
  }
});

// 显示批量设置货号弹窗
function onShowResetAllSkuOfferIdsPopover() {
  showResetAllSkuOfferIdsPopover.value = !showResetAllSkuOfferIdsPopover.value;
  if (showResetAllSkuOfferIdsPopover.value) {
    const m = workbench.transformedData?.value?.sku_matrix;
    const first = m?.[0];
    resetAllSkuOfferIdsInputValue.value =
      first?.offer_ids !== undefined && first?.offer_ids !== null
        ? String(first.offer_ids)
        : "";
  }
}
// 输入货号确认
function resetAllSkuOfferIdsConfirm() {
  if (!resetAllSkuOfferIdsInputValue.value) {
    showToast("请输入货号前缀", 2000);
    return;
  }
  //货号最多100字符，其中系统拼接19个，留给用户输入前缀只有81个
  if (resetAllSkuOfferIdsInputValue.value.length > 60) {
    showToast("货号长度不能超过60个字符", 2000);
    return;
  }
  function isEnglishAndNumber(str: string) {
    // 正则：只允许 字母、数字、短横线 -
    const reg = /^[a-zA-Z0-9-]+$/;
    return reg.test(str);
  }
  if (!isEnglishAndNumber(resetAllSkuOfferIdsInputValue.value)) {
    showToast("货号前缀仅支持英文、数字、短横线", 2000);
    return;
  }
  const m = workbench.transformedData?.value?.sku_matrix ?? [];
  m.forEach((_sku: any, idx: number) => {
    function generateSkuOfferId() {
      const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
      let tail = "";
      for (let i = 0; i < 8; i++) {
        tail += chars[Math.floor(Math.random() * chars.length)];
      }
      return `${resetAllSkuOfferIdsInputValue.value}${tail}`;
    }
    workbench.handleUpdateSkuOfferidPrefix(idx, generateSkuOfferId());
  });
  showResetAllSkuOfferIdsPopover.value = false;
  showToast("已更新货号", 2000);
}

function resetAllSkuOfferIdsCancel() {
  resetAllSkuOfferIdsInputValue.value = "";
  showResetAllSkuOfferIdsPopover.value = false;
}

// 列表输入框编辑货号
function onSkuOfferidPrefixInput(index: number | string, e: Event) {
  const rowIndex = Number(index);
  workbench.handleUpdateSkuOfferidPrefix(
    rowIndex,
    (e.target as HTMLInputElement).value
  );
  clearSkuTableFieldError(getSkuOfferidPrefixFieldKey(rowIndex));
}
function skuOfferidPrefix(sku: Record<string, unknown>) {
  const v = sku?.offerid_prefix;
  return typeof v === "string" ? v : "";
}

const resetAllSkuOfferIdsPopoverPositionHandler = () =>
  updateResetAllSkuOfferIdsPopoverPosition();
const batchPackWeightPopoverPositionHandler = () =>
  updateBatchPackWeightPopoverPosition();
const skuAspectMultiDropdownPositionHandler = () =>
  updateSkuAspectMultiDropdownPosition();
const skuVariantMultiDropdownPositionHandler = () =>
  updateSkuVariantMultiDropdownPosition();
const skuAspectSingleDropdownPositionHandler = () =>
  updateSkuAspectSingleDropdownPosition();
const skuVariantSingleDropdownPositionHandler = () =>
  updateSkuVariantSingleDropdownPosition();
function handleSkuAspectDropdownScrollClose(e: Event) {
  const target = e.target;
  if (target instanceof Element) {
    if (
      target.closest(".mjgd-ai-sku-variant-multi-popover") ||
      target.closest(".mjgd-ai-sku-variant-single-popover") ||
      target.closest(".mjgd-ai-sku-aspect-single-dropdown") ||
      target.closest(".mjgd-ai-sku-aspect-multi-popover")
    ) {
      return;
    }
  }
  closeSkuVariantMultiDropdown();
  closeSkuVariantSingleDropdown();
  closeSkuAspectSingleDropdown();
  closeSkuAspectMultiDropdown();
}

function onIsDirectSaleChange(e: Event) {
  workbench.isDirectSale.value = (e.target as HTMLInputElement).checked;
}
function onImageTranslateChange(e: Event) {
  workbench.imageTranslate.value = (e.target as HTMLInputElement).checked;
}
function getSkuTitleValue(sku: Record<string, unknown> | null | undefined) {
  // 用户清空后 sku_name 为 ""，须保留空值；仅未设置时才回退商品名称
  if (typeof sku?.sku_name === "string") return sku.sku_name;
  const rootTitle = workbench.transformedData?.value?.global_data?.product_name;
  return typeof rootTitle === "string" ? rootTitle : "";
}
function onSkuTitleInput(index: number, e: Event) {
  const root = workbench.transformedData?.value;
  const sku = root?.sku_matrix?.[index];
  if (!sku) return;
  sku.sku_name = (e.target as HTMLTextAreaElement).value.slice(0, 250);
  clearSkuTableFieldError(getSkuTitleFieldKey(index));
}
function onProductBasicDescriptionInput(e: Event) {
  const root = workbench.transformedData?.value;
  if (!root) return;
  if (!root.global_data) root.global_data = {};
  root.global_data.description_clean_text = (
    e.target as HTMLTextAreaElement
  ).value;
  // 更新修改后的简介
  setFeatureAttrValue(FEATURE_ATTR_ID_DESCRIPTION, root.global_data.description_clean_text ?? "");
  workbench.clearFeatureAttrValidationError(FEATURE_ATTR_ID_DESCRIPTION);
}

function applySkuTitleFromFirstRow() {
  const skuList = workbench.transformedData?.value?.sku_matrix;
  if (!Array.isArray(skuList) || skuList.length < 2) return;
  const firstTitle = getSkuTitleValue(skuList[0]);
  if (!firstTitle.trim()) {
    showToast("请输入首行内容", 2000);
    return;
  }
  for (let i = 1; i < skuList.length; i++) {
    const sku = skuList[i];
    if (!sku) continue;
    sku.sku_name = firstTitle;
  }
}

function goToImageQueue() {
  workbench.navigateToImageQueue?.();
}

// 添加变体、复制最后一行数据 追加到最后一行
function onAddVariant() {
  workbench.handleAddSku();
}

// 表格行多选（批量删除用）
const selectedSkuIndices = ref<number[]>([]);
function toggleSkuSelection(index: number) {
  const i = selectedSkuIndices.value.indexOf(index);
  if (i === -1) selectedSkuIndices.value = [...selectedSkuIndices.value, index];
  else
    selectedSkuIndices.value = selectedSkuIndices.value.filter(
      (j) => j !== index
    );
}
function toggleSelectAllSku(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  const list = transformedData.value?.sku_matrix ?? [];
  if (checked)
    selectedSkuIndices.value = list.map((_: unknown, i: number) => i);
  else selectedSkuIndices.value = [];
}
function onBatchDelete() {
  if (selectedSkuIndices.value.length === 0) return;
  const indices = [...selectedSkuIndices.value].sort((a, b) => b - a);
  indices.forEach((index) => workbench.handleDeleteSku(index));
  selectedSkuIndices.value = [];
}
watch(
  () => transformedData.value?.sku_matrix?.length ?? 0,
  () => {
    selectedSkuIndices.value = [];
  }
);
// 价格输入框
type SkuPriceField = "price_amount" | "sale_price";

const skuPriceFieldHandlers: Record<
  SkuPriceField,
  (index: number, value: number) => void
> = {
  price_amount: (index, value) => workbench.handleUpdateSkuPriceAmount(index, value),
  sale_price: (index, value) => workbench.handleUpdateSkuSalePrice(index, value),
};

function updateSkuPriceField(
  index: number | string,
  e: Event,
  field: SkuPriceField,
  normalize: boolean = false
) {
  const input = e.target as HTMLInputElement;
  const rawValue = input.value;

  if (rawValue.trim() === "") {
    skuPriceFieldHandlers[field](Number(index), 0);
    return;
  }

  const nextValue = normalize ? roundPrice(rawValue, 2) : Number(rawValue);
  if (Number.isNaN(nextValue)) return;

  skuPriceFieldHandlers[field](Number(index), nextValue);

  // 价格输入在失焦时统一矫正到两位，避免用户录入过程中被实时截断。
  if (normalize) input.value = String(nextValue);
}

function onSkuSalePriceInput(index: number | string, e: Event) {
  updateSkuPriceField(index, e, "sale_price");
}
function onSkuSalePriceBlur(index: number | string, e: Event) {
  updateSkuPriceField(index, e, "sale_price", true);
}
// 价格输入框
function onSkuPriceAmountInput(index: number | string, e: Event) {
  updateSkuPriceField(index, e, "price_amount");
}
// 价格输入框
function onSkuPriceAmountBlur(index: number | string, e: Event) {
  updateSkuPriceField(index, e, "price_amount", true);
}
function onSkuPackLengthInput(index: number | string, e: Event) {
  const valStr = (e.target as HTMLInputElement).value;
  if (valStr.trim() === "") return;
  const num = Number(valStr);
  if (Number.isNaN(num)) {
    showToast("请输入数字", 2000);
    return;
  }
  workbench.handleUpdateSkuPackagingLength?.(Number(index), num);
}
function onSkuPackWidthInput(index: number | string, e: Event) {
  const valStr = (e.target as HTMLInputElement).value;
  if (valStr.trim() === "") return;
  const num = Number(valStr);
  if (Number.isNaN(num)) {
    showToast("请输入数字", 2000);
    return;
  }
  workbench.handleUpdateSkuPackagingWidth?.(Number(index), num);
}
function onSkuPackHeightInput(index: number | string, e: Event) {
  const valStr = (e.target as HTMLInputElement).value;
  if (valStr.trim() === "") return;
  const num = Number(valStr);
  if (Number.isNaN(num)) {
    showToast("请输入数字", 2000);
    return;
  }
  workbench.handleUpdateSkuPackagingHeight?.(Number(index), num);
}
function onSkuPackWeightInput(index: number | string, e: Event) {
  const valStr = (e.target as HTMLInputElement).value;
  if (valStr.trim() === "") return;
  const num = Number(valStr);
  if (Number.isNaN(num)) {
    showToast("请输入数字", 2000);
    return;
  }
  workbench.handleUpdateSkuPackagingWeight?.(Number(index), num);
}
function onDeleteSku(index: number | string) {
  workbench.handleDeleteSku(Number(index));
}

function onSkuTableWheel(e: WheelEvent) {
  const container = skuTableScrollRef.value;
  if (!container) return;

  const hasHorizontalOverflow = container.scrollWidth > container.clientWidth;
  if (!hasHorizontalOverflow) return;

  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (target.closest("input, textarea, select, [contenteditable='true']")) return;

  const cell = target.closest("th, td") as HTMLElement | null;
  if (!cell) return;
  if (cell.closest(".mjgd-ai-sku-sticky-col")) return;

  const deltaX = Math.abs(e.deltaX);
  const deltaY = Math.abs(e.deltaY);

  const isHorizontalDominant = deltaX > deltaY * 0.3;

  if (!isHorizontalDominant && !isTableScrollingHorizontally) {
    return;
  }

  if (Math.abs(e.deltaY) < 1 && Math.abs(e.deltaX) < 1) return;

  closeSkuAspectSingleDropdown();
  closeSkuAspectMultiDropdown();
  const scrollAmount = e.deltaY !== 0 ? e.deltaY : e.deltaX;
  container.scrollLeft += scrollAmount;
  e.preventDefault();

  isTableScrollingHorizontally = true;
  if (tableScrollTimeout !== null) {
    clearTimeout(tableScrollTimeout);
  }
  tableScrollTimeout = window.setTimeout(() => {
    isTableScrollingHorizontally = false;
  }, 150);

  syncBottomScrollbarFromTable();
}

function syncBottomScrollbarFromTable() {
  if (isSyncingScroll || !bottomScrollbarRef.value || !skuTableScrollRef.value) return;
  isSyncingScroll = true;
  bottomScrollbarRef.value.scrollLeft = skuTableScrollRef.value.scrollLeft;
  requestAnimationFrame(() => {
    isSyncingScroll = false;
  });
}

function updateBottomScrollbarState() {
  const tableContainer = tableContainerRef.value;
  const tableScroll = skuTableScrollRef.value;
  if (!tableContainer || !tableScroll) {
    bottomScrollbarVisible.value = false;
    bottomScrollbarWidth.value = "0px";
    bottomScrollbarStyle.value = {
      left: "0px",
      width: "0px",
      bottom: `${BOTTOM_SCROLLBAR_VIEWPORT_GAP}px`,
    };
    return;
  }

  const scrollWidth = tableScroll.scrollWidth;
  const clientWidth = tableScroll.clientWidth;
  bottomScrollbarWidth.value = `${scrollWidth}px`;

  const hasHorizontalOverflow = scrollWidth > clientWidth + 1;
  if (!hasHorizontalOverflow) {
    bottomScrollbarVisible.value = false;
    return;
  }

  const tableRect = tableContainer.getBoundingClientRect();
  const scrollRect = tableScroll.getBoundingClientRect();
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth;
  const isSectionVisible = tableRect.bottom > 0 && tableRect.top < viewportHeight;
  const horizontalPadding = 12;
  const left = Math.max(
    horizontalPadding,
    Math.min(scrollRect.left, viewportWidth - horizontalPadding)
  );
  const width = Math.max(
    0,
    Math.min(scrollRect.width, viewportWidth - left - horizontalPadding)
  );

  const modalEl = tableContainer.closest(".mjgd-ai-modal");
  // 在弹窗内时对齐弹窗底边（表格区往往未占满高度，不能用 scrollRect.bottom 否则会悬在中间）
  const contentBottom =
    modalEl instanceof HTMLElement
      ? Math.min(
          modalEl.getBoundingClientRect().bottom,
          viewportHeight
        )
      : scrollRect.bottom;
  const targetBarBottomY = contentBottom - BOTTOM_SCROLLBAR_VIEWPORT_GAP;
  const bottomPx = Math.max(
    BOTTOM_SCROLLBAR_VIEWPORT_GAP,
    Math.round(viewportHeight - targetBarBottomY)
  );

  bottomScrollbarStyle.value = {
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    bottom: `${bottomPx}px`,
  };
  bottomScrollbarVisible.value = isSectionVisible && width > 0;

  if (
    bottomScrollbarRef.value &&
    Math.abs(bottomScrollbarRef.value.scrollLeft - tableScroll.scrollLeft) > 1
  ) {
    bottomScrollbarRef.value.scrollLeft = tableScroll.scrollLeft;
  }
}

function scheduleBottomScrollbarUpdate() {
  if (bottomScrollbarUpdateRaf !== null) {
    cancelAnimationFrame(bottomScrollbarUpdateRaf);
  }
  bottomScrollbarUpdateRaf = requestAnimationFrame(() => {
    bottomScrollbarUpdateRaf = null;
    updateBottomScrollbarState();
  });
}

function onSkuTableScroll() {
  if (skuVirtualRowsRef.value?.isVirtualizing?.()) {
    closeSkuVariantMultiDropdown();
    closeSkuAspectSingleDropdown();
    closeSkuAspectMultiDropdown();
  }
  syncBottomScrollbarFromTable();
  scheduleBottomScrollbarUpdate();
}

function onBottomScrollbarScroll() {
  if (isSyncingScroll || !bottomScrollbarRef.value || !skuTableScrollRef.value) return;
  closeSkuVariantMultiDropdown();
  closeSkuAspectSingleDropdown();
  closeSkuAspectMultiDropdown();
  isSyncingScroll = true;
  skuTableScrollRef.value.scrollLeft = bottomScrollbarRef.value.scrollLeft;
  requestAnimationFrame(() => {
    isSyncingScroll = false;
  });
  scheduleBottomScrollbarUpdate();
}

function setShowBatchPricePopover(v: boolean) {
  showBatchPricePopover.value = v;
}

onMounted(() => {
  window.addEventListener("resize", batchPricePopoverPositionHandler);
  window.addEventListener("scroll", batchPricePopoverPositionHandler, true);
  window.addEventListener("resize", batchPackDimsPopoverPositionHandler);
  window.addEventListener("scroll", batchPackDimsPopoverPositionHandler, true);
  window.addEventListener("resize", batchPackWeightPopoverPositionHandler);
  window.addEventListener("scroll", batchPackWeightPopoverPositionHandler, true);
  // 监听页面变化，更新货号弹窗位置
  window.addEventListener("resize", resetAllSkuOfferIdsPopoverPositionHandler);
  window.addEventListener("scroll", resetAllSkuOfferIdsPopoverPositionHandler, true);
  window.addEventListener("resize", skuAspectMultiDropdownPositionHandler);
  window.addEventListener("resize", skuVariantMultiDropdownPositionHandler);
  window.addEventListener("resize", skuAspectSingleDropdownPositionHandler);
  window.addEventListener("resize", skuVariantSingleDropdownPositionHandler);
  window.addEventListener("scroll", handleSkuAspectDropdownScrollClose, true);
  document.addEventListener("keydown", onSkuAspectSingleDocumentKeydown);
  window.addEventListener("resize", scheduleBottomScrollbarUpdate);
  window.addEventListener("scroll", scheduleBottomScrollbarUpdate, true);
  bottomScrollbarResizeObserver = new ResizeObserver(() => {
    scheduleBottomScrollbarUpdate();
  });
  if (tableContainerRef.value) {
    bottomScrollbarResizeObserver.observe(tableContainerRef.value);
  }
  if (skuTableScrollRef.value) {
    bottomScrollbarResizeObserver.observe(skuTableScrollRef.value);
  }
  if (skuTableRef.value) {
    bottomScrollbarResizeObserver.observe(skuTableRef.value);
  }
  nextTick(() => {
    syncBottomScrollbarFromTable();
    scheduleBottomScrollbarUpdate();
  });
});
onUnmounted(() => {
  if (tableScrollTimeout) {
    clearTimeout(tableScrollTimeout);
  }
  skuAspectDropdownRepositionTimers.forEach((timer) => {
    window.clearTimeout(timer);
  });
  skuAspectDropdownRepositionTimers = [];
  document.removeEventListener("click", handleBatchPriceClickOutside);
  window.removeEventListener("resize", batchPricePopoverPositionHandler);
  window.removeEventListener("scroll", batchPricePopoverPositionHandler, true);
  document.removeEventListener("click", handleBatchPackDimsClickOutside);
  window.removeEventListener("resize", batchPackDimsPopoverPositionHandler);
  window.removeEventListener("scroll", batchPackDimsPopoverPositionHandler, true);
  document.removeEventListener("click", handleBatchPackWeightClickOutside);
  window.removeEventListener("resize", batchPackWeightPopoverPositionHandler);
  window.removeEventListener("scroll", batchPackWeightPopoverPositionHandler, true);
  // 移除监听货号弹窗
  window.removeEventListener("resize", resetAllSkuOfferIdsPopoverPositionHandler);
  window.removeEventListener("scroll", resetAllSkuOfferIdsPopoverPositionHandler, true);
  window.removeEventListener("resize", skuAspectMultiDropdownPositionHandler);
  window.removeEventListener("resize", skuVariantMultiDropdownPositionHandler);
  window.removeEventListener("resize", skuAspectSingleDropdownPositionHandler);
  window.removeEventListener("resize", skuVariantSingleDropdownPositionHandler);
  window.removeEventListener("scroll", handleSkuAspectDropdownScrollClose, true);
  document.removeEventListener("keydown", onSkuAspectSingleDocumentKeydown);
  window.removeEventListener("resize", scheduleBottomScrollbarUpdate);
  window.removeEventListener("scroll", scheduleBottomScrollbarUpdate, true);
  bottomScrollbarResizeObserver?.disconnect();
  bottomScrollbarResizeObserver = null;
  if (bottomScrollbarUpdateRaf !== null) {
    cancelAnimationFrame(bottomScrollbarUpdateRaf);
    bottomScrollbarUpdateRaf = null;
  }
});

watch(aiOutput, async () => {
  await nextTick();
  if (aiOutputTextareaRef.value) {
    aiOutputTextareaRef.value.scrollTop =
      aiOutputTextareaRef.value.scrollHeight;
  }
});

</script>

<style scoped lang="scss">
/* 内联 ProgressBar */
.mjgd-progress-bar {
  padding: 16px 0;
}

.mjgd-progress-bar-container {
  position: relative;
  width: 100%;
}

.mjgd-progress-bar-line {
  position: absolute;
  top: 16px;
  left: 0;
  right: 0;
  height: 3px;
  background: #f5f7fa;
  border-radius: 2px;
  z-index: 1;
}

.mjgd-progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #409eff 0%, #66b1ff 100%);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.mjgd-progress-steps {
  position: relative;
  display: flex;
  justify-content: space-between;
  z-index: 2;
}

.mjgd-progress-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  position: relative;
}

.mjgd-progress-step-node {
  position: relative;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.mjgd-progress-step-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #f5f7fa;
  border: 3px solid #f5f7fa;
  transition: all 0.3s ease;
  z-index: 3;
}

.mjgd-progress-step-checkmark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 12px;
  font-weight: bold;
  z-index: 4;
}

.mjgd-progress-step-ripple {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #409eff;
  opacity: 0.3;
  animation: progress-ripple 1.5s ease-in-out infinite;
  z-index: 2;
}

@keyframes progress-ripple {
  0% {
    transform: translate(-50%, -50%) scale(0.8);
    opacity: 0.5;
  }

  50% {
    transform: translate(-50%, -50%) scale(1.2);
    opacity: 0.3;
  }

  100% {
    transform: translate(-50%, -50%) scale(1.6);
    opacity: 0;
  }
}

.mjgd-progress-step-label {
  font-size: 12px;
  color: #606266;
  text-align: center;
  white-space: nowrap;
  transition: color 0.3s ease;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mjgd-progress-step-pending .mjgd-progress-step-dot {
  background: #f5f7fa;
  border-color: #dcdfe6;
}

.mjgd-progress-step-pending .mjgd-progress-step-label {
  color: #606266;
}

.mjgd-progress-step-active .mjgd-progress-step-dot {
  background: #409eff;
  border-color: #409eff;
  box-shadow: 0 0 0 4px rgba(64, 158, 255, 0.1);
  animation: progress-pulse 1.5s ease-in-out infinite;
}

.mjgd-progress-step-active .mjgd-progress-step-label {
  color: #409eff;
  font-weight: 500;
}

@keyframes progress-pulse {
  0%,
  100% {
    transform: scale(1);
  }

  50% {
    transform: scale(1.1);
  }
}

.mjgd-progress-step-completed .mjgd-progress-step-dot {
  background: #67c23a;
  border-color: #67c23a;
}

.mjgd-progress-step-completed .mjgd-progress-step-label {
  color: #606266;
  font-weight: 500;
}

.mjgd-progress-step-skipped .mjgd-progress-step-dot {
  background: #f5f7fa;
  border-color: #dcdfe6;
  border-style: dashed;
}

.mjgd-progress-step-skipped .mjgd-progress-step-label {
  color: #606266;
  text-decoration: line-through;
}

/* 内联 CategorySelector */
.mjgd-category-selector {
  width: 100%;
}

.mjgd-category-selector-container {
  display: flex;
  align-items: center;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #ffffff;
  transition: all 0.3s;
  overflow: visible;
  position: relative;

  &:hover {
    border-color: #66b1ff;
  }

  &:focus-within {
    border-color: #409eff;
    box-shadow: 0 0 0 2px #ecf5ff;
  }
}

/* 类目选择：只读输入框 */
.mjgd-category-picker-input-wrap {
  width: 100%;
}
.mjgd-category-picker-input-wrap.is-disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.mjgd-category-picker-input {
  width: 100%;
  padding: 10px 12px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #606266;
  cursor: pointer;
}
.mjgd-category-picker-input:disabled {
  cursor: not-allowed;
}

/* 类目选择弹窗（参考 ozon-vue 视觉） */
.mjgd-category-dialog-layer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  box-sizing: border-box;
}
.mjgd-category-dialog {
  width: 820px;
  max-width: 92vw;
  background: #ffffff;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 86vh;
}
.mjgd-category-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
}
.mjgd-category-dialog-title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}
.mjgd-category-dialog-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: #6b7280;
}
.mjgd-category-dialog-close:hover {
  color: #111827;
}
.mjgd-category-dialog-body {
  padding: 14px 16px 10px;
  overflow: auto;
}
.mjgd-category-dialog-section {
  margin-bottom: 16px;
}
.mjgd-category-dialog-section-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 10px;
}

/* AI 智能帮选 pills */
.mjgd-category-ai-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.mjgd-category-ai-pill {
  max-width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #374151;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mjgd-category-ai-pill.active {
  background: #409eff;
  border-color: #409eff;
  color: #ffffff;
}
.mjgd-category-ai-empty {
  font-size: 13px;
  color: #9ca3af;
  padding: 6px 0;
}

/* Tree search */
.mjgd-category-tree-search {
  margin-bottom: 10px;
}
.mjgd-category-tree-search-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  outline: none;
  font-size: 13px;
  box-sizing: border-box;
}
.mjgd-category-tree-search-input:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
}

/* Tree — 对齐参考图：白底、层级缩进、一级与二级区块留白、叶子无三角占位 */
.mjgd-category-tree-wrap {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  max-height: 420px;
  overflow: auto;
  padding: 4px 0;
}
.mjgd-category-tree-empty {
  padding: 18px 12px;
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}
/* CategoryTreeNode 为 h() 子组件渲染，节点无父 scoped 标记，必须用 :deep 才能命中 */
.mjgd-category-tree-wrap :deep(.mjgd-category-tree),
.mjgd-category-tree-wrap :deep(.mjgd-category-tree-children) {
  list-style: none;
  margin: 0;
  padding: 0;
}
.mjgd-category-tree-wrap :deep(.mjgd-category-tree-children) {
  margin-top: 10px;
  margin-bottom: 4px;
  padding: 0;
  background: transparent;
}
.mjgd-category-tree-wrap :deep(.mjgd-category-tree-node) {
  margin: 0;
}
.mjgd-category-tree-wrap :deep(.mjgd-category-tree-node-row) {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 6px 12px 6px 0;
  box-sizing: border-box;
  border-radius: 0;
  cursor: pointer;
  user-select: none;
  transition: background 0.12s ease;
}
.mjgd-category-tree-wrap :deep(.mjgd-category-tree-node.lvl-1 > .mjgd-category-tree-node-row) {
  padding-left: 12px;
}
.mjgd-category-tree-wrap :deep(.mjgd-category-tree-node.lvl-2 > .mjgd-category-tree-node-row) {
  padding-left: 32px;
}
.mjgd-category-tree-wrap :deep(.mjgd-category-tree-node.lvl-3 > .mjgd-category-tree-node-row) {
  padding-left: 52px;
}
.mjgd-category-tree-wrap :deep(.mjgd-category-tree-node-row:hover) {
  background: #f5f6f8;
}
.mjgd-category-tree-wrap :deep(.mjgd-category-tree-node-row.is-active) {
  background: #e8eaed;
}
.mjgd-category-tree-wrap
  :deep(.mjgd-category-tree-node-row.is-active .mjgd-category-tree-node-label) {
  color: #1a1a1a;
  font-weight: 500;
}
.mjgd-category-tree-wrap :deep(.mjgd-category-tree-node-caret) {
  flex-shrink: 0;
  width: 14px;
  min-width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  color: #a0a0a0;
}
.mjgd-category-tree-wrap :deep(.mjgd-category-tree-node-caret.is-placeholder) {
  pointer-events: none;
}
.mjgd-category-tree-wrap :deep(.mjgd-category-tree-node-label) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 1.35;
  color: #4a4a4a;
  font-weight: 400;
}

.mjgd-category-dialog-footer {
  border-top: 1px solid #e5e7eb;
  padding: 12px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.mjgd-category-dialog-btn {
  min-width: 90px;
  height: 34px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #374151;
  cursor: pointer;
  font-size: 13px;
}
.mjgd-category-dialog-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.mjgd-category-dialog-btn-primary {
  border-color: #409eff;
  background: #409eff;
  color: #ffffff;
}
.mjgd-category-dialog-btn-primary:hover:not(:disabled) {
  opacity: 0.92;
}

.mjgd-category-search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #606266;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    color: #409eff;
    background: #ecf5ff;
  }
}

.mjgd-category-divider {
  width: 0.5px;
  height: 24px;
  background: #dcdfe6;
  flex-shrink: 0;
}

.mjgd-category-select {
  flex: 1;
  padding: 10px 12px;
  border: none;
  border-radius: 0;
  font-size: 14px;
  color: #606266;
  background: transparent;
  cursor: pointer;
  outline: none;
  appearance: none;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.mjgd-category-search-container {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  overflow: visible;
}

.mjgd-category-search-input {
  flex: 1;
  padding: 10px 36px 10px 12px;
  border: none;
  border-radius: 0;
  font-size: 14px;
  color: #606266;
  background: transparent;
  outline: none;

  &::placeholder {
    color: #606266;
  }
}

.mjgd-category-close-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: #606266;
  cursor: pointer;
  z-index: 1;
}

.mjgd-category-search-results {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 300px;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: var(--mjgd-z-popper);
  margin-top: 4px;
}

.mjgd-category-search-result-item {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid #e4e7ed;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: #ecf5ff;
  }
}

.mjgd-category-result-path {
  font-size: 14px;
  color: #606266;
  line-height: 1.5;
}

.mjgd-category-search-no-results,
.mjgd-category-search-loading {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  padding: 12px;
  background: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  z-index: var(--mjgd-z-popper);
  text-align: center;
  font-size: 14px;
  color: #606266;
}

/* 内联 Tooltip */
.mjgd-tooltip-wrapper {
  position: relative;
  display: inline-block;
}

.mjgd-tooltip {
  position: fixed;
  z-index: var(--mjgd-z-popper);
  padding: 8px 12px;
  background: rgba(48, 55, 66, 0.9);
  color: #fff;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
  max-width: 300px;
  word-wrap: break-word;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  pointer-events: none;
}

.mjgd-tooltip-content {
  position: relative;
  z-index: 1;
}

.mjgd-tooltip-arrow {
  position: absolute;
  width: 0;
  height: 0;
  border-style: solid;
}

.mjgd-tooltip-arrow-top {
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-width: 6px 6px 0 6px;
  border-color: rgba(48, 55, 66, 0.9) transparent transparent transparent;
}

.mjgd-tooltip-fade-enter-active,
.mjgd-tooltip-fade-leave-active {
  transition: opacity 0.2s ease;
}

.mjgd-tooltip-fade-enter-from,
.mjgd-tooltip-fade-leave-to {
  opacity: 0;
}

/* 内联 Popover + BatchPriceSetting */
.mjgd-ai-popover-wrapper {
  display: inline-block;
}

.mjgd-ai-popover-reference {
  display: inline-block;
}

.mjgd-ai-popover {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.mjgd-ai-batch-price-setting {
  box-sizing: border-box;
  min-width: 280px;
  padding: 16px;
}

.mjgd-ai-batch-price-header {
  margin-bottom: 16px;
}

.mjgd-ai-batch-price-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.mjgd-ai-batch-price-radio-group {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.mjgd-ai-batch-price-radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #666;
}

.mjgd-ai-batch-price-radio {
  cursor: pointer;
  width: 16px;
  height: 16px;
  accent-color: #1890ff;
}

.mjgd-ai-batch-price-input-wrapper {
  position: relative;
  margin-bottom: 16px;
}

.mjgd-ai-batch-price-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: #1890ff;
    box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
  }

  &[type="number"] {
    padding-right: 40px;
  }
}

.mjgd-ai-batch-price-append {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #666;
  font-size: 14px;
  pointer-events: none;
}

.mjgd-ai-batch-price-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.mjgd-ai-batch-price-btn {
  padding: 6px 16px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;

  &:hover:not(:disabled) {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.mjgd-ai-batch-price-btn-cancel {
  background: #fff;
  color: #666;

  &:hover:not(:disabled) {
    border-color: #1890ff;
    color: #1890ff;
  }
}

.mjgd-ai-batch-price-btn-confirm {
  background: #1890ff;
  color: #fff;
  border-color: #1890ff;

  &:hover:not(:disabled) {
    background: #40a9ff;
    border-color: #40a9ff;
  }
}

.mjgd-ai-page-workbench {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 10px;
}

.mjgd-ai-page-title {
  margin-bottom: 0;
}

.mjgd-ai-page-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
}

.mjgd-ai-header-category {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 480px;
  flex: 1;
}

.mjgd-ai-header-category-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
}

.mjgd-ai-header-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mjgd-category-selector-header {
  width: 100%;
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
  color: #606266;
  margin: 0;
}

.mjgd-ai-config-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 0;
}

.mjgd-ai-config-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mjgd-ai-config-label {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mjgd-ai-label {
  display: block;
  font-weight: 600;
  color: #111827;
  font-size: 16px;
}

.mjgd-ai-options-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  &.mjgd-ai-shop-select-disabled {
    opacity: 0.6;
    pointer-events: none;
    background: #f5f5f5;
  }
}

.mjgd-ai-shop-select-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.mjgd-ai-shop-select-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
}

.mjgd-ai-shop-select-title-bar {
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: #409eff;
  flex-shrink: 0;
}

.mjgd-ai-shop-select-tip {
  font-size: 13px;
  color: #e6a23c;
  font-weight: 400;
}

.mjgd-ai-shop-select-all-label {
  flex-shrink: 0;
}

.mjgd-ai-shop-card-empty {
  padding: 24px;
  text-align: center;
  color: #909399;
  font-size: 14px;
  background: #f7f9fb;
  border-radius: 8px;
}

.mjgd-ai-shop-card-grid {
  display: grid;
  /* 每行最多 4 列：列宽至少 max(200px, 25% 减间距)，窄屏自动降为 3/2/1 列 */
  grid-template-columns: repeat(auto-fill, minmax(max(200px, calc((100% - 36px) / 4)), 1fr));
  gap: 10px 12px;
  max-height: 360px;
  overflow-y: auto;
  padding: 12px;
  background: #f7f9fb;
  border-radius: 8px;
  box-sizing: border-box;
}

.mjgd-ai-shop-card-grid::-webkit-scrollbar {
  width: 6px;
}

.mjgd-ai-shop-card-grid::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 3px;
}

.mjgd-ai-shop-card {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 10px 12px;
  background: #ffffff;
  box-sizing: border-box;
  transition: border-color 0.2s, background 0.2s;
  min-width: 0;

  &.is_selected {
    border-color: #409eff;
    background: #ecf5ff;
  }
}

.mjgd-ai-shop-card-head {
  display: flex;
  align-items: center;
  min-width: 0;
}

.mjgd-ai-shop-card-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  cursor: pointer;
}

.mjgd-ai-shop-card-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #303133;
  font-weight: 500;
}

.mjgd-ai-shop-quota-list {
  margin-top: 8px;
  padding-left: 22px;
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.4;
}

.mjgd-ai-shop-quota-item {
  margin-right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  white-space: nowrap;
}

.mjgd-ai-shop-quota-label {
  color: #606266;
  flex-shrink: 0;
}

.mjgd-ai-shop-quota-value {
  color: #da4b28;
  font-weight: 600;
}

.mjgd-ai-shop-card-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-left: 22px;
  min-width: 0;
}

.mjgd-ai-shop-card-controls .mjgd-ai-shop-extra-select {
  width: auto;
  min-width: 0;
  flex: none;
  min-height: 32px;
  padding: 4px 8px;
  font-size: 12px;
}

.mjgd-ai-shop-stock-stepper {
  display: inline-flex;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
}

.mjgd-ai-shop-stepper-btn {
  width: 22px;
  height: 28px;
  border: none;
  background: #f5f7fa;
  color: #606266;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  line-height: 1;

  &:hover:not(:disabled) {
    background: #ecf5ff;
    color: #409eff;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.mjgd-ai-options-col {
  display: flex;
  flex-direction: column;
}

.mjgd-ai-shop-section {
  display: flex;
  flex-direction: column;
}

.mjgd-ai-shop-select-content {
  flex: 1;
}

.mjgd-ai-shop-select-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mjgd-ai-offerid-prefix-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.mjgd-ai-offerid-prefix-row .mjgd-ai-offerid-prefix-input-wrapper {
  flex: 1;
  min-width: 0;
}

.mjgd-ai-shop-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 40px !important;
  box-sizing: border-box;
  margin-bottom: 5px;
}

.mjgd-ai-shop-row:last-child {
  margin-bottom: 0;
}

.mjgd-ai-shop-row-label {
  width: 240px;
}

.mjgd-ai-shop-extra-select,
.mjgd-ai-shop-extra-input {
  padding: 6px 12px;
  font-size: 14px;
  color: #303133;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
  background: #ffffff;
  min-height: 36px;
}

.mjgd-ai-shop-extra-select:focus,
.mjgd-ai-shop-extra-input:focus {
  border-color: #409eff;
  background: #ffffff;
}

.mjgd-ai-shop-extra-select:disabled,
.mjgd-ai-shop-extra-input:disabled {
  background: #f5f7fa;
  color: #606266;
  cursor: not-allowed;
  border-color: #e4e7ed;
}

.mjgd-ai-shop-extra-select {
  width: 140px;
  flex: 0 0 160px;
  cursor: pointer;
}

.mjgd-ai-shop-extra-input {
  width: 46px;
  min-height: 30px;
  text-align: center;
  padding: 0 6px;
  border: none;
  border-radius: 0;
}

.mjgd-ai-inventory-shop-name {
  width: 240px;
  font-size: 14px;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mjgd-ai-inventory-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 136px;
  font-size: 14px;
  color: #909399;
  text-align: center;
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
    accent-color: #2563eb;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  span {
    user-select: none;
  }
}

.mjgd-ai-switch-group {
  display: flex;
  flex-direction: row;
  gap: 16px;

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
  background: #f7f9fb;
  border-radius: 8px;
  width: 100%;
}

.mjgd-ai-switch-label {
  font-size: 14px;
  font-weight: 500;
  color: #606266;
  white-space: nowrap;
}

.mjgd-ai-switch-wrapper {
  display: flex;
  align-items: center;
  height: 40px;
}

.mjgd-ai-offerid-prefix-input-wrapper {
  display: flex;
  align-items: center;
  height: 40px;
  flex: 1;
}

.mjgd-ai-offerid-prefix-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  font-size: 14px;
  color: #606266;
  background: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;

  &:focus {
    border-color: #409eff;
    box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
  }

  &.is-error {
    border-color: #ef4444;
    background: #fff8f8;
  }

  &.is-error:focus {
    border-color: #ef4444;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.16);
  }

  &:disabled {
    background: #f5f7fa;
    color: #606266;
    cursor: not-allowed;
    border-color: #e4e7ed;
  }

  &::placeholder {
    color: #606266;
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
    content: "";
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

.mjgd-ai-switch-active .mjgd-ai-switch-slider {
  background-color: #2563eb;

  &::before {
    transform: translateX(20px);
  }
}

.mjgd-ai-execute-btn {
  padding: 6px 16px;
  background: #409eff;
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
  box-shadow: 0 2px 10px rgba(64, 158, 255, 0.35);
  white-space: nowrap;

  &:hover:not(:disabled) {
    transform: none;
    /* Ozon 蓝色保持与当前一致（只强化阴影） */
    background: #409eff;
    box-shadow: 0 4px 14px rgba(64, 158, 255, 0.5);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.7;
    background: #9ca3af;
    box-shadow: none;
  }

  &.mjgd-ai-execute-btn-recover {
    background: #ffffff;
    color: #999999;
    box-shadow: inset 0 0 0 1px rgba(153, 153, 153, 0.32),
      0 1px 6px rgba(0, 0, 0, 0.06);

    &:hover:not(:disabled) {
      transform: none;
      background: #f5fbff;
      box-shadow: inset 0 0 0 1px rgba(153, 153, 153, 0.45),
        0 2px 10px rgba(153, 153, 153, 0.18);
    }
  }

  /* 浅色按钮（截图左侧） */
  &.mjgd-ai-execute-btn-secondary {
    background: #ffffff;
    color: #409eff;
    box-shadow: inset 0 0 0 1px rgba(64, 158, 255, 0.32),
      0 1px 6px rgba(0, 0, 0, 0.06);

    &:hover:not(:disabled) {
      transform: none;
      background: #f5fbff;
      box-shadow: inset 0 0 0 1px rgba(64, 158, 255, 0.45),
        0 2px 10px rgba(64, 158, 255, 0.18);
    }

    &:disabled {
      opacity: 0.75;
      background: #ffffff;
      color: #9ca3af;
      box-shadow: inset 0 0 0 1px rgba(156, 163, 175, 0.45);
    }
  }

  /* Ozon 蓝色按钮（截图右侧） */
  &.mjgd-ai-execute-btn-ozon {
    /* 保持当前蓝色，不改宽高，只微调阴影与圆角 */
    background: #409eff;
  }

  &.mjgd-ai-execute-btn-loading {
    background: #2563eb;
    opacity: 0.9;
  }
}

.mjgd-ai-execute-btn-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 20px;

  svg {
    width: 20px;
    height: 20px;
    display: block;
  }
}

.mjgd-ai-execute-icon {
  width: 30px;
  height: 30px;
  object-fit: contain;
  filter: brightness(0) invert(1);
}

.mjgd-ai-execute-loading-icon {
  font-size: 16px;
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

// .mjgd-ai-data-section {
//   display: grid;
//   grid-template-columns: 1fr 1fr;
//   gap: 16px;
//   margin-top: 24px;
// }

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

.mjgd-ai-product-basic {
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.mjgd-ai-product-basic .mjgd-ai-data-header {
  flex-shrink: 0;
}

.mjgd-ai-product-basic-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mjgd-ai-product-basic-note {
  padding: 14px 16px;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%);
}

.mjgd-ai-product-basic-note-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d4ed8;
}

.mjgd-ai-product-basic-note-text {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.mjgd-ai-product-basic-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mjgd-ai-product-basic-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.mjgd-ai-product-basic-label {
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

.mjgd-ai-link-action {
  font-size: 12px;
  color: #409eff;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.mjgd-ai-link-action:hover {
  color: #66b1ff;
  text-decoration: underline;
}

.mjgd-ai-product-basic-input {
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  color: #303133;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
  background: #ffffff;
}

.mjgd-ai-product-basic-input:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
}

.mjgd-ai-product-basic-input[readonly] {
  background: #f5f7fa;
  cursor: default;
}

.mjgd-ai-product-basic-textarea {
  width: 100%;
  min-height: 120px;
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.6;
  color: #303133;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  outline: none;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
  background: #ffffff;
}

.mjgd-ai-product-basic-textarea:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
}

.mjgd-ai-product-basic-textarea[readonly] {
  background: #f5f7fa;
  cursor: default;
}

.mjgd-ai-product-basic-textarea::placeholder {
  color: #909399;
}

.mjgd-ai-data-header {
  padding: 14px 16px;
  border-bottom: 1px solid #cbd5e1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.mjgd-ai-data-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.mjgd-ai-feature-attr {
  border-radius: 8px;
  overflow: visible;
  background: #ffffff;
  box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.1);
}

.mjgd-ai-feature-attr-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  border-radius: 8px 8px 0 0;
}

.mjgd-ai-feature-attr-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mjgd-ai-feature-attr-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.mjgd-ai-feature-attr-expand {
  font-size: 14px;
  color: #38bdf8;
  cursor: pointer;
}

.mjgd-ai-feature-attr-expand:hover {
  text-decoration: underline;
}

.mjgd-ai-feature-attr-body {
  margin-top: 0;
  background: #f8fafc;
  min-height: 48px;
  box-sizing: border-box;
  border-radius: 0 0 8px 8px;
  overflow: visible;
}

.mjgd-ai-feature-attr-empty,
.mjgd-ai-feature-attr-loading,
.mjgd-ai-feature-attr-error {
  padding-top: 10px;
  font-size: 14px;
  color: #909399;
  text-align: center;
}
.mjgd-ai-feature-attr-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mjgd-ai-feature-attr-error {
  color: #f56c6c;
}

.mjgd-ai-feature-attr-sections {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.mjgd-ai-feature-attr-section {
  background: #ffffff;
  padding: 14px 16px;
}

.mjgd-ai-feature-attr-section-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 6px;
}

.mjgd-ai-feature-attr-section-required .mjgd-ai-feature-attr-dot {
  color: #f56c6c;
}

.mjgd-ai-feature-attr-section-optional .mjgd-ai-feature-attr-dot {
  color: #409eff;
}

.mjgd-ai-feature-attr-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 24px;
}

.mjgd-ai-feature-attr-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.mjgd-ai-feature-attr-row .mjgd-ai-feature-attr-label {
  flex: 0 0 auto;
  width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  color: #606266;
  text-align: right;
}

.mjgd-ai-feature-attr-label-optional {
  color: #606266;
}

.mjgd-ai-feature-attr-cell {
  flex: 1 1 auto;
  min-width: 0;
}

.mjgd-ai-feature-attr-cell-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* flex 子项默认 min-width:auto 会按文本撑开，导致 select 省略号失效 */
.mjgd-ai-feature-attr-cell-main > .mjgd-searchable-select,
.mjgd-ai-feature-attr-cell-main > .mjgd-ai-feature-attr-input,
.mjgd-ai-feature-attr-cell-main > .mjgd-ai-feature-attr-multi {
  flex: 1 1 0;
  min-width: 0;
}

.mjgd-ai-feature-attr-cell .mjgd-ai-feature-attr-input,
.mjgd-ai-feature-attr-cell .mjgd-ai-feature-attr-select,
.mjgd-ai-feature-attr-cell .mjgd-ai-feature-attr-multi {
  width: 100%;
  max-width: 100%;
}

.mjgd-ai-feature-attr-action {
  flex: 0 0 auto;
}

.mjgd-ai-feature-attr-input,
.mjgd-ai-feature-attr-select {
  padding: 8px 12px;
  font-size: 14px;
  color: #303133;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
  background: #ffffff;
}

.mjgd-ai-feature-attr-input::placeholder,
.mjgd-ai-feature-attr-select option[value=""][disabled] {
  color: #909399;
}

.mjgd-ai-feature-attr-input:focus,
.mjgd-ai-feature-attr-select:focus,
.mjgd-ai-feature-attr-select.is-open {
  border-color: #409eff;
  background: #ffffff;
}

.mjgd-ai-product-basic-textarea.is-error,
.mjgd-ai-feature-attr-input.is-error,
.mjgd-ai-feature-attr-select.is-error,
.mjgd-ai-feature-attr-multi-control.is-error {
  border-color: #ef4444;
  background: #fff8f8;
}

.mjgd-ai-feature-attr-input.is-error:focus,
.mjgd-ai-feature-attr-select.is-error:focus,
.mjgd-ai-feature-attr-multi-control.is-error.is-open {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.16);
}

.mjgd-ai-feature-attr-multi {
  position: relative;
  width: 100%;
}

.mjgd-ai-feature-attr-multi-control {
  width: 100%;
  min-height: 36px;
  padding: 6px 2px 10px 6px;;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #ffffff;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.mjgd-ai-feature-attr-multi-control.is-open {
  border-color: #409eff;
  background: #ffffff;
}

.mjgd-ai-feature-attr-field-error {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: #ef4444;
}

.mjgd-ai-feature-attr-multi-tags {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.mjgd-ai-feature-attr-multi-placeholder {
  font-size: 14px;
  color: #909399;
  padding: 2px 0;
}

.mjgd-ai-feature-attr-multi-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 10px;
  font-size: 12px;
  background: #e4e7eb;
  border-radius: 6px;
  color: #606266;
}

.mjgd-ai-feature-attr-multi-tag-text {
  min-width: 0;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mjgd-ai-feature-attr-multi-tag-remove {
  border: none;
  background: transparent;
  color: #909399;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.mjgd-ai-feature-attr-multi-tag-remove:hover {
  color: #606266;
}

.mjgd-ai-feature-attr-multi-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: #303133;
  line-height: 0;

  svg {
    display: block;
  }
}

.mjgd-ai-feature-attr-multi-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  max-height: 240px;
  overflow: auto;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  z-index: 40;
  padding: 6px 0;
}

.mjgd-ai-feature-attr-multi-option {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 8px 12px;
  font-size: 14px;
  color: #303133;
  cursor: pointer;
}

.mjgd-ai-feature-attr-multi-option:hover {
  background: #f5f7fa;
}

.mjgd-ai-feature-attr-multi-option.is-selected {
  background: #ecf5ff;
  color: #409eff;
}

.mjgd-ai-feature-attr-multi-check {
  width: 0;
  text-align: center;
  color: #409eff;
  font-weight: 700;
}

.mjgd-ai-feature-attr-multi-option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mjgd-ai-feature-attr-noopts {
  font-size: 13px;
  color: #909399;
}

.mjgd-ai-model-badge {
  padding: 4px 10px;
  background: #18493e;
  color: #05df72;
  border: 1px solid #05df72;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

/* 与 ImageQueuePage 日志 overlay 一致的浅色（仅用于 options-col 内日志块） */
.mjgd-ai-options-col .mjgd-ai-data-right {
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid #e5e7eb;
}
.mjgd-ai-options-col .mjgd-ai-data-header {
  background: rgba(249, 250, 251, 0.6);
  border-bottom: 1px solid #e5e7eb;
}
.mjgd-ai-options-col .mjgd-ai-data-title {
  color: #111827;
}
.mjgd-ai-options-col .mjgd-ai-model-badge {
  background: #e5e7eb;
  color: #374151;
  border-color: #d1d5db;
}
.mjgd-ai-options-col .mjgd-ai-textarea {
  background: rgba(249, 250, 251, 0.4);
  color: #374151;
}
.mjgd-ai-options-col .mjgd-ai-textarea::-webkit-scrollbar-track {
  background-color: #e5e7eb;
}
.mjgd-ai-options-col .mjgd-ai-textarea::-webkit-scrollbar-thumb {
  background-color: #9ca3af;
}
.mjgd-ai-options-col .mjgd-ai-textarea::-webkit-scrollbar-thumb:hover {
  background-color: #6b7280;
}

.mjgd-ai-textarea {
  flex: 1;
  padding: 16px;
  border: none;
  outline: none;
  resize: none;
  font-family: "Courier New", monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #05df72;
  background: #101828;
  overflow-y: auto;
  min-height: 350px;
}

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
  color: #606266;
}
.mjgd-ai-loading-text {
  margin-left: 10px;
}

.mjgd-ai-table-container {
  flex: 1;
  overflow: hidden;
  padding: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
}

.mjgd-ai-sku-table-scroll {
  overflow-x: auto;
  overflow-y: auto;
  padding-bottom: 0;
  flex: 1;
  min-height: 0;

  &::-webkit-scrollbar {
    height: 16px;
    width: 16px;
  }

  &::-webkit-scrollbar:vertical {
    width: 0;
  }

  /* 横向由底部同步条控制，避免与 mjgd-ai-bottom-scrollbar 重复 */
  &::-webkit-scrollbar:horizontal {
    height: 0;
  }

  &::-webkit-scrollbar-track:horizontal {
    background: #f5f7fa;
    border-radius: 8px;
    border: 1px solid #e4e7ed;
  }

  &::-webkit-scrollbar-thumb:horizontal {
    background: linear-gradient(180deg, #409eff 0%, #36a3f7 100%);
    border-radius: 8px;
    border: 3px solid #f5f7fa;
    min-width: 60px;

    &:hover {
      background: linear-gradient(180deg, #66b1ff 0%, #409eff 100%);
    }
  }

  &::-webkit-scrollbar-corner {
    background: transparent;
  }
}

.mjgd-ai-bottom-scrollbar {
  position: fixed;
  bottom: 2px;
  z-index: 60;
  height: 18px;
  overflow-x: auto;
  overflow-y: hidden;
  border-radius: 10px;
  border: 1px solid rgba(220, 223, 230, 0.95);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    box-shadow 0.18s ease;

  &.is-visible {
    opacity: 1;
    pointer-events: auto;
  }

  &::-webkit-scrollbar {
    height: 16px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 8px;
  }

  &::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, #409eff 0%, #36a3f7 100%);
    border-radius: 8px;
    border: 3px solid rgba(255, 255, 255, 0.96);
    min-width: 60px;
  }
}

.mjgd-ai-bottom-scrollbar-inner {
  height: 1px;
}

.mjgd-ai-product-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #dcdfe6;
  background: #ffffff;
}

.mjgd-ai-product-list-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.mjgd-ai-sku-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border: 1px solid #f59e0b;
  border-radius: 6px;
}

.mjgd-ai-warning-text {
  font-size: 12px;
  font-weight: 500;
  color: #92400e;
  line-height: 1.4;
}

.mjgd-ai-batch-price-btn-trigger {
  padding: 6px 12px;
  background: #1890ff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}

.mjgd-ai-product-list-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mjgd-ai-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  background: #ffffff;
  transition: all 0.2s ease;
}

.mjgd-ai-action-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mjgd-ai-action-btn-icon svg {
  display: block;
}

.mjgd-ai-action-btn-image {
  border-color: #dfe4ec;
  background: #ffffff;
  color: #394150;
}

.mjgd-ai-action-btn-image:hover {
  border-color: #cfd6e0;
  background: #eef2f7;
}

.mjgd-ai-action-btn-add {
  border-color: #409eff;
  background: #409eff;
  color: #ffffff;
}

.mjgd-ai-action-btn-add .mjgd-ai-action-btn-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.72);
  font-size: 14px;
  line-height: 1;
}

.mjgd-ai-action-btn-add:hover {
  background: rgb(102,177,255);
  border-color: rgb(102,177,255);
}

.mjgd-ai-action-btn-delete {
  border-color: #ffc7c9;
  background: #fff5f5;
  color: #ff4d4f;
}

.mjgd-ai-action-btn-delete:hover {
  border-color: #ffb3b6;
  background: #ffecec;
}

.mjgd-ai-sku-table {
  width: max-content;
  min-width: 1800px;
  max-width: none;
  border-collapse: collapse;
  background: #ffffff;
  table-layout: fixed;
}

.mjgd-ai-sku-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 12px 16px;
  font-size: 14px;
  color: #606266;
  text-align: center;
  border-bottom: 1px solid #dcdfe6;
  background: rgba(249, 250, 251, 0.8);
  vertical-align: middle;
}

.mjgd-ai-sku-th-checkbox {
  width: 44px;
  min-width: 44px;
  padding: 12px 8px;
}

.mjgd-ai-sku-sticky-col {
  position: sticky;
  z-index: 2;
  background: #ffffff;
}

.mjgd-ai-sku-sticky-col-right {
  position: sticky;
  right: 0;
  z-index: 5;
  background: #ffffff;
  box-shadow: -1px 0 0 rgba(220, 223, 230, 1);
}

.mjgd-ai-sku-table thead .mjgd-ai-sku-sticky-col {
  background: rgba(249, 250, 251, 0.95);
  z-index: 6;
}

.mjgd-ai-sku-table thead .mjgd-ai-sku-sticky-col-right {
  background: rgba(249, 250, 251, 0.98);
  z-index: 7;
}

.mjgd-ai-sku-sticky-col--checkbox {
  left: 0;
  z-index: 5;
  box-shadow: 1px 0 0 rgba(220, 223, 230, 1);
}

.mjgd-ai-sku-sticky-col--image {
  left: 44px;
  z-index: 4;
  box-shadow: 1px 0 0 rgba(220, 223, 230, 1);
}

.mjgd-ai-sku-sticky-col--name {
  left: 144px;
  z-index: 3;
  box-shadow: 1px 0 0 rgba(220, 223, 230, 1);
  width: 140px;
  min-width: 140px;
  max-width: 140px;
}

.mjgd-ai-sku-checkbox-cell {
  width: 44px;
  min-width: 44px;
  padding: 12px 8px;
  text-align: center;
  vertical-align: middle;
}

.mjgd-ai-sku-checkbox-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin: 0;

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #409eff;
  }
}

// 修复已添加富文本的row显示的绿色对号的层级问题
.mjgd-ai-sku-tr-header {
  position: relative;
  z-index: 10;
}

.mjgd-ai-sku-th-with-action {
  vertical-align: middle;
}

.mjgd-ai-sku-th-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  word-break: keep-all;
}

.mjgd-ai-sku-th-title {
  font-weight: 600;
  color: #606266;
}

.mjgd-ai-sku-th-action {
  font-size: 12px;
  color: #409eff;
  text-decoration: underline;
  cursor: pointer;
  user-select: none;
}

.mjgd-ai-sku-th-action:hover {
  color: #66b1ff;
}

.mjgd-ai-sku-aspect-th {
  width: 110px;
  min-width: 90px;
  max-width: 160px;
  font-size: 13px;
  white-space: normal;
  line-height: 1.35;
  word-break: break-word;
}

.mjgd-ai-sku-aspect-cell {
  overflow: visible;
  vertical-align: center;
  padding: 8px 6px !important;
  text-align: left;
}

.mjgd-ai-sku-description-textarea {
  width: 180px;
  min-height: 72px;
}

.mjgd-ai-sku-description-textarea.is-error {
  border-color: #ef4444;
  background: #fff8f8;
}

.mjgd-ai-sku-variant-multi {
  width: 100%;
}

.mjgd-ai-sku-variant-multi-popover {
  position: fixed;
  z-index: var(--mjgd-z-popper);
}

/* 与采购价 .mjgd-ai-price-input（6px 竖向 padding + 13px 字）同视觉高度 */
.mjgd-ai-sku-aspect-input,
.mjgd-ai-sku-aspect-select {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  height: 32px;
  min-height: 32px;
  padding: 6px 8px;
  font-size: 13px;
  line-height: 1.25;
  color: #606266;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #ffffff;
}

.mjgd-ai-sku-aspect-input.is-error,
.mjgd-ai-sku-aspect-select.is-error,
.mjgd-ai-sku-aspect-multi .mjgd-ai-feature-attr-multi-control.is-error {
  border-color: #ef4444;
  background: #fff8f8;
}

.mjgd-ai-sku-aspect-input.is-error:focus,
.mjgd-ai-sku-aspect-select.is-error:focus,
.mjgd-ai-sku-aspect-select.is-error.is-open,
.mjgd-ai-sku-aspect-multi .mjgd-ai-feature-attr-multi-control.is-error.is-open,
.mjgd-ai-sku-aspect-multi .mjgd-ai-feature-attr-multi-control.is-error:focus {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.16);
}

.mjgd-ai-sku-aspect-single,
.mjgd-ai-sku-variant-single {
  width: 100%;
}

.mjgd-ai-sku-variant-single-popover {
  position: fixed;
  z-index: var(--mjgd-z-popper);
}

.mjgd-ai-sku-aspect-select {
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  cursor: pointer;
  color: #303133;
}

.mjgd-ai-sku-aspect-select:disabled {
  cursor: not-allowed;
  color: #c0c4cc;
  background: #f5f7fa;
}

.mjgd-ai-sku-aspect-select.is-open {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.14);
}

.mjgd-ai-sku-aspect-select.is-placeholder .mjgd-ai-sku-aspect-select-label {
  color: #909399;
}

.mjgd-ai-sku-aspect-select-label {
  flex: 1;
  min-width: 0;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mjgd-ai-sku-aspect-select-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: #909399;
  line-height: 0;
  transition: transform 0.2s ease;
}

.mjgd-ai-sku-aspect-select-arrow.is-open {
  transform: rotate(180deg);
}

.mjgd-ai-sku-aspect-single-dropdown {
  overflow: auto;
  overscroll-behavior: contain;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  padding: 6px 0;
}

.mjgd-ai-sku-aspect-single-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.25;
  color: #303133;
  cursor: pointer;
}

.mjgd-ai-sku-aspect-single-option:hover {
  background: #f5f7fa;
}

.mjgd-ai-sku-aspect-single-option.is-selected {
  background: #ecf5ff;
  color: #409eff;
}

.mjgd-ai-sku-aspect-single-check {
  width: 0;
  text-align: center;
  color: #409eff;
  font-weight: 700;
}

.mjgd-ai-sku-aspect-single-option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mjgd-ai-sku-aspect-multi .mjgd-ai-feature-attr-multi-control {
  min-height: 32px;
  padding: 5px 8px;
  align-items: center;
  box-sizing: border-box;
  border-radius: 4px;
}

.mjgd-ai-sku-aspect-multi .mjgd-ai-feature-attr-multi-placeholder {
  font-size: 13px;
  line-height: 1.25;
  padding: 0;
}

.mjgd-ai-sku-aspect-multi .mjgd-ai-feature-attr-multi-tags {
  max-height: none;
  overflow: hidden;
  align-items: center;
}

.mjgd-ai-sku-aspect-multi-popover {
  position: fixed;
  z-index: var(--mjgd-z-popper);
}

.mjgd-ai-sku-table tbody tr {
  border-bottom: 1px solid #dcdfe6;
}

.mjgd-ai-sku-spacer-row {
  border: 0 !important;
}

.mjgd-ai-sku-spacer-row td,
.mjgd-ai-sku-spacer-cell {
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.mjgd-ai-sku-table tbody td {
  padding: 12px 16px;
  font-size: 13px;
  color: #606266;
  text-align: center;
  vertical-align: middle;
}

.mjgd-ai-sku-image-cell {
  width: 100px;
  max-width: 100px;
}

.mjgd-ai-sku-th-pack-dims {
  width: 260px;
  min-width: 260px;
  max-width: 260px;
  font-size: 13px;
}

.mjgd-ai-sku-th-pack-weight {
  width: 150px;
  min-width: 150px;
  max-width: 150px;
  font-size: 13px;
}

.mjgd-ai-sku-pack-dims-cell {
  width: 260px;
  min-width: 260px;
  max-width: 260px;
}

.mjgd-ai-sku-pack-dims-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
}

.mjgd-ai-sku-pack-dims-mul {
  color: #909399;
  font-size: 13px;
  width: 12px;
  min-width: 12px;
  text-align: center;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mjgd-ai-sku-pack-dims-input {
  width: 70px;
  min-width: 70px;
  height: 32px;
  padding: 6px 8px;
  box-sizing: border-box;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #ffffff;
  color: #606266;
  font-size: 13px;
  text-align: center;
  outline: none;
}

.mjgd-ai-sku-pack-dims-input:focus {
  border-color: #409eff;
}

.mjgd-ai-sku-pack-weight-cell {
  width: 150px;
  min-width: 150px;
  max-width: 150px;
}

.mjgd-ai-sku-pack-weight-inner {
  display: flex;
  align-items: center;
  justify-content: center;
}

.mjgd-ai-sku-pack-weight-input {
  width: 120px;
  min-width: 120px;
  height: 32px;
  padding: 6px 8px;
  box-sizing: border-box;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #ffffff;
  color: #606266;
  font-size: 13px;
  text-align: center;
  outline: none;
}

.mjgd-ai-sku-pack-weight-input:focus {
  border-color: #409eff;
}

.mjgd-ai-sku-image,
.mjgd-ai-sku-image-cell :deep(.mjgd-ai-sku-image),
.mjgd-ai-sku-image-cell :deep(.mjgd_csp_safe_img_loading) {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  cursor: pointer;
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
  color: #606266;
  cursor: pointer;
}

.mjgd-ai-sku-video-th,
.mjgd-ai-sku-rich-text-th {
  width: 140px;
  min-width: 140px;
  max-width: 140px;
}

.mjgd-ai-sku-video-cell,
.mjgd-ai-sku-rich-text-cell {
  width: 140px;
  min-width: 140px;
  max-width: 140px;
}

.mjgd-ai-sku-video-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  margin: 0 auto;
}

.mjgd-ai-sku-rich-text-cell .json-rich-text-preview {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

// 与 JsonRichTextPreview compact-status 保持一致：实心绿底 + el-icon-check
.mjgd-ai-sku-video-status {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  background: #52c41a;
  border-radius: 50%;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  border: 2px solid #fff;
}

.mjgd-ai-sku-video-status .el-icon-check {
  font-size: 12px;
}

.mjgd-ai-sku-video-container {
  width: auto;
  min-height: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.mjgd-ai-sku-video-thumb-shell {
  width: 44px;
  height: 44px;
  min-width: 44px;
  max-width: 44px;
  min-height: 44px;
  max-height: 44px;
  flex: 0 0 44px;
  overflow: hidden;
  border-radius: 6px;
}

.mjgd-ai-sku-rich-text-cell.is-error {
  outline: 1px solid #ef4444;
  outline-offset: -1px;
  background: #fff8f8;
}

.mjgd-ai-sku-rich-text-cell.is-error .json-rich-text-preview {
  border-color: #ef4444;
}

.mjgd-ai-sku-rich-text-cell .json-rich-text-preview.is-compact {
  display: inline-flex;
  width: auto;
}

.mjgd-ai-sku-video-placeholder {
  width: 48px;
  height: 48px;
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  background: #fafafa;
}

.mjgd-ai-sku-video-placeholder.small {
  width: 44px;
  height: 44px;
}

.mjgd-ai-sku-video-placeholder svg {
  width: 24px;
  height: 24px;
}

.mjgd-ai-sku-video-preview-card {
  width: 44px;
  height: 44px;
  min-width: 44px;
  max-width: 44px;
  min-height: 44px;
  max-height: 44px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #f8fafc;
  overflow: hidden;
  box-sizing: border-box;
  flex: 0 0 44px;
}

.mjgd-ai-sku-video-preview-card {
  position: relative;
}

.mjgd-ai-sku-video-preview {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  pointer-events: none;
  background: #111827;
}

.mjgd-ai-sku-video-preview-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(to bottom, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.18));
  pointer-events: none;
}

.mjgd-ai-sku-video-preview-mask svg {
  width: 18px;
  height: 18px;
  color: #fff;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25));
}

.mjgd-ai-sku-field-value {
  font-size: 13px;
  color: #606266;
  word-break: break-word;
}

.mjgd-ai-sku-name-th {
  width: 170px;
  min-width: 170px;
  max-width: 170px;
}

.mjgd-ai-sku-name-cell {
  width: 170px;
  min-width: 170px;
  max-width: 170px;
  word-break: break-word;
  overflow: hidden;
}

.mjgd-ai-sku-title-input-wrapper {
  position: relative;
}

.mjgd-ai-sku-title-textarea {
  box-sizing: border-box;
  display: block;
  width: 100%;
  height: 80px;
  min-height: 80px;
  padding: 8px 10px;
  background: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  color: #303133;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  line-height: 1.45;
}

.mjgd-ai-sku-title-textarea:focus {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1);
  outline: none;
}

.mjgd-ai-sku-title-textarea.is-error {
  border-color: #ef4444;
  background: #fff8f8;
}

.mjgd-ai-sku-title-textarea.is-error:focus {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.16);
}

.mjgd-ai-sku-title-textarea:disabled {
  background: #f5f7fa;
  cursor: not-allowed;
}

.mjgd-ai-sku-title-count {
  position: absolute;
  right: 12px;
  bottom: 2px;
  font-size: 11px;
  line-height: 1;
  color: #909399;
  pointer-events: none;
}

.mjgd-ai-sku-offerid-cell {
  width: 160px;
  min-width: 160px;
  max-width: 160px;
}
.mjgd-ai-sku-offerid-th {
  width: 160px;
  min-width: 160px;
  max-width: 160px;
}

.mjgd-ai-sku-price-cell {
  width: 120px;
  min-width: 120px;
  max-width: 120px;
}
.mjgd-ai-sku-price-th {
  width: 120px;
  min-width: 120px;
  max-width: 120px;
}

.mjgd-ai-sku-sale-price-cell {
  width: 150px;
  min-width: 150px;
  max-width: 150px;
}
.mjgd-ai-sku-sale-price-th {
  width: 150px;
  min-width: 150px;
  max-width: 150px;
}

.mjgd-ai-sku-action-th,
.mjgd-ai-sku-action-cell {
  width: 80px;
  min-width: 80px;
  max-width: 80px;
  text-align: center;
}

.mjgd-ai-delete-btn {
  padding: 6px 12px;
  background: #ff4757;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.mjgd-ai-price-wrapper {
  display: inline-flex;
  align-items: center;
  background: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0;
  min-width: 100px;
  max-width: 100%;
}

.mjgd-ai-price-wrapper-readonly {
  background: #f8fafc;
}

.mjgd-ai-price-symbol {
  padding: 4px 10px;
  font-size: 13px;
  color: #606266;
  font-weight: 500;
  flex-shrink: 0;
}

.mjgd-ai-price-input {
  width: 80px;
  min-width: 60px;
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  color: #606266;
  background: transparent;
}

.mjgd-ai-price-input[readonly] {
  background: #f8fafc;
  cursor: not-allowed;
}

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
}

.mjgd-ai-result-header .mjgd-ai-data-title {
  font-size: 14px;
  font-weight: 600;
  color: #606266;
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
}

.mjgd-ai-result-shop,
.mjgd-ai-result-task {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
}

.mjgd-ai-result-table {
  width: 100%;
  border-collapse: collapse;
  background: #f5f7fa;
  border-radius: 4px;
  overflow: hidden;
}

.mjgd-ai-result-table thead th {
  padding: 12px 16px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  border-bottom: 2px solid #dcdfe6;
}

.mjgd-ai-result-table tbody td {
  padding: 12px 16px;
  font-size: 13px;
  color: #606266;
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
  font-family: "Courier New", monospace;
  color: #409eff;
  font-weight: 500;
  word-break: break-all;
}

.mjgd-ai-result-copy-btn {
  padding: 4px 12px;
  background: #409eff;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.mjgd-ai-workbench-log-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
}

.mjgd-ai-workbench-log-panel {
  width: min(900px, 92vw);
  height: min(72vh, 680px);
  background: #fff;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mjgd-ai-workbench-log-header {
  height: 48px;
  padding: 0 14px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.mjgd-ai-workbench-log-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}
.mjgd-ai-workbench-log-warning {
  color: #d97706;
  font-size: 14px;
  font-weight: 500;
}
.mjgd-ai-workbench-log-close {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 20px;
  color: #64748b;
  line-height: 1;
  padding: 0 4px;
}

.mjgd_ai_workbench_log_viewport {
  flex: 1;
  overflow: auto;
  padding: 12px 14px;
  font-size: 12px;
  line-height: 1.5;
  color: #0f172a;
  background: #f8fafc;
  font-family: "SF Mono", "Consolas", "Courier New", monospace;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: anywhere;
  user-select: text;
  min-width: 0;
}
.mjgd_ai_workbench_log_viewport .mjgd_ai_log_stream_block {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.mjgd_ai_workbench_log_viewport .mjgd_ai_log_stream_text {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: anywhere;
  overflow-x: hidden;
}

.mjgd-media-preview-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.mjgd-media-preview-container {
  position: relative;
  max-width: 90%;
  max-height: 90%;
  cursor: default;
}

.mjgd-media-preview-img {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.mjgd-media-preview-close {
  position: absolute;
  top: -40px;
  right: 0;
  color: #fff;
  font-size: 32px;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  transition: background 0.3s;
}

.mjgd-media-preview-close:hover {
  background: rgba(0, 0, 0, 0.7);
}

/** start 可搜索下拉选择器 */
.mjgd-searchable-select {
  position: relative;
  width: 100%;

  .mjgd-ai-feature-attr-multi-arrow {
    position: absolute;
    top: 12px;
    right: 4px;
  }
}
.searchable-select {
  position: relative;
  width: 100%;
}

.select-input {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  /* 为右侧下拉箭头预留空间，避免长文本盖住图标 */
  padding-right: 28px;
}

.select-input.is-placeholder {
  color: #909399;
}

.select-input.is-error {
  border-color: red;
}

.select-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-top: 4px;
  z-index: var(--mjgd-z-popper);
  max-height: 300px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-input {
  box-sizing: border-box;
  width: 100%;
  padding: 6px 12px;
  border: none;
  border-bottom: 1px solid #eee;
  outline: none;
}

.options {
  overflow-y: auto;
}

.option-item {
  padding: 6px 12px;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.option-item:hover {
  background: #f5f5f5;
}

.option-item-none {
  color: #999999;
}
/** end 可搜索下拉选择器 */

// 加载中动画
.mjgd_ai_data_loading {
  width: 20px;
  height: 20px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid #3498db;
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
</style>
