<template>
  <div class="mjgd-ai-image--queue-container" @click.outside="closeAllDropdowns">
    <!-- 顶部返回栏 -->
    <div class="mjgd-ai-image-queue-header">
      <button type="button" class="mjgd-ai-back-btn" @click="imageQueue.navigateToWorkbench">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>返回工作台
      </button>
      <div class="mjgd_ai_workspace_tip_bar">
        <svg class="mjgd_ai_workspace_tip_icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V456c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272zm-32-344a48.01 48.01 0 0 1 0-96 48.01 48.01 0 0 1 0 96z"
            fill="currentColor" />
        </svg>
        <span class="mjgd_ai_workspace_tip_text" v-if="editPageMode === 'single'">单变体改图模式：①全选变体仅用于批量分配图片至多个变体；②仅图片翻译和智能消除水印会修改所有相同链接的图片；③相同链接的图片仅处理一次</span>
        <span class="mjgd_ai_workspace_tip_text" v-else>批量变体改图模式：①右栏功能都会修改所有相同链接的图片；②相同链接的图片仅处理一次</span>
      </div>
      <button v-if="showRestoreImageEditBtn" type="button" class="mjgd_ai_restore_edit_btn" @click="handleRestoreLastImageEdit">
        <svg t="1777284225761" class="mjgd_ai_restore_edit_btn_icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1166" width="20" height="20">
          <path
            d="M863.60644531 309.85595703l-118.57324219 118.57324219-46.66992187-46.70947266 95.19873047-95.23828125-95.23828125-95.23828125L745.03320313 144.57324219l141.9477539 141.90820312-23.33496094 23.33496094z"
            fill="#999999" p-id="1167"></path>
          <path
            d="M444.76367187 807.24658203h187.19384766v66.04980469H444.76367187a309.88037109 309.88037109 0 1 1 1e-8-619.76074219h355.95703124v66.04980469h-355.95703124a243.83056641 243.83056641 0 0 0-1e-8 487.66113281z"
            fill="#999999" p-id="1168"></path>
        </svg>恢复上次改图
      </button>
      <div class="mjgd_ai_queue_mode_tabs">
        <button type="button" class="mjgd_ai_queue_mode_tab" :class="{ mjgd_ai_queue_mode_tab_active: editPageMode === 'single' }" @click="switchEditMode('single')">单变体改图</button>
        <button type="button" class="mjgd_ai_queue_mode_tab" :class="{ mjgd_ai_queue_mode_tab_active: editPageMode === 'batch' }" @click="switchEditMode('batch')">批量变体改图</button>
      </div>
    </div>
    <div class="mjgd-ai-workspace-three-cols">
      <!-- 左栏 -->
      <div class="mjgd-ai-workspace-left">
      <div class="mjgd-ai-workspace-left-section">
        <div class="mjgd-ai-workspace-left-header">
          <span class="mjgd-ai-workspace-left-title"> 主图 / 图片集 </span>
          <span class="mjgd-ai-workspace-left-count">共{{ skuMatrix.length }}个变体</span>
        </div>
        <label class="mjgd-ai-workspace-checkbox-row">
          <input type="checkbox" :checked="selectSkuIndexList.length === skuMatrix.length && skuMatrix.length > 0" @change="handleSelectAllVariants" />
          <span>全选</span>
        </label>

        <!-- 左栏sku列表 -->
        <div ref="variantListRef" class="mjgd-ai-workspace-variant-list">
          <div v-for="(sku, index) in skuMatrix" :key="index" class="mjgd-ai-workspace-variant-card" :class="{ 'mjgd-ai-workspace-variant-selected': isVariantCardSelected(index as number) }"
            :data-variant-index="index" @click="handleVariantClick(index as number)">
            <div class="mjgd-ai-workspace-variant-header">
              <!-- 勾选框 -->
              <label class="mjgd-ai-workspace-variant-checkbox" @click.stop>
                 <input type="checkbox" :checked="selectSkuIndexList.includes(index as number)" @change="handleVariantCheckboxChange(index as number)" />
              </label>
              <div class="mjgd-ai-workspace-variant-label">SKU名称：{{ sku.specs ? formatSkuSpecs(sku.specs) : `变体 ${index as number + 1}` }}</div>
            </div>
            <div class="mjgd-ai-workspace-variant-widget-text" v-if="sku.hasWidget">已分配富文本</div>
            <div class="mjgd-ai-workspace-variant-imgs">
              <template v-if="sku.skuImgList.length > 0">
                <span class="mjgd-ai-workspace-variant-main-label">主图</span>
                <template v-for="(url, index) in sku.skuImgList" :key="index">
                  <CspSafeImg v-if="index as number < 5" :src="url.transformUrl" :show-loading-text="false" :class="index as number === 0 ? 'mjgd_ai_workspace_variant_img_main' : ''" />
                </template>
                <span v-if="(sku.skuImgList.length > 5)" class="mjgd-ai-workspace-variant-more">+{{ sku.skuImgList.length - 5 }}</span>
              </template>
              <span v-else class="mjgd-ai-workspace-variant-no-img">暂无图片</span>
            </div>
          </div>
        </div>
      </div>
      <div class="mjgd-ai-workspace-left-section mjgd-ai-workspace-public-card">
        <div class="mjgd-ai-workspace-public-inner">
          <div class="mjgd-ai-workspace-public-text">
            <div class="mjgd-ai-workspace-public-title">详情图片</div>
            <div class="mjgd-ai-workspace-public-desc">尚未分配至任何变体的图片</div>
          </div>
          <button v-if="editPageMode === 'single'" type="button" class="mjgd-ai-workspace-public-btn" @click="openOtherImagesTab">查看图片</button>
          <label v-else class="mjgd_ai_detail_checkbox_row" @click.stop>
            <input type="checkbox" :checked="batchIncludeDetailImages" @change="handleBatchDetailCheckboxChange" />
            <span>在中栏展示</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 中栏 -->
    <div class="mjgd-ai-workspace-center">
       <div class="mjgd-ai-workspace-toolbar">
          <div class="mjgd-ai-workspace-toolbar-row mjgd-ai-workspace-toolbar-row-main">
            <div class="mjgd-ai-workspace-toolbar-actions">
              <template v-if="editPageMode === 'single'">
                <button type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-primary"
                  :disabled="selectImgIndexList.length === 0"
                  @click="handleConfirmAssign">确认分配</button>
              </template>
              <button type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-outline" title="还原上一步的图片处理"
                @click="handleBatchRevert">还原图片</button>
              <button type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-outline"
                @click="handleBatchRemove">移除图片</button>
            </div>
            <button v-if="editPageMode === 'single'" type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-outline" @click="openJsonSyncModal">同步JSON富文本</button>
            <div v-if="centerVisibleImageCount > 0" class="mjgd-ai-workspace-toolbar-actions mjgd-ai-workspace-toolbar-actions-right">
              <label v-if="centerMainImageIndices.length > 0" class="mjgd_ai_workspace_select_all_row">
                <input type="checkbox" :checked="centerSelectPreset === 'main'" @change="handleSelectMainImages()" />
                <span>勾选主图</span>
              </label>
              <label class="mjgd_ai_workspace_select_all_row">
                <input type="checkbox" :checked="centerSelectPreset === 'all'" @change="handleSelectAllCenter()" />
                <span>全选图片</span>
              </label>
            </div>
          </div>
        </div>

        <div ref="centerGridWrapRef" class="mjgd-ai-workspace-grid-wrap">
          <!-- 单变体：平铺网格（白底 SKU 区域） -->
          <template v-if="editPageMode === 'single'">
            <div class="mjgd_ai_center_sku_panel">
              <div ref="gridListRef" class="mjgd-ai-workspace-grid">
                <div v-for="(item, index) in showCenterImgList" :key="item.url + '-' + index" class="mjgd-ai-workspace-grid-item">
                  <div class="mjgd-ai-workspace-grid-img-box" @click="toggleSelectImage(index as number)">
                    <CspSafeImg :src="item.transformUrl" class="mjgd-ai-workspace-grid-img" fill />
                    <div v-if="item.status" class="mjgd-ai-workspace-grid-status-overlay">
                      <span v-if="item.status === 'processing'" class="mjgd-ai-workspace-grid-status-spinner"></span>
                      <span v-else class="mjgd-ai-workspace-grid-status-overlay-text">{{ getImageStatusText(item.status) }}</span>
                    </div>
                    <span v-if="index === 0 && activeTab === 'imageSet'" class="mjgd-ai-workspace-grid-main-tag">主图</span>
                    <div class="mjgd-ai-workspace-grid-checkbox-wrap" @click.stop>
                      <label class="mjgd-ai-workspace-grid-checkbox">
                        <input type="checkbox" :checked="selectImgIndexList.includes(index as number)" @change="toggleSelectImage(index as number)" @click.stop />
                        <span class="mjgd-ai-workspace-grid-checkbox-custom"></span>
                      </label>
                    </div>
                    <div v-if="item.transformUrl != item.url" class="mjgd-ai-workspace-grid-compare-wrap">
                      <button type="button" class="mjgd-ai-workspace-grid-action" title="查看对比图" @click.stop="openCompare(item)">查看对比图</button>
                    </div>
                    <div class="mjgd-ai-workspace-grid-bottom-bar" @click.stop>
                      <div v-if="activeTab === 'imageSet' && index as number > 0" class="mjgd-ai-workspace-grid-set-main" @click.stop.prevent="setAsVariantMain(index as number)">设为变体主图</div>
                      <div class="mjgd-ai-workspace-grid-actions">
                        <button v-if="item.transformUrl != item.url" type="button" class="mjgd-ai-workspace-grid-action mjgd-ai-workspace-grid-icon" title="下载"
                          @click.stop="downloadSingle(item.transformUrl)">
                          <svg t="1779973394862" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1712" width="16" height="16">
                            <path
                              d="M853.333333 853.333333a42.666667 42.666667 0 0 1 0 85.333334H170.666667a42.666667 42.666667 0 0 1 0-85.333334h682.666666zM512 85.504a42.666667 42.666667 0 0 1 42.666667 42.666667v515.370666l204.373333-204.373333a42.666667 42.666667 0 0 1 63.914667 56.277333l-3.584 4.010667-277.376 277.546667a42.666667 42.666667 0 0 1-56.32 3.584l-4.010667-3.541334-277.12-276.650666a42.666667 42.666667 0 0 1 56.234667-63.957334l4.010666 3.541334L469.333333 644.096V128.170667a42.666667 42.666667 0 0 1 42.666667-42.666667z"
                              fill="#000000" p-id="1713"></path>
                          </svg>
                        </button>
                        <button v-if="item.transformUrl == item.url" type="button" class="mjgd-ai-workspace-grid-action mjgd-ai-workspace-grid-icon" title="查看大图"
                          @click.stop="openImagePreview(item.transformUrl)">
                          <svg class="mjgd-ai-workspace-grid-icon_svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                            stroke-linejoin="round">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m21 21-4.35-4.35" />
                            <path d="M11 8v6M8 11h6" />
                          </svg>
                        </button>
                        <button type="button" class="mjgd-ai-workspace-grid-action mjgd-ai-workspace-grid-icon" title="删除" @click.stop="removeSingleImage(index as number)">
                          <svg class="mjgd-ai-workspace-grid-icon_svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                            stroke-linejoin="round">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="mjgd-ai-workspace-grid-item mjgd-ai-workspace-grid-add-card" role="button" tabindex="0" @click="openAddImageModal" @keydown.enter.prevent="openAddImageModal">
                  <div class="mjgd-ai-workspace-grid-add-card-inner">
                    <span class="mjgd-ai-workspace-grid-add-card-plus">+</span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 批量变体：按 SKU / 详情分组 -->
          <template v-else>
            <div v-for="section in batchCenterSections" :key="section.sectionKey" class="mjgd_ai_batch_section" :class="{ mjgd_ai_batch_section_sku: section.type === 'sku' }"
              :data-batch-section-key="section.sectionKey">
              <div class="mjgd_ai_batch_section_header">{{ section.label }}</div>
              <div :key="section.type === 'sku' ? `${section.sectionKey}-${batchGridRenderKeys[section.skuIndex!] ?? 0}` : section.sectionKey"
                :ref="section.type === 'sku' ? (el) => setBatchGridRef(section.skuIndex!, el as HTMLElement | null) : undefined" class="mjgd-ai-workspace-grid">
                <div v-for="(entry, index) in section.images" :key="index" class="mjgd-ai-workspace-grid-item">
                  <div class="mjgd-ai-workspace-grid-img-box" @click="toggleSelectImage(flatCenterIndexFromEntry(entry))">
                    <CspSafeImg :src="entry.item.transformUrl" class="mjgd-ai-workspace-grid-img" fill />
                    <div v-if="entry.item.status" class="mjgd-ai-workspace-grid-status-overlay">
                      <span v-if="entry.item.status === 'processing'" class="mjgd-ai-workspace-grid-status-spinner"></span>
                      <span v-else class="mjgd-ai-workspace-grid-status-overlay-text">{{ getImageStatusText(entry.item.status) }}</span>
                    </div>
                    <span v-if="section.type === 'sku' && entry.localIndex === 0" class="mjgd-ai-workspace-grid-main-tag">主图</span>
                    <div class="mjgd-ai-workspace-grid-checkbox-wrap" @click.stop>
                      <label class="mjgd-ai-workspace-grid-checkbox">
                        <input type="checkbox" :checked="selectImgIndexList.includes(flatCenterIndexFromEntry(entry))" @change="toggleSelectImage(flatCenterIndexFromEntry(entry))" @click.stop />
                        <span class="mjgd-ai-workspace-grid-checkbox-custom"></span>
                      </label>
                    </div>
                    <div v-if="entry.item.transformUrl != entry.item.url" class="mjgd-ai-workspace-grid-compare-wrap">
                      <button type="button" class="mjgd-ai-workspace-grid-action" title="查看对比图" @click.stop="openCompare(entry.item)">查看对比图</button>
                    </div>
                    <div class="mjgd-ai-workspace-grid-bottom-bar" @click.stop>
                      <div v-if="section.type === 'sku' && entry.localIndex > 0" class="mjgd-ai-workspace-grid-set-main" @click.stop.prevent="setAsVariantMainInSku(section.skuIndex!, entry.localIndex)">
                        设为变体主图</div>
                      <div class="mjgd-ai-workspace-grid-actions">
                        <button v-if="entry.item.transformUrl != entry.item.url" type="button" class="mjgd-ai-workspace-grid-action mjgd-ai-workspace-grid-icon" title="下载"
                          @click.stop="downloadSingle(entry.item.transformUrl)">
                          <svg t="1779973394862" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1712" width="16" height="16">
                            <path
                              d="M853.333333 853.333333a42.666667 42.666667 0 0 1 0 85.333334H170.666667a42.666667 42.666667 0 0 1 0-85.333334h682.666666zM512 85.504a42.666667 42.666667 0 0 1 42.666667 42.666667v515.370666l204.373333-204.373333a42.666667 42.666667 0 0 1 63.914667 56.277333l-3.584 4.010667-277.376 277.546667a42.666667 42.666667 0 0 1-56.32 3.584l-4.010667-3.541334-277.12-276.650666a42.666667 42.666667 0 0 1 56.234667-63.957334l4.010666 3.541334L469.333333 644.096V128.170667a42.666667 42.666667 0 0 1 42.666667-42.666667z"
                              fill="#000000" p-id="1713"></path>
                          </svg>
                        </button>
                        <button v-if="entry.item.transformUrl == entry.item.url" type="button" class="mjgd-ai-workspace-grid-action mjgd-ai-workspace-grid-icon" title="查看大图"
                          @click.stop="openImagePreview(entry.item.transformUrl)">
                          <svg class="mjgd-ai-workspace-grid-icon_svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                            stroke-linejoin="round">
                            <circle cx="11" cy="11" r="7" />
                            <path d="m21 21-4.35-4.35" />
                            <path d="M11 8v6M8 11h6" />
                          </svg>
                        </button>
                        <button type="button" class="mjgd-ai-workspace-grid-action mjgd-ai-workspace-grid-icon" title="删除" @click.stop="removeSingleImage(flatCenterIndexFromEntry(entry))">
                          <svg class="mjgd-ai-workspace-grid-icon_svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                            stroke-linejoin="round">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- 图片对比弹窗 -->
        <Teleport to="body">
          <div v-if="compareState.visible" class="mjgd-ai-workspace-compare-modal mjgd_plugin_overlay is_nested is_tier_inner" @click.self="closeCompare">
            <div class="mjgd-ai-workspace-compare-modal-box">
              <div class="mjgd-ai-workspace-compare-title">图片对比</div>
              <div class="mjgd-ai-workspace-compare-body">
                <div class="mjgd-ai-workspace-compare-side">
                  <div class="mjgd-ai-workspace-compare-label">产品原图</div>
                  <div class="mjgd-ai-workspace-compare-img-wrap">
                    <CspSafeImg :src="compareState.originalUrl" alt="原图" fill />
                  </div>
                </div>
                <div class="mjgd-ai-workspace-compare-side">
                  <div class="mjgd-ai-workspace-compare-label">生成结果</div>
                  <div class="mjgd-ai-workspace-compare-img-wrap">
                    <CspSafeImg :src="compareState.resultUrl" alt="结果" fill />
                  </div>
                </div>
              </div>
              <div class="mjgd-ai-workspace-compare-footer">
                <button type="button" class="mjgd-ai-workspace-btn" @click="closeCompare">关闭</button>
                <button type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-primary" @click="downloadCompareResult">下载结果</button>
              </div>
            </div>
          </div>
        </Teleport>

        <!-- 大图预览弹窗 -->
        <Teleport to="body">
          <div v-if="imagePreviewUrl" class="mjgd-ai-workspace-preview-modal mjgd_plugin_overlay is_nested is_tier_inner" @click.self="closeImagePreview">
            <div class="mjgd-ai-workspace-preview-modal-box">
              <div class="mjgd_ai_workspace_preview_img_wrap" @click.stop><CspSafeImg :src="imagePreviewUrl || ''" alt="大图预览" class="mjgd-ai-workspace-preview-modal-img" fill /></div>
              <button type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-preview-close" @click="closeImagePreview">关闭</button>
            </div>
          </div>
        </Teleport>

        <!-- 添加图片弹窗 -->
        <Teleport to="body">
          <div v-if="addImageModalVisible" class="mjgd-ai-workspace-compare-modal mjgd_plugin_overlay is_nested is_tier_inner" @click.self="closeAddImageModal">
            <div class="mjgd-ai-workspace-add-image-modal-box">
              <div class="mjgd-ai-workspace-compare-title">添加图片</div>
              <div class="mjgd-ai-workspace-add-image-modal-actions">
                <input ref="addModalFileInputRef" type="file" accept="image/*" multiple class="mjgd-ai-workspace-file-input-hidden" @change="handleAddModalLocalChange" />
                <button type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-outline" @click="triggerAddModalFileInput">本地上传</button>
                <button type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-outline" @click="openAddImageUrlModal">第三方图片链接</button>
              </div>
              <div class="mjgd-ai-workspace-add-image-pending">
                <div v-if="addImagePendingUrls.length === 0" class="mjgd-ai-workspace-add-image-pending-empty">暂无待添加图片</div>
                <div v-else class="mjgd-ai-workspace-add-image-pending-grid">
                  <div v-for="(url, idx) in addImagePendingUrls" :key="url + '-' + idx" class="mjgd-ai-workspace-add-image-pending-item">
                    <img :src="url" alt="" class="mjgd-ai-workspace-add-image-pending-img" @error="removePendingUrl(url)" />
                    <button type="button" class="mjgd-ai-workspace-add-image-pending-remove" title="移除" @click="removePendingUrlByIndex(idx)">×</button>
                  </div>
                </div>
              </div>
              <div class="mjgd-ai-workspace-compare-footer">
                <button type="button" class="mjgd-ai-workspace-btn" @click="closeAddImageModal">取消</button>
                <button type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-primary" :disabled="addImageConfirming" @click="confirmAddImage">{{ addImageConfirming ? "上传中…" : "确定" }}</button>
              </div>
            </div>
          </div>
        </Teleport>

        <!-- 分配方式弹窗 -->
        <Teleport to="body">
          <div v-if="assignModeModalVisible" class="mjgd-ai-workspace-compare-modal mjgd_plugin_overlay is_nested is_tier_inner" @click.self="closeAssignModeModal">
            <div class="mjgd-ai-workspace-assign-modal-box">
              <div class="mjgd-ai-workspace-modal-header">
                <div class="mjgd-ai-workspace-compare-title mjgd-ai-workspace-assign-modal-title">选择分配方式</div>
                <button type="button" class="mjgd-ai-workspace-modal-close" title="关闭" aria-label="关闭" @click="closeAssignModeModal">
                  <svg class="mjgd-ai-workspace-modal-close-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </button>
              </div>
              <div class="mjgd-ai-workspace-assign-mode-list">
                <button type="button" class="mjgd-ai-workspace-assign-mode-card" @click="confirmAssignByMode('append')">
                  <span class="mjgd-ai-workspace-assign-mode-title">追加</span>
                  <span class="mjgd-ai-workspace-assign-mode-text">保留变体现有图片，把当前勾选图片继续追加进去</span>
                </button>
                <button type="button" class="mjgd-ai-workspace-assign-mode-card" @click="confirmAssignByMode('appendNoMain')">
                  <span class="mjgd-ai-workspace-assign-mode-title">追加（除主图）</span>
                  <span class="mjgd-ai-workspace-assign-mode-text">保留变体现有图片，追加勾选图片但跳过主图（当前变体主图与各目标变体主图）</span>
                </button>
                <button type="button" class="mjgd-ai-workspace-assign-mode-card mjgd-ai-workspace-assign-mode-card-danger" @click="confirmAssignByMode('replace')">
                  <span class="mjgd-ai-workspace-assign-mode-title">清空覆盖</span>
                  <span class="mjgd-ai-workspace-assign-mode-text">删除目标变体全部原有图片，写入当前勾选的图片</span>
                </button>
                <button type="button" class="mjgd-ai-workspace-assign-mode-card mjgd-ai-workspace-assign-mode-card-danger" @click="confirmAssignByMode('replaceNoMain')">
                  <span class="mjgd-ai-workspace-assign-mode-title">清空覆盖（保留主图）</span>
                  <span class="mjgd-ai-workspace-assign-mode-text">只保留目标变体主图，其余图片替换为当前勾选的图片</span>
                </button>
              </div>
            </div>
          </div>
        </Teleport>

        <!-- 同步 JSON 富文本弹窗 -->
        <Teleport to="body">
          <div v-if="jsonSyncModalVisible" class="mjgd-ai-workspace-compare-modal mjgd_plugin_overlay is_nested is_tier_inner" @click.self="closeJsonSyncModal">
            <div class="mjgd-ai-workspace-assign-modal-box mjgd-ai-workspace-json-sync-modal-box">
              <div class="mjgd-ai-workspace-modal-header">
                <div class="mjgd-ai-workspace-compare-title mjgd-ai-workspace-assign-modal-title">同步JSON富文本</div>
                <button type="button" class="mjgd-ai-workspace-modal-close" title="关闭" aria-label="关闭" @click="closeJsonSyncModal">
                  <svg class="mjgd-ai-workspace-modal-close-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </div>
              <div class="mjgd-ai-workspace-json-sync-desc">将当前勾选图片同步到目标变体的 `JSON富内容` 字段，生成结果会追加到已有富文本末尾。</div>
              <div class="mjgd-ai-workspace-json-sync-meta">
                <div class="mjgd-ai-workspace-json-sync-meta-item">目标变体：已选中 {{ selectSkuIndexList.length }} 个</div>
                <div class="mjgd-ai-workspace-json-sync-meta-item">已选图片：{{ selectImgIndexList.length }} 张</div>
              </div>
              <div class="mjgd-ai-workspace-json-sync-mode-list">
                <button v-for="option in JSON_SYNC_MODE_OPTIONS" :key="option.value" type="button" class="mjgd-ai-workspace-assign-mode-card mjgd-ai-workspace-json-sync-mode-card"
                  @click="handleJsonSyncModeSelect(option.value)">
                  <span class="mjgd-ai-workspace-assign-mode-title">{{ option.label }}</span>
                  <span class="mjgd-ai-workspace-assign-mode-text">{{ option.description }}</span>
                  <span v-if="option.requiredCount > 0" class="mjgd-ai-workspace-json-sync-mode-hint">需精确选择 {{ option.requiredCount }} 张图片</span>
                  <span v-else class="mjgd-ai-workspace-json-sync-mode-hint">按当前所选图片数量生成</span>
                </button>
              </div>
            </div>
          </div>
        </Teleport>

        <!-- 第三方图片链接弹窗 -->
        <Teleport to="body">
          <div v-if="addImageUrlModalVisible" class="mjgd-ai-workspace-compare-modal mjgd-ai-workspace-url-modal-layer mjgd_plugin_overlay is_nested is_tier_inner" @click.self="closeAddImageUrlModal">
            <div class="mjgd-ai-workspace-add-image-modal-box">
              <div class="mjgd-ai-workspace-compare-title">第三方图片链接</div>
              <textarea ref="addModalUrlTextareaRef" v-model="addImageUrlInput" class="mjgd-ai-workspace-param-input mjgd-ai-workspace-add-image-url-textarea" placeholder="每行一个图片 URL" rows="5" />
              <div class="mjgd-ai-workspace-compare-footer">
                <button type="button" class="mjgd-ai-workspace-btn" @click="closeAddImageUrlModal">取消</button>
                <button type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-primary" @click="confirmAddImageUrlFromModal">添加链接</button>
              </div>
            </div>
          </div>
        </Teleport>
    </div>

      <!-- 右栏 -->
      <div class="mjgd-ai-workspace-right mjgd-ai-workspace-right-with-overlay">
        <div class="mjgd-ai-workspace-right-scroll">
          <!-- 第一块：AI改图 -->
          <div class="mjgd-ai-panel">
            <div class="mjgd-ai-panel-header" @click="panelAiTemplateCollapsed = !panelAiTemplateCollapsed">
              <div class="mjgd_ai_watermark_panel_title_wrap">
                <span class="mjgd-ai-panel-title">AI改图</span>
                <span class="mjgd_ai_watermark_free_tag">免费</span>
              </div>
              <span class="mjgd-ai-panel-collapse">{{ panelAiTemplateCollapsed ? "展开" : "收起" }} ^</span>
            </div>
            <div v-show="!panelAiTemplateCollapsed" class="mjgd-ai-panel-body">
              <div class="mjgd-ai-panel-row">
                <label class="mjgd-ai-panel-label">改图模板
                  <button type="button" class="mjgd-ai-points-refresh-btn" :disabled="refineTemplateLoading" @click="fetchRefineTemplateList(true)" title="刷新模板列表">
                    <i class="el-icon-refresh mjgd-ai-points-refresh-icon" :class="{ 'is-loading': refineTemplateLoading }"></i>
                  </button>
                </label>
                <select class="mjgd-ai-workspace-select mjgd-ai-panel-select" v-model="defaultRefineTemplate">
                  <option v-for="t in refineTemplateList" :key="t.id" :value="String(t.id)">{{ t.templateName }}</option>
                </select>
                <button type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-primary mjgd-ai-panel-action" :disabled="selectImgIndexList.length === 0 || !defaultRefineTemplate"
                  @click="handleImageProcess">图片处理</button>
              </div>
            </div>
          </div>
          <!-- 第二块：图片翻译 -->
          <div class="mjgd-ai-panel">
            <div class="mjgd-ai-panel-header mjgd_ai_img_translate_block" @click="panelTranslateCollapsed = !panelTranslateCollapsed">
              <span class="mjgd-ai-panel-title">图片翻译</span>
              <!-- 选择翻译服务 -->
              <div class="mjgd_ai_translate_select_block" @click.stop="toggleMethodDropdown">
                <div class="mjgd_ai_translate_select_arrow">
                  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </div>
                <div>{{ translateServiceSelect.label }}</div>
                <div v-show="methodDropdown" class="mjgd_ai_translate_select_option_list">
                  <div class="mjgd_ai_translate_select_option" :class="{ 'active': item.type === translateServiceSelect.type }" v-for="item in translateServiceList" :key="item.type"
                    @click="onSelectTranslateService(item)">{{ item.label }}</div>
                  <div class="mjgd_ai_translate_select_option_hint">
                    <svg t="1778234844812" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1271" width="16" height="16">
                      <path
                        d="M514.133333 311.466667c-12.8 0-21.333333 8.533333-21.333333 21.333333v226.133333c0 12.8 8.533333 21.333333 21.333333 21.333334s21.333333-8.533333 21.333334-21.333334V332.8c0-10.666667-10.666667-21.333333-21.333334-21.333333zM524.8 627.2h-21.333333c-12.8 0-21.333333 8.533333-21.333334 21.333333v21.333334c0 12.8 8.533333 21.333333 21.333334 21.333333h21.333333c12.8 0 21.333333-8.533333 21.333333-21.333333v-21.333334c0-10.666667-10.666667-21.333333-21.333333-21.333333z"
                        fill="#cdcdcd" p-id="1272" data-spm-anchor-id="a313x.manage_type_myprojects.0.i3.3f943a81ij5mDc" class="selected"></path>
                      <path
                        d="M514.133333 149.333333c200.533333 0 362.666667 162.133333 362.666667 362.666667s-162.133333 362.666667-362.666667 362.666667-362.666667-162.133333-362.666666-362.666667 162.133333-362.666667 362.666666-362.666667m0-42.666666c-224 0-405.333333 181.333333-405.333333 405.333333s181.333333 405.333333 405.333333 405.333333 405.333333-181.333333 405.333334-405.333333-181.333333-405.333333-405.333334-405.333333z"
                        fill="#cdcdcd" p-id="1273" data-spm-anchor-id="a313x.manage_type_myprojects.0.i2.3f943a81ij5mDc" class="selected"></path>
                    </svg>
                    本次手动翻译生效
                  </div>
                </div>
              </div>
              <span class="mjgd-ai-panel-collapse">{{ panelTranslateCollapsed ? "展开" : "收起" }} ^</span>
            </div>
            <div v-show="!panelTranslateCollapsed" class="mjgd-ai-panel-body">
              <div class="mjgd-ai-panel-row">
                <span class="mjgd-ai-panel-label">翻译语言:</span>
                <div class="mjgd-ai-radio-capsules">
                  <label class="mjgd-ai-radio-capsule" :class="{ active: translateMode === '' }">
                    <input type="radio" v-model="translateMode" value="" />中文->俄文
                  </label>
                  <label class="mjgd-ai-radio-capsule" :class="{ active: translateMode === 'zh2en' }">
                    <input type="radio" v-model="translateMode" value="zh2en" />中文->英文
                  </label>
                  <label class="mjgd-ai-radio-capsule" :class="{ active: translateMode === 'en2ru' }">
                    <input type="radio" v-model="translateMode" value="en2ru" />英文->俄文
                  </label>
                </div>
              </div>
              <!-- 本地模式不展示商业账户额度，翻译服务按本地配置直接使用 -->
              <div class="mjgd-ai-panel-row mjgd_ai_translate_panel_action_row" style="margin-top: 12px;">
                <button type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-primary mjgd-ai-panel-action mjgd_ai_translate_start_btn" :disabled="selectImgIndexList.length === 0"
                  @click="handleStartTranslate">开始翻译</button>
              </div>
            </div>
          </div>
          <!-- 第三块：智能消除水印（功能待接入） -->
          <div class="mjgd-ai-panel">
            <div class="mjgd-ai-panel-header" @click="panelWatermarkCollapsed = !panelWatermarkCollapsed">
              <div class="mjgd_ai_watermark_panel_title_wrap">
                <span class="mjgd-ai-panel-title">智能消除水印</span>
                <span class="mjgd_ai_watermark_free_tag">限免</span>
              </div>
              <span class="mjgd-ai-panel-collapse">{{ panelWatermarkCollapsed ? "展开" : "收起" }} ^</span>
            </div>
            <div v-show="!panelWatermarkCollapsed" class="mjgd-ai-panel-body">
              <div class="mjgd-ai-panel-row mjgd_ai_watermark_panel_body_row">
                <span class="mjgd_ai_watermark_selected_hint">已选择{{ selectImgIndexList.length }}张图片</span>
                <button type="button" class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-primary mjgd-ai-panel-action" :disabled="selectImgIndexList.length === 0"
                  @click="openWatermarkEditor">进入编辑器</button>
              </div>
            </div>
          </div>
          <!-- 第四块：视觉工坊 -->
          <div class="mjgd-ai-panel" style="border-bottom: none;">
            <div class="mjgd-ai-panel-header" @click="panelVisualCollapsed = !panelVisualCollapsed">
              <span class="mjgd-ai-panel-title">视觉工坊</span>
              <span class="mjgd-ai-panel-collapse">{{ panelVisualCollapsed ? "展开" : "收起" }} ^</span>
            </div>
            <div v-show="!panelVisualCollapsed" class="mjgd-ai-panel-body">
              <div class="mjgd-ai-panel-tabs">
                <button type="button" class="mjgd-ai-tab-btn mjgd-ai-tab-btn--image-repaint" :class="{ active: selectedParamCard === 'imageRepaint' }" @click="selectImageRepaintTab">图片重绘<span class="mjgd_ai_watermark_free_tag mjgd-ai-tab-new-tag">New</span></button>
                <button type="button" class="mjgd-ai-tab-btn" :class="{ active: selectedParamCard === 'changeBg' }" @click="selectedParamCard = 'changeBg'">智能换背景</button>
                <button type="button" class="mjgd-ai-tab-btn" :class="{ active: selectedParamCard === 'faceSwap' }" @click="selectedParamCard = 'faceSwap'">模特换脸</button>
                <button type="button" class="mjgd-ai-tab-btn" :class="{ active: selectedParamCard === 'modelGen' }" @click="selectedParamCard = 'modelGen'">产品模特图</button>
              </div>
              <div class="mjgd-ai-workspace-params mjgd-ai-workspace-params-embed">
                <div class="mjgd-ai-workspace-params-body">
                  <div class="mjgd-ai-workspace-param-tabs-and-group">
                    <!-- 智能换背景：单一大文本框 0/600，无 tabs -->
                    <template v-if="selectedParamCard === 'changeBg'">
                      <div class="mjgd-ai-workspace-param-group mjgd-ai-workspace-param-group-change-bg">
                        <div class="mjgd-ai-workspace-param-block">
                          <div class="mjgd-ai-workspace-param-textarea-wrap">
                            <textarea v-model="paramForm.backgroundDesc" class="mjgd-ai-workspace-param-textarea" placeholder="请描述您想要的背景,例如:黑色背景、白色摄影棚背景、户外自然风光、简约风格室内背景等" maxlength="600" rows="6" />
                            <span class="mjgd-ai-workspace-param-count mjgd-ai-workspace-param-count-textarea">{{ (paramForm.backgroundDesc || "").length }}/600</span>
                          </div>
                        </div>
                      </div>
                    </template>
                    <!-- 模特换脸：预设参数 / 自定义提示词，自定义时显示图一样式（单一大文本框 0/1000） -->
                    <template v-else-if="selectedParamCard === 'faceSwap'">
                      <div class="mjgd-ai-workspace-param-tabs-wrap">
                        <div class="mjgd-ai-workspace-param-tabs mjgd-ai-workspace-param-tabs--face-swap">
                          <button type="button" :class="{ active: paramSubTab === 'preset' }" @click="paramSubTab = 'preset'">预设参数</button>
                          <button type="button" :class="{ active: paramSubTab === 'custom' }" @click="paramSubTab = 'custom'">自定义提示词</button>
                        </div>
                      </div>
                      <template v-if="paramSubTab === 'preset'">
                        <div class="mjgd-ai-workspace-param-group">
                          <section class="mjgd-ai-workspace-param-block">
                            <div class="mjgd-ai-workspace-param-block-title">性别+年龄感</div>
                            <div class="mjgd-ai-workspace-param-textarea-wrap">
                              <textarea v-model="paramForm.genderAge" class="mjgd-ai-workspace-param-textarea" placeholder="例如: 女+25-30岁轻熟大气" maxlength="160" rows="2" />
                              <span class="mjgd-ai-workspace-param-count mjgd-ai-workspace-param-count-textarea">{{ (paramForm.genderAge || "").length }}/160</span>
                            </div>
                            <div class="mjgd-ai-workspace-param-tags">
                              <span class="mjgd-ai-workspace-param-tag-label">参考词</span>
                              <span v-for="tag in genderAgeTags" :key="tag" class="mjgd-ai-workspace-param-tag mjgd-ai-workspace-param-tag-ref" @click="paramForm.genderAge = tag">{{ tag }}</span>
                            </div>
                          </section>
                          <section class="mjgd-ai-workspace-param-block">
                            <div class="mjgd-ai-workspace-param-block-title">色调</div>
                            <div class="mjgd-ai-workspace-param-textarea-wrap">
                              <textarea v-model="paramForm.tone" class="mjgd-ai-workspace-param-textarea" placeholder="例如: 冷白中性调" maxlength="160" rows="2" />
                              <span class="mjgd-ai-workspace-param-count mjgd-ai-workspace-param-count-textarea">{{ (paramForm.tone || "").length }}/160</span>
                            </div>
                            <div class="mjgd-ai-workspace-param-tags">
                              <span class="mjgd-ai-workspace-param-tag-label">参考词</span>
                              <span v-for="tag in toneTags" :key="tag" class="mjgd-ai-workspace-param-tag mjgd-ai-workspace-param-tag-ref" @click="paramForm.tone = tag">{{ tag }}</span>
                            </div>
                          </section>
                          <section class="mjgd-ai-workspace-param-block">
                            <div class="mjgd-ai-workspace-param-block-title">妆容</div>
                            <div class="mjgd-ai-workspace-param-textarea-wrap">
                              <textarea v-model="paramForm.makeup" class="mjgd-ai-workspace-param-textarea" placeholder="例如: 裸妆" maxlength="160" rows="2" />
                              <span class="mjgd-ai-workspace-param-count mjgd-ai-workspace-param-count-textarea">{{ (paramForm.makeup || "").length }}/160</span>
                            </div>
                            <div class="mjgd-ai-workspace-param-tags">
                              <span class="mjgd-ai-workspace-param-tag-label">参考词</span>
                              <span v-for="tag in makeupTags" :key="tag" class="mjgd-ai-workspace-param-tag mjgd-ai-workspace-param-tag-ref" @click="paramForm.makeup = tag">{{ tag }}</span>
                            </div>
                          </section>
                          <section class="mjgd-ai-workspace-param-block">
                            <div class="mjgd-ai-workspace-param-block-title">光影</div>
                            <div class="mjgd-ai-workspace-param-textarea-wrap">
                              <textarea v-model="paramForm.lighting" class="mjgd-ai-workspace-param-textarea" placeholder="例如: 贴合原画面正面平光" maxlength="160" rows="2" />
                              <span class="mjgd-ai-workspace-param-count mjgd-ai-workspace-param-count-textarea">{{ (paramForm.lighting || "").length }}/160</span>
                            </div>
                            <div class="mjgd-ai-workspace-param-tags">
                              <span class="mjgd-ai-workspace-param-tag-label">参考词</span>
                              <span v-for="tag in lightingTags" :key="tag" class="mjgd-ai-workspace-param-tag mjgd-ai-workspace-param-tag-ref" @click="paramForm.lighting = tag">{{ tag }}</span>
                            </div>
                          </section>
                        </div>
                      </template>
                      <template v-else>
                        <div class="mjgd-ai-workspace-param-group">
                          <section class="mjgd-ai-workspace-param-block">
                            <div class="mjgd-ai-workspace-param-block-title">
                              自定义提示词<span class="mjgd-ai-workspace-param-help" title="请输入完整的提示词">?</span>
                            </div>
                            <div class="mjgd-ai-workspace-param-textarea-wrap">
                              <textarea v-model="paramForm.faceSwapCustomPrompt" class="mjgd-ai-workspace-param-textarea" placeholder="请输入完整的提示词,例如: 女+25-30岁轻熟大气, 冷白中性调, 裸妆, 贴合原画面正面平光"
                                maxlength="1000" rows="6" />
                              <span class="mjgd-ai-workspace-param-count mjgd-ai-workspace-param-count-textarea">{{ (paramForm.faceSwapCustomPrompt || "").length }}/1000</span>
                            </div>
                          </section>
                        </div>
                      </template>
                    </template>
                    <!-- 产品模特图：预设参数 / 自定义提示词，自定义时显示图二样式（单一大文本框 0/1000） -->
                    <template v-else-if="selectedParamCard === 'modelGen'">
                      <div class="mjgd-ai-workspace-param-tabs-wrap">
                        <div class="mjgd-ai-workspace-param-tabs mjgd-ai-workspace-param-tabs--model-gen">
                          <button type="button" :class="{ active: paramSubTab === 'preset' }" @click="paramSubTab = 'preset'">预设参数</button>
                          <button type="button" :class="{ active: paramSubTab === 'custom' }" @click="paramSubTab = 'custom'">自定义提示词</button>
                        </div>
                      </div>
                      <template v-if="paramSubTab === 'preset'">
                        <div class="mjgd-ai-workspace-param-group">
                          <section class="mjgd-ai-workspace-param-block">
                            <div class="mjgd-ai-workspace-param-block-title">性别+年龄感</div>
                            <div class="mjgd-ai-workspace-param-textarea-wrap">
                              <textarea v-model="paramForm.genderAge" class="mjgd-ai-workspace-param-textarea" placeholder="例如: 女+25-30岁轻熟大气" maxlength="160" rows="2" />
                              <span class="mjgd-ai-workspace-param-count mjgd-ai-workspace-param-count-textarea">{{ (paramForm.genderAge || "").length }}/160</span>
                            </div>
                            <div class="mjgd-ai-workspace-param-tags">
                              <span class="mjgd-ai-workspace-param-tag-label">参考词</span>
                              <span v-for="tag in genderAgeTags" :key="tag" class="mjgd-ai-workspace-param-tag mjgd-ai-workspace-param-tag-ref"
                                :class="{'is-selected': paramForm.genderAge === tag}" @click="paramForm.genderAge = tag">{{ tag }}</span>
                            </div>
                          </section>
                          <section class="mjgd-ai-workspace-param-block">
                            <div class="mjgd-ai-workspace-param-block-title">产品信息</div>
                            <div class="mjgd-ai-workspace-param-textarea-wrap">
                              <textarea v-model="paramForm.productInfo" class="mjgd-ai-workspace-param-textarea" placeholder="例如: 纯棉连帽卫衣 + 服饰 + 黑色宽松款 + 纯棉磨毛 + 加绒保暖" maxlength="260" rows="3" />
                              <span class="mjgd-ai-workspace-param-count mjgd-ai-workspace-param-count-textarea">{{ (paramForm.productInfo || "").length }}/260</span>
                            </div>
                            <div class="mjgd-ai-workspace-param-tags">
                              <span class="mjgd-ai-workspace-param-tag-label">参考词</span>
                              <span v-for="tag in productInfoTags" :key="tag" class="mjgd-ai-workspace-param-tag mjgd-ai-workspace-param-tag-ref"
                                :class="{'is-selected': paramForm.productInfo === tag}" @click="paramForm.productInfo = tag">{{ tag }}</span>
                            </div>
                          </section>
                          <section class="mjgd-ai-workspace-param-block">
                            <div class="mjgd-ai-workspace-param-block-title">展示场景</div>
                            <div class="mjgd-ai-workspace-param-textarea-wrap">
                              <textarea v-model="paramForm.displayScene" class="mjgd-ai-workspace-param-textarea" placeholder="例如: Ozon 规范纯白色纯色背景 (主图必选)" maxlength="200" rows="2" />
                              <span class="mjgd-ai-workspace-param-count mjgd-ai-workspace-param-count-textarea">{{ (paramForm.displayScene || "").length }}/200</span>
                            </div>
                            <div class="mjgd-ai-workspace-param-tags">
                              <span class="mjgd-ai-workspace-param-tag-label">参考词</span>
                              <span v-for="tag in displaySceneTags" :key="tag" class="mjgd-ai-workspace-param-tag mjgd-ai-workspace-param-tag-ref"
                                :class="{'is-selected': paramForm.displayScene === tag }" @click="paramForm.displayScene = tag">{{ tag }}</span>
                            </div>
                          </section>
                          <section class="mjgd-ai-workspace-param-block">
                            <div class="mjgd-ai-workspace-param-block-title">风格</div>
                            <div class="mjgd-ai-workspace-param-textarea-wrap">
                              <textarea v-model="paramForm.style" class="mjgd-ai-workspace-param-textarea" placeholder="例如: 冷白中性调 (主图首选)" maxlength="160" rows="2" />
                              <span class="mjgd-ai-workspace-param-count mjgd-ai-workspace-param-count-textarea">{{ (paramForm.style || "").length }}/160</span>
                            </div>
                            <div class="mjgd-ai-workspace-param-tags">
                              <span class="mjgd-ai-workspace-param-tag-label">参考词</span>
                              <span v-for="tag in styleTags" :key="tag" class="mjgd-ai-workspace-param-tag mjgd-ai-workspace-param-tag-ref" :class="{ 'is-selected': paramForm.style === tag }"
                                @click="paramForm.style = tag">{{ tag }}</span>
                            </div>
                          </section>
                        </div>
                      </template>
                      <template v-else>
                        <div class="mjgd-ai-workspace-param-group">
                          <section class="mjgd-ai-workspace-param-block">
                            <div class="mjgd-ai-workspace-param-block-title">
                              自定义提示词<span class="mjgd-ai-workspace-param-help" title="请输入完整的提示词">?</span>
                            </div>
                            <div class="mjgd-ai-workspace-param-textarea-wrap">
                              <textarea v-model="paramForm.modelGenCustomPrompt" class="mjgd-ai-workspace-param-textarea"
                                placeholder="请输入完整的提示词,例如: 女+ 25-30 岁轻熟大气,纯棉连帽卫衣+ 服饰 + 黑色宽松款+ 纯棉磨毛 + 加绒保暖,Ozon 规范纯白色纯色背景(主图必选),冷白中性调(主图首选)" maxlength="1000" rows="6" />
                              <span class="mjgd-ai-workspace-param-count mjgd-ai-workspace-param-count-textarea">{{ (paramForm.modelGenCustomPrompt || "").length }}/1000</span>
                            </div>
                          </section>
                        </div>
                      </template>
                    </template>
                    <!-- 图片重绘 -->
                    <template v-else-if="selectedParamCard === 'imageRepaint'">
                      <div class="mjgd-ai-workspace-param-group mjgd-ai-workspace-param-group-image-repaint">
                        <section class="mjgd-ai-workspace-param-block">
                          <div class="mjgd-ai-workspace-param-block-title">
                            图片种类
                            <span
                              class="mjgd-ai-workspace-param-help"
                              @mouseenter="showParamHelpTip($event, '主图：仅重绘选中图片；详情图：结合人像模特生成详情图。')"
                              @mouseleave="hideParamHelpTip"
                            >?</span>
                          </div>
                          <select v-model="imageRepaintForm.imageType" class="mjgd-ai-workspace-select mjgd-ai-image-repaint-select">
                            <option value="main">主图</option>
                            <option value="detail">详情图</option>
                          </select>
                        </section>
                        <section class="mjgd-ai-workspace-param-block">
                          <div class="mjgd-ai-workspace-param-block-title">
                            生成模型
                            <span
                              class="mjgd-ai-workspace-param-help"
                              @mouseenter="showParamHelpTip($event, '不同模型的清晰度、速度和费用不同。')"
                              @mouseleave="hideParamHelpTip"
                            >?</span>
                          </div>
                          <div v-if="imageRepaintModelTip" class="upgrade-tip">{{ imageRepaintModelTip }}</div>
                          <select
                            v-model="imageRepaintForm.model"
                            class="mjgd-ai-workspace-select mjgd-ai-image-repaint-select"
                            :disabled="imageRepaintModelsLoading"
                          >
                            <option v-if="imageRepaintModelsLoading && imageRepaintModelOptions.length === 0" value="" disabled>加载中...</option>
                            <option v-for="m in imageRepaintModelOptions" :key="m.model" :value="m.model" :disabled="m.disabled">{{ m.label }}</option>
                          </select>
                        </section>
                        <section class="mjgd-ai-workspace-param-block">
                          <div class="mjgd-ai-workspace-param-block-title">图片比例</div>
                          <select v-model="imageRepaintForm.ratio" class="mjgd-ai-workspace-select mjgd-ai-image-repaint-select">
                            <option v-for="r in imageRepaintRatioOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
                          </select>
                        </section>
                        <section class="mjgd-ai-workspace-param-block">
                          <div class="mjgd-ai-workspace-param-block-title">
                            补充要求
                            <span
                              class="mjgd-ai-workspace-param-help"
                              @mouseenter="showParamHelpTip($event, '描述你想要的图片效果，所有选中图片将使用同一份要求进行重绘。')"
                              @mouseleave="hideParamHelpTip"
                            >?</span>
                            <button type="button" class="btn-fill-prompt" @click.prevent="toggleImageRepaintPromptInput">填写</button>
                          </div>
                          <div v-if="imageRepaintForm.showPromptInput" class="mjgd-ai-workspace-param-textarea-wrap">
                            <textarea
                              v-model="imageRepaintForm.prompt"
                              class="mjgd-ai-workspace-param-textarea"
                              placeholder="描述你想要的图片效果，例如：变成油画风格、添加暖色调滤镜、背景替换为蓝天白云..."
                              maxlength="1000"
                              rows="6"
                            />
                            <span class="mjgd-ai-workspace-param-count mjgd-ai-workspace-param-count-textarea">{{ (imageRepaintForm.prompt || "").length }}/1000</span>
                          </div>
                        </section>
                        <!-- 详情图：人像模特配置 -->
                        <template v-if="imageRepaintForm.imageType === 'detail'"></template>
                      </div>
                    </template>
                  </div>
                </div>
              </div>
              <div class="mjgd-ai-panel-row mjgd_ai_translate_panel_action_row mjgd-ai-panel-row-action">
                <button
                  v-if="selectedParamCard !== 'imageRepaint'"
                  type="button"
                  class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-primary mjgd-ai-panel-action mjgd_ai_translate_start_btn"
                  :disabled="!canApplyParams || selectImgIndexList.length === 0"
                  @click="handleStartProcess"
                >开始处理</button>
                <button
                  v-else
                  type="button"
                  class="mjgd-ai-workspace-btn mjgd-ai-workspace-btn-primary mjgd-ai-panel-action mjgd_ai_translate_start_btn"
                  :disabled="isExecutingRightPanel || selectImgIndexList.length === 0"
                  @click.prevent="handleStartImageRepaint"
                >开始重绘</button>
              </div>
            </div>
          </div>
        </div>
        <!-- 智能日志遮罩：执行时覆盖右侧面板 -->
        <div v-if="isExecutingRightPanel" class="mjgd-ai-workspace-log-overlay">
          <div class="mjgd-ai-workspace-log mjgd-ai-data-right mjgd-ai-log-overlay-inner">
            <div class="mjgd-ai-logs-container">
              <div ref="advancedAiLogViewportRef" class="mjgd_ai_image_queue_log_viewport" role="log" aria-live="polite"></div>
            </div>
          </div>
          <button v-if="isVisualWorkshopRunning" type="button" class="mjgd_ai_workshop_log_cancel_btn mjgd-ai-workspace-btn mjgd-ai-workspace-btn-outline" @click="handleCancelVisualWorkshop">取消</button>
        </div>
      </div>
    </div>
    <!-- 智能去水印编辑器弹层：覆盖整个队列容器 -->
    <div v-if="watermarkEditorVisible" class="mjgd_ai_watermark_editor_overlay">
      <RemoveWatermark ref="removeWatermarkRef" embedded @cancel="handleCancelWatermarkEditor" @save="handleSaveWatermarkEditor" />
    </div>
    <!-- 参数说明气泡：Teleport 到 body + fixed 定位，仿 el-tooltip，避免被参数面板 overflow 裁切 -->
    <Teleport to="body">
      <div
        v-if="paramHelpTip.visible"
        class="mjgd-ai-param-help-pop"
        role="tooltip"
        :style="{ left: paramHelpTip.left + 'px', top: paramHelpTip.top + 'px' }"
      >{{ paramHelpTip.text }}</div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  inject,
  ref,
  watch,
  nextTick,
  onMounted,
  onUnmounted,
  onActivated,
  type Ref,
} from "vue";
import Sortable from "sortablejs";
import { showToast } from "../../utils/toast";
import { showConfirm } from "../../utils/messageBox";
// @ts-ignore local JS utility has no declaration file
import dataConverter from "./richTextEditor/utils/dataConverter.js";
import {
  apiService,
  createSseConnection,
  type BatchImageTranslateLanguage,
  type ImageRepaintModelOption,
} from "../../utils/api";
import {
  processImageWithOptions,
  fileToDataUrl,
  type ProcessImageOptions,
} from "../../utils/imageProcessor";
import { hasExtensionMessaging, readStorageValue } from "../../utils/runtime";
import { proxyFetchBlob } from "../../utils/proxyFetch";
import {
  ensureHttpImageUrlOnOss,
  isBlobImageUrl,
} from "../../utils/imageOssUpload";
import { applyTransformUrl, revertTransformUrlOneStep, type ImageTransformItem } from "../../utils/imageTransform";
import {
  applyImageEditDraftMerge,
  buildProductKey,
  hasImageEditDraftEntries,
  loadImageEditDraft,
  mergeImageEditDraftModifications,
} from "../utils/imageEditDraftStorage";
import RemoveWatermark from "./removeWatermark.vue";
import CspSafeImg from "./common/CspSafeImg.vue";
import { useAiLogStream } from "../composables/useAiLogStream";
import { calcIncrement, extractNodeChunksFromSsePayload } from "../utils/ozonAiFillAndSubmit";

interface RemoveWatermarkEditorInstance {
  loadImagesFromUrls(urls: string[]): Promise<void>;
  getWritebackPayload(): Promise<Array<{ sourceUrl: string; blob: Blob }>>;
  resetEditor(): Promise<void>;
}

/** 参数说明气泡（视觉工坊·图片重绘）：仿 el-tooltip，Teleport 到 body 用 fixed 定位，规避参数面板 overflow 裁切与原生 title 的延迟 */
const paramHelpTip = ref<{ visible: boolean; text: string; left: number; top: number }>({
  visible: false,
  text: "",
  left: 0,
  top: 0,
});
function showParamHelpTip(event: MouseEvent, text: string) {
  const el = event.currentTarget as HTMLElement | null;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  paramHelpTip.value = {
    visible: true,
    text,
    left: rect.left + rect.width / 2,
    top: rect.top,
  };
}
function hideParamHelpTip() {
  paramHelpTip.value.visible = false;
}

export type ImageStatus = "waiting" | "processing" | "completed" | "failed";

export interface ImageItem {
  url: string;
  status: ImageStatus;
  taskId?: string;
  selected?: boolean;
  translatedUrl?: string;
  sources?: string[];
}

const imageQueue = inject<{
  featureAttrs: { value: any[] };
  selectedImagesForTranslate: { value: string[] };
  pipelineRunning: { value: boolean };
  imageTranslateInProgress: { value: boolean };
  translateImagesOnly: (fromImageQueue: boolean, translateService: string) => Promise<{ failedCount: number; totalCount: number }>;
  translateVariantIndex?: { value: number | null };
  batchTranslateLanguage?: { value: BatchImageTranslateLanguage };
  transformedData: { value: any };
  navigateToWorkbench: () => void;
  skuListIndex: { value: number };
  translateImagesLogInfo: Ref<string>; // 图片翻译日志
  onTranslateItemDone?: (url: string, success: boolean) => void;
  getCollectOfferId: () => { collectPlatform: string; offerId: string };
}>("imageQueue")!;

// 监听图片翻译日志（遮罩未打开时忽略，避免写入已销毁的视口）
watch(() => imageQueue.translateImagesLogInfo.value, (newVal) => {
  if (!newVal || !isExecutingRightPanel.value) return;
  addAdvancedAiLog("info", newVal);
})

const transformedData = computed(() => imageQueue.transformedData.value);

// 改图本地草稿：按平台+商品ID 持久化 transformUrl / transformHistory，供浏览器意外关闭后恢复
const imageEditProductKey = computed(() => {
  const { collectPlatform, offerId } = imageQueue.getCollectOfferId();
  if (!offerId) return "";
  return buildProductKey(collectPlatform, offerId);
});
const showRestoreImageEditBtn = ref(false);
let restoreImageEditBtnInitKey = "";
function initRestoreImageEditBtnVisibility() {
  const productKey = imageEditProductKey.value;
  if (!productKey || !transformedData.value) return;
  if (restoreImageEditBtnInitKey === productKey) return;
  restoreImageEditBtnInitKey = productKey;
  showRestoreImageEditBtn.value = hasImageEditDraftEntries(productKey);
}
watch([imageEditProductKey, () => transformedData.value], initRestoreImageEditBtnVisibility);
const imageEditDraftPersistSignature = computed(() => {
  const data = transformedData.value;
  if (!data) return "";
  const skuPart = (data.sku_matrix || []).map((sku: any) => (sku.skuImgList || []).map((item: any) => `${item.url}|${item.transformUrl}|${(item.transformHistory || []).join(",")}`).join(";")).join("||");
  const detailPart = (data.detailImgList || []).map((item: any) => `${item.url}|${item.transformUrl}|${(item.transformHistory || []).join(",")}`).join(";");
  return `${skuPart}##${detailPart}`;
});
let imageEditDraftPersistTimer: ReturnType<typeof setTimeout> | null = null;
const IMAGE_EDIT_DRAFT_PERSIST_DEBOUNCE_MS = 400;
// 还原触发的签名变化不落盘，避免覆盖本地完整改图草稿
let suppressImageEditDraftPersist = false;
let suppressImageEditDraftPersistTimer: ReturnType<typeof setTimeout> | null = null;
const IMAGE_EDIT_DRAFT_SUPPRESS_PERSIST_MS = 500;
function clearSuppressImageEditDraftPersistTimer() {
  if (suppressImageEditDraftPersistTimer) {
    clearTimeout(suppressImageEditDraftPersistTimer);
    suppressImageEditDraftPersistTimer = null;
  }
}
function beginSuppressImageEditDraftPersist() {
  suppressImageEditDraftPersist = true;
  clearSuppressImageEditDraftPersistTimer();
  flushImageEditDraftPersistTimer();
}
function endSuppressImageEditDraftPersistAfterDelay() {
  clearSuppressImageEditDraftPersistTimer();
  suppressImageEditDraftPersistTimer = setTimeout(() => {
    suppressImageEditDraftPersistTimer = null;
    suppressImageEditDraftPersist = false;
  }, IMAGE_EDIT_DRAFT_SUPPRESS_PERSIST_MS);
}
function flushImageEditDraftPersistTimer() {
  if (imageEditDraftPersistTimer) {
    clearTimeout(imageEditDraftPersistTimer);
    imageEditDraftPersistTimer = null;
  }
}
function persistImageEditDraftNow() {
  const productKey = imageEditProductKey.value;
  if (!productKey) return;
  const { collectPlatform, offerId } = imageQueue.getCollectOfferId();
  // 仅合并改图操作；还原不写回、不删除本地已有记录
  mergeImageEditDraftModifications(transformedData.value, { collectPlatform, offerId }, productKey);
}
function schedulePersistImageEditDraft() {
  if (!imageEditProductKey.value) return;
  flushImageEditDraftPersistTimer();
  imageEditDraftPersistTimer = setTimeout(() => {
    imageEditDraftPersistTimer = null;
    persistImageEditDraftNow();
  }, IMAGE_EDIT_DRAFT_PERSIST_DEBOUNCE_MS);
}
function handleImageEditDraftBeforeUnload() {
  flushImageEditDraftPersistTimer();
  persistImageEditDraftNow();
}
function handleRestoreLastImageEdit() {
  const productKey = imageEditProductKey.value;
  if (!productKey || !transformedData.value) return;
  const draft = loadImageEditDraft(productKey);
  if (!draft) {
    showToast("没有可恢复的改图数据", 2000);
    return;
  }
  const { mergedCount, skippedCount } = applyImageEditDraftMerge(transformedData.value, draft);
  if (mergedCount > 0) {
    const skipTip = skippedCount > 0 ? `，${skippedCount} 张因当前已有改动已跳过` : "";
    showToast(`已恢复 ${mergedCount} 张图片改图${skipTip}`, 3000);
    return;
  }
  showToast("没有可合并的改图", 2000);
}
watch(imageEditDraftPersistSignature, (_signature, prevSignature) => {
  // 跳过首次赋值（页面刚加载原图数据），仅在用户改图引起签名变化时落盘
  if (!prevSignature) return;
  // 还原操作引起的签名变化不写回草稿
  if (suppressImageEditDraftPersist) return;
  schedulePersistImageEditDraft();
});

// 各变体 JSON 富文本原始值快照，供 skuMatrix 建立响应式依赖（工作台 RichTextEditor 保存后需能刷新标识）
const skuVariantJsonRichTextSnapshot = computed(() => {
  const list = transformedData.value?.sku_matrix || [];
  const attr = jsonRichTextFeatureAttr.value;
  if (!attr?.id) return "";
  const attrId = String(attr.id);
  return list
    .map((_: any, idx: number) => getVariantJsonRichTextValue(idx, attrId))
    .join("\u0001");
});

// --- 左栏数据与状态 ---
const skuMatrix = computed(() => {
  // 显式依赖快照，避免仅依赖 transformedData 引用时漏掉深层 __mjgd_variant_feature_values 变更
  skuVariantJsonRichTextSnapshot.value;
  const list = transformedData.value?.sku_matrix || [];
  const attr = jsonRichTextFeatureAttr.value;
  if (!attr?.id) return list;
  const attrId = String(attr.id);
  return list.map((item: any, idx: number) => {
    const existingRawValue = getVariantJsonRichTextValue(idx, attrId);
    const existingWidgets = parseRichTextWidgets(existingRawValue) || [];
    return {
      ...item,
      hasWidget: existingWidgets.length > 0,
    };
  });
});
const selectSkuIndexList = ref<number[]>([]) // 当前勾选的sku索引列表
/** 用于检测离开页面前后 sku_matrix 数量变化（KeepAlive 下工作台增删变体） */
const skuMatrixLengthSnapshot = ref(0);
const skuListIndex = computed(() => imageQueue.skuListIndex.value); // 当前选中的sku索引
const variantListRef = ref<HTMLElement | null>(null);
/** 中栏图片区滚动容器（批量模式下定位到 SKU 分组） */
const centerGridWrapRef = ref<HTMLElement | null>(null);

// --- 单变体 / 批量变体改图模式 ---
type ImageQueueEditMode = "single" | "batch";
const editPageMode = ref<ImageQueueEditMode>("single");
/** 批量模式下是否在中栏展示详情图片（排在所有 SKU 分组之后） */
const batchIncludeDetailImages = ref(false);
/** 批量模式：按 SKU 递增版本号，拖拽结束后强制 remount 该分组 grid，与 skuImgList 顺序对齐 */
const batchGridRenderKeys = ref<Record<number, number>>({});

/** 中栏展示用图片项（含处理状态，与 skuImgList 运行时结构一致） */
type CenterDisplayImage = ImageTransformItem & { status?: ImageStatus };

type CenterImageEntry = {
  item: CenterDisplayImage;
  source: "sku" | "detail";
  skuIndex?: number;
  localIndex: number;
};

type BatchCenterSection = {
  sectionKey: string;
  type: "sku" | "detail";
  skuIndex?: number;
  label: string;
  images: CenterImageEntry[];
};

function getSkuSectionLabel(skuIndex: number): string {
  const sku = skuMatrix.value[skuIndex];
  if (!sku) return `变体 ${skuIndex + 1}`;
  return sku.specs
    ? `SKU名称：${formatSkuSpecs(sku.specs)}`
    : `变体 ${skuIndex + 1}`;
}

/**
 * 工作台增删变体后 sku 索引会重排；从 KeepAlive 恢复时同步勾选与中栏（批量模式默认全选当前矩阵）
 */
function syncImageQueueAfterSkuMatrixChange() {
  const len = skuMatrix.value.length;
  const lengthChanged = len !== skuMatrixLengthSnapshot.value;
  const hasInvalidSkuIndex = selectSkuIndexList.value.some(
    (i) => i < 0 || i >= len
  );

  if (len === 0) {
    imageQueue.skuListIndex.value = 0;
  } else if (skuListIndex.value >= len) {
    imageQueue.skuListIndex.value = len - 1;
  }

  if (editPageMode.value === "batch") {
    if (lengthChanged || hasInvalidSkuIndex) {
      selectSkuIndexList.value =
        len > 0 ? [...Array(len).keys()] : [];
      clearCenterImageSelection();
      nextTick(() => initBatchSortables());
    }
  } else {
    selectSkuIndexList.value = selectSkuIndexList.value.filter(
      (i) => i >= 0 && i < len
    );
  }

  skuMatrixLengthSnapshot.value = len;
}

/**
 * 左栏变体列表滚动到当前选中的 skuListIndex（从工作台点主图进入时定位）
 */
function scrollVariantListToSelected() {
  nextTick(() => {
    const container = variantListRef.value;
    if (!container) return;
    const index = skuListIndex.value;
    const target = container.querySelector(`[data-variant-index="${index}"]`) as HTMLElement | null;
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    // 批量模式滚动到中栏对应分组
    if (editPageMode.value === "batch") {
      scrollBatchCenterToSku(index);
    }
  });
}

const maxImgCount = 29; //单个sku最大图片数量
const activeTab = ref<"imageSet" | "other">("imageSet");

/** 中栏可见图片条目（含数据源定位，批量/单变体统一索引） */
const centerImageEntries = computed<CenterImageEntry[]>(() => {
  if (editPageMode.value === "batch") {
    const entries: CenterImageEntry[] = [];
    const sortedSkuIndices = [...selectSkuIndexList.value].sort((a, b) => a - b);
    for (const skuIndex of sortedSkuIndices) {
      const imgs = skuMatrix.value[skuIndex]?.skuImgList || [];
      imgs.forEach((item: CenterDisplayImage, localIndex: number) => {
        entries.push({ item, source: "sku", skuIndex, localIndex });
      });
    }
    if (batchIncludeDetailImages.value) {
      const detailList = transformedData.value?.detailImgList || [];
      detailList.forEach((item: CenterDisplayImage, localIndex: number) => {
        entries.push({ item, source: "detail", localIndex });
      });
    }
    return entries;
  }
  if (activeTab.value === "imageSet") {
    const list = skuMatrix.value?.[skuListIndex.value]?.skuImgList || [];
    return list.map((item: CenterDisplayImage, localIndex: number) => ({
      item,
      source: "sku" as const,
      skuIndex: skuListIndex.value,
      localIndex,
    }));
  }
  const detailList = transformedData.value?.detailImgList || [];
  return detailList.map((item: CenterDisplayImage, localIndex: number) => ({
    item,
    source: "detail" as const,
    localIndex,
  }));
});

/** 批量模式：按 SKU / 详情切分的中栏分组 */
const batchCenterSections = computed<BatchCenterSection[]>(() => {
  if (editPageMode.value !== "batch") return [];
  const sections: BatchCenterSection[] = [];
  const sortedSkuIndices = [...selectSkuIndexList.value].sort((a, b) => a - b);
  for (const skuIndex of sortedSkuIndices) {
    const imgs = skuMatrix.value[skuIndex]?.skuImgList || [];
    const images: CenterImageEntry[] = imgs.map(
      (item: CenterDisplayImage, localIndex: number) => ({
        item,
        source: "sku",
        skuIndex,
        localIndex,
      })
    );
    sections.push({
      sectionKey: `sku-${skuIndex}`,
      type: "sku",
      skuIndex,
      label: getSkuSectionLabel(skuIndex),
      images,
    });
  }
  if (batchIncludeDetailImages.value) {
    const detailList = transformedData.value?.detailImgList || [];
    const images: CenterImageEntry[] = detailList.map(
      (item: CenterDisplayImage, localIndex: number) => ({
        item,
        source: "detail",
        localIndex,
      })
    );
    sections.push({
      sectionKey: "detail",
      type: "detail",
      label: "详情图片",
      images,
    });
  }
  return sections;
});

/** 批量 Sortable 仅在分组结构变化时全量重建，避免排序 splice 触发 deep watch */
const batchSortableSectionKeys = computed(() =>
  batchCenterSections.value
    .filter((s) => s.type === "sku")
    .map((s) => s.sectionKey)
    .join("|")
);

const centerVisibleImageCount = computed(() => centerImageEntries.value.length);

/** 中栏可见主图扁平索引（各 SKU 第一张图） */
const centerMainImageIndices = computed(() =>
  centerImageEntries.value.reduce<number[]>((indices, entry, index) => {
    if (entry.source === "sku" && entry.localIndex === 0) {
      indices.push(index);
    }
    return indices;
  }, [])
);

/** 单变体模板仍使用底层数组引用，便于 push/splice/Sortable */
const showCenterImgList = computed(() => {
  if (editPageMode.value === "batch") {
    return centerImageEntries.value.map((e) => e.item);
  }
  if (activeTab.value === "imageSet") {
    return skuMatrix.value?.[skuListIndex.value]?.skuImgList || [];
  }
  return transformedData.value?.detailImgList || [];
});

function flatCenterIndexFromEntry(entry: CenterImageEntry): number {
  return centerImageEntries.value.findIndex(
    (e) =>
      e.source === entry.source &&
      e.skuIndex === entry.skuIndex &&
      e.localIndex === entry.localIndex
  );
}

function switchEditMode(mode: ImageQueueEditMode) {
  if (editPageMode.value === mode) return;
  clearCenterImageSelection();
  editPageMode.value = mode;
  if (mode === "batch") {
    selectSkuIndexList.value = [...Array(skuMatrix.value.length).keys()];
    skuMatrixLengthSnapshot.value = skuMatrix.value.length;
    batchIncludeDetailImages.value = false;
    activeTab.value = "imageSet";
    batchGridRenderKeys.value = {};
  } else {
    selectSkuIndexList.value = [];
    batchIncludeDetailImages.value = false;
    batchGridRenderKeys.value = {};
  }
  destroyAllSortables();
  // 等 v-if 切换完成后再初始化，避免在已卸载节点上挂载 Sortable
  nextTick(() => {
    nextTick(() => {
      if (editPageMode.value === "batch") {
        initBatchSortables();
      } else if (editPageMode.value === "single") {
        initSingleSortable();
      }
    });
  });
}

/** 左栏当前聚焦变体（单变体/批量模式均用 skuListIndex，与勾选列表独立） */
function isVariantCardSelected(index: number): boolean {
  // 查看详情图片时不展示 SKU 蓝色选中边框
  if (activeTab.value === "other") return false;
  return skuListIndex.value === index;
}

function handleBatchDetailCheckboxChange() {
  batchIncludeDetailImages.value = !batchIncludeDetailImages.value;
  clearCenterImageSelection();
}

watch(
  () => [selectSkuIndexList.value, batchIncludeDetailImages.value],
  () => {
    if (editPageMode.value === "batch") {
      clearCenterImageSelection();
    }
  },
  { deep: true }
);

function formatSkuSpecs(specs: Record<string, unknown>): string {
  if (!specs || typeof specs !== "object") return "";
  return (
    Object.entries(specs)
      .map(([k, v]) => `${k} ${v}`)
      .join(" ") || ""
  );
}

/**
 * 批量模式：左栏点击 SKU 卡片时，仅当该 SKU 已勾选才滚动中栏到对应分组
 * （勾选仅通过左侧 checkbox 操作）
 */
function scrollBatchCenterToSku(skuIndex: number) {
  if (!selectSkuIndexList.value.includes(skuIndex)) return;
  // 与单变体一致：点击已勾选 SKU 时更新当前聚焦索引，驱动左栏 selected 样式
  imageQueue.skuListIndex.value = skuIndex;
  nextTick(() => {
    const container = centerGridWrapRef.value;
    if (!container) return;
    const target = container.querySelector(
      `[data-batch-section-key="sku-${skuIndex}"]`
    ) as HTMLElement | null;
    if (!target) return;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

// 左侧栏点击变体：单变体切换当前 SKU；批量模式滚动到中栏对应分组
function handleVariantClick(index: number) {
  if (editPageMode.value === "batch") {
    scrollBatchCenterToSku(index);
    return;
  }
  clearCenterImageSelection();
  activeTab.value = "imageSet";
  imageQueue.skuListIndex.value = index;
}
// 左侧栏单选按钮
function handleVariantCheckboxChange(index: number) {
  const arr = selectSkuIndexList.value;
  if (arr.includes(index)) {
    selectSkuIndexList.value = arr.filter((i) => i !== index);
  } else {
    selectSkuIndexList.value = [...arr, index];
  }
}
// 左侧栏全选按钮
function handleSelectAllVariants() {
  if (selectSkuIndexList.value.length === skuMatrix.value.length) {
    selectSkuIndexList.value = [];
  } else {
    selectSkuIndexList.value = [...Array(skuMatrix.value.length).keys()];
  }
}
// 切换详情图片
function openOtherImagesTab() {
  clearCenterImageSelection(); //清空选中索引
  activeTab.value = "other";
}

// --- 中栏当前列表 ---
const assignModeModalVisible = ref(false);
type JsonSyncMode =
  | "raImage"
  | "raImageText"
  | "raLeftRightImage"
  | "raDoubleImage"
  | "raTripleImage"
  | "raQuadImage";
const FEATURE_SCOPE_STORAGE_KEY = "__mjgd_feature_scope";
const SKU_VARIANT_FEATURE_STORAGE_KEY = "__mjgd_variant_feature_values";
const JSON_SYNC_MODE_OPTIONS: Array<{
  value: JsonSyncMode;
  label: string;
  description: string;
  requiredCount: number;
}> = [
  {
    value: "raImage",
    label: "图片",
    description: "生成一个图片模块，可包含多张图片。",
    requiredCount: 0,
  },
  {
    value: "raImageText",
    label: "图文",
    description: "生成一个图文模块，每张图对应一组图文。",
    requiredCount: 0,
  },
  {
    value: "raLeftRightImage",
    label: "左右图文",
    description: "生成一个左右图文模块，每张图对应一组左右布局。",
    requiredCount: 0,
  },
  {
    value: "raDoubleImage",
    label: "双组图文",
    description: "生成一个双组图文模块。",
    requiredCount: 2,
  },
  {
    value: "raTripleImage",
    label: "三组图文",
    description: "生成一个三组图文模块。",
    requiredCount: 3,
  },
  {
    value: "raQuadImage",
    label: "四组图文",
    description: "生成一个四组图文模块。",
    requiredCount: 4,
  },
];
const jsonSyncModalVisible = ref(false);
/** 添加图片弹窗 */
const addImageModalVisible = ref(false);
const addImagePendingUrls = ref<string[]>([]);
const addImageConfirming = ref(false);
const addImageUrlInput = ref("");
const addImageUrlModalVisible = ref(false);
const addModalFileInputRef = ref<HTMLInputElement | null>(null);
const addModalUrlTextareaRef = ref<HTMLTextAreaElement | null>(null);

// 勾选的图片索引
type CenterSelectPreset = "none" | "all" | "main";
const selectImgIndexList = ref<number[]>([]);
const centerSelectPreset = ref<CenterSelectPreset>("none");

function clearCenterImageSelection() {
  selectImgIndexList.value = [];
  centerSelectPreset.value = "none";
}

// 勾选图片
function toggleSelectImage(index: number) {
  centerSelectPreset.value = "none";
  const arr = selectImgIndexList.value;
  if (arr.includes(index)) {
    selectImgIndexList.value = arr.filter((i) => i !== index);
  } else {
    selectImgIndexList.value = [...arr, index];
  }
}
// 全选图片（与「勾选主图」互斥）
function handleSelectAllCenter() {
  const count = centerVisibleImageCount.value;
  if (centerSelectPreset.value === "all") {
    clearCenterImageSelection();
  } else {
    centerSelectPreset.value = "all";
    selectImgIndexList.value = [...Array(count).keys()];
  }
}
// 一键勾选主图（单变体 / 批量变体：各 SKU 第一张图，与「全选图片」互斥）
function handleSelectMainImages() {
  const mains = centerMainImageIndices.value;
  if (mains.length === 0) return;
  if (centerSelectPreset.value === "main") {
    clearCenterImageSelection();
  } else {
    centerSelectPreset.value = "main";
    selectImgIndexList.value = [...mains];
  }
}
// 按扁平索引删除中栏图片（写回对应 skuImgList / detailImgList）
function removeCenterImagesByFlatIndices(flatIndices: number[]) {
  const entries = flatIndices
    .map((i) => centerImageEntries.value[i])
    .filter((e): e is CenterImageEntry => Boolean(e));
  const skuIndexToLocal = new Map<number, number[]>();
  const detailLocalIndices: number[] = [];
  for (const entry of entries) {
    if (entry.source === "detail") {
      detailLocalIndices.push(entry.localIndex);
    } else if (entry.skuIndex != null) {
      const arr = skuIndexToLocal.get(entry.skuIndex) || [];
      arr.push(entry.localIndex);
      skuIndexToLocal.set(entry.skuIndex, arr);
    }
  }
  skuIndexToLocal.forEach((localIndices, skuIndex) => {
    const list = skuMatrix.value[skuIndex]?.skuImgList;
    if (!list) return;
    [...localIndices].sort((a, b) => b - a).forEach((i) => list.splice(i, 1));
  });
  const detailList = transformedData.value?.detailImgList;
  if (detailList) {
    [...detailLocalIndices]
      .sort((a, b) => b - a)
      .forEach((i) => detailList.splice(i, 1));
  }
}

// 单步还原：每张勾选图弹出一步transformHistory，无栈时回退到 url
function handleBatchRevert() {
  const idxs = selectImgIndexList.value;
  if (idxs.length === 0) return;
  beginSuppressImageEditDraftPersist();
  let revertedCount = 0;
  idxs.forEach((indexItem: number) => {
    const entry = centerImageEntries.value[indexItem];
    if (entry?.item && revertTransformUrlOneStep(entry.item)) {
      revertedCount += 1;
    }
  });
  endSuppressImageEditDraftPersistAfterDelay();
  if (revertedCount > 0) {
    showToast(`已还原 ${revertedCount} 张图片的上一步`, 2000);
  } else {
    showToast("所选图片已是原图", 2000);
  }
}
// 多选删除图片：按索引降序 splice，与单删一致保持数组引用，避免 Sortable 与中栏 DOM 不同步
function handleBatchRemove() {
  const idxs = [...selectImgIndexList.value].sort((a, b) => b - a);
  if (idxs.length === 0) return;
  if (editPageMode.value === "batch") {
    removeCenterImagesByFlatIndices(idxs);
  } else {
    const list =
      activeTab.value === "imageSet"
        ? skuMatrix.value[skuListIndex.value].skuImgList
        : transformedData.value.detailImgList;
    for (const i of idxs) {
      list.splice(i, 1);
    }
  }
  clearCenterImageSelection();
  showToast("已删除", 2000);
}
// 删除单个图片
function removeSingleImage(flatIndex: number) {
  if (editPageMode.value === "batch") {
    removeCenterImagesByFlatIndices([flatIndex]);
    let idxs = selectImgIndexList.value.filter((i) => i !== flatIndex);
    for (let i = 0; i < idxs.length; i++) {
      if (idxs[i] > flatIndex) idxs[i]--;
    }
    selectImgIndexList.value = idxs;
    centerSelectPreset.value = "none";
  } else {
    if (activeTab.value === "imageSet") {
      skuMatrix.value[skuListIndex.value].skuImgList.splice(flatIndex, 1);
    } else {
      transformedData.value.detailImgList.splice(flatIndex, 1);
    }
    let idxs = selectImgIndexList.value;
    idxs = idxs.filter((i) => i !== flatIndex);
    for (let i = 0; i < idxs.length; i++) {
      if (idxs[i] > flatIndex) idxs[i]--;
    }
    selectImgIndexList.value = idxs;
    centerSelectPreset.value = "none";
  }
  showToast("已删除", 2000);
}

// 获取图片状态文本
function getImageStatusText(status: ImageStatus): string {
  const m: Record<ImageStatus, string> = {
    waiting: "等待",
    processing: "处理中",
    completed: "已完成",
    failed: "失败",
  };
  return m[status];
}

// 打开 JSON 同步弹窗，检查是否勾选了图片和目标变体
function openJsonSyncModal() {
  if (!selectImgIndexList.value.length) {
    showToast("请先勾选要同步的图片", 2000);
    return;
  }
  if (!selectSkuIndexList.value.length) {
    showToast("请先在左侧选择目标变体", 2000);
    return;
  }
  if (!jsonRichTextFeatureAttr.value?.id) {
    showToast("当前类目未找到 JSON富内容 属性，请稍后重试", 3000);
    return;
  }
  jsonSyncModalVisible.value = true;
}
// 关闭 JSON 同步弹窗
function closeJsonSyncModal() {
  jsonSyncModalVisible.value = false;
}
const jsonRichTextFeatureAttr = computed(() => {
  const attrs = imageQueue.featureAttrs?.value || [];
  const attrsFind = attrs.find((attr: any) => {
    const attrName = String(attr?.name || "").trim().replace(/^\[+|\]+$/g, "").trim();
    return attrName.includes("JSON富内容")
  })
  return attrsFind || null;
});
// 同步JSON富内容弹窗的模式选择
function handleJsonSyncModeSelect(mode: JsonSyncMode) {
  const data = transformedData.value;
  const targetIndex = selectSkuIndexList.value;
  const attr = jsonRichTextFeatureAttr.value;
  if (!data || !targetIndex.length || !attr?.id) {
    closeJsonSyncModal();
    return;
  }
  const selectedUrls = showCenterImgList.value.filter((_: any, i: number) => selectImgIndexList.value.includes(i)).map((item: any) => item.transformUrl);
  if (!selectedUrls.length) {
    showToast("请先勾选要同步的图片", 3000);
    return;
  }
  // 检查是否符合同步模式的图片数量要求
  const requiredCount = getJsonSyncRequiredImageCount(mode);
  if (requiredCount > 0 && selectedUrls.length !== requiredCount) {
    const option = JSON_SYNC_MODE_OPTIONS.find((item) => item.value === mode);
    showToast(`${option?.label || "当前模式"}需要选择${requiredCount}张图片，当前已选${selectedUrls.length}张`, 3000);
    return;
  }
  const newWidget = buildJsonSyncWidget(mode, selectedUrls);
  if (!newWidget) {
    showToast("暂不支持该同步模式", 3000);
    return;
  }
  data.global_data = data.global_data || {};
  data.global_data[FEATURE_SCOPE_STORAGE_KEY] = {
    ...(data.global_data[FEATURE_SCOPE_STORAGE_KEY] || {}),
    [String(attr.id)]: "variant",
  };
  let hasWidget: number[] = []; // 已存在JSON富内容的变体索引
  targetIndex.forEach((idx) => {
    const existingRawValue = getVariantJsonRichTextValue(idx, String(attr.id));
    const existingWidgets = parseRichTextWidgets(existingRawValue) || [];
    // console.warn('existingWidgets', existingWidgets);
    // 已存在JSON富内容，直接跳过
    if (existingWidgets?.length > 0) {
      hasWidget.push(idx + 1);
      return;
    }
    const nextValue = JSON.stringify(
      dataConverter.convertToCompetitorFormat({
        widgets: [...existingWidgets, newWidget],
        version: 0.3,
      })
    );
    const sku = data.sku_matrix?.[idx];
    if (!sku) {
      closeJsonSyncModal();
      return;
    }
    sku[SKU_VARIANT_FEATURE_STORAGE_KEY] = {
      ...(sku[SKU_VARIANT_FEATURE_STORAGE_KEY] || {}),
      [String(attr.id)]: nextValue,
    };
  });
  closeJsonSyncModal();
  if (hasWidget.length > 0) {
    showToast(`变体 ${hasWidget.join(',')} 已存在 JSON富文本，请先检查原内容`, 3000);
  }else{
    showToast(`已同步 ${targetIndex.length} 个变体`, 2500);
  }
}
function getJsonSyncRequiredImageCount(mode: JsonSyncMode): number {
  const option = JSON_SYNC_MODE_OPTIONS.find((item) => item.value === mode);
  return option?.requiredCount || 0;
}
function getVariantJsonRichTextValue(variantIndex: number, attrId: string): string {
  const data = transformedData.value;
  const sku = data?.sku_matrix?.[variantIndex];
  if (!sku) return "";
  const variantFeatureValues = sku?.[SKU_VARIANT_FEATURE_STORAGE_KEY] || {};
  if (Object.prototype.hasOwnProperty.call(variantFeatureValues, attrId)) {
    return String(variantFeatureValues[attrId] ?? "");
  }
  const featureScopeMap = data?.global_data?.[FEATURE_SCOPE_STORAGE_KEY] || {};
  if (featureScopeMap?.[attrId] === "variant") {
    return "";
  }
  const publicValue = data?.global_data?.[attrId];
  return typeof publicValue === "string" ? publicValue : "";
}
function parseRichTextWidgets(rawValue: string): any[] | null {
  const text = String(rawValue || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    const converted = dataConverter.smartConvert(parsed, "our");
    return Array.isArray(converted?.widgets) ? converted.widgets : [];
  } catch (error) {
    console.error("解析富文本失败", error);
    return null;
  }
}
function createEmptyTextConfig(size: "size2" | "size3" | "size4") {
  return {
    items: [{ type: "text", content: "" }],
    size,
    align: "left",
    color: "color1",
  };
}
function createImageConfig(url: string, includeWidth = false) {
  const base = {
    src: url,
    srcMobile: url,
    alt: "",
    link: "",
    position: "to_the_edge",
    positionMobile: "to_the_edge",
  };
  if (!includeWidth) {
    return base;
  }
  return {
    ...base,
    width: "full",
    widthMobile: "full",
    scale: 100,
  };
}
function createImageTextLikeItem(url: string, widgetName: JsonSyncMode) {
  if (widgetName === "raLeftRightImage") {
    return {
      layout: "left",
      img: createImageConfig(url),
      title: createEmptyTextConfig("size3"),
      text: createEmptyTextConfig("size2"),
    };
  }
  return {
    img: createImageConfig(url, widgetName === "raImage"),
    ...(widgetName === "raImage"
      ? {}
      : {
          title: createEmptyTextConfig(
            widgetName === "raImageText" ? "size4" : "size3"
          ),
          text: createEmptyTextConfig("size2"),
        }),
  };
}
function buildJsonSyncWidget(mode: JsonSyncMode, imageUrls: string[]) {
  switch (mode) {
    case "raImage":
      return {
        widgetName: "raImage",
        items: imageUrls.map((url) => createImageTextLikeItem(url, "raImage")),
      };
    case "raImageText":
      return {
        widgetName: "raImageText",
        items: imageUrls.map((url) =>
          createImageTextLikeItem(url, "raImageText")
        ),
      };
    case "raLeftRightImage":
      return {
        widgetName: "raLeftRightImage",
        items: imageUrls.map((url) =>
          createImageTextLikeItem(url, "raLeftRightImage")
        ),
      };
    case "raDoubleImage":
    case "raTripleImage":
    case "raQuadImage":
      return {
        widgetName: mode,
        items: imageUrls.map((url) => ({
          img: createImageConfig(url),
          title: createEmptyTextConfig("size3"),
          text: createEmptyTextConfig("size2"),
        })),
      };
    default:
      return null;
  }
}

// 点击确认分配按钮
function handleConfirmAssign() {
  if (selectSkuIndexList.value.length === 0) {
    showToast("请先在左侧选择目标变体", 2000);
  } else {
    assignModeModalVisible.value = true;
  }
}
// 关闭分配弹窗
function closeAssignModeModal() {
  assignModeModalVisible.value = false;
}
// 确认分配：根据分配模式（append/replace）处理勾选图片加入当前选中变体
type AssignMode = "append" | "appendNoMain" | "replace" | "replaceNoMain";
function confirmAssignByMode(mode: AssignMode) {
  // 获取选中的图片
  const list = showCenterImgList.value.filter((_: any, i: number) => selectImgIndexList.value.includes(i));
  switch (mode) {
    case "append":
      byModaSetImgList(list);
      break;
    case "appendNoMain": //除主图外追加
      if (list[0].url === showCenterImgList.value[0].url) { //如果勾选了主图，则删除
        list.shift();
      }
      byModaSetImgList(list);
      break;
    case "replace":
      if (list.length > maxImgCount) {
        showToast(`每个SKU最多 ${maxImgCount} 张图片`, 2000);
        return;
      }
      // 就地替换数组元素并保持引用，避免 Sortable 与中栏 DOM 不同步（见 handleBatchRemove）
      selectSkuIndexList.value.forEach((skuIndex: number) => {
        const targetList = transformedData.value?.sku_matrix?.[skuIndex]?.skuImgList;
        if (!targetList) return;
        targetList.splice(0, targetList.length, ...list);
      });
      clearCenterImageSelection(); //取消勾选图片
      showToast("已分配", 2000);
      break;
    case "replaceNoMain":
      if ((list.length + 1) > maxImgCount) {
        showToast(`每个SKU最多 ${maxImgCount} 张图片`, 2000);
        return;
      }
      selectSkuIndexList.value.forEach((skuIndex: number) => {
        const targetList = transformedData.value?.sku_matrix?.[skuIndex]?.skuImgList;
        if (!targetList) return;
        if (targetList.length > 0) {
          const mainImg = targetList[0];
          targetList.splice(0, targetList.length, mainImg, ...list);
        } else {
          targetList.splice(0, targetList.length, ...list);
        }
      });
      clearCenterImageSelection(); //取消勾选图片
      showToast("已分配", 2000);
      break;
  }
  closeAssignModeModal();
}
function byModaSetImgList(list: any[]) {
  // 检查是否超过最大图片数
  let isOverCountSku: number[] = [];
  skuMatrix.value.forEach((sku: any, index: number) => {
    selectSkuIndexList.value.forEach((skuIndex: number) => {
      if (skuIndex === index && (list.length + sku.skuImgList.length) > maxImgCount) {
        isOverCountSku.push(index + 1);
      }
    });
  });
  if (isOverCountSku.length) {
    showToast(`第 ${isOverCountSku.join(", ")} 个SKU会超出最大图片数（${maxImgCount}个）`, 3000);
    return;
  }
  // 没有超过最大图片数则追加
  skuMatrix.value.forEach((sku: any, index: number) => {
    selectSkuIndexList.value.forEach((skuIndex: number) => {
      if (skuIndex === index) {
        sku.skuImgList.push(...list);
      }
    });
  });
  showToast("已分配", 2000);
}

// 设置为变体主图（指定 SKU）
function setAsVariantMainInSku(skuIndex: number, localIndex: number) {
  const list = skuMatrix.value[skuIndex]?.skuImgList;
  if (!list || localIndex <= 0 || localIndex >= list.length) return;
  const item = list.splice(localIndex, 1)[0];
  list.unshift(item);
  clearCenterImageSelection();
  showToast("已设为主图", 2000);
}

function setAsVariantMain(index: number) {
  setAsVariantMainInSku(skuListIndex.value, index);
}

// --- 未改图：放大镜查看大图（弹窗预览）---
const imagePreviewUrl = ref<string | null>(null);
  function openImagePreview(url: string) {
  imagePreviewUrl.value = url;
}
function closeImagePreview() {
  imagePreviewUrl.value = null;
}
interface ShowCenterImgListItem extends ImageTransformItem {}
const compareState = ref<{
  visible: boolean;
  originalUrl: string;
  resultUrl: string;
}>({ visible: false, originalUrl: "", resultUrl: "" });
// 改图后：查看图片对比
function openCompare(item: ShowCenterImgListItem) {
  compareState.value = {
    visible: true,
    originalUrl: item.url,
    resultUrl: item.transformUrl,
  };
}
function closeCompare() {
  compareState.value = { visible: false, originalUrl: "", resultUrl: "" };
}
// 点击下载结果
function downloadCompareResult() {
  downloadSingleUrl(compareState.value.resultUrl);
  closeCompare();
}
// 点击下载
function downloadSingle(url: string) {
  downloadSingleUrl(url);
}
// 开始下载图片
async function downloadSingleUrl(url: string) {
  if (!hasExtensionMessaging()) {
    showToast("环境不支持下载", 2000);
    return;
  }
  try {
    const { blob } = await proxyFetchBlob(url, {
      method: "GET",
      headers: { Accept: "image/*" },
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `image${getFileExtension(url)}`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("下载成功", 2000);
  } catch {
    showToast("下载失败", 2000);
  }
}
function getFileExtension(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname;
    const i = p.lastIndexOf(".");
    if (i !== -1) return p.substring(i);
  } catch {
    const m = url.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i);
    if (m) return m[0].replace(/\?.*$/, "");
  }
  return ".jpg";
}
// 添加新图片：追加到当前中间区域列表末尾（仅单变体）
function appendUrlsToCenterList(urls: string[]) {
  const newItems = urls.map((item) => ({
    url: item,
    transformUrl: item,
    transformHistory: [] as string[],
  }));
  if (activeTab.value === "imageSet") {
    skuMatrix.value[skuListIndex.value]?.skuImgList?.push(...newItems);
  } else {
    transformedData.value?.detailImgList?.push(...newItems);
  }
}

/** 添加图片弹窗：当前变体还可追加的数量（已含待添加队列） */
function getAddImageRemainingSlots(): number {
  const currentCount = showCenterImgList.value.length;
  const pendingCount = addImagePendingUrls.value.length;
  return Math.max(0, maxImgCount - currentCount - pendingCount);
}

// 点击添加图片
function openAddImageModal() {
  if (showCenterImgList.value.length >= maxImgCount) {
    showToast(`每个SKU最多 ${maxImgCount} 张图片`, 2000);
    return;
  }
  addImagePendingUrls.value = [];
  addImageUrlInput.value = "";
  addImageUrlModalVisible.value = false;
  addImageModalVisible.value = true;
  addImageConfirming.value = false;
  nextTick(() => addModalUrlTextareaRef.value?.focus());
}
function openAddImageUrlModal() {
  addImageUrlInput.value = "";
  addImageUrlModalVisible.value = true;
  nextTick(() => addModalUrlTextareaRef.value?.focus());
}
function closeAddImageUrlModal() {
  addImageUrlModalVisible.value = false;
}
function confirmAddImageUrlFromModal() {
  addUrlsFromTextarea();
  closeAddImageUrlModal();
}
function closeAddImageModal() {
  for (const u of addImagePendingUrls.value) {
    if (isBlobImageUrl(u)) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* ignore */
      }
    }
  }
  addImageModalVisible.value = false;
  addImagePendingUrls.value = [];
  addImageConfirming.value = false;
  addImageUrlInput.value = "";
  addImageUrlModalVisible.value = false;
  addModalFileInputRef.value && (addModalFileInputRef.value.value = "");
}
// 本地上传
function triggerAddModalFileInput() {
  addModalFileInputRef.value?.click();
}
// input文件上传事件
async function handleAddModalLocalChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files?.length) return;
  const remaining = getAddImageRemainingSlots();
  if (remaining <= 0) {
    showToast(`每个SKU最多 ${maxImgCount} 张图片`, 2000);
    input.value = "";
    return;
  }
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) {
    input.value = "";
    return;
  }
  // 本地上传按剩余名额截断，避免一次选多张时超出变体上限
  const toProcess = imageFiles.slice(0, remaining);
  if (imageFiles.length > remaining) {
    showToast(`每个SKU最多 ${maxImgCount} 张图片，已忽略多余文件`, 3000);
  }
  const urls: string[] = [];
  for (const file of toProcess) {
    try {
      urls.push(await fileToDataUrl(file));
    } catch {
      urls.push(URL.createObjectURL(file));
    }
  }
  addImagePendingUrls.value = [...addImagePendingUrls.value, ...urls];
  input.value = "";
}

function isLikelyUrl(s: string): boolean {
  const t = s.trim();
  return (
    t.startsWith("http://") ||
    t.startsWith("https://") ||
    t.startsWith("data:")
  );
}

function addUrlsFromTextarea() {
  const raw = addImageUrlInput.value.trim();
  if (!raw) return;
  const lines = raw
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = lines.filter(isLikelyUrl);
  if (valid.length === 0) {
    showToast("未识别到有效 URL（需以 http/https/data: 开头）", 2000);
    return;
  }
  const remaining = getAddImageRemainingSlots();
  if (remaining <= 0) {
    showToast(`每个SKU最多 ${maxImgCount} 张图片`, 2000);
    return;
  }
  const toAdd = valid.slice(0, remaining);
  if (valid.length > remaining) {
    showToast(`每个SKU最多 ${maxImgCount} 张图片，已忽略多余链接`, 3000);
  }
  addImagePendingUrls.value = [...addImagePendingUrls.value, ...toAdd];
  addImageUrlInput.value = "";
}

function removePendingUrl(url: string) {
  const arr = addImagePendingUrls.value;
  const i = arr.indexOf(url);
  if (i !== -1) {
    addImagePendingUrls.value = arr.slice(0, i).concat(arr.slice(i + 1));
  }
}

function removePendingUrlByIndex(idx: number) {
  addImagePendingUrls.value = addImagePendingUrls.value.filter(
    (_, i) => i !== idx
  );
}
// 确定添加图片
async function confirmAddImage() {
  if (addImagePendingUrls.value.length === 0) {
    showToast("请先添加待上传的图片或链接", 2000);
    return;
  }
  const remaining = maxImgCount - showCenterImgList.value.length;
  if (addImagePendingUrls.value.length > remaining) {
    showToast(`每个SKU最多 ${maxImgCount} 张图片，请移除多余待添加图片`, 2000);
    return;
  }
  if (addImageConfirming.value) return;
  const pending = [...addImagePendingUrls.value];
  addImageConfirming.value = true;
  try {
    showToast("图片正在上传中...", 2500);
    const uploadCache = new Map<string, string>();
    const ts = Date.now();
    const resolved: string[] = [];
    for (let i = 0; i < pending.length; i++) {
      resolved.push(
        await ensureHttpImageUrlOnOss(
          pending[i],
          `local_upload_${ts}_${i}`,
          uploadCache
        )
      );
    }
    appendUrlsToCenterList(resolved);
    showToast(`已添加 ${resolved.length} 张图片`, 2000);
    closeAddImageModal();
  } catch (e) {
    addImageConfirming.value = false;
    showToast(
      `上传失败：${(e as Error)?.message || "未知错误"}`,
      3000
    );
  }
}

// --- 右侧面板折叠与执行状态 ---
const panelAiTemplateCollapsed = ref(false);
const panelTranslateCollapsed = ref(false);
const panelWatermarkCollapsed = ref(false);
const panelVisualCollapsed = ref(false);
const isExecutingRightPanel = ref(false); //是否显示日志
const isVisualWorkshopRunning = ref(false); // 视觉工坊处理中（用于日志弹窗展示取消按钮）
const advancedAiSessionId = ref<string | null>(null);
const advancedAiCancelRequested = ref(false);
let rejectAdvancedAiStep: ((reason?: unknown) => void) | null = null;
const ADVANCED_AI_TASK_CANCELLED = "ADVANCED_AI_TASK_CANCELLED";

// 智能去水印编辑器弹层
const watermarkEditorVisible = ref(false);
const removeWatermarkRef = ref<RemoveWatermarkEditorInstance | null>(null);

// 进阶AI：本次任务的 SSE 日志与图片 id→原图 url 映射
const advancedAiLogHasContent = ref(false);
const advancedAiLogViewportRef = ref<HTMLElement | null>(null);
const { reset: resetAdvancedAiLogStream, appendStructuredLine: appendAdvancedAiLogStructuredLine, appendDelta: appendAdvancedAiLogDelta, getFullText: getAdvancedAiLogFullText } = useAiLogStream(advancedAiLogViewportRef);
// SSE 流式输出状态：按字段累积后仅 append 纯文本增量
const advancedAiSseNodeState: Record<string, { result: string; reasoningContent: string }> = {};
let advancedAiSseFallbackText = "";
const advancedAiImageIdToUrl = ref<Record<string, string>>({});
// 应用参数时保存的配置（一键执行时使用）
const savedAdvancedAiParams = ref<{ appCode: string; params: any } | null>(null);
const advancedAiEventSource = ref<EventSource | null>(null);

// 选择的改图模板
const defaultRefineTemplate = ref("");
// 从 插件storage 加载
async function loadExecuteOptionsFromStorage(){
    const aiStep = await readStorageValue('mjgd_ai_step')
    if (aiStep) {
      const step = JSON.parse(aiStep)
      defaultRefineTemplate.value = step.imageRefineTemplate || ''
      // 同步设置里的翻译模式
      translateServiceList.value.forEach((item) => {
        if (item.type === step.imageTranslateType) {
          translateServiceSelect.value = item;
        }
      })
    }
}
// 改图模板列表
const refineTemplateList = ref<any[]>([]);
const refineTemplateLoading = ref(false);
async function fetchRefineTemplateList(silent = false) {
  refineTemplateLoading.value = true;
  try {
    const res = await apiService.getRefineTemplateList();
    if (res?.code === 200 && Array.isArray(res?.rows)) {
      refineTemplateList.value = res.rows;
      if (res.rows.length > 0 && defaultRefineTemplate.value == '') {
        defaultRefineTemplate.value = String(res.rows[0].id);
      }
      if (silent) showToast("模板刷新成功", 2000);
    }
  } catch (e: any) {
    showToast(e?.msg || "获取改图模板列表失败", 2000);
  } finally {
    refineTemplateLoading.value = false;
  }
}
/**
 * 勾选图片的 transformUrl（按首次勾选顺序去重，避免同 URL 重复调接口）
 */
function getSelectedCenterItemUrls(): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  centerImageEntries.value.forEach((entry, i) => {
    if (!selectImgIndexList.value.includes(i)) return;
    const url = String(entry.item.transformUrl || "").trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  });
  return urls;
}

/** 打开智能去水印编辑器，携带勾选图片 */
async function openWatermarkEditor() {
  if (selectImgIndexList.value.length === 0) {
    showToast("请先勾选要处理的图片", 2000);
    return;
  }
  const urls = getSelectedCenterItemUrls();
  if (!urls.length) {
    showToast("未找到有效图片", 2000);
    return;
  }
  const MAX_IMAGES = 20;
  if (urls.length > MAX_IMAGES) {
    showToast(`单次最多添加 ${MAX_IMAGES} 张图片`, 3000);
    return;
  }
  watermarkEditorVisible.value = true;
  await nextTick();
  try {
    await removeWatermarkRef.value?.loadImagesFromUrls(urls);
  } catch (e: any) {
    showToast(e?.message || "加载图片失败", 3000);
  }
}

/** 取消去水印编辑：不写回，直接关闭 */
async function handleCancelWatermarkEditor() {
  const editor = removeWatermarkRef.value;
  if (!editor) {
    watermarkEditorVisible.value = false;
    return;
  }
  await editor.resetEditor();
  watermarkEditorVisible.value = false;
}

/** 保存并退出去水印编辑器：上传编辑结果并全量写回相同 transformUrl */
async function handleSaveWatermarkEditor() {
  const editor = removeWatermarkRef.value;
  if (!editor) {
    watermarkEditorVisible.value = false;
    return;
  }
  try {
    const payload = await editor.getWritebackPayload();
    let writebackCount = 0;
    for (const item of payload) {
      const { sourceUrl, blob } = item;
      if (!sourceUrl || !blob) continue;
      try {
        const ossUrl = await apiService.uploadProductImage(blob, `watermark_${Date.now()}.png`);
        applyTransformUrlToAllWithSameTransformUrl(sourceUrl, ossUrl);
        writebackCount += 1;
      } catch (e: any) {
        showToast(e?.message || "上传去水印结果失败", 3000);
      }
    }
    if (writebackCount > 0) {
      showToast("去水印结果已写回", 2000);
    }
  } finally {
    await editor.resetEditor();
    watermarkEditorVisible.value = false;
  }
}

/** AI 改图 / 视觉工坊：仅批量变体模式下对全量数据同 URL 写回 */
function shouldRefineApplyTransformGlobally(): boolean {
  return editPageMode.value === "batch";
}

/** 全量数据中 transformUrl 相同的图片一并写回（图片翻译 replaceImageUrls 同逻辑） */
function applyTransformUrlToAllWithSameTransformUrl(
  sourceTransformUrl: string,
  newUrl: string
) {
  const source = String(sourceTransformUrl || "").trim();
  const next = String(newUrl || "").trim();
  if (!source || !next) return;
  const data = transformedData.value;
  if (!data) return;
  data.sku_matrix?.forEach((sku: any) => {
    sku.skuImgList?.forEach((item: CenterDisplayImage) => {
      if (item.transformUrl === source) {
        applyTransformUrl(item, next);
      }
    });
  });
  data.detailImgList?.forEach((item: CenterDisplayImage) => {
    if (item.transformUrl === source) {
      applyTransformUrl(item, next);
    }
  });
}

/** 仅中栏当前可见条目内匹配 transformUrl 写回（单变体改图） */
function applyTransformUrlInCenterEntries(
  sourceTransformUrl: string,
  newUrl: string
) {
  const source = String(sourceTransformUrl || "").trim();
  const next = String(newUrl || "").trim();
  if (!source || !next) return;
  for (const entry of centerImageEntries.value) {
    if (entry.item.transformUrl === source) {
      applyTransformUrl(entry.item, next);
    }
  }
}

/** AI 改图 / 视觉工坊写回：批量全量，单变体仅中栏可见项 */
function applyTransformUrlForRefine(
  sourceTransformUrl: string,
  newUrl: string
) {
  if (shouldRefineApplyTransformGlobally()) {
    applyTransformUrlToAllWithSameTransformUrl(sourceTransformUrl, newUrl);
  } else {
    applyTransformUrlInCenterEntries(sourceTransformUrl, newUrl);
  }
}

/** 全量数据中 transformUrl 相同的图片一并更新处理状态（图片翻译用） */
function setImageStatusByTransformUrl(
  sourceTransformUrl: string,
  status?: ImageStatus
) {
  const source = String(sourceTransformUrl || "").trim();
  if (!source) return;
  const data = transformedData.value;
  if (!data) return;
  const patch = (item: CenterDisplayImage) => {
    if (item.transformUrl !== source) return;
    if (status) {
      item.status = status;
    } else {
      item.status = undefined;
    }
  };
  data.sku_matrix?.forEach((sku: any) => sku.skuImgList?.forEach(patch));
  data.detailImgList?.forEach(patch);
}

function setImageStatusInCenterEntries(
  sourceTransformUrl: string,
  status?: ImageStatus
) {
  const source = String(sourceTransformUrl || "").trim();
  if (!source) return;
  for (const entry of centerImageEntries.value) {
    if (entry.item.transformUrl !== source) continue;
    if (status) {
      entry.item.status = status;
    } else {
      entry.item.status = undefined;
    }
  }
}

function setImageStatusForRefine(sourceTransformUrl: string, status?: ImageStatus) {
  if (shouldRefineApplyTransformGlobally()) {
    setImageStatusByTransformUrl(sourceTransformUrl, status);
  } else {
    setImageStatusInCenterEntries(sourceTransformUrl, status);
  }
}

/** 图片翻译：处理状态始终按 URL 全量同步 */
function setSelectedCenterImagesStatusForTranslate(status: ImageStatus) {
  getSelectedCenterItemUrls().forEach((url) =>
    setImageStatusByTransformUrl(url, status)
  );
}

/** AI 改图 / 视觉工坊：处理状态随写回范围（批量全量 / 单变体中栏） */
function setSelectedCenterImagesStatusForRefine(status: ImageStatus) {
  getSelectedCenterItemUrls().forEach((url) =>
    setImageStatusForRefine(url, status)
  );
}

function resetImgStatusGlobal() {
  const data = transformedData.value;
  if (!data) return;
  const clear = (item: CenterDisplayImage) => {
    if (item.status) item.status = undefined;
  };
  data.sku_matrix?.forEach((sku: any) => sku.skuImgList?.forEach(clear));
  data.detailImgList?.forEach(clear);
}

function resetImgStatusForRefine() {
  if (shouldRefineApplyTransformGlobally()) {
    resetImgStatusGlobal();
    return;
  }
  for (const entry of centerImageEntries.value) {
    if (entry.item.status) entry.item.status = undefined;
  }
}

/** 短暂展示完成/失败后清除遮罩（与 AI 改图完成态展示节奏一致） */
function clearImageStatusAfterDelay(urls: string[], ms: number) {
  setTimeout(() => {
    urls.forEach((url) => setImageStatusForRefine(url, undefined));
  }, ms);
}

function clearTranslateImageStatusAfterDelay(url: string, ms: number) {
  setTimeout(() => setImageStatusByTransformUrl(url, undefined), ms);
}

function getImageStatusForRefine(sourceTransformUrl: string): ImageStatus | undefined {
  const source = String(sourceTransformUrl || "").trim();
  if (!source) return undefined;
  if (shouldRefineApplyTransformGlobally()) {
    const data = transformedData.value;
    if (!data) return undefined;
    let found: ImageStatus | undefined;
    const check = (item: CenterDisplayImage) => {
      if (item.transformUrl === source && item.status) found = item.status;
    };
    data.sku_matrix?.forEach((sku: any) => sku.skuImgList?.forEach(check));
    data.detailImgList?.forEach(check);
    return found;
  }
  for (const entry of centerImageEntries.value) {
    if (entry.item.transformUrl === source) return entry.item.status;
  }
  return undefined;
}

function finishImageStatusForRefine(url: string, success: boolean) {
  if (success) {
    setImageStatusForRefine(url, undefined);
    return;
  }
  setImageStatusForRefine(url, "failed");
  clearImageStatusAfterDelay([url], 800);
}

/** 写回改图结果并清除遮罩；写回后条目 transformUrl 已变，必须用新 URL 定位 */
function applyRefineResultAndFinishStatus(
  sourceTransformUrl: string,
  resultUrl?: string | null
) {
  const source = String(sourceTransformUrl || "").trim();
  if (!source) return;
  const next = String(resultUrl || "").trim();
  if (!next) {
    finishImageStatusForRefine(source, false);
    return;
  }
  applyTransformUrlForRefine(source, next);
  finishImageStatusForRefine(next, true);
}

function finishImageStatusForTranslate(url: string, success: boolean) {
  if (success) {
    setImageStatusByTransformUrl(url, undefined);
    return;
  }
  setImageStatusByTransformUrl(url, "failed");
  clearTranslateImageStatusAfterDelay(url, 800);
}

/** 仅清除仍处于 processing 的遮罩，避免批量任务结束时覆盖已单张完成的态 */
function clearStaleProcessingOverlays(urls: string[]) {
  const data = transformedData.value;
  if (data) {
    const clear = (item: CenterDisplayImage) => {
      if (item.status === "processing") item.status = undefined;
    };
    data.sku_matrix?.forEach((sku: any) => sku.skuImgList?.forEach(clear));
    data.detailImgList?.forEach(clear);
    return;
  }
  urls.forEach((url) => {
    if (getImageStatusForRefine(url) === "processing") {
      setImageStatusForRefine(url, undefined);
    }
  });
}

function clearStaleTranslateProcessingOverlays(urls: string[]) {
  urls.forEach((url) => {
    const data = transformedData.value;
    if (!data) return;
    let isProcessing = false;
    const check = (item: CenterDisplayImage) => {
      if (item.transformUrl === url && item.status === "processing") {
        isProcessing = true;
      }
    };
    data.sku_matrix?.forEach((sku: any) => sku.skuImgList?.forEach(check));
    data.detailImgList?.forEach(check);
    if (isProcessing) setImageStatusByTransformUrl(url, undefined);
  });
}

// 点击图片处理（AI改图）
async function handleImageProcess() {
  if (selectImgIndexList.value.length === 0) {
    showToast("请先勾选要处理的图片", 2000);
    return;
  }
  const workingUrls = getSelectedCenterItemUrls();
  setSelectedCenterImagesStatusForRefine("processing");
  await showAdvancedAiLogOverlay();
  addAdvancedAiLog("info", "开始执行AI改图模板");
  try {
    await runAiTemplateStep(workingUrls);
  } catch (e: any) {
    addAdvancedAiLog("error", (e?.message || "处理失败") as string);
  } finally {
    clearCenterImageSelection(); //取消勾选图片
    clearStaleProcessingOverlays(workingUrls);
    isExecutingRightPanel.value = false;
  }
}
// 执行AI改图模板
async function runAiTemplateStep(workingUrls: string[]): Promise<void> {
  const templateId = defaultRefineTemplate.value;
  const template = refineTemplateList.value.find(
    (t: any) => String(t.id) === String(templateId)
  );
  const options = templateToOptions(template);
  const hasAny =
    options.enableZoom ||
    options.enableBorder ||
    options.enableWatermark ||
    options.enablePixelPerturbation ||
    options.enableAspectRatio;
  if (!hasAny) {
    addAdvancedAiLog("info", "当前模板未开启任何处理项，跳过");
    return;
  }
  const total = workingUrls.length;
  for (let i = 0; i < total; i++) {
    const url = (workingUrls[i] || "").trim();
    try {
      addAdvancedAiLog("info", `AI改图模板 处理中 (${i + 1}/${total})`);
      const dataUrl = await processImageWithOptions(url, options);
      const ossUrl = await ensureHttpImageUrlOnOss(dataUrl, `template_src_${i}_${Date.now()}`)
      updateImgStatus(url, ossUrl);
    } catch (e: any) {
      updateImgStatus(url);
      addAdvancedAiLog("error", `图片处理失败: ${e?.message || "未知错误"}`);
    }
  }
  addAdvancedAiLog("success", "AI改图模板处理完成");
}
// AI 改图模板：批量模式全量同 URL 写回，单变体仅中栏可见项
function updateImgStatus(url: string, dataUrl?: string) {
  applyRefineResultAndFinishStatus(url, dataUrl);
}

// 翻译模式列表
const translateServiceList = ref([{ label: '本地翻译服务', type: 'package' }, { label: '备用翻译服务', type: 'points' }]);
// 选择的翻译模式
const translateServiceSelect = ref({ label: '本地翻译服务', type: 'package' });
// 选择
function onSelectTranslateService(item: any) {
  translateServiceSelect.value = item;
  showToast(`已切换为【${item.label}】，仅本次手动翻译生效`, 3000);
}
// 切换翻译模式下拉菜单
const methodDropdown = ref(false);
function toggleMethodDropdown() {
  methodDropdown.value = !methodDropdown.value;
}
function closeAllDropdowns() {
  methodDropdown.value = false;
}

// 选择翻译语言
const translateMode = ref("");
function syncBatchTranslateLanguageFromMode() {
  const lang = imageQueue.batchTranslateLanguage;
  if (!lang) return;
  const map: Record<string, BatchImageTranslateLanguage> = {
    "": "CHS>RUS",
    zh2en: "CHS>ENG",
    en2ru: "ENG>RUS",
  };
  lang.value = map[translateMode.value] ?? "CHS>RUS";
}
// 点击开始翻译按钮
async function handleStartTranslate() {
  if (selectImgIndexList.value.length === 0) {
    showToast("请先勾选要翻译的图片", 2000);
    return;
  }
  const workingUrls = getSelectedCenterItemUrls();
  setSelectedCenterImagesStatusForTranslate("processing");
  await showAdvancedAiLogOverlay();
  addAdvancedAiLog("info", "开始执行翻译");
  syncBatchTranslateLanguageFromMode();
  imageQueue.selectedImagesForTranslate.value = workingUrls;
  try {
    const { failedCount, totalCount } = await imageQueue.translateImagesOnly(true, translateServiceSelect.value.type);
    // 全部失败时不提示完成（含接口未抛错但无结果的情况）
    if (totalCount > 0 && failedCount >= totalCount) {
      addAdvancedAiLog("error", "翻译失败，勾选图片未成功替换");
      showToast("图片翻译失败", 2000);
      return;
    }
    if (failedCount > 0) {
      addAdvancedAiLog("error", `翻译部分完成，${failedCount} 张未成功`);
      showToast(`图片翻译完成，${failedCount} 张未成功`, 2000);
    } else {
      addAdvancedAiLog("success", "翻译完成，已替换勾选图片");
      showToast("图片翻译完成", 2000);
    }
  } catch (e: any) {
    addAdvancedAiLog("error", `翻译失败: ${e?.message || "未知错误"}`);
  } finally {
    clearCenterImageSelection(); //取消勾选图片
    clearStaleTranslateProcessingOverlays(workingUrls);
    isExecutingRightPanel.value = false;
  }
}

// 点击开始处理（视觉工坊）
async function handleStartProcess() {
  if (selectImgIndexList.value.length === 0) {
    showToast("请先勾选要处理的图片", 2000);
    return;
  }
  if (!canApplyParams.value) {
    showToast("请配置进阶AI改图的参数", 2000);
    return;
  }
  applyParams();
  const workingUrls = getSelectedCenterItemUrls();
  setSelectedCenterImagesStatusForRefine("processing");
  await showAdvancedAiLogOverlay();
  isVisualWorkshopRunning.value = true;
  advancedAiCancelRequested.value = false;
  advancedAiSessionId.value = null;
  addAdvancedAiLog("info", "开始执行进阶AI改图");
  try {
    await runAdvancedAiStep(workingUrls);
  } catch (e: any) {
    // 用户主动取消已在 terminateVisualWorkshopSilently 中静默结束，不再写日志
    if (e?.message !== ADVANCED_AI_TASK_CANCELLED) {
      addAdvancedAiLog("error", (e?.message || "处理失败") as string);
    }
  } finally {
    resetAdvancedAiExecutionState();
    clearStaleProcessingOverlays(workingUrls);
    isExecutingRightPanel.value = false;
    isVisualWorkshopRunning.value = false;
  }
}

/** 视觉工坊：重置取消/会话相关状态，避免影响下次任务 */
function resetAdvancedAiExecutionState() {
  advancedAiCancelRequested.value = false;
  advancedAiSessionId.value = null;
  rejectAdvancedAiStep = null;
  closeAdvancedAiSse();
}

/** 视觉工坊：立即本地终止任务并隐藏日志，服务端取消接口 fire-and-forget */
function terminateVisualWorkshopSilently() {
  advancedAiCancelRequested.value = true;
  const sessionId = advancedAiSessionId.value;
  // 通知服务端取消，不等待返回
  if (sessionId) {
    void apiService.advancedAiEditCancel(sessionId);
  }
  closeAdvancedAiSse();
  if (rejectAdvancedAiStep) {
    rejectAdvancedAiStep(new Error(ADVANCED_AI_TASK_CANCELLED));
  }
  resetAdvancedAiExecutionState();
  clearStaleProcessingOverlays(getSelectedCenterItemUrls());
  isExecutingRightPanel.value = false;
  isVisualWorkshopRunning.value = false;
}

/** 视觉工坊：日志弹窗右下角取消，需二次确认。 */
async function handleCancelVisualWorkshop() {
  const confirmed = await showConfirm({
    message: "取消后当前处理结果不会保留，确认取消吗？",
    type: "warning",
    confirmText: "确认取消",
    cancelText: "返回",
  });
  if (!confirmed) return;
  terminateVisualWorkshopSilently();
}

// --- 进阶AI 智能日志（SSE）：rAF 增量直写 DOM，绕过 Vue 热路径 ---
function formatLogTime(timestamp: number): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleTimeString();
}

function formatAdvancedAiLogLine(level: string, message: string, animated = false): string {
  const suffix = animated ? " ..." : "";
  return `[${formatLogTime(Date.now())}] ${message}${suffix}`;
}

function resetAdvancedAiSseStreamState() {
  Object.keys(advancedAiSseNodeState).forEach((key) => delete advancedAiSseNodeState[key]);
  advancedAiSseFallbackText = "";
}

function appendAdvancedAiSseFieldDelta(nodeName: string, field: "result" | "reasoningContent", incoming: string) {
  if (!incoming) return;
  if (!advancedAiSseNodeState[nodeName]) {
    advancedAiSseNodeState[nodeName] = { result: "", reasoningContent: "" };
  }
  const state = advancedAiSseNodeState[nodeName]!;
  const inc = calcIncrement(state[field], incoming);
  if (!inc) return;
  state[field] += inc;
  appendAdvancedAiStreamDelta(inc);
}

function appendPlainSseNodeResult(nodeResult: unknown, nodeName = "__fallback") {
  if (nodeResult && typeof nodeResult === "object") {
    const row = nodeResult as Record<string, unknown>;
    if (typeof row.reasoningContent === "string") {
      appendAdvancedAiSseFieldDelta(nodeName, "reasoningContent", row.reasoningContent);
    }
    if (typeof row.result === "string") {
      appendAdvancedAiSseFieldDelta(nodeName, "result", row.result);
    }
    return;
  }
  if (typeof nodeResult === "string") {
    appendAdvancedAiSseFallbackChunk(nodeResult);
  }
}

function resetAdvancedAiLogs() {
  resetAdvancedAiLogStream();
  resetAdvancedAiSseStreamState();
  advancedAiLogHasContent.value = false;
}

// 日志遮罩用 v-if，须等 nextTick 后视口 ref 才可用
async function showAdvancedAiLogOverlay() {
  isExecutingRightPanel.value = true;
  await nextTick();
  resetAdvancedAiLogs();
}

function appendAdvancedAiStreamDelta(delta: string) {
  if (!delta) return;
  advancedAiLogHasContent.value = true;
  appendAdvancedAiLogDelta(delta);
}

function appendAdvancedAiSseFallbackChunk(incoming: string) {
  if (!incoming) return;
  const inc = calcIncrement(advancedAiSseFallbackText, incoming);
  if (!inc) return;
  advancedAiSseFallbackText += inc;
  appendAdvancedAiStreamDelta(inc);
}

function addAdvancedAiLog(level: string, message: string, animated = false) {
  const line = formatAdvancedAiLogLine(level, message, animated);
  const fullText = getAdvancedAiLogFullText();
  const lastLine = fullText.split("\n").filter(Boolean).pop();
  if (lastLine === line && !animated) return;
  advancedAiLogHasContent.value = true;
  appendAdvancedAiLogStructuredLine({
    time: formatLogTime(Date.now()),
    level,
    message,
    levelKey: level === "success" || level === "warning" || level === "error" ? level : "info",
    animated,
  });
}

function parseSSEMessage(data: any) {
  const chunks = extractNodeChunksFromSsePayload(data, { allowAllNodes: true });
  if (chunks.length > 0) {
    chunks.forEach((chunk) => {
      appendAdvancedAiSseFieldDelta(chunk.nodeName, "reasoningContent", chunk.reasoningDelta);
      appendAdvancedAiSseFieldDelta(chunk.nodeName, "result", chunk.resultDelta);
    });
    return;
  }
  try {
    if (data.message && typeof data.message === "string") {
      try {
        const messageArray = JSON.parse(data.message);
        if (Array.isArray(messageArray)) {
          messageArray.forEach((item: any) => {
            if (item.response) {
              try {
                const responseData = JSON.parse(item.response);
                let nodeResult = responseData.nodeResult;
                if (typeof nodeResult === "string") {
                  try {
                    nodeResult = JSON.parse(nodeResult);
                  } catch (_) {}
                }
                appendPlainSseNodeResult(nodeResult, String(responseData.nodeName || "__fallback"));
              } catch {
                appendAdvancedAiSseFallbackChunk(String(item.response));
              }
            }
          });
        } else {
          appendAdvancedAiSseFallbackChunk(data.message);
        }
      } catch {
        appendAdvancedAiSseFallbackChunk(data.message);
      }
    }
  } catch {
    appendAdvancedAiSseFallbackChunk(typeof data === "string" ? data : String(data?.message || ""));
  }
}

function closeAdvancedAiSse() {
  if (advancedAiEventSource.value) {
    // 主动关闭前先移除 onerror，避免 close 触发失败态闪烁
    advancedAiEventSource.value.onerror = null;
    advancedAiEventSource.value.close();
    advancedAiEventSource.value = null;
  }
}

// --- 参数设置（仅前端）---
const selectedParamCard = ref<"changeBg" | "faceSwap" | "modelGen" | "imageRepaint">("imageRepaint");
const paramSubTab = ref<"preset" | "custom">("preset");
const paramForm = ref({
  backgroundDesc: "",
  genderAge: "",
  tone: "",
  makeup: "",
  lighting: "",
  productInfo: "",
  displayScene: "",
  style: "",
  faceSwapCustomPrompt: "",
  modelGenCustomPrompt: "",
});
const genderAgeTags = [
  "女+25-30岁轻熟大气",
  "女+20-25岁简约清新",
  "男+30-35岁沉稳硬朗",
  "男+25-30岁休闲干练",
  "中性+20-30岁简约酷感",
];
const toneTags = [
  "冷白中性调",
  "北欧冷调",
  "浅冷灰色调",
  "冷调自然光感 (原画面户外选这个)",
  "冷调室内光感 (原画面室内选这个)",
];
const makeupTags = [
  "裸妆",
  "轻欧美简约淡妆",
  "自然无妆容",
  "淡眉裸唇简约妆",
  "男士清爽无妆感",
];
const lightingTags = [
  "贴合原画面正面平光",
  "贴合原画面 45°侧光",
  "贴合原画面户外柔光",
  "贴合原画面室内冷白柔光",
  "贴合原画面顶光轮廓感",
];
const productInfoTags = [
  "纯棉连帽卫衣 + 服饰 + 黑色宽松款 + 纯棉磨毛 + 加绒保暖",
  "真皮斜挎包 + 箱包 + 复古方形款 + 头层牛皮 + 耐磨防刮",
  "金属墨镜 + 配饰 + 大框款 + 合金材质 + 防紫外线",
  "牛皮休闲鞋 + 鞋履 + 低帮款 + 头层牛皮 + 防滑耐磨",
  "针织披肩 + 家纺 + 纯色款 + 羊毛材质 + 保暖抗起球",
];
const displaySceneTags = [
  "Ozon 规范纯白色纯色背景 (主图必选)",
  "俄式极简摄影棚",
  "北欧风简约街头",
  "欧式简约客厅",
  "极简户外草坪",
  "简约金属陈列架旁",
];
const styleTags = [
  "冷白中性调 (主图首选)",
  "北欧冷调",
  "浅冷灰色调",
  "冷调自然光感",
  "冷调室内光感",
];

// 当前选中的参数卡片内容是否全部有值即可点击应用参数（不依赖是否勾选图片）
const canApplyParams = computed(() => {
  const form = paramForm.value;
  const card = selectedParamCard.value;
  const sub = paramSubTab.value;
  const filled = (s: string) => (s || "").trim() !== "";
  if (card === "changeBg") {
    return filled(form.backgroundDesc);
  }
  if (card === "faceSwap") {
    if (sub === "preset") {
      return (
        filled(form.genderAge) &&
        filled(form.tone) &&
        filled(form.makeup) &&
        filled(form.lighting)
      );
    }
    return filled(form.faceSwapCustomPrompt);
  }
  if (card === "modelGen") {
    if (sub === "preset") {
      return (
        filled(form.genderAge) &&
        filled(form.productInfo) &&
        filled(form.displayScene) &&
        filled(form.style)
      );
    }
    return filled(form.modelGenCustomPrompt);
  }
  return false;
});

const emptyParamForm = () => ({
  backgroundDesc: "",
  genderAge: "",
  tone: "",
  makeup: "",
  lighting: "",
  productInfo: "",
  displayScene: "",
  style: "",
  faceSwapCustomPrompt: "",
  modelGenCustomPrompt: "",
});

// 切换参数卡片时清空表单
watch(selectedParamCard, () => {
  if (selectedParamCard.value !== "imageRepaint") {
    paramForm.value = emptyParamForm();
  }
});

// --- 图片重绘 ---
const IMAGE_REPAINT_DEFAULT_PROMPT =
  "保持产品主体不变，产品的外观、结构、颜色、材质、纹理、比例与细节完全不变，可以改变拍摄角度和视角（如正面、侧面、俯视、仰视等），重绘背景、环境和灯光氛围，可使用高级商业摄影风格、电影级布光、空间透视和视觉层次优化画面。严格按照要求生成图片。";

const imageRepaintForm = ref({
  imageType: "main", // 图片种类: main-主图, detail-详情图
  model: "",
  prompt: "",
  showPromptInput: false,
  ratio: "3:4",
});
const imageRepaintModelOptions = ref<ImageRepaintModelOption[]>([]);
const imageRepaintModelTip = ref("");
const imageRepaintModelsLoading = ref(false);
const imageRepaintRatioOptions = [
  { value: "1:1", label: "1:1" },
  { value: "3:4", label: "3:4" },
  { value: "4:3", label: "4:3" },
  { value: "2:3", label: "2:3" },
];
const imageRepaintTaskId = ref<number | null>(null);
let imageRepaintPollTimer: ReturnType<typeof setInterval> | null = null;
let imageRepaintAppliedIndices = new Set<number>();

function selectImageRepaintTab() {
  selectedParamCard.value = "imageRepaint";
  paramSubTab.value = "preset";
  void loadImageRepaintModels();
}

async function loadImageRepaintModels() {
  if (imageRepaintModelsLoading.value) return;
  imageRepaintModelsLoading.value = true;
  try {
    const res = await apiService.getImageRepaintModels();
    if (res.code !== 200 || !res.data) return;
    const data = res.data;
    imageRepaintModelOptions.value = Array.isArray(data.models) ? data.models : [];
    imageRepaintModelTip.value = data.tip || "";
    const enabledModels = imageRepaintModelOptions.value.filter((item) => !item.disabled);
    const current = imageRepaintForm.value.model;
    const currentEnabled = enabledModels.some((item) => item.model === current);
    if (!currentEnabled) {
      if (data.defaultModel && enabledModels.some((item) => item.model === data.defaultModel)) {
        imageRepaintForm.value.model = data.defaultModel;
      } else if (enabledModels.length > 0) {
        imageRepaintForm.value.model = enabledModels[0].model;
      }
    }
  } catch (e) {
    console.error("加载重绘模型列表失败:", e);
  } finally {
    imageRepaintModelsLoading.value = false;
  }
}

function toggleImageRepaintPromptInput() {
  if (!imageRepaintForm.value.showPromptInput) {
    imageRepaintForm.value.showPromptInput = true;
    if (!imageRepaintForm.value.prompt) {
      imageRepaintForm.value.prompt = IMAGE_REPAINT_DEFAULT_PROMPT;
    }
  } else {
    imageRepaintForm.value.showPromptInput = false;
    imageRepaintForm.value.prompt = "";
  }
}

function stopImageRepaintPollingTimers() {
  if (imageRepaintPollTimer) {
    clearInterval(imageRepaintPollTimer);
    imageRepaintPollTimer = null;
  }
}

function resetImageRepaintTaskState() {
  stopImageRepaintPollingTimers();
  imageRepaintAppliedIndices.clear();
}

function clearImageRepaintPolling() {
  stopImageRepaintPollingTimers();
}

function getImageRepaintFriendlyError(error: unknown): string {
  if (!error) return "操作失败，请稍后重试";
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: string }).message)
        : String(error);
  if (msg.includes("积分不足") || msg.includes("扣费失败")) return "本地图像服务暂不可用，请检查服务配置";
  if (msg.includes("任务提交失败") || msg.includes("提交失败")) {
    return "任务提交失败，请稍后重试";
  }
  if (msg.includes("timeout") || msg.includes("超时")) return "请求超时，请检查网络后重试";
  if (msg.includes("Network Error") || msg.includes("网络")) return "网络连接失败，请检查网络后重试";
  if (msg.length > 30) return "操作失败，请稍后重试或联系客服";
  return msg || "操作失败，请稍后重试";
}

const IMAGE_REPAINT_REFUND_FAIL_MSG = "改图失败，请稍后重试";

/** 图片重绘结果 URL 校验：过滤 null / 空串 / 占位字符串 / 非 http(s) 链接 */
function normalizeImageRepaintResultUrl(resultUrl?: string | null): string {
  const next = String(resultUrl ?? "").trim();
  if (!next) return "";
  const lower = next.toLowerCase();
  if (lower === "null" || lower === "undefined" || lower === "none") return "";
  if (next.startsWith("data:")) return next;
  try {
    const parsed = new URL(next);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return next;
  } catch {
    // ignore invalid URL
  }
  return "";
}

function getImageRepaintCompletionMessage(successCount: number, failCount: number): string {
  if (failCount <= 0) return "图片重绘完成";
  if (successCount <= 0) return IMAGE_REPAINT_REFUND_FAIL_MSG;
  return `图片重绘完成 ${successCount} 张，${failCount} 张改图失败`;
}

type ImageRepaintApplyOutcome = "success" | "failed" | "pending" | "skipped";

function buildAiRepaintContext(): string {
  try {
    const data = transformedData.value;
    const globalData = data?.global_data;
    const categoryPath = String(globalData?.category_hint || "").trim();
    const categorySegments = categoryPath
      .split(/\s*(?:>|＞|\/|、|,)\s*/)
      .filter((s) => s && s.trim());
    const categoryTitle =
      categorySegments.length > 0
        ? categorySegments[categorySegments.length - 1].trim()
        : "商品";
    const productName = String(globalData?.product_name || "").trim();

    const features: string[] = [];
    const featureList = imageQueue.featureAttrs?.value || [];
    featureList.forEach((f: any) => {
      if (!f || !f.name) return;
      let val = f.value;
      if (Array.isArray(val)) val = val.join(",");
      if (val === null || val === undefined || val === "") return;
      features.push(`${f.name}: ${String(val)}`);
    });

    const skuMatrix = Array.isArray(data?.sku_matrix) ? data.sku_matrix : [];
    const skuList: Array<{ index: number; name: string }> = [];
    const sameSeriesSkuNames: string[] = [];
    skuMatrix.forEach((sku: any, index: number) => {
      const specs = sku?.specs && typeof sku.specs === "object" ? sku.specs : {};
      const attrs = Object.values(specs)
        .map((v) => String(v ?? "").trim())
        .filter(Boolean);
      const skuName = attrs.length > 0 ? attrs.join(" / ") : String(sku?.sku_name || "").trim();
      skuList.push({ index, name: skuName || `变体${index + 1}` });
      sameSeriesSkuNames.push(skuName || `变体${index + 1}`);
    });

    const firstSku = skuMatrix[0];
    const packagingDefaults: Record<string, number> = {};
    if (firstSku?.weight != null) packagingDefaults.weight_g = Number(firstSku.weight);
    if (firstSku?.length != null) packagingDefaults.length_mm = Number(firstSku.length);
    if (firstSku?.width != null) packagingDefaults.width_mm = Number(firstSku.width);
    if (firstSku?.height != null) packagingDefaults.height_mm = Number(firstSku.height);

    return JSON.stringify({
      taskType: "sku_main_image_prompt",
      outputLanguageForVisibleText: "Russian only",
      productName,
      categoryTitle,
      sourceFacts: { features },
      packagingDefaults,
      skuList: skuList.length > 0 ? skuList : [],
      sameSeriesSkuNames,
    });
  } catch (e) {
    console.error("构建 AI 重绘上下文失败:", e);
    return "";
  }
}

function applyImageRepaintResultAtIndex(
  sourceUrls: string[],
  resultUrls: string[],
  index: number,
  forceFinalize = false
): ImageRepaintApplyOutcome {
  if (imageRepaintAppliedIndices.has(index)) return "skipped";
  const sourceUrl = sourceUrls[index];
  if (!sourceUrl) return "skipped";
  const validResult = normalizeImageRepaintResultUrl(resultUrls[index]);
  if (!validResult) {
    if (!forceFinalize) return "pending";
    imageRepaintAppliedIndices.add(index);
    finishImageStatusForRefine(sourceUrl, false);
    return "failed";
  }
  imageRepaintAppliedIndices.add(index);
  applyRefineResultAndFinishStatus(sourceUrl, validResult);
  return "success";
}

function applyPartialImageRepaintResults(
  sourceUrls: string[],
  resultUrls: string[]
) {
  sourceUrls.forEach((_, index) => {
    applyImageRepaintResultAtIndex(sourceUrls, resultUrls, index, false);
  });
}

function summarizeImageRepaintResults(
  sourceUrls: string[],
  resultUrls: string[]
): { successCount: number; failCount: number } {
  let successCount = 0;
  let failCount = 0;
  sourceUrls.forEach((_, index) => {
    const outcome = applyImageRepaintResultAtIndex(sourceUrls, resultUrls, index, true);
    if (outcome === "success" || outcome === "skipped") {
      successCount++;
    } else if (outcome === "failed") {
      failCount++;
    }
  });
  return { successCount, failCount };
}

function startImageRepaintPolling(taskId: number, sourceUrls: string[]) {
  stopImageRepaintPollingTimers();
  imageRepaintPollTimer = setInterval(async () => {
    if (!imageRepaintTaskId.value) return;
    try {
      const res = await apiService.getImageRepaintStatus(taskId);
      if (!res || res.code !== 200 || !res.data) return;
      const d = res.data;

      if (d.status === "2") {
        applyPartialImageRepaintResults(sourceUrls, d.imageUrls || []);
      } else if (d.status === "3") {
        stopImageRepaintPollingTimers();
        const finalUrls = d.imageUrls || [];
        const { successCount, failCount } = summarizeImageRepaintResults(sourceUrls, finalUrls);
        imageRepaintAppliedIndices.clear();
        const completionMsg = getImageRepaintCompletionMessage(successCount, failCount);
        if (failCount > 0 && successCount === 0) {
          addAdvancedAiLog("error", completionMsg);
        } else if (failCount > 0) {
          addAdvancedAiLog(
            "info",
            `图片重绘完成！成功: ${successCount} 张，失败: ${failCount} 张`
          );
        } else {
          addAdvancedAiLog("success", `图片重绘完成！成功: ${successCount} 张`);
        }
        showToast(completionMsg, failCount > 0 ? 3000 : 2000);
        imageRepaintTaskId.value = null;
        isExecutingRightPanel.value = false;
        clearStaleProcessingOverlays(sourceUrls);
      } else if (d.status === "4") {
        stopImageRepaintPollingTimers();
        const failMsg = getImageRepaintFriendlyError({
          message: d.errorMsg || "重绘失败",
        });
        sourceUrls.forEach((url, index) => {
          if (imageRepaintAppliedIndices.has(index)) return;
          finishImageStatusForRefine(url, false);
        });
        imageRepaintAppliedIndices.clear();
        addAdvancedAiLog("error", failMsg);
        showToast(failMsg, 3000);
        imageRepaintTaskId.value = null;
        isExecutingRightPanel.value = false;
        clearStaleProcessingOverlays(sourceUrls);
      }
    } catch {
      // 忽略轮询网络错误
    }
  }, 3000);
}

async function handleStartImageRepaint() {
  if (isExecutingRightPanel.value) {
    showToast("当前有任务正在执行，请稍候", 2000);
    return;
  }
  const selectedModel = imageRepaintModelOptions.value.find(
    (item) => item.model === imageRepaintForm.value.model
  );
  if (selectedModel?.disabled) {
    showToast(selectedModel.disabledReason || "该模型暂不可用", 2000);
    return;
  }
  if (selectImgIndexList.value.length === 0) {
    showToast("请先勾选要处理的图片", 2000);
    return;
  }

  const sourceUrls = getSelectedCenterItemUrls();
  if (sourceUrls.length === 0) {
    showToast("未找到有效图片", 2000);
    return;
  }

  const aiContextText = buildAiRepaintContext();
  const basePrompt = imageRepaintForm.value.prompt || "";
  const combinedPrompt = aiContextText
    ? basePrompt
      ? `${aiContextText}\n\n${basePrompt}`
      : aiContextText
    : basePrompt;

  await showAdvancedAiLogOverlay();
  isExecutingRightPanel.value = true;
  imageRepaintTaskId.value = null;
  resetImageRepaintTaskState();
  setSelectedCenterImagesStatusForRefine("processing");
  addAdvancedAiLog("info", "开始执行图片重绘");

  try {
    addAdvancedAiLog("info", "正在上传图片...");
    const uploadCache = new Map<string, string>();
    const imageUrls: string[] = [];
    for (let i = 0; i < sourceUrls.length; i++) {
      imageUrls.push(
        await ensureHttpImageUrlOnOss(
          sourceUrls[i],
          `image_repaint_${i}_${Date.now()}`,
          uploadCache
        )
      );
    }

    addAdvancedAiLog("info", "正在提交图片重绘任务...");
    const reqData: {
      imageUrls: string[];
      userContext: string;
      imageSize: string;
      model: string;
      imageType: string;
      prompt?: string;
      prompts?: string[];
    } = {
      imageUrls,
      userContext: aiContextText,
      imageSize: imageRepaintForm.value.ratio,
      model: imageRepaintForm.value.model,
      imageType: imageRepaintForm.value.imageType,
    };
    if (basePrompt) {
      reqData.prompt = combinedPrompt;
      reqData.prompts = [combinedPrompt];
    }
    const res = await apiService.submitImageRepaint(reqData);

    if (res?.code !== 200 || !res?.data?.taskId) {
      throw new Error(res?.msg || "任务提交失败");
    }

    const taskId = res.data.taskId;
    imageRepaintTaskId.value = taskId;
    addAdvancedAiLog("success", `任务已创建: ${taskId}`);
    addAdvancedAiLog(
      "info",
      `待处理图片: ${sourceUrls.length} 张，预估 ${
        res.data.estimatedSeconds != null ? res.data.estimatedSeconds : "--"
      } 秒`
    );
    addAdvancedAiLog("info", "正在生成中...", true);
    startImageRepaintPolling(taskId, sourceUrls);
  } catch (e: any) {
    const userMsg = getImageRepaintFriendlyError(e);
    sourceUrls.forEach((url) => finishImageStatusForRefine(url, false));
    addAdvancedAiLog("error", userMsg);
    showToast(userMsg, 3000);
    clearImageRepaintPolling();
    imageRepaintAppliedIndices.clear();
    imageRepaintTaskId.value = null;
    isExecutingRightPanel.value = false;
    clearStaleProcessingOverlays(sourceUrls);
  }
}

// 重置参数按钮操作
function resetParams() {
  paramForm.value = emptyParamForm();
  showToast("已重置", 2000);
}

// 应用参数按钮操作：仅保存当前参数，供一键执行时使用
function applyParams() {
  const card = selectedParamCard.value;
  const appCodeMap: Record<string, string> = {
    changeBg: "changeBackground",
    faceSwap: "swapFace",
    modelGen: "generateScene",
  };
  const appCode = appCodeMap[card] || "";
  const form = paramForm.value;
  let params: any = {};
  if (card === "changeBg") {
    params = { prompt: form.backgroundDesc };
  } else if (card === "faceSwap") {
    if (paramSubTab.value === "preset") {
      params = {
        genderAge: form.genderAge,
        tone: form.tone,
        makeup: form.makeup,
        lighting: form.lighting,
      };
    } else {
      params = { customPrompt: form.faceSwapCustomPrompt };
    }
  } else if (card === "modelGen") {
    if (paramSubTab.value === "preset") {
      params = {
        displayScene: form.displayScene,
        modelGenderAge: form.genderAge,
        productInfo: form.productInfo,
        style: form.style,
      };
    } else {
      params = { customPrompt: form.modelGenCustomPrompt };
    }
  }
  savedAdvancedAiParams.value = { appCode, params };
  showToast("参数已保存", 2000);
}
// 进阶AI改图步骤：使用当前展示 URL 发请求，结果按 key 写回，不还原上次结果
function runAdvancedAiStep(selectedKeys: string[]): Promise<void> {
  const saved = savedAdvancedAiParams.value;
  if (!saved) return Promise.resolve();

  const urlsInStep = selectedKeys;

  const finishAsCancelled = (resolve: () => void) => {
    // 用户取消：直接清除处理态，不展示失败
    urlsInStep.forEach((u) => setImageStatusForRefine(u, undefined));
    closeAdvancedAiSse();
    resolve();
  };

  return (async () => {
    try {
      addAdvancedAiLog("info", "正在提交请求...");
      const uploadCache = new Map<string, string>();
      const resolvedUrls: string[] = [];
      for (let i = 0; i < selectedKeys.length; i++) {
        if (advancedAiCancelRequested.value) {
          throw new Error(ADVANCED_AI_TASK_CANCELLED);
        }
        const display = selectedKeys[i];
        resolvedUrls.push(
          await ensureHttpImageUrlOnOss(
            display,
            `advanced_ai_${i}_${Date.now()}`,
            uploadCache
          )
        );
      }
      if (advancedAiCancelRequested.value) {
        throw new Error(ADVANCED_AI_TASK_CANCELLED);
      }
      const timestamp = Date.now();
      const workImgList: any[] = []; //记录每个图片的id、ossUrl、transformUrl，用于后续更新图片
      const images = selectedKeys.map((item, index) => {
        const id = `img_${timestamp}_${index}`;
        const url = resolvedUrls[index] || item;
        workImgList.push({ id, ossUrl: url, transformUrl: item });
        return { id, url };
      });
      const payload = { appCode: saved.appCode, images, params: saved.params };

      await new Promise<void>((resolve, reject) => {
        rejectAdvancedAiStep = reject;
    apiService
      .advancedAiEdit(payload)
      .then((res) => {
        if (advancedAiCancelRequested.value) {
          const pendingSessionId = res?.data?.sessionId as string | undefined;
          if (pendingSessionId) {
            advancedAiSessionId.value = pendingSessionId;
            void apiService.advancedAiEditCancel(pendingSessionId);
          }
          finishAsCancelled(resolve);
          return;
        }
        if (res?.code !== 200 || !res?.data?.sessionId) {
          urlsInStep.forEach((u) => setImageStatusForRefine(u, "failed"));
          clearImageStatusAfterDelay(urlsInStep, 800);
          showToast(res?.msg || "启动失败", 2000);
          addAdvancedAiLog("error", res?.msg || "启动失败");
          reject(new Error(res?.msg || "启动失败"));
          return;
        }
        const sessionId = res.data.sessionId as string;
        advancedAiSessionId.value = sessionId;
        const estimatedTime = res.data.estimatedTime as number | undefined;
        if (estimatedTime != null) {
          showToast(`已提交，预计 ${estimatedTime} 秒`, 2000);
        } else {
          showToast("已提交", 2000);
        }
        const idToUrl: Record<string, string> = {};
        images.forEach((img: { id: string; url: string }, i: number) => {
          idToUrl[img.id] = selectedKeys[i];
        });
        advancedAiImageIdToUrl.value = idToUrl;

        closeAdvancedAiSse();
        createSseConnection(sessionId)
          .then((es) => {
            if (advancedAiCancelRequested.value) {
              es.close();
              finishAsCancelled(resolve);
              return;
            }
            advancedAiEventSource.value = es;
            const completedAdvancedAiIds = new Set<string>();
            const completedAdvancedAiUrls = new Set<string>();

            es.addEventListener("connected", () => {
              addAdvancedAiLog("info", "SSE 已连接，处理中...");
            });

            es.addEventListener("message", (event: MessageEvent) => {
              try {
                const data = JSON.parse(event.data || "{}");
                parseSSEMessage(data);
              } catch {
                appendAdvancedAiSseFallbackChunk(String(event.data));
              }
            });

            es.addEventListener("complete", (event: MessageEvent) => {
              void (async () => {
                try {
                  const data = JSON.parse(event.data || "{}");
                  const imageId = data.imageId ?? data.imageld;
                  const resultUrl = data.resultUrl;
                  if (imageId == null || !resultUrl) return;
                  //更新图片
                  workImgList.forEach((workItem) => {
                    if (workItem.id === imageId) {
                      applyRefineResultAndFinishStatus(
                        workItem.transformUrl,
                        resultUrl
                      );
                    }
                  });

                  const idKey = String(imageId);
                  if (completedAdvancedAiIds.has(idKey)) return;
                  completedAdvancedAiIds.add(idKey);

                  const originalUrl = advancedAiImageIdToUrl.value[idKey];
                  if (!originalUrl) {
                    addAdvancedAiLog(
                      "info",
                      "complete 未匹配到本地图片: " + idKey
                    );
                    return;
                  }

                  completedAdvancedAiUrls.add(originalUrl);
                  addAdvancedAiLog("success", "图片处理完成");
                } catch (e) {
                  addAdvancedAiLog("info", String((e as Error).message));
                }
              })();
            });

            es.addEventListener("error", (event: MessageEvent) => {
              try {
                const data =
                  typeof event.data === "string"
                    ? JSON.parse(event.data || "{}")
                    : event.data || {};
                addAdvancedAiLog(
                  "error",
                  data.error || data.errorCode || "处理失败"
                );
                // 这里失败后会直接关掉日志面板，用户看不到错误信息，toast提示用户
                // showToast(data.error || data.errorCode || "处理失败", 2000);
              } catch {
                addAdvancedAiLog("error", "处理失败");
              }
            });

            es.addEventListener("end", () => {
              urlsInStep.forEach((u) => {
                if (completedAdvancedAiUrls.has(u)) return;
                finishImageStatusForRefine(u, true);
              });
              addAdvancedAiLog("success", "进阶AI改图全部处理完成");
              showToast("图片处理完成", 2000);
              es.onerror = null;
              closeAdvancedAiSse();
              resolve();
            });

            es.addEventListener("cancel", () => {
              finishAsCancelled(resolve);
            });

            es.onerror = () => {
              if (es.readyState === EventSource.CLOSED || advancedAiCancelRequested.value) return;
              urlsInStep.forEach((u) => setImageStatusForRefine(u, "failed"));
              clearImageStatusAfterDelay(urlsInStep, 800);
              addAdvancedAiLog("error", "SSE 连接异常");
              showToast("图片处理异常", 2000);
              closeAdvancedAiSse();
              resolve();
            };
          })
          .catch((e: any) => {
            if (e?.message === ADVANCED_AI_TASK_CANCELLED || advancedAiCancelRequested.value) {
              reject(e);
              return;
            }
            urlsInStep.forEach((u) => setImageStatusForRefine(u, "failed"));
            clearImageStatusAfterDelay(urlsInStep, 800);
            showToast(e?.msg || e?.message || "请求失败", 2000);
            addAdvancedAiLog("error", e?.msg || e?.message || "请求失败");
            reject(e);
          });
      })
      .catch((e: any) => {
        if (e?.message === ADVANCED_AI_TASK_CANCELLED || advancedAiCancelRequested.value) {
          reject(e);
          return;
        }
        urlsInStep.forEach((u) => setImageStatusForRefine(u, "failed"));
        clearImageStatusAfterDelay(urlsInStep, 800);
        showToast(e?.msg || e?.message || "请求失败", 2000);
        addAdvancedAiLog("error", e?.msg || e?.message || "请求失败");
        reject(e);
      });
      });
    } catch (e: any) {
      if (e?.message === ADVANCED_AI_TASK_CANCELLED || advancedAiCancelRequested.value) {
        throw e;
      }
      urlsInStep.forEach((u) => setImageStatusForRefine(u, "failed"));
      clearImageStatusAfterDelay(urlsInStep, 800);
      showToast(e?.msg || e?.message || "上传或请求失败", 2000);
      addAdvancedAiLog("error", e?.msg || e?.message || "上传或请求失败");
      throw e;
    }
  })();
}

// 将精修模板转为 processImageWithOptions 所需选项（与 ozon-vue AiModifyPicture applyTemplate 一致）
function templateToOptions(template: any): ProcessImageOptions {
  if (!template) return {};
  const num = (v: any) => (v != null && v !== "" ? Number(v) : undefined);
  const str = (v: any) => (v != null && v !== "" ? String(v) : undefined);
  const isOn = (v: any) => v === "0" || v === 0;
  const enableZoom = isOn(template.isEnlarge);
  const enableBorder = isOn(template.isFrame);
  const customBorderUrl = str(template.customFrameUrl) || null;
  const enableWatermark = isOn(template.isWatermark);
  const enablePixelPerturbation = isOn(template.isPct);
  const enableAspectRatio = isOn(template.isImgSize);
  const aspectRatioWidth = num(template.width) ?? 1;
  const aspectRatioHeight = num(template.height) ?? 1;
  const watermarkType = template.imageWatermarkUrl ? "image" : "text";
  const textWatermark = str(template.textWatermark) || "";
  const imageWatermarkUrl = str(template.imageWatermarkUrl) || "";
  const watermarkPosition = str(template.watermarkPosition) || "bottom-right";
  const isFillWatermark = watermarkPosition === "fill";
  let watermarkOptions: ProcessImageOptions["watermarkOptions"] = {
    fill: isFillWatermark,
    ...(isFillWatermark ? {} : { position: watermarkPosition }),
  };
  if (template.superWatermarkJson) {
    try {
      const config = JSON.parse(template.superWatermarkJson);
      const superPosition =
        watermarkType === "image"
          ? str(config.imgPosition) || str(config.position)
          : str(config.position);
      const superFill =
        watermarkType === "image" ? config.imgFill ?? config.fill : config.fill;
      const superAngle =
        watermarkType === "image" ? config.imgAngle ?? config.angle : config.angle;
      const superOpacity =
        watermarkType === "image"
          ? config.imgOpacity ?? config.watermarkImgOpacity
          : config.textOpacity;
      const superScale =
        watermarkType === "image"
          ? config.imgScale ?? config.watermarkImgScale
          : undefined;

      if (superFill != null) {
        watermarkOptions.fill =
          superFill === true ||
          superFill === "true" ||
          superFill === 1 ||
          superFill === "1";
      }
      if (superPosition && !isFillWatermark && !watermarkOptions.fill) {
        watermarkOptions.position = superPosition;
      }
      if (config.fontFamily) watermarkOptions.fontFamily = config.fontFamily;
      if (config.fontSize != null)
        watermarkOptions.fontSize = Number(config.fontSize);
      if (config.fontWeight != null)
        watermarkOptions.fontWeight = Number(config.fontWeight);
      if (config.fontColor) watermarkOptions.fontColor = config.fontColor;
      if (superOpacity != null) {
        watermarkOptions.opacity = Number(superOpacity) / 100;
      }
      if (superScale != null) {
        watermarkOptions.scale = Number(superScale) / 100;
      }
      if (superAngle != null) {
        watermarkOptions.angle = Number(superAngle);
      }
    } catch (_) {}
  }
  return {
    enableZoom,
    zoomScale: num(template.enlargeScale) || 1.2,
    enableBorder,
    borderColor: str(template.borderColor) || "black",
    customBorderUrl,
    enableWatermark,
    watermarkType,
    textWatermark,
    imageWatermarkUrl,
    watermarkOptions,
    enablePixelPerturbation,
    enableAspectRatio,
    aspectRatioWidth,
    aspectRatioHeight,
  };
}

// --- 拖拽排序 ---
const gridListRef = ref<HTMLElement | null>(null);
let sortableInstance: Sortable | null = null;
const batchGridRefs = new Map<number, HTMLElement>();
const batchSortableMap = new Map<number, Sortable>();

function setBatchGridRef(skuIndex: number, el: HTMLElement | null) {
  if (el) {
    batchGridRefs.set(skuIndex, el);
    return;
  }
  batchGridRefs.delete(skuIndex);
  // 批量分组卸载时同步销毁，避免 DOM 移除后 Sortable 仍响应拖拽导致 options 为 null
  const instance = batchSortableMap.get(skuIndex);
  if (instance) {
    try {
      instance.destroy();
    } catch {
      /* 节点已移除时 destroy 可能抛错，忽略 */
    }
    batchSortableMap.delete(skuIndex);
  }
}

function destroyBatchSortables() {
  batchSortableMap.forEach((instance) => {
    try {
      instance.destroy();
    } catch {
      /* ignore */
    }
  });
  batchSortableMap.clear();
  // 不 clear batchGridRefs：由 Vue ref 回调维护，清空会导致 init 时取不到 DOM
}

function destroyAllSortables() {
  destroyBatchSortables();
  if (sortableInstance) {
    try {
      sortableInstance.destroy();
    } catch {
      /* ignore */
    }
    sortableInstance = null;
  }
}

function handleBatchSortableEnd(skuIndex: number, ev: { oldIndex?: number; newIndex?: number }) {
  const list = transformedData.value?.sku_matrix?.[skuIndex]?.skuImgList;
  if (!list) return;
  const oldIndex = ev.oldIndex;
  const newIndex = ev.newIndex;
  if (
    oldIndex === undefined ||
    newIndex === undefined ||
    isNaN(oldIndex) ||
    isNaN(newIndex) ||
    oldIndex === newIndex ||
    oldIndex < 0 ||
    newIndex < 0 ||
    oldIndex >= list.length ||
    newIndex >= list.length
  ) {
    return;
  }
  const [moved] = list.splice(oldIndex, 1);
  list.splice(newIndex, 0, moved);
  // Sortable 已改动真实 DOM，递增 renderKey 强制该 SKU 分组整组 remount
  batchGridRenderKeys.value = {
    ...batchGridRenderKeys.value,
    [skuIndex]: (batchGridRenderKeys.value[skuIndex] ?? 0) + 1,
  };
  nextTick(() => reinitBatchSortableForSku(skuIndex));
}

function mountBatchSortableForSku(skuIndex: number) {
  if (editPageMode.value !== "batch") return;
  if (batchSortableMap.has(skuIndex)) return;
  const el = batchGridRefs.get(skuIndex);
  const list = skuMatrix.value[skuIndex]?.skuImgList;
  if (!el?.isConnected || !list?.length) return;
  batchSortableMap.set(
    skuIndex,
    new Sortable(el, {
      animation: 150,
      onEnd(ev: { oldIndex?: number; newIndex?: number }) {
        handleBatchSortableEnd(skuIndex, ev);
      },
    } as any)
  );
}

function reinitBatchSortableForSku(skuIndex: number) {
  const instance = batchSortableMap.get(skuIndex);
  if (instance) {
    try {
      instance.destroy();
    } catch {
      /* ignore */
    }
    batchSortableMap.delete(skuIndex);
  }
  mountBatchSortableForSku(skuIndex);
}

function initBatchSortables() {
  if (editPageMode.value !== "batch") return;
  destroyBatchSortables();
  // 等批量分组 DOM 与 ref 回调完成后再挂载 Sortable
  nextTick(() => {
    if (editPageMode.value !== "batch") return;
    for (const section of batchCenterSections.value) {
      if (section.type !== "sku" || section.skuIndex == null) continue;
      mountBatchSortableForSku(section.skuIndex);
    }
  });
}

function initSingleSortable() {
  if (editPageMode.value !== "single") return;
  if (sortableInstance) {
    try {
      sortableInstance.destroy();
    } catch {
      /* ignore */
    }
    sortableInstance = null;
  }
  const el = gridListRef.value;
  if (!el?.isConnected || showCenterImgList.value.length === 0) return;
  sortableInstance = new Sortable(el, {
      animation: 150,
      filter: ".mjgd-ai-workspace-grid-add-card",
      onEnd(ev: { oldIndex?: number; newIndex?: number }) {
        const oldIndex = ev.oldIndex;
        const newIndex = ev.newIndex;
        const list = showCenterImgList.value;
        if (
          oldIndex === undefined ||
          newIndex === undefined ||
          isNaN(oldIndex) ||
          isNaN(newIndex) ||
          oldIndex < 0 ||
          newIndex < 0 ||
          oldIndex >= list.length ||
          newIndex >= list.length
        ) {
          return;
        }
        const [moved] = list.splice(oldIndex, 1);
        list.splice(newIndex, 0, moved);
      },
    } as any);
}

onMounted(() => {
  imageQueue.onTranslateItemDone = finishImageStatusForTranslate;
  fetchRefineTemplateList();
  void loadImageRepaintModels();
  initRestoreImageEditBtnVisibility();
  skuMatrixLengthSnapshot.value = skuMatrix.value.length;
  window.addEventListener("beforeunload", handleImageEditDraftBeforeUnload);
  watch(
    () => skuMatrix.value.length,
    () => {
      syncImageQueueAfterSkuMatrixChange();
    }
  );
  watch(
    [gridListRef, showCenterImgList, editPageMode],
    () => {
      if (editPageMode.value === "batch") {
        // 批量模式由 batchCenterSections 的 watch 管理；此处只拆掉单变体实例
        if (sortableInstance) {
          try {
            sortableInstance.destroy();
          } catch {
            /* ignore */
          }
          sortableInstance = null;
        }
        return;
      }
      nextTick(() => initSingleSortable());
    },
    { immediate: true }
  );
  watch(
    [batchSortableSectionKeys, editPageMode, batchIncludeDetailImages],
    () => {
      if (editPageMode.value !== "batch") {
        destroyBatchSortables();
        return;
      }
      nextTick(() => initBatchSortables());
    },
    { immediate: true }
  );
});

// keep-alive的组件首次加载和再次激活都会调用onActivated，执行滚动条定位，并从storage同步设置页改动的执行选项
onActivated(() => {
  syncImageQueueAfterSkuMatrixChange();
  scrollVariantListToSelected();
  loadExecuteOptionsFromStorage();
  initRestoreImageEditBtnVisibility();
});

onUnmounted(() => {
  window.removeEventListener("beforeunload", handleImageEditDraftBeforeUnload);
  flushImageEditDraftPersistTimer();
  clearSuppressImageEditDraftPersistTimer();
  suppressImageEditDraftPersist = false;
  persistImageEditDraftNow();
  destroyAllSortables();
  batchGridRefs.clear();
  closeAdvancedAiSse();
  resetImageRepaintTaskState();
  imageRepaintTaskId.value = null;
});
</script>

<style scoped lang="scss">
.mjgd-ai-image--queue-container{
  height: 100%;
  position: relative;
}

.mjgd_ai_watermark_editor_overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
  overflow: hidden;
}

.mjgd-ai-image-queue-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid #e4e7ed;
  background: linear-gradient(180deg, #fafafa 0%, #f5f7fa 100%);
}

.mjgd_ai_queue_mode_tabs {
  display: flex;
  flex-shrink: 0;
}

.mjgd_ai_queue_mode_tab {
  padding: 8px 16px;
  border: 1px solid #dcdfe6;
  margin-left: -1px;
  background: #fff;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;

  &:first-child {
    margin-left: 0;
    border-radius: 6px 0 0 6px;
  }

  &:last-child {
    border-radius: 0 6px 6px 0;
  }
}

.mjgd_ai_queue_mode_tab_active {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
  z-index: 1;
  position: relative;
}

.mjgd_ai_detail_checkbox_row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #ffffff;
  cursor: pointer;
  flex-shrink: 0;
}

.mjgd_ai_batch_section {
  margin-bottom: 12px;
}

/* 中栏 SKU 区域：单变体 / 批量变体共用白底卡片 */
.mjgd_ai_center_sku_panel,
.mjgd_ai_batch_section_sku {
  background: #ffffff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.mjgd_ai_center_sku_panel {
  margin-bottom: 12px;
}

.mjgd_ai_batch_section_header {
  padding-bottom: 6px;
  color: #303133;
  font-size: 14px;
  font-weight: 600;
}

.mjgd_ai_restore_edit_btn {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 8px 16px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  background: #fff;
  color: #606266;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    color: #409eff;
    border-color: #c6e2ff;
    background: #ecf5ff;
  }

  &:active {
    color: #3a8ee6;
    border-color: #409eff;
  }

  .mjgd_ai_restore_edit_btn_icon {
    width: 20px;
    height: 20px;
    margin: -2px 1px 0 0;
  }
}

.mjgd-ai-back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px 16px;
  margin-right: auto;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #409eff 0%, #36a3f7 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.25);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.35);
    background: linear-gradient(135deg, #66b1ff 0%, #409eff 100%);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 1px 4px rgba(64, 158, 255, 0.25);
  }
}

.mjgd-ai-workspace-three-cols {
  display: flex;
  height: calc(100% - 59px);
}

.mjgd-ai-workspace-left {
  width: 330px;
  min-width: 280px;
  border-right: 1px solid #dcdfe6;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f5f7fa;
}

.mjgd-ai-workspace-left-section {
  box-sizing: border-box;
  max-height: calc(100% - 120px);
  padding: 12px;
}

.mjgd-ai-workspace-left-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.mjgd-ai-workspace-left-title {
  font-size: 14px;
  font-weight: 600;
  color: #606266;
}
.mjgd-ai-workspace-left-count {
  font-size: 12px;
  color: #909399;
}

.mjgd-ai-workspace-checkbox-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  margin-bottom: 8px;
}

.mjgd-ai-workspace-variant-list {
  overflow-y: auto;
  max-height: calc(100% - 50px);
}

.mjgd-ai-workspace-variant-card {
  position: relative;
  background: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
  cursor: pointer;
}

.mjgd-ai-workspace-variant-selected {
  border-color: #409eff;
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.2);
}

.mjgd-ai-workspace-variant-header {
  position: relative;
  padding-left: 20px;
  margin-bottom: 6px;

  .mjgd-ai-workspace-variant-checkbox {
    position: absolute;
    left: -10px;
    top: -10px;
    padding: 10px;
    cursor: pointer;

    input {
      cursor: pointer;
    }
  }

  .mjgd-ai-workspace-variant-label {
    color: #606266;
    font-size: 12px;
  }
}

.mjgd-ai-workspace-variant-widget-text {
  padding-left: 20px;
  margin-bottom: 6px;
  color: #409eff;
  font-size: 12px;
}

.mjgd-ai-workspace-variant-imgs {
  position: relative;
  display: flex;
  align-items: flex-start;
  flex-wrap: nowrap;
  gap: 4px;
  width: 100%;

  /* 组件 root 是 flex 子项，禁止被压缩 */
  :deep(.mjgd_csp_safe_img_root) {
    flex-shrink: 0;
  }

  img,
  :deep(img),
  :deep(.mjgd_csp_safe_img_loading) {
    /* 禁止 flex 压缩，避免左栏多图时 loading/缩略图被压扁 */
    flex-shrink: 0;
    box-sizing: border-box;
    width: 47px;
    height: 47px;
    border-radius: 8px;
    border: 1px solid #dcdfe6;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    object-fit: cover;
  }
  img:first-of-type,
  :deep(.mjgd_ai_workspace_variant_img_main),
  :deep(img.mjgd_ai_workspace_variant_img_main) {
    width: 78px;
    height: 78px;
  }
  .mjgd-ai-workspace-variant-main-label,
  .mjgd-ai-workspace-variant-more {
    height: 22px;
    padding: 0 4px;
    background-color: #ffffff;
    border: none;
    border-radius: 6px;
    color: #409eff;
    font-weight: 500;
    line-height: 22px;
  }
  .mjgd-ai-workspace-variant-main-label {
    position: absolute;
    top: 4px;
    left: 4px;
    font-size: 12px;
    z-index: 5;
  }
  .mjgd-ai-workspace-variant-more {
    position: absolute;
    top: 22px;
    right: 3px;
    font-size: 16px;
  }
  .mjgd-ai-workspace-variant-no-img {
    font-size: 12px;
    color: #909399;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
}

.mjgd-ai-workspace-variant-more-btn {
  position: absolute;
  right: 8px;
  bottom: 8px;
  font-size: 14px;
  color: #909399;
}

.mjgd-ai-workspace-public-card {
  flex: 1;
  min-height: 120px;
  display: flex;
  align-items: flex-start;
}

.mjgd-ai-workspace-public-inner {
  background: #0ea5e9;
  border-radius: 14px;
  padding: 12px 14px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  box-shadow: 0 2px 8px rgba(53, 192, 255, 0.25);
  position: relative;
  overflow: hidden;
}

.mjgd-ai-workspace-public-text {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.mjgd-ai-workspace-public-title {
  font-size: 18px;
  font-weight: 700;
  color: #ffffff;
  margin-bottom: 4px;
}

.mjgd-ai-workspace-public-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.4;
}

.mjgd-ai-workspace-public-btn {
  padding: 6px 12px;
  background: #ffffff;
  color: #525aa3;
  border: none;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

/* 中栏 */
.mjgd-ai-workspace-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.mjgd-ai-workspace-center-hint {
  font-size: 12px;
  color: #909399;
  padding: 4px 16px 12px;
  margin: 0;
}

.mjgd-ai-workspace-toolbar {
  padding: 12px 16px 16px;
  border-bottom: 1px solid #dcdfe6;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mjgd-ai-workspace-toolbar-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.mjgd-ai-workspace-toolbar-row-main {
  justify-content: space-between;
}
.mjgd-ai-workspace-toolbar-row-ai {
  background: #f7fcff;
  border-radius: 10px;
  padding: 10px 14px;
  justify-content: space-between;
  gap: 0;
}
.mjgd-ai-workspace-toolbar-ai-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.mjgd-ai-workspace-toolbar-ai-divider {
  width: 1px;
  align-self: stretch;
  min-height: 24px;
  background: #dcdfe6;
  margin: 0 16px;
  flex-shrink: 0;
}
.mjgd-ai-workspace-toolbar-ai-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mjgd-ai-workspace-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.mjgd-ai-workspace-toolbar-actions-right {
  margin-left: auto;
  justify-content: flex-end;
  gap: 10px;
}

.mjgd-ai-workspace-btn {
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
  border: none;
}

.mjgd-ai-workspace-btn-outline {
  border: 1px solid #dcdfe6;
  background: #ffffff;
  color: #606266;
}
.mjgd-ai-workspace-btn-outline:hover:not(:disabled) {
  background: #f5f7fa;
}
.mjgd-ai-workspace-btn-primary {
  border: none;
  background: #409eff;
  color: #ffffff;
}
.mjgd-ai-workspace-btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}
.mjgd-ai-workspace-btn-dark {
  border: none;
  background: #1d4ed8;
  color: #ffffff;
}
.mjgd-ai-workspace-btn-dark:hover:not(:disabled) {
  opacity: 0.9;
}
.mjgd-ai-workspace-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 按钮胶囊：两段式切换，整体白底药丸形，柔和阴影无硬边，选中蓝底白字 */
.mjgd-ai-workspace-btn-capsule {
  display: inline-flex;
  align-items: stretch;
  border: none;
  border-radius: 20px;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}
.mjgd-ai-workspace-btn-capsule-item {
  margin: 0;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  outline: none;
  background: #ffffff;
  color: #5a646e;
  transition: background 0.2s ease, color 0.2s ease;
}
.mjgd-ai-workspace-btn-capsule-item:hover:not(.is-active) {
  background: #f8f9fa;
}
.mjgd-ai-workspace-btn-capsule-item.is-active {
  background: #1e90ff;
  color: #ffffff;
}
.mjgd-ai-workspace-btn-capsule-item.is-active:hover {
  opacity: 0.92;
}
/* 选中段为椭圆形：四角都圆角，无分割线 */
.mjgd-ai-workspace-btn-capsule-left {
  border-radius: 20px;
}
.mjgd-ai-workspace-btn-capsule-right {
  border-radius: 20px;
}

.mjgd-ai-workspace-dropdown {
  position: relative;
}
.mjgd-ai-workspace-file-input-hidden {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}
.mjgd-ai-workspace-dropdown-menu {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  padding-top: 4px;
  background: #ffffff;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  z-index: 10;
  min-width: 140px;
}
.mjgd-ai-workspace-dropdown:hover .mjgd-ai-workspace-dropdown-menu {
  display: block;
}
.mjgd-ai-workspace-dropdown-disabled {
  pointer-events: none;
  opacity: 0.6;
}
.mjgd-ai-workspace-dropdown-disabled:hover .mjgd-ai-workspace-dropdown-menu {
  display: none;
}
.mjgd-ai-workspace-dropdown-menu a,
.mjgd-ai-workspace-dropdown-menu button {
  display: block;
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  color: #606266;
  text-decoration: none;
  text-align: left;
  border: none;
  background: none;
  cursor: pointer;
}
.mjgd-ai-workspace-dropdown-menu a:hover,
.mjgd-ai-workspace-dropdown-menu button:hover {
  background: #f5f7fa;
  color: #409eff;
}

.mjgd-ai-workspace-switch-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
}
/* 胶囊开关：椭圆形轨道 + 滑动圆点 */
.mjgd-ai-workspace-switch-capsule {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  border-radius: 20px;
  background: #e5e7eb;
  flex-shrink: 0;
  transition: background 0.2s ease;
}
.mjgd-ai-workspace-switch-capsule.is-on {
  background: #409eff;
}
.mjgd-ai-workspace-switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}
.mjgd-ai-workspace-switch-capsule.is-on .mjgd-ai-workspace-switch-thumb {
  transform: translateX(16px);
}
.mjgd-ai-workspace-switch-input {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
.mjgd-ai-workspace-switch {
  width: 36px;
  height: 20px;
  accent-color: #409eff;
  cursor: pointer;
}

.mjgd-ai-workspace-select {
  padding: 6px 28px 6px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 13px;
  min-width: 120px;
  background: #ffffff;
  color: #606266;
  cursor: pointer;
}

.mjgd-ai-workspace-grid-wrap {
  flex: 1;
  overflow: auto;
  padding: 16px;
  background: #f5f7fa;
}

/* 顶部黄色提示*/
.mjgd_ai_workspace_tip_bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fffbe6;
  border-radius: 4px;
}

.mjgd_ai_workspace_tip_icon {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: #fa8c16;
}

.mjgd_ai_workspace_tip_text {
  font-size: 13px;
  line-height: 1.5;
  color: #d46b08;
}

.mjgd_ai_workspace_select_all_row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  white-space: nowrap;
}

.mjgd-ai-workspace-empty-hint {
  padding: 40px;
  text-align: center;
  color: #909399;
  font-size: 14px;
}

.mjgd-ai-workspace-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 16px;
}

@media (max-width: 1200px) {
  .mjgd-ai-workspace-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.mjgd-ai-workspace-grid-item {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
}

.mjgd-ai-workspace-grid-add-card {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
  background: #ffffff;
}
.mjgd-ai-workspace-grid-add-card-disabled {
  pointer-events: none;
  opacity: 0.5;
}
.mjgd-ai-workspace-grid-add-card-inner {
  position: relative;
  aspect-ratio: 1;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed #93c5fd;
  border-radius: 8px;
  background: #ffffff;
}
.mjgd-ai-workspace-grid-add-card-plus {
  font-size: 32px;
  color: #9ca3af;
  line-height: 1;
  user-select: none;
}

.mjgd-ai-workspace-grid-img-box {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
}

/* CspSafeImg 有内部 root，需 :deep 才能把 contain 落到真实 img 上 */
.mjgd-ai-workspace-grid-img-box :deep(.mjgd-ai-workspace-grid-img),
.mjgd-ai-workspace-grid-img-box :deep(img.mjgd-ai-workspace-grid-img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.mjgd-ai-workspace-grid-status-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
}
.mjgd-ai-workspace-grid-status-overlay-text {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
}
.mjgd-ai-workspace-grid-status-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: mjgd-ai-grid-status-spin 0.8s linear infinite;
}
@keyframes mjgd-ai-grid-status-spin {
  to {
    transform: rotate(360deg);
  }
}
.mjgd-ai-workspace-grid-main-tag {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  font-size: 11px;
  color: #fff;
  background: #409eff;
  padding: 2px 6px;
  border-radius: 4px;
}

.mjgd-ai-workspace-grid-checkbox-wrap {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
}
.mjgd-ai-workspace-grid-checkbox {
  box-sizing: content-box;
  /* 扩大可点区域，视觉圆框仍保持 20px */
  width: 36px;
  height: 36px;
  padding: 0 0 6px 6px;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
}
.mjgd-ai-workspace-grid-checkbox input {
  opacity: 0;
  position: absolute;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}
.mjgd-ai-workspace-grid-checkbox-custom {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.25);
  box-sizing: border-box;
  transition: background 0.15s, border-color 0.15s;
}

.mjgd-ai-workspace-grid-checkbox-custom::after {
  content: "";
  display: none;
  width: 6px;
  height: 10px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.mjgd-ai-workspace-grid-checkbox
  input:checked
  + .mjgd-ai-workspace-grid-checkbox-custom {
  background: #409eff;
  border-color: #409eff;
}
.mjgd-ai-workspace-grid-checkbox
  input:checked
  + .mjgd-ai-workspace-grid-checkbox-custom::after {
  display: block;
}

.mjgd-ai-workspace-grid-set-main {
  color: #409eff;
  font-size: 12px;
  cursor: pointer;
}
.mjgd-ai-workspace-grid-top-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 8px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.mjgd-ai-workspace-grid-compare-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
}
.mjgd-ai-workspace-grid-compare-wrap .mjgd-ai-workspace-grid-action {
  pointer-events: auto;
}
.mjgd-ai-workspace-grid-status {
  font-size: 11px;
  color: #fff;
}
.mjgd-ai-workspace-grid-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: auto;
}
.mjgd-ai-workspace-grid-action {
  padding: 6px 10px;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease,
    transform 0.2s ease;
}
.mjgd-ai-workspace-grid-action:hover {
  background: rgba(0, 0, 0, 0.55);
  transform: scale(1.1);
}
/* 下载、放大镜、删除 = 无背景，黑色线稿图标 */
.mjgd-ai-workspace-grid-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
  padding: 0;
  border-radius: 0;
  background: transparent;
  border: none;
  transition: transform 0.2s ease;
}
.mjgd-ai-workspace-grid-icon:hover {
  background: transparent;
  transform: scale(1.1);
}
.mjgd-ai-workspace-grid-icon_svg {
  color: #000;
}
/* 图一：底部遮罩 = 实心半透明深灰条 + 底部圆角 */
.mjgd-ai-workspace-grid-bottom-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 5px;
  background: rgba(255, 255, 255, 0.85);
  display: flex;
  justify-content: space-between;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.mjgd-ai-workspace-grid-item:hover .mjgd-ai-workspace-grid-bottom-bar {
  opacity: 1;
}

/* 图片对比弹窗 */
.mjgd-ai-workspace-compare-modal {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}
.mjgd-ai-workspace-compare-modal-box {
  background: #ffffff;
  border-radius: 12px;
  padding: 20px;
  width: 75vw;
  height: 80vh;
  box-sizing: border-box;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
}
.mjgd-ai-workspace-compare-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.mjgd-ai-workspace-assign-modal-title{
  color: #2563eb;
}
.mjgd-ai-workspace-compare-body {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}
.mjgd-ai-workspace-compare-side {
  flex: 1;
  min-width: 0;
  min-height: 0;
  text-align: center;
  display: flex;
  flex-direction: column;
}
.mjgd-ai-workspace-compare-label {
  font-size: 14px;
  color: #333333;
  margin-bottom: 8px;
  flex-shrink: 0;
}
.mjgd-ai-workspace-compare-img-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex: 1;
  min-height: 0;
}
.mjgd-ai-workspace-compare-side img,
.mjgd-ai-workspace-compare-side :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.mjgd-ai-workspace-compare-img-wrap :deep(.mjgd_csp_safe_img_loading.is_fill) {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}
.mjgd-ai-workspace-compare-footer {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  justify-content: flex-end;
  flex-shrink: 0;
}
.mjgd-ai-workspace-assign-modal-box {
  position: relative;
  background: #ffffff;
  border-radius: 12px;
  padding: 20px;
  width: 520px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.mjgd-ai-workspace-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
}
.mjgd-ai-workspace-modal-header .mjgd-ai-workspace-compare-title {
  margin-bottom: 0;
}
.mjgd-ai-workspace-modal-close {
  position: absolute;
  top: 0;
  right: 0;
  background: #fff !important;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 999px;
  color: rgba(17, 24, 39, 0.65);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}
.mjgd-ai-workspace-modal-close-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}
.mjgd-ai-workspace-modal-close:hover {
  background: rgba(17, 24, 39, 0.08);
  color: rgba(17, 24, 39, 0.9);
}
.mjgd-ai-workspace-modal-close:active {
  background: rgba(17, 24, 39, 0.12);
  transform: scale(0.98);
}
.mjgd-ai-workspace-modal-close:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.6);
  outline-offset: 2px;
}
.mjgd-ai-workspace-assign-modal-desc {
  font-size: 13px;
  color: #606266;
  margin-bottom: 16px;
}
.mjgd-ai-workspace-assign-mode-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.mjgd-ai-workspace-assign-mode-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 16px;
  border: 1px solid #dcdfe6;
  border-radius: 10px;
  background: #ffffff;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}
.mjgd-ai-workspace-assign-mode-card:hover {
  border-color: #409eff;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.12);
}
.mjgd-ai-workspace-assign-mode-card-danger:hover {
  border-color: #f56c6c;
  box-shadow: 0 4px 12px rgba(245, 108, 108, 0.12);
}
.mjgd-ai-workspace-assign-mode-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.mjgd-ai-workspace-assign-mode-text {
  font-size: 13px;
  line-height: 1.6;
  color: #606266;
}
.mjgd-ai-workspace-json-sync-modal-box {
  width: 720px;
}
.mjgd-ai-workspace-json-sync-desc {
  font-size: 13px;
  line-height: 1.7;
  color: #606266;
  margin-bottom: 14px;
}
.mjgd-ai-workspace-json-sync-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}
.mjgd-ai-workspace-json-sync-meta-item {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 13px;
  font-weight: 500;
}
.mjgd-ai-workspace-json-sync-mode-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.mjgd-ai-workspace-json-sync-mode-card {
  min-height: 132px;
}
.mjgd-ai-workspace-json-sync-mode-hint {
  font-size: 12px;
  color: #909399;
}

/* 添加图片弹窗 */
.mjgd-ai-workspace-add-image-modal-box {
  background: #ffffff;
  border-radius: 12px;
  padding: 20px;
  width: 800px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}
.mjgd-ai-workspace-add-image-modal-actions {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}
.mjgd-ai-workspace-add-image-modal-url-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
  margin-bottom: 12px;
}
.mjgd-ai-workspace-add-image-url-textarea {
  width: 100%;
  min-height: 72px;
  resize: vertical;
  font-size: 13px;
}
.mjgd-ai-workspace-add-image-pending {
  margin-top: 8px;
  height: 600px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #f9fafb;
}
.mjgd-ai-workspace-add-image-pending-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  color: #9ca3af;
  font-size: 14px;
}
.mjgd-ai-workspace-add-image-pending-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}
.mjgd-ai-workspace-add-image-pending-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e7eb;
}
.mjgd-ai-workspace-add-image-pending-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.mjgd-ai-workspace-add-image-pending-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mjgd-ai-workspace-add-image-pending-remove:hover {
  background: rgba(0, 0, 0, 0.8);
}

/* 大图预览弹窗 */
.mjgd-ai-workspace-preview-modal {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}
.mjgd-ai-workspace-preview-modal-box {
  position: relative;
  width: 80vh;
  height: 80vh;
  box-sizing: border-box;
  padding: 20px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}
.mjgd_ai_workspace_preview_img_wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  flex: 1;
  min-height: 0;
}
.mjgd-ai-workspace-preview-modal-img,
.mjgd_ai_workspace_preview_img_wrap :deep(img.mjgd-ai-workspace-preview-modal-img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.mjgd_ai_workspace_preview_img_wrap :deep(.mjgd_csp_safe_img_loading.is_fill) {
  width: 100%;
  height: 100%;
  border-radius: 8px;
}
.mjgd-ai-workspace-preview-close {
  flex-shrink: 0;
  border: none;
}

/* 右栏 */
.mjgd-ai-workspace-right {
  width: 360px;
  min-width: 320px;
  min-height: 0;
  border-left: 1px solid #dcdfe6;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}
.mjgd-ai-workspace-right-with-overlay {
  position: relative;
}

.mjgd-ai-workspace-right-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* 右侧面板 */
.mjgd-ai-panel {
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.mjgd-ai-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
  background: #fafafa;
}
.mjgd-ai-panel-header:hover {
  background: #f3f4f6;
}

// start 图片翻译
.mjgd_ai_img_translate_block{
  height: 46px;
  padding: 0 16px;
}
.mjgd_ai_translate_select_block{
  position: relative;
  width: 130px;
  height: 30px;
  padding: 0 30px 0 10px;
  margin: 0 auto 0 10px;
  background-color: rgb(239, 246, 255);
  border: 1px solid rgb(59, 130, 246);
  border-radius: 14px;
  color: rgb(37, 99, 235);
  font-size: 14px;
  line-height: 28px;
  cursor: pointer;
}
.mjgd_ai_translate_select_block:hover{
  background-color: #dbeafe;
  border-color: rgb(37, 99, 235);
}
.mjgd_ai_translate_select_arrow{
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  height: 14px;
  font-size: 14px;
  line-height: 14px;
}
.mjgd_ai_translate_select_option_list{
  position: absolute;
  top: 100%;
  left: 0;
  width: 140px;
  margin-top: 6px;
  background: #fff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 20;
  overflow: hidden;
}
.mjgd_ai_translate_select_option{
  height: 34px;
  padding: 0 10px;
  color: #333333;
  font-size: 14px;
  line-height: 34px;
}
.mjgd_ai_translate_select_option:hover {
  background: #eff6ff;
  color: rgb(37, 99, 235);
}
.mjgd_ai_translate_select_option.active {
  background: #eff6ff;
  color: rgb(37, 99, 235);
}
.mjgd_ai_translate_select_option_hint{
  display: flex;
  align-items: center;
  padding: 0 10px;
  background-color: #f8fafc;
  border-top: 1px solid #e2e8f0;
  color: #94a3b8;
  font-size: 12px;
}
// end 图片翻译

// start 智能消除水印
.mjgd_ai_watermark_panel_title_wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mjgd_ai_watermark_free_tag {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  height: 19px;
  font-size: 11px;
  font-weight: 600;
  line-height: 19px;
  color: #fff;
  background: linear-gradient(90deg, #f97316, #ef4444);
  border-radius: 4px;
}
.mjgd-ai-tab-btn--image-repaint {
  position: relative;
}
.mjgd-ai-tab-new-tag {
  position: absolute;
  top: -10px;
  left: -6px;
  pointer-events: none;
}
.mjgd-ai-workspace-param-group-image-repaint {
  overflow: hidden;
}
.mjgd-ai-image-repaint-points-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}
.mjgd-ai-image-repaint-points-hint b {
  color: #409eff;
}
.mjgd-ai-image-repaint-select {
  display: block;
  width: 100%;
  box-sizing: border-box;
  height: 32px;
  padding: 0 30px 0 15px;
  border-radius: 4px;
  line-height: 30px;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'%3E%3Cpath fill='%23c0c4cc' d='M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6l341.696 339.2a32 32 0 0 0 42.752 0l341.696-339.2a29.12 29.12 0 0 0 0-41.6 30.592 30.592 0 0 0-42.752 0z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 14px 14px;
}
.mjgd-ai-image-repaint-select:hover:not(:disabled) {
  border-color: #93c5fd;
}
.mjgd-ai-image-repaint-select:focus:not(:disabled) {
  border-color: #3b82f6;
  outline: none;
}
.mjgd-ai-image-repaint-select:disabled {
  background-color: #f5f7fa;
  color: #c0c4cc;
  cursor: not-allowed;
}
.mjgd-ai-param-help-pop {
  position: fixed;
  transform: translate(-50%, calc(-100% - 8px));
  z-index: 2147483000;
  min-width: 180px;
  max-width: 260px;
  padding: 8px 10px;
  border-radius: 4px;
  background: #303133;
  color: #fff;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  white-space: normal;
  text-align: left;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  pointer-events: none;
}
.mjgd-ai-param-help-pop::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: #303133;
}
.btn-fill-prompt {
  height: 22px;
  padding: 0 8px;
  margin-left: 8px;
  border: 1px solid #c7d2fe;
  border-radius: 4px;
  background: #eef2ff;
  color: #6366f1;
  font-size: 11px;
  line-height: 20px;
  cursor: pointer;
  white-space: nowrap;
  transition: 0.15s;
}
.btn-fill-prompt:hover {
  background: #e0e7ff;
  border-color: #a5b4fc;
}
.mjgd_ai_watermark_panel_body_row {
  justify-content: space-between;
  width: 100%;
}
.mjgd_ai_watermark_selected_hint {
  font-size: 13px;
  color: #6b7280;
}
// end 智能消除水印

.mjgd-ai-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}
.mjgd-ai-panel-collapse {
  font-size: 12px;
  color: #6b7280;
}
.mjgd-ai-panel-body {
  padding: 12px 16px;
  background: #fff;
}
.mjgd-ai-panel-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.mjgd-ai-panel-row .mjgd-ai-panel-label {
  flex-shrink: 0;
}
.mjgd-ai-panel-label {
  font-size: 13px;
  color: #374151;
}
.mjgd-ai-panel-select {
  flex: 1;
  min-width: 120px;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  font-size: 13px;
}
.mjgd-ai-panel-action {
  flex-shrink: 0;
}
.mjgd-ai-panel-row-action {
  margin-top: 12px;
}
.mjgd-ai-radio-capsules {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}
.mjgd-ai-radio-capsule {
  display: inline-flex;
  align-items: center;
  padding: 4px 6px;
  border-radius: 20px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: 12px;
  color: #6b7280;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s, color 0.2s;
}
.mjgd-ai-radio-capsule input {
  margin-right: 6px;
}
.mjgd-ai-radio-capsule.active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #2563eb;
}
.mjgd-ai-panel-tabs {
  display: flex;
  height: 36px;
  margin-bottom: 12px;
}
.mjgd-ai-tab-btn {
  flex: 1;
  border: 1px solid #e5e7eb;
  margin-left: -1px;
  background: #fff;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}
.mjgd-ai-panel-tabs .mjgd-ai-tab-btn:first-child {
  margin-left: 0;
  border-radius: 6px 0 0 6px;
}
.mjgd-ai-panel-tabs .mjgd-ai-tab-btn:last-child {
  border-radius: 0 6px 6px 0;
}
.mjgd-ai-panel-tabs .mjgd-ai-tab-btn:only-child {
  border-radius: 6px;
}
.mjgd-ai-tab-btn.active {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
  z-index: 1;
}
.mjgd-ai-workspace-params-embed {
  margin-top: 0;
  border: none;
  box-shadow: none;
}
.mjgd-ai-workspace-params-embed .mjgd-ai-workspace-params-body {
  padding: 0;
}

/* 智能日志遮罩：执行时覆盖参数区，高不透明度白底以保证日志可读 */
.mjgd-ai-workspace-log-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.94);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}
.mjgd_ai_workshop_log_cancel_btn {
  position: absolute;
  right: 24px;
  bottom: 20px;
  z-index: 11;
  min-width: 72px;
  border-color: #9ca3af;
  color: #1f2937;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.mjgd-ai-workspace-log-overlay .mjgd-ai-log-overlay-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  margin: 12px;
}
.mjgd-ai-workspace-log-overlay .mjgd-ai-data-header {
  background: #f3f4f6;
  border-bottom: 1px solid #d1d5db;
}
.mjgd-ai-workspace-log-overlay .mjgd-ai-data-title {
  color: #111827;
}
.mjgd-ai-workspace-log-overlay .mjgd-ai-logs-container {
  background: #f3f4f6;
  color: #111827;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.mjgd-ai-workspace-log-overlay .mjgd-ai-logs-container::-webkit-scrollbar {
  width: 6px;
}
.mjgd-ai-workspace-log-overlay .mjgd-ai-logs-container::-webkit-scrollbar-track {
  background-color: #e5e7eb;
  border-radius: 3px;
}
.mjgd-ai-workspace-log-overlay .mjgd-ai-logs-container::-webkit-scrollbar-thumb {
  background-color: #9ca3af;
  border-radius: 3px;
}
.mjgd-ai-workspace-log-overlay .mjgd-ai-logs-container::-webkit-scrollbar-thumb:hover {
  background-color: #6b7280;
}
/* 遮罩内日志视口使用浅色主题，避免沿用暗色主题的浅灰字导致对比不足 */
.mjgd-ai-workspace-log-overlay .mjgd_ai_image_queue_log_viewport {
  box-sizing: border-box;
  color: #111827;
  background: #f9fafb;
  &::-webkit-scrollbar-track {
    background-color: #e5e7eb;
  }
  &::-webkit-scrollbar-thumb {
    background-color: #9ca3af;
    &:hover {
      background-color: #6b7280;
    }
  }
}

.mjgd-ai-workspace-log.mjgd-ai-data-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: none;
  border-radius: 0;
  min-height: 300px;
}

.mjgd-ai-data-header {
  padding: 14px 16px;
  background: #1e2939;
  border-bottom: 1px solid #364153;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.mjgd-ai-data-title {
  font-size: 14px;
  font-weight: 600;
  color: #e5e7eb;
}
.mjgd-ai-workspace-btn-text {
  padding: 4px 8px;
  font-size: 12px;
  color: #9ca3af;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 4px;
  &:hover {
    color: #e5e7eb;
  }
}
.mjgd-ai-logs-container {
  flex: 1;
  overflow: hidden;
  font-family: "Monaco", "Menlo", "Consolas", monospace;
  font-size: 12px;
  line-height: 1.6;
  min-height: 0;
  position: relative;
  background: #1f2937;
}
.mjgd_ai_image_queue_log_viewport {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px;
  color: #d1d5db;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: anywhere;
  user-select: text;
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background-color: #374151;
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: #4b5563;
    border-radius: 3px;
    &:hover {
      background-color: #6b7280;
    }
  }
}
</style>

<!-- 日志行由 JS 动态插入，scoped 无法命中子节点，单独非 scoped 块 -->
<style lang="scss">
.mjgd_ai_image_queue_log_viewport .mjgd-ai-log-item {
  display: flex;
  margin-bottom: 4px;
  transition: background-color 0.2s ease;
}
.mjgd_ai_image_queue_log_viewport .mjgd-ai-log-time,
.mjgd_ai_image_queue_log_viewport .mjgd-ai-log-level {
  color: #9ca3af;
  margin-right: 4px;
  flex-shrink: 0;
}
.mjgd_ai_image_queue_log_viewport .mjgd-ai-log-content {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  color: #6babfa;
}
.mjgd_ai_image_queue_log_viewport .mjgd-ai-log-item.mjgd-ai-log-success .mjgd-ai-log-content {
  color: #5ed9b1;
}
.mjgd_ai_image_queue_log_viewport .mjgd-ai-log-item.mjgd-ai-log-warning .mjgd-ai-log-content {
  color: #fbbf24;
}
.mjgd_ai_image_queue_log_viewport .mjgd-ai-log-item.mjgd-ai-log-error .mjgd-ai-log-content {
  color: #f87171;
}
.mjgd-ai-workspace-log-overlay .mjgd_ai_image_queue_log_viewport .mjgd-ai-log-time,
.mjgd-ai-workspace-log-overlay .mjgd_ai_image_queue_log_viewport .mjgd-ai-log-level {
  color: #6b7280;
}
.mjgd-ai-workspace-log-overlay .mjgd_ai_image_queue_log_viewport .mjgd-ai-log-content {
  color: #6babfa;
}
.mjgd-ai-workspace-log-overlay .mjgd_ai_image_queue_log_viewport .mjgd-ai-log-item.mjgd-ai-log-success .mjgd-ai-log-content {
  color: #5ed9b1;
}
.mjgd-ai-workspace-log-overlay .mjgd_ai_image_queue_log_viewport .mjgd-ai-log-item.mjgd-ai-log-warning .mjgd-ai-log-content {
  color: #fbbf24;
}
.mjgd-ai-workspace-log-overlay .mjgd_ai_image_queue_log_viewport .mjgd-ai-log-item.mjgd-ai-log-error .mjgd-ai-log-content {
  color: #f87171;
}
.mjgd_ai_image_queue_log_viewport .mjgd_ai_log_stream_block {
  margin-top: 4px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.mjgd_ai_image_queue_log_viewport .mjgd_ai_log_stream_text {
  margin: 0;
  padding: 4px 8px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: #6babfa;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-wrap: anywhere;
  overflow-x: hidden;
}
.mjgd-ai-workspace-log-overlay .mjgd_ai_image_queue_log_viewport .mjgd_ai_log_stream_text {
  color: #6babfa;
}
.mjgd-ai-log-content--generating {
  display: inline-block;
  animation: mjgd-ai-log-generating-bounce 1.8s ease-in-out infinite;
}
@keyframes mjgd-ai-log-generating-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}
</style>

<style scoped lang="scss">
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
  min-height: 200px;
}

/* 参数设置 */
.mjgd-ai-workspace-params {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mjgd-ai-workspace-params-header {
  padding: 12px 16px;
}
.mjgd-ai-workspace-params-title {
  font-size: 14px;
  font-weight: 600;
  color: #606266;
}

.mjgd-ai-workspace-params-body {
  flex: 1;
  overflow-y: auto;
}

/* 三个功能卡片：单独容器，白底圆角阴影，块间细分割线 */
.mjgd-ai-workspace-param-cards {
  display: flex;
  flex-direction: column;
  background: #f5f6f8;
  overflow: hidden;
  padding: 10px;
}
.mjgd-ai-workspace-param-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  margin: 0;
  background: #ffffff;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: box-shadow 0.2s ease;
}
.mjgd-ai-workspace-param-card.is-selected {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 0 0 2px #409eff;
}

.mjgd-ai-workspace-param-card-icon {
  flex-shrink: 0;
  width: 35px;
  height: 35px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid currentColor;
}
.mjgd-ai-workspace-param-card-icon-blue {
  color: #7eb8f0;
  background: rgba(126, 184, 240, 0.12);
}
.mjgd-ai-workspace-param-card-icon-green {
  color: #85c88a;
  background: rgba(133, 200, 138, 0.12);
}
.mjgd-ai-workspace-param-card-icon-orange {
  color: #e8b86d;
  background: rgba(232, 184, 109, 0.12);
}
.mjgd-ai-workspace-param-card-content {
  flex: 1;
  min-width: 0;
}
.mjgd-ai-workspace-param-card .mjgd-ai-workspace-param-block-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.mjgd-ai-workspace-param-card .mjgd-ai-workspace-param-desc {
  font-size: 12px;
  color: #909399;
  margin-bottom: 0;
  line-height: 1.5;
}

/* 所有带字数统计的 textarea 外层需 relative，以便右下角字数绝对定位 */
.mjgd-ai-workspace-param-textarea-wrap {
  position: relative;
}
.mjgd-ai-workspace-param-textarea {
  width: 100%;
  padding: 12px 14px 28px;
  border: 1px solid #dcdfe6;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: #606266;
  background: #ffffff;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  // 字体之间的间距
  letter-spacing: 0.06em;
}
.mjgd-ai-workspace-param-textarea::placeholder {
  color: #c0c4cc;
}
.mjgd-ai-workspace-param-count-textarea {
  position: absolute;
  right: 12px;
  bottom: 8px;
  font-size: 12px;
  color: #909399;
}

.mjgd-ai-workspace-param-block {
  margin-bottom: 20px;
}

.mjgd-ai-workspace-param-block:last-child {
  margin-bottom: 0;
}

.mjgd-ai-workspace-param-block-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 6px;
}
.upgrade-tip {
  font-size: 12px;
  color: #f59e0b;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 4px;
  padding: 4px 8px;
  margin-bottom: 6px;
}
.mjgd-ai-workspace-param-desc {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}
.mjgd-ai-workspace-param-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 6px;
  box-sizing: border-box;
}
.mjgd-ai-workspace-param-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}
.mjgd-ai-workspace-param-tag {
  padding: 4px 10px;
  font-size: 12px;
  background: #f5f7fa;
  border-radius: 6px;
  cursor: pointer;
  color: #606266;
}
.mjgd-ai-workspace-param-tag:hover {
  background: #e4e7eb;
}
/* 图二：参考词标签 浅蓝描边+浅蓝字+白底 */
.mjgd-ai-workspace-param-tag-label {
  font-size: 12px;
  color: #909399;
  flex-basis: 100%;
  margin-bottom: 4px;
}
.mjgd-ai-workspace-param-tag-ref {
  background: #ffffff;
  border: 1px solid #7eb8f0;
  color: #409eff;
}
.mjgd-ai-workspace-param-tag-ref:hover {
  background: #ecf5ff;
}
/* 图三：参考词选中态 红框红字 */
.mjgd-ai-workspace-param-tag-ref.is-selected {
  border-color: #f56c6c;
  color: #f56c6c;
  background: #ffffff;
}
.mjgd-ai-workspace-param-tag-ref.is-selected:hover {
  background: #fef0f0;
}
.mjgd-ai-workspace-param-count {
  font-size: 11px;
  color: #909399;
}
/* 预设参数/自定义提示词：胶囊分段，选中白底蓝字蓝边，未选浅灰底灰字 */
.mjgd-ai-workspace-param-tabs-wrap {
  display: flex;
  justify-content: center;
  margin: 20px 0;
}
.mjgd-ai-workspace-param-tabs {
  display: inline-flex;
  align-items: stretch;
  background: #f5f7fa;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  padding: 4px;
}
.mjgd-ai-workspace-param-tabs button {
  margin: 0;
  padding: 6px 16px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  background: #f5f7fa;
  color: #606266;
  transition: background 0.2s ease, color 0.2s ease;
  border-radius: 10px;
}
.mjgd-ai-workspace-param-tabs button.active {
  background: #ffffff;
  color: #366ef4;
}
/* 模特换脸：自定义提示词选中时绿色（图一） */
.mjgd-ai-workspace-param-tabs--face-swap button.active {
  background: #22c55e;
  color: #ffffff;
}
/* 产品模特图：自定义提示词选中时橙色（图二） */
.mjgd-ai-workspace-param-tabs--model-gen button.active {
  background: #f97316;
  color: #ffffff;
}
.mjgd-ai-workspace-param-block-title .mjgd-ai-workspace-param-help {
  width: 15px;
  height: 15px;
  border: 1px solid #b8c4d6;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 10px;
  flex-shrink: 0;
  cursor: help;
  margin-left: 4px;
  line-height: 1;
}
.mjgd-ai-workspace-params-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #dcdfe6;
}

.mjgd_ai_translate_panel_action_row {
  justify-content: space-between;
  width: 100%;
}
.mjgd_ai_translate_panel_action_row .mjgd-ai-points-quota {
  width: auto;
  flex: 0 1 auto;
}
.mjgd_ai_translate_start_btn {
  margin-left: auto;
  flex-shrink: 0;
}
.mjgd-ai-points-quota {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #334155;
  background: #f8fafc;
  border-radius: 8px;
  padding: 6px 10px;
  width: 100%;
}

.mjgd-ai-points-quota-label {
  white-space: nowrap;
}

.mjgd-ai-points-quota-value {
  font-weight: 600;
  color: #F56C6C;
  white-space: nowrap;
}

.mjgd-ai-points-refresh-btn {
  border: none;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) {
    color: #1d4ed8;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.mjgd-ai-points-refresh-icon {
  font-size: 14px;
  line-height: 1;
  font-style: normal;
}

.mjgd-ai-points-refresh-icon.is-loading {
  animation: rotate 1s linear infinite;
}

.mjgd-ai-points-recharge-btn {
  flex: 1;
  text-align: right;
  border: none;
  background: transparent;
  color: #2563eb;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  margin-left: auto;

  &:hover {
    color: #1d4ed8;
    text-decoration: underline;
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
