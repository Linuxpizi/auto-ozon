<template>
  <div class="container">
    <div class="card">
      <div class="page-header">
        <n-h2 class="page-title" style="margin: 0">选品中心</n-h2>
        <n-space>
          <n-popconfirm @positive-click="batchDeleteProducts">
            <template #trigger>
              <n-button size="small" type="error" :disabled="selectedKeys.length === 0">
                批量删除 ({{ selectedKeys.length }})
              </n-button>
            </template>
            确定删除选中的 {{ selectedKeys.length }} 个商品?
          </n-popconfirm>
          <n-button size="small" @click="loadProducts" :loading="loading">刷新</n-button>
        </n-space>
      </div>

      <!-- ━━━ 筛选栏 ━━━ -->
      <div class="filter-bar">
        <div class="filter-row">
          <div class="filter-group">
            <n-input v-model:value="keyword" placeholder="搜索商品名称/品牌" clearable size="small" style="width: 220px"
              @keyup.enter="loadProducts" @clear="loadProducts" />
            <n-select v-model:value="filterPlatform" :options="platformOptions" placeholder="平台" clearable size="small"
              style="width: 120px" @update:value="loadProducts" />
            <n-input-number v-model:value="minRating" placeholder="最低评分" :min="0" :max="5" :step="0.1" size="small"
              style="width: 110px" @update:value="loadProducts" />
          </div>
          <div class="filter-group filter-actions">
            <n-button size="small" @click="filterExpanded = !filterExpanded">
              {{ filterExpanded ? '收起筛选 ▴' : '更多筛选 ▾' }}
            </n-button>
            <n-button size="small" @click="resetFilters">重置</n-button>
          </div>
        </div>
        <!-- 高级筛选 -->
        <div v-if="filterExpanded" class="filter-row filter-advanced">
          <div class="filter-group">
            <n-input v-model:value="filterBrand" placeholder="品牌" clearable size="small" style="width: 140px"
              @keyup.enter="loadProducts" @clear="loadProducts" />
            <n-input v-model:value="filterCategory" placeholder="分类" clearable size="small" style="width: 140px"
              @keyup.enter="loadProducts" @clear="loadProducts" />
            <n-input-number v-model:value="minPrice" placeholder="最低价" :min="0" size="small" style="width: 100px"
              @update:value="loadProducts" />
            <n-input-number v-model:value="maxPrice" placeholder="最高价" :min="0" size="small" style="width: 100px"
              @update:value="loadProducts" />
            <n-input-number v-model:value="minReviews" placeholder="最低评论" :min="0" size="small" style="width: 100px"
              @update:value="loadProducts" />
          </div>
          <div class="filter-group">
            <n-date-picker v-model:value="dateRange" type="daterange" clearable size="small" style="width: 240px"
              @update:value="loadProducts" />
          </div>
        </div>
      </div>

      <!-- 统计 -->
      <div class="table-info">
        共 <strong>{{ totalCount }}</strong> 个商品
        <span v-if="keyword"> · 关键词: {{ keyword }}</span>
        <span v-if="filterPlatform"> · 平台: {{ filterPlatform }}</span>
        <span v-if="filterBrand"> · 品牌: {{ filterBrand }}</span>
      </div>

      <!-- 数据表格 -->
      <n-data-table :columns="columns" :data="products" :row-key="(r: any) => r.id" :checked-row-keys="selectedKeys"
        @update:checked-row-keys="handleCheck" :pagination="false" :loading="loading" size="small" striped
        :scroll-x="1000" />

      <!-- 分页 -->
      <div class="pagination-wrap">
        <n-pagination v-model:page="currentPage" v-model:page-size="pageSize" :item-count="totalCount"
          :page-sizes="[20, 50, 100]" show-size-picker @update:page="loadProducts"
          @update:page-size="onPageSizeChange" />
      </div>
    </div>

    <!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         编辑抽屉 — 单栏编辑面板
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
    <n-drawer v-model:show="drawerVisible" :width="920" placement="right" :closable="true" :mask-closable="true"
      :theme-overrides="drawerThemeOverrides">
      <n-drawer-content :native-scrollbar="false" closable>
        <template #header>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:15px; font-weight:600;">编辑商品</span>
            <n-tag v-if="editProduct" size="small" :bordered="false"
              :type="editProduct.platform === '1688' ? 'info' : 'success'">
              {{ editProduct.platform }}
            </n-tag>
            <n-tag v-if="hasChanges" size="small" type="warning" :bordered="false">已修改</n-tag>
          </div>
        </template>

        <div v-if="editProduct" class="edit-drawer-body">
          <div class="panel-right">
            <div class="panel-title">商品数据</div>

            <!-- 基础信息 -->
            <div class="section-block">
              <div class="section-label">基础信息</div>
              <n-grid :cols="2" :x-gap="8">
                <n-gi>
                  <div class="field-label">品牌</div>
                  <n-input v-model:value="editProduct.brand" size="small" placeholder="品牌" />
                </n-gi>
                <n-gi>
                  <div class="field-label">分类</div>
                  <n-input v-model:value="editProduct.category" size="small" placeholder="分类" />
                </n-gi>
              </n-grid>
              <div class="field-label" style="margin-top: 8px">上架标签</div>
              <n-dynamic-tags v-model:value="editProduct.tags" />
            </div>

            <!-- 店铺与 Ozon 分类 -->
            <div class="section-block">
              <div class="section-label category-section-heading">
                <span>🏪 店铺与 Ozon 分类</span>
                <n-button size="tiny" type="primary" secondary :loading="categorySyncing"
                  :disabled="!editProduct.store_id" @click="syncCategoryTree">
                  同步中文分类
                </n-button>
              </div>
              <n-grid :cols="1" :x-gap="8">
                <n-gi>
                  <div class="field-label">Ozon 店铺</div>
                  <n-select v-model:value="editProduct.store_id" :options="storeOptions" placeholder="选择店铺" size="small"
                    clearable @update:value="onEditStoreChange" />
                  <div class="category-selection-hint">浏览本地分类无需店铺；只有从 Ozon 同步分类时才使用所选店铺凭证。</div>
                </n-gi>
                <n-gi style="margin-top:8px">
                  <div class="field-label category-field-heading">
                    <span>商品分类（本地中文库）</span>
                    <span class="category-snapshot-meta">
                      {{ categorySnapshotCount }} 个节点
                      <template v-if="categorySyncedAt"> · {{ formatCategorySyncedAt(categorySyncedAt) }}</template>
                    </span>
                  </div>
                  <n-popover trigger="click" placement="bottom-start" :show="editCategoryPopoverShow"
                    @update:show="(v: boolean) => editCategoryPopoverShow = v" raw :style="{ width: '420px' }">
                    <template #trigger>
                      <n-input :value="editSelectedCategoryLabel" placeholder="点击选择本地 Ozon 中文分类" readonly
                        :loading="categoryLoading" size="small" style="cursor: pointer">
                        <template #suffix>
                          <n-icon v-if="editSelectedCategoryLabel" @click.stop="clearEditCategorySelection"
                            style="cursor: pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14"
                              height="14">
                              <path
                                d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
                            </svg>
                          </n-icon>
                        </template>
                      </n-input>
                    </template>
                    <div
                      style="background: var(--n-color); border-radius: 8px; box-shadow: 0 6px 16px rgba(0,0,0,.12); overflow: hidden;">
                      <div style="padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,.06);">
                        <n-input v-model:value="editCategorySearchPattern" placeholder="🔍 搜索分类..." clearable
                          size="small" />
                      </div>
                      <div class="category-selected-card" :class="{ 'is-empty': !editSelectedCategoryLabel }">
                        <template v-if="editSelectedCategoryLabel">
                          <div class="category-selected-card__head">✅ 当前已选分类</div>
                          <div class="category-selected-card__path">{{ editSelectedCategoryLabel }}</div>
                          <div class="category-selected-card__meta">
                            <n-tag size="tiny" type="success" :bordered="false">
                              Category ID: {{ editProduct.description_category_id || '—' }}
                            </n-tag>
                            <n-tag size="tiny" type="info" :bordered="false">
                              Type ID: {{ editProduct.type_id || '—' }}
                            </n-tag>
                          </div>
                        </template>
                        <template v-else>
                          点击下方分类节点后，这里会显示当前已选分类
                        </template>
                      </div>
                      <div v-if="categoryTreeNodes.length" style="height: 360px; overflow-y: auto; padding: 4px 0;">
                        <n-tree :data="categoryTreeNodes" :selected-keys="editSelectedCategoryKeys"
                          :expanded-keys="expandedCategoryKeys" :cascade="false"
                          :pattern="editCategorySearchPattern || undefined" :filter="filterCategoryTree"
                          @update:selected-keys="onCategoryTreeSelect" @update:expanded-keys="onCategoryTreeExpand" />
                      </div>
                      <n-empty v-else description="本地暂无 Ozon 中文分类" style="padding: 48px 16px;">
                        <template #extra>
                          <n-button size="small" type="primary" :loading="categorySyncing"
                            :disabled="!editProduct.store_id" @click="syncCategoryTree">
                            选择店铺后同步
                          </n-button>
                        </template>
                      </n-empty>
                    </div>
                  </n-popover>
                  <div v-if="editSelectedCategoryLabel" class="category-selection-summary">
                    <span class="category-selection-summary__label">已选</span>
                    <span class="category-selection-summary__path">{{ editSelectedCategoryLabel }}</span>
                    <n-tag size="tiny" type="success" :bordered="false">
                      Category ID: {{ editProduct.description_category_id || '—' }}
                    </n-tag>
                    <n-tag size="tiny" type="info" :bordered="false">
                      Type ID: {{ editProduct.type_id || '—' }}
                    </n-tag>
                  </div>
                  <div v-else class="category-selection-hint">
                    未选择分类，点击输入框后在分类树中选择
                  </div>
                </n-gi>
              </n-grid>
            </div>

            <!-- 采集 variants 与可编辑 sku_list 按 SKU 身份统一呈现 -->
            <div class="section-block sku-editor-section">
              <div class="section-label">
                <span>SKU 变体</span>
                <n-tag size="tiny" type="success" :bordered="false">{{ skuEditorRows.length }} 个 SKU</n-tag>
              </div>
              <div class="sku-editor-hint">
                左侧选择 SKU，右侧编辑该 SKU 的标题、条码、上架价格和库存。采集图集、视频及价格事实只读。
              </div>

              <div v-if="skuEditorRows.length" class="sku-editor-content">
                <div class="sku-selector-list" role="tablist" aria-label="SKU 列表">
                  <button v-for="item in skuEditorRows" :key="item.key" type="button" role="tab"
                    class="sku-selector-item" :class="{ 'sku-selector-item--active': activeSkuKey === item.key }"
                    :aria-selected="activeSkuKey === item.key" @click="selectedSkuKey = item.key">
                    <img v-if="item.variant?.images?.[0]" :src="item.variant.images[0]" alt="" />
                    <span v-else class="sku-selector-item__placeholder">SKU</span>
                    <span class="sku-selector-item__content">
                      <strong>{{ item.variant?.sku || item.row.sku || '待填写 SKU' }}</strong>
                      <small>{{ item.row.name || (item.variant ? '采集 SKU' : '人工 SKU') }}</small>
                    </span>
                    <span class="sku-selector-item__status" :class="{ 'is-manual': !item.variant }">
                      {{ item.variant ? '采集' : '人工' }}
                    </span>
                  </button>
                </div>

                <div v-for="item in selectedSkuEditorRows" :key="item.key" class="sku-editor-card"
                  :class="{ 'sku-editor-card--collected': item.variant }">
                  <div class="sku-editor-card__header">
                    <div class="sku-editor-card__identity">
                      <div class="sku-editor-card__eyebrow">SKU</div>
                      <strong>{{ item.variant?.sku || item.row.sku || '待填写 SKU' }}</strong>
                      <span v-if="item.row.name">{{ item.row.name }}</span>
                    </div>
                    <n-tag v-if="item.variant" size="tiny" type="success" :bordered="false">采集 SKU</n-tag>
                    <n-tag v-else size="tiny" type="info" :bordered="false">人工 SKU</n-tag>
                    <n-button v-if="!item.variant" size="tiny" quaternary type="error"
                      @click="removeSku(item.row)">删除</n-button>
                  </div>

                  <div class="sku-subsection-heading sku-subsection-heading--editable">
                    <div class="sku-subsection-title">SKU 标题</div>
                    <div class="section-actions">
                      <n-button size="tiny" quaternary :loading="aiTextLoading"
                        @click="handleAiTranslateSkuTitle(item.row)">🌐 翻译</n-button>
                      <n-button size="tiny" quaternary :loading="aiTextLoading"
                        @click="handleAiOptimizeSkuTitle(item.row)">✨ AI优化</n-button>
                    </div>
                  </div>
                  <div class="sku-editor-field sku-editor-field--wide">
                    <div class="field-label">上架标题</div>
                    <n-input v-model:value="item.row.name" type="textarea" :rows="2"
                      placeholder="请输入当前 SKU 的上架标题" />
                  </div>

                  <section class="sku-editable-images">
                    <div class="sku-subsection-heading">
                      <div class="sku-subsection-title">当前 SKU 上架图片</div>
                      <n-tag size="tiny" type="info" :bordered="false">SKU 独立保存</n-tag>
                    </div>
                    <div class="sku-editor-card__hint">
                      删除和新增只影响当前 SKU；编辑某个图片 URL 时，会同步更新其他 SKU 对同一原图的引用。
                    </div>
                    <div class="sku-image-toolbar">
                      <n-button size="tiny" quaternary :loading="aiImageBatchLoading"
                        :disabled="!item.row.images?.length" @click="handleAiOptimizeImages(item.row)">✨ AI 优化全部</n-button>
                      <n-button size="tiny" quaternary type="primary" :loading="aiImageGenerateLoading"
                        @click="handleAiGenerateImages(item.row)">🎨 AI 生成图片</n-button>
                    </div>
                    <div class="image-manager">
                      <div v-for="(img, idx) in (item.row.images || [])" :key="`${img}-${idx}`" class="image-card">
                        <n-image :src="img" width="80" height="80" object-fit="cover" preview-disabled
                          class="gallery-img" />
                        <div class="image-actions">
                          <n-button size="tiny" quaternary type="primary" :loading="aiImageLoading === img"
                            @click="handleAiOptimizeImage(item.row, img)">✨</n-button>
                          <n-button size="tiny" quaternary type="info" @click="openEditor(item.row, idx)">✏️</n-button>
                          <n-button size="tiny" quaternary type="error" @click="removeImage(item.row, idx)">✕</n-button>
                        </div>
                        <span v-if="idx === 0" class="main-badge">主图</span>
                      </div>
                      <button type="button" class="image-card image-add" @click="triggerImageUpload">
                        <span class="image-add__icon">+</span>
                        <span>添加图片</span>
                      </button>
                    </div>
                    <input ref="imageUploadRef" type="file" accept="image/*" multiple class="image-upload-input"
                      @change="handleImageUpload" />
                  </section>

                  <section v-if="item.variant" class="sku-facts">
                    <div class="sku-subsection-heading">
                      <div class="sku-subsection-title">当前 SKU 采集图片</div>
                      <n-tag size="tiny" :bordered="false">采集事实 · 只读</n-tag>
                    </div>
                    <div v-if="item.variant.images?.length" class="sku-media-grid">
                      <n-image v-for="(image, imageIndex) in item.variant.images" :key="`${image}-${imageIndex}`"
                        :src="image" width="72" height="72" object-fit="cover" class="sku-editor-card__image" />
                    </div>
                    <div v-else class="sku-editor-card__empty">当前 SKU 未采集到商品图片</div>
                    <div v-if="item.variant.videoUrls?.length" class="sku-video-grid">
                      <video v-for="(video, videoIndex) in item.variant.videoUrls" :key="`${video}-${videoIndex}`"
                        :src="video" controls preload="metadata" />
                    </div>

                    <div class="sku-subsection-title">其他采集事实</div>
                    <div class="sku-fact-grid">
                      <div v-if="item.variant.stock !== undefined"><span>库存</span><strong>{{ item.variant.stock }}</strong></div>
                      <div v-if="item.variant.weight !== undefined"><span>重量</span><strong>{{ item.variant.weight }} g</strong></div>
                      <div v-if="item.variant.depth !== undefined"><span>长</span><strong>{{ item.variant.depth }} mm</strong></div>
                      <div v-if="item.variant.width !== undefined"><span>宽</span><strong>{{ item.variant.width }} mm</strong></div>
                      <div v-if="item.variant.height !== undefined"><span>高</span><strong>{{ item.variant.height }} mm</strong></div>
                    </div>
                    <div v-if="variantValueEntries(item.variant).length" class="variant-values sku-editor-card__values">
                      <n-tag v-for="entry in variantValueEntries(item.variant)" :key="entry.key" size="small" type="info"
                        :bordered="false">{{ entry.name }}：{{ entry.value }}</n-tag>
                    </div>
                    <div v-if="variantIdentityEntries(item.variant).length" class="sku-identifiers">
                      <div v-for="entry in variantIdentityEntries(item.variant)" :key="entry.label">
                        <span>{{ entry.label }}</span><code>{{ entry.value }}</code>
                      </div>
                    </div>
                    <div v-if="supplierFactEntries(item.variant).length" class="sku-supplier-facts">
                      <n-collapse arrow-placement="right">
                        <n-collapse-item title="其他采集属性" name="supplier-facts">
                          <div v-for="entry in supplierFactEntries(item.variant)" :key="entry.key" class="sku-supplier-fact">
                            <span>{{ entry.name }}</span><strong>{{ entry.value }}</strong>
                          </div>
                        </n-collapse-item>
                      </n-collapse>
                    </div>
                    <div v-if="item.variant.sourcePath || item.variant.sourceUrl" class="sku-editor-card__source">
                      <span v-if="item.variant.sourcePath">采集来源：{{ item.variant.sourcePath }}</span>
                      <a v-if="item.variant.sourceUrl" :href="item.variant.sourceUrl" target="_blank" rel="noopener noreferrer">查看 SKU 来源页</a>
                    </div>
                  </section>
                  <div v-else class="sku-editor-card__empty sku-editor-card__empty--manual">
                    该人工 SKU 暂无采集图集、视频、采集价格和促销事实。
                  </div>

                  <div class="sku-subsection-title sku-subsection-title--editable">价格与促销</div>
                  <div class="sku-pricing-grid">
                    <div class="sku-editor-field">
                      <div class="field-label">上架价格（{{ _currencySymbol(editProduct.currency) }}）</div>
                      <n-input-number v-model:value="item.row.price" size="small" :min="0" :precision="2"
                        placeholder="未设置" style="width:100%" />
                    </div>
                    <div v-if="item.variant?.price !== undefined" class="sku-readonly-field">
                      <span>采集当前价</span>
                      <strong>{{ formatVariantMoney(item.variant.price) }}</strong>
                    </div>
                    <div v-if="item.variant?.oldPrice !== undefined" class="sku-readonly-field">
                      <span>采集原价 / 促销参考</span>
                      <strong>{{ formatVariantMoney(item.variant.oldPrice) }}</strong>
                    </div>
                  </div>
                  <div v-if="item.variant" class="sku-editor-card__hint">
                    采集价格与促销信息仅供参考；保存时只更新当前 SKU 的上架价格。
                  </div>

                  <div class="sku-subsection-title sku-subsection-title--editable">上架数据</div>
                  <div class="sku-editor-fields">
                    <div class="sku-editor-field">
                      <div class="field-label">SKU 编码</div>
                      <n-input v-model:value="item.row.sku" size="small" placeholder="请输入 SKU"
                        :disabled="Boolean(item.variant)" />
                    </div>
                    <div class="sku-editor-field">
                      <div class="field-label">条码</div>
                      <n-input v-model:value="item.row.barcode" size="small" placeholder="未设置" />
                    </div>
                    <div class="sku-editor-field">
                      <div class="field-label">库存</div>
                      <n-input-number v-model:value="item.row.stock" size="small" :min="0" :precision="0"
                        placeholder="未设置" style="width:100%" />
                    </div>
                  </div>
                </div>
              </div>
              <div v-else class="sku-editor-empty">暂无 SKU，点击下方按钮添加</div>
              <n-button size="small" dashed block class="sku-add-button" @click="addSku">+ 添加人工 SKU</n-button>
            </div>

            <!-- 描述 -->
            <div class="section-block">
              <div class="section-label">
                商品描述
                <div class="section-actions">
                  <n-button size="tiny" quaternary @click="handleAiTranslate">🌐 翻译</n-button>
                  <n-button size="tiny" quaternary @click="handleAiOptimize">✨ AI优化</n-button>
                </div>
              </div>
              <n-input v-model:value="editProduct.description" type="textarea" :rows="4" placeholder="商品描述" />
            </div>

            <!-- ━━━ 1688找同款 ━━━ -->
            <div class="section-block">
              <div class="section-label">
                🔗 1688 同款
                <div class="section-actions">
                  <n-button size="tiny" quaternary type="warning" :loading="extract1688Loading"
                    @click="handleExtract1688Specs" :disabled="!editProduct?.source_url?.includes('1688')">📥
                    提取参数</n-button>
                  <n-button size="tiny" type="primary" @click="showSearch1688Modal" :loading="search1688Loading">🔍
                    搜索同款</n-button>
                </div>
              </div>
              <div class="empty-hint">
                <span v-if="editProduct.source_url?.includes('1688')">当前商品来自1688，可直接提取参数</span>
                <span v-else>未绑定1688同款，点击搜索按钮查找</span>
              </div>
            </div>

            <!-- 物理规格 -->
            <div class="section-block">
              <div class="section-label">物理规格</div>
              <n-grid :cols="4" :x-gap="8">
                <n-gi>
                  <div class="field-label">重量 (g)</div>
                  <n-input-number v-model:value="editProduct.weight_g" :min="0" size="small" style="width:100%" />
                </n-gi>
                <n-gi>
                  <div class="field-label">宽 (mm)</div>
                  <n-input-number v-model:value="editProduct.width_mm" :min="0" size="small" style="width:100%" />
                </n-gi>
                <n-gi>
                  <div class="field-label">高 (mm)</div>
                  <n-input-number v-model:value="editProduct.height_mm" :min="0" size="small" style="width:100%" />
                </n-gi>
                <n-gi>
                  <div class="field-label">深 (mm)</div>
                  <n-input-number v-model:value="editProduct.depth_mm" :min="0" size="small" style="width:100%" />
                </n-gi>
              </n-grid>
            </div>

            <!-- 来源信息 -->
            <div class="section-block">
              <div class="section-label">来源信息</div>
              <n-grid :cols="2" :x-gap="8">
                <n-gi>
                  <div class="field-label">卖家</div>
                  <n-input v-model:value="editProduct.seller_name" size="small" placeholder="卖家名称" />
                </n-gi>
                <n-gi>
                  <div class="field-label">来源链接</div>
                  <n-input v-model:value="editProduct.source_url" size="small" placeholder="https://..." />
                </n-gi>
              </n-grid>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="edit-drawer-footer">
            <n-popconfirm @positive-click="handleDelete">
              <template #trigger>
                <n-button type="error" size="small" :disabled="!editProduct">🗑️ 删除商品</n-button>
              </template>
              确定删除此商品?
            </n-popconfirm>
            <n-space>
              <n-button @click="drawerVisible = false">取消</n-button>
              <n-popconfirm @positive-click="handleCreateDraft">
                <template #trigger>
                  <n-button type="warning" :loading="drawerCreatingDraft" :disabled="!editProduct">
                    📤 创建上架草稿
                  </n-button>
                </template>
                确定将此商品创建为上架草稿？创建后可到「上架管理」编辑并提交。
              </n-popconfirm>
              <n-button type="primary" :loading="drawerSaving" :disabled="!editProduct" @click="saveEdit">
                💾 保存修改
              </n-button>
            </n-space>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

    <n-modal v-model:show="editorVisible" :mask-closable="true" :close-on-esc="true"
      style="width: 85vw; max-width: 1400px; height: 75vh;"
      content-style="padding: 0; height: 75vh; overflow: hidden;">
      <div class="image-editor-modal">
        <ImageEditor :image-url="editorImageUrl" @apply="onEditorApply" @close="editorVisible = false" />
      </div>
    </n-modal>

    <!-- ━━━ 1688 搜索同款弹窗 ━━━ -->
    <n-modal v-model:show="search1688Visible" preset="card" style="width: 800px;" :bordered="false">
      <template #header>
        <span>🔍 1688 搜索同款</span>
      </template>
      <n-space vertical :size="12">
        <n-input-group>
          <n-input v-model:value="search1688Keyword" placeholder="输入关键词搜索1688同款..." @keyup.enter="handleSearch1688" />
          <n-button type="primary" :loading="search1688Loading" @click="handleSearch1688">搜索</n-button>
        </n-input-group>
        <n-spin :show="search1688Loading">
          <div v-if="search1688Results.length" class="search1688-results">
            <div v-for="item in search1688Results" :key="item.offer_id" class="search1688-card"
              @click="handleLink1688(item)">
              <n-image :src="item.image" width="80" height="80" object-fit="cover"
                style="border-radius: 6px; flex-shrink: 0;" v-if="item.image" />
              <div v-else
                style="width:80px;height:80px;background:#f0f0f0;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                📦</div>
              <div class="search1688-card__info">
                <div class="search1688-card__title">{{ item.title || '(无标题)' }}</div>
                <div class="search1688-card__meta">
                  <n-tag size="tiny" type="warning" :bordered="false" v-if="item.price">¥{{ item.price }}</n-tag>
                  <n-tag size="tiny" type="info" :bordered="false" v-if="item.seller">{{ item.seller }}</n-tag>
                  <span v-if="item.sales" style="font-size:11px; color:#999;">月销 {{ item.sales }}</span>
                </div>
              </div>
              <n-button size="tiny" type="primary" quaternary>选择</n-button>
            </div>
          </div>
          <div v-else-if="!search1688Loading && search1688Keyword && search1688Searched"
            style="text-align:center; padding:20px; color:#999;">
            未找到结果，换个关键词试试
          </div>
        </n-spin>
      </n-space>
    </n-modal>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, h, onMounted, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import {
  NButton, NTag, NSpace, NInput, NInputNumber, NSelect, NDataTable,
  NPopconfirm, NPagination, NDrawer, NDrawerContent, NImage,
  NModal, NGrid, NGi, NH2, NDynamicTags,
  NTree, NSpin, NDatePicker, NInputGroup, NCollapse, NCollapseItem,
  type GlobalThemeOverrides,
} from "naive-ui";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";
import { translateText, optimizeDescription, replaceImageSubject, generateImage } from "../api/ai";
import ImageEditor from "../components/image/ImageEditor.vue";
import { useMessage } from "naive-ui";

const message = useMessage();
const router = useRouter();

// ── 抽屉主题:确保深色模式下背景正确 ──
const drawerThemeOverrides = computed<GlobalThemeOverrides>(() => {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    Drawer: {
      color: dark ? "#1a1a2e" : undefined,
      bodyColor: dark ? "#1a1a2e" : undefined,
    },
  };
});

// ── 币种符号 ──
const _CURRENCY_MAP: Record<string, string> = { CNY: "¥", RUB: "₽", USD: "$", EUR: "€" };
const _currencySymbol = (c?: string) => _CURRENCY_MAP[(c || "").toUpperCase()] || "₽";

// ── 状态 ──
const loading = ref(false);
const products = ref<any[]>([]);
const totalCount = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const selectedKeys = ref<number[]>([]);

// ── 筛选 ──
const keyword = ref("");
const filterPlatform = ref("");
const filterBrand = ref("");
const filterCategory = ref("");
const minPrice = ref<number | null>(null);
const maxPrice = ref<number | null>(null);
const minRating = ref<number | null>(null);
const minReviews = ref<number | null>(null);
const dateRange = ref<[number, number] | null>(null);
const filterExpanded = ref(false);

const platformOptions = [
  { label: "全部平台", value: "" },
  { label: "1688", value: "1688" },
  { label: "Ozon", value: "ozon" },
  { label: "Wildberries", value: "wb" },
];
const brandOptions = ref<any[]>([]);

function resetFilters() {
  keyword.value = "";
  filterPlatform.value = "";
  filterBrand.value = "";
  filterCategory.value = "";
  minPrice.value = null;
  maxPrice.value = null;
  minRating.value = null;
  minReviews.value = null;
  dateRange.value = null;
  currentPage.value = 1;
  loadProducts();
}

// ── 编辑抽屉 ──
const drawerVisible = ref(false);
const editProduct = ref<any>(null);
const editProductSnapshot = ref<any>(null);
const drawerSaving = ref(false);
const selectedSkuKey = ref<string | null>(null);

// ── 编辑抽屉: 店铺与分类选择 ──
const editCategoryPopoverShow = ref(false);
const editSelectedCategoryKeys = ref<any[]>([]);
const editSelectedCategoryPathLabel = ref('');
const editCategorySearchPattern = ref('');

const editSelectedCategoryLabel = computed(() => {
  if (editSelectedCategoryPathLabel.value) return editSelectedCategoryPathLabel.value;
  if (!editSelectedCategoryKeys.value.length) return '';
  const key = editSelectedCategoryKeys.value[0];
  return getCategoryPathLabelByKey(key);
});

function resetEditCategorySelection() {
  editSelectedCategoryKeys.value = [];
  editSelectedCategoryPathLabel.value = '';
  if (!editProduct.value) return;
  editProduct.value.description_category_id = null;
  editProduct.value.type_id = null;
  editProduct.value.ozon_category_id = 0;
  editProduct.value.ozon_type_id = 0;
}

function onEditStoreChange(_val: number | null) {
  // The local Ozon taxonomy is global. Changing the store must not clear the
  // loaded snapshot or the category already selected for this product.
}

function clearEditCategorySelection() {
  resetEditCategorySelection();
}

const hasChanges = computed(() => {
  if (!editProduct.value || !editProductSnapshot.value) return false;
  return JSON.stringify(editProduct.value) !== JSON.stringify(editProductSnapshot.value);
});

function openDrawer(product: any) {
  selectedSkuKey.value = null;
  const normalizedProduct = {
    ...normalizeProduct(JSON.parse(JSON.stringify(product))),
    description_category_id: product.description_category_id || product.ozon_category_id || null,
    type_id: product.type_id || product.ozon_type_id || null,
  };
  synchronizeSkuList(normalizedProduct);
  editProduct.value = normalizedProduct;
  editProductSnapshot.value = JSON.parse(JSON.stringify(normalizedProduct));
  // initialize edit category state from product
  const initialCategoryId = normalizedProduct.description_category_id;
  const initialTypeId = normalizedProduct.type_id;
  editSelectedCategoryKeys.value = initialCategoryId ? [makeCategorySelectionKey(initialCategoryId, initialTypeId)] : [];
  editSelectedCategoryPathLabel.value = '';
  editCategorySearchPattern.value = '';
  editCategoryPopoverShow.value = false;
  expandedCategoryKeys.value = [];
  loadCategoryTree();
  if (!storeOptions.value.length) {
    loadStoreOptions();
  }
  drawerVisible.value = true;
}

async function saveEdit() {
  if (!editProduct.value) return;
  drawerSaving.value = true;
  try {
    const d = editProduct.value;
    await apiPut(`/selection/products/${d.id}`, buildProductUpdatePayload(d));
    message.success("保存成功");
    editProductSnapshot.value = JSON.parse(JSON.stringify(editProduct.value));
    await loadProducts();
  } catch (e: any) {
    message.error("保存失败: " + e.message);
  } finally {
    drawerSaving.value = false;
  }
}

function buildProductUpdatePayload(d: any) {
  return {
    title: d.title,
    brand: d.brand,
    category: d.category,
    price: d.price,
    old_price: d.old_price,
    description: d.description,
    source_url: d.source_url,
    images: d.images,
    seller_name: d.seller_name,
    seller_url: d.seller_url,
    video_urls: d.video_urls || [],
    sku_list: d.sku_list || [],
    spec_list: d.spec_list || [],
    facts: d.facts || [],
    tags: d.tags || [],
    color_list: d.color_list || [],
    weight_g: d.weight_g,
    width_mm: d.width_mm,
    height_mm: d.height_mm,
    depth_mm: d.depth_mm,
    store_id: d.store_id || null,
    description_category_id: d.description_category_id || null,
    type_id: d.type_id || null,
  };
}

// ── 店铺选项（编辑抽屉使用） ──
const storeOptions = ref<any[]>([]);

// ── 创建上架草稿 ──
const drawerCreatingDraft = ref(false);

async function handleCreateDraft() {
  if (!editProduct.value) return;
  drawerCreatingDraft.value = true;
  try {
    const d = editProduct.value;
    const selectedRow = selectedSkuEditorRows.value[0]?.row;
    const sourceSku = normalizeSkuIdentity(selectedRow?.sku);
    if (!sourceSku) {
      message.warning("请先选择并填写要创建草稿的 SKU");
      return;
    }
    // 草稿服务从持久化 sku_list 读取图片、价格和条码；先保存可避免
    // 抽屉内尚未保存的当前 SKU 编辑被旧数据库快照覆盖。
    await apiPut(`/selection/products/${d.id}`, buildProductUpdatePayload(d));
    await apiPost("/upload/drafts", {
      store_id: d.store_id,
      source_product_id: d.id,
      source_sku: sourceSku,
      name: displayValue(selectedRow?.name) || d.title || "",
      category_name: editSelectedCategoryLabel.value || d.category || "",
      description_category_id: d.description_category_id || 0,
      type_id: d.type_id || 0,
    });
    message.success("✅ 上架草稿已创建，请到「上架管理」编辑并提交");
    drawerVisible.value = false;
    router.push("/listing");
  } catch (e: any) {
    message.error("创建草稿失败: " + e.message);
  } finally {
    drawerCreatingDraft.value = false;
  }
}

// ── 1688 找同款 ──
const search1688Visible = ref(false);
const search1688Keyword = ref("");
const search1688Results = ref<any[]>([]);
const search1688Loading = ref(false);
const search1688Searched = ref(false);

function showSearch1688Modal() {
  // 用商品标题作为默认搜索关键词
  search1688Keyword.value = editProduct.value?.title?.substring(0, 30) || "";
  search1688Results.value = [];
  search1688Searched.value = false;
  search1688Visible.value = true;
}

async function handleSearch1688() {
  if (!search1688Keyword.value.trim()) return;
  search1688Loading.value = true;
  search1688Searched.value = true;
  try {
    const res = await apiPost("/selection/search-1688", {
      keyword: search1688Keyword.value,
      page: 1,
      page_size: 20,
    });
    search1688Results.value = res.items || [];
  } catch (e: any) {
    message.error("搜索失败: " + e.message);
    search1688Results.value = [];
  } finally {
    search1688Loading.value = false;
  }
}

async function handleLink1688(item: any) {
  if (!editProduct.value) return;
  try {
    const result = await apiPost(`/selection/products/${editProduct.value.id}/link-1688`, {
      offer_id: item.offer_id || "",
      url: item.url || "",
      title: item.title || "",
      price: item.price || 0,
      image: item.image || "",
      seller: item.seller || "",
    });
    message.success(`✅ 已提取1688同款信息${result.specs_extracted?.length ? `，提取了 ${result.specs_extracted.length} 个规格参数` : ""}`);
    search1688Visible.value = false;
  } catch (e: any) {
    message.error("绑定失败: " + e.message);
  }
}

// ── 1688 参数提取 ──
const extract1688Loading = ref(false);

async function handleExtract1688Specs() {
  if (!editProduct.value) return;
  extract1688Loading.value = true;
  try {
    const result = await apiPost(`/selection/products/${editProduct.value.id}/extract-1688-specs`);
    // 更新尺寸和重量
    if (result.weight_g) editProduct.value.weight_g = result.weight_g;
    if (result.depth_mm) editProduct.value.depth_mm = result.depth_mm;
    if (result.height_mm) editProduct.value.height_mm = result.height_mm;
    if (result.width_mm) editProduct.value.width_mm = result.width_mm;
    message.success(`✅ 已提取 ${result.specs_extracted?.length || 0} 个参数` +
      (result.weight_g ? `，重量: ${result.weight_g}g` : ""));
  } catch (e: any) {
    message.error("参数提取失败: " + e.message);
  } finally {
    extract1688Loading.value = false;
  }
}

// ── AI 文字功能 ──
const aiTextLoading = ref(false);

async function handleAiTranslate() {
  if (!editProduct.value) return;
  const text = editProduct.value.description;
  if (!text) {
    message.warning("没有可翻译的文本");
    return;
  }
  aiTextLoading.value = true;
  try {
    const res = await translateText({
      text,
      field_type: "description",
      context: editProduct.value.category || "",
    });
    if (res.translated) {
      editProduct.value.description = res.translated;
      message.success("描述翻译完成");
    }
  } catch (e: any) {
    message.error("翻译失败: " + e.message);
  } finally {
    aiTextLoading.value = false;
  }
}

async function handleAiOptimize() {
  if (!editProduct.value) return;
  const text = editProduct.value.description;
  if (!text) {
    message.warning("没有可优化的文本");
    return;
  }
  aiTextLoading.value = true;
  try {
    const res = await optimizeDescription({
      title: editProduct.value.title || "",
      description: text,
      field_type: "description",
      context: editProduct.value.category || "",
    });
    if (res.description) {
      editProduct.value.description = res.description;
      message.success("描述优化完成");
    }
  } catch (e: any) {
    message.error("优化失败: " + e.message);
  } finally {
    aiTextLoading.value = false;
  }
}

async function handleAiTranslateSkuTitle(row: EditableSkuRow) {
  const text = displayValue(row.name);
  if (!text) {
    message.warning("没有可翻译的 SKU 标题");
    return;
  }
  aiTextLoading.value = true;
  try {
    const res = await translateText({
      text,
      field_type: "title",
      context: editProduct.value?.category || "",
    });
    if (res.translated) {
      row.name = res.translated;
      message.success("SKU 标题翻译完成");
    }
  } catch (e: any) {
    message.error("翻译失败: " + e.message);
  } finally {
    aiTextLoading.value = false;
  }
}

async function handleAiOptimizeSkuTitle(row: EditableSkuRow) {
  const text = displayValue(row.name);
  if (!text) {
    message.warning("没有可优化的 SKU 标题");
    return;
  }
  aiTextLoading.value = true;
  try {
    const res = await optimizeDescription({
      title: text,
      field_type: "title",
      context: editProduct.value?.category || "",
    });
    if (res.description) {
      row.name = res.description;
      message.success("SKU 标题优化完成");
    }
  } catch (e: any) {
    message.error("优化失败: " + e.message);
  } finally {
    aiTextLoading.value = false;
  }
}

// ── SKU 独立上架图片 ──
const editorVisible = ref(false);
const editorImageUrl = ref("");
const editorSourceUrl = ref("");
const editorSkuRow = ref<EditableSkuRow | null>(null);
const imageUploadRef = ref<HTMLInputElement | null>(null);
const aiImageLoading = ref<string | null>(null);
const aiImageBatchLoading = ref(false);
const aiImageGenerateLoading = ref(false);

function openEditor(row: EditableSkuRow, idx: number) {
  const imageUrl = row.images?.[idx];
  if (!imageUrl) return;
  editorSkuRow.value = row;
  editorSourceUrl.value = imageUrl;
  editorImageUrl.value = imageUrl;
  editorVisible.value = true;
}

function replaceSkuImageReferences(sourceUrl: string, targetUrl: string): number {
  const rows = editProduct.value?.sku_list;
  if (!sourceUrl || !targetUrl || !Array.isArray(rows)) return 0;
  let replacements = 0;
  for (const row of rows as EditableSkuRow[]) {
    if (!Array.isArray(row.images)) continue;
    row.images = row.images.map((url) => {
      if (url !== sourceUrl) return url;
      replacements += 1;
      return targetUrl;
    });
  }
  return replacements;
}

function onEditorApply(editedUrl: string) {
  const sourceUrl = editorSourceUrl.value;
  const normalizedUrl = displayValue(editedUrl);
  if (!editorSkuRow.value || !sourceUrl || !normalizedUrl) return;
  const replacements = replaceSkuImageReferences(sourceUrl, normalizedUrl);
  editorVisible.value = false;
  editorSkuRow.value = null;
  editorSourceUrl.value = "";
  if (replacements) message.success(`编辑结果已更新 ${replacements} 个 SKU 图片引用`);
}

function triggerImageUpload() {
  imageUploadRef.value?.click();
}

function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.files?.length || !editProduct.value) return;
  // 当前项目没有通用商品图片文件上传接口，保留原入口与原提示，避免制造无法保存的临时 URL。
  message.info("图片上传功能即将上线,敬请期待 ✨");
  input.value = "";
}

function removeImage(row: EditableSkuRow, idx: number) {
  if (!Array.isArray(row.images)) return;
  row.images.splice(idx, 1);
}

async function optimizeSkuImageReference(sourceUrl: string, notify = true) {
  if (!sourceUrl) return false;
  aiImageLoading.value = sourceUrl;
  try {
    const res = await replaceImageSubject({
      image_url: sourceUrl,
      prompt: "Professional e-commerce product photo on white background, studio lighting, clean",
    });
    const resultUrl = displayValue(res.result_url);
    if (!resultUrl) return false;
    const replacements = replaceSkuImageReferences(sourceUrl, resultUrl);
    if (notify && replacements) message.success(`图片优化完成，已更新 ${replacements} 个 SKU 图片引用`);
    return replacements > 0;
  } catch (e: any) {
    if (notify) message.error("图片优化失败: " + e.message);
    throw e;
  } finally {
    aiImageLoading.value = null;
  }
}

async function handleAiOptimizeImage(_row: EditableSkuRow, sourceUrl: string) {
  try {
    await optimizeSkuImageReference(sourceUrl);
  } catch {
    // 单图优化的错误已在 helper 中反馈。
  }
}

async function handleAiOptimizeImages(row: EditableSkuRow) {
  const sourceUrls = Array.isArray(row.images) ? [...row.images] : [];
  const imageCount = sourceUrls.length;
  if (!imageCount) {
    message.warning("当前 SKU 没有可优化的上架图片");
    return;
  }
  aiImageBatchLoading.value = true;
  let optimizedCount = 0;
  try {
    for (const sourceUrl of sourceUrls) {
      try {
        if (await optimizeSkuImageReference(sourceUrl, false)) optimizedCount += 1;
      } catch {
        // 继续优化其余图片，最终统一反馈结果。
      }
    }
    if (optimizedCount) message.success(`已优化当前 SKU 的 ${optimizedCount} 张上架图片`);
    if (optimizedCount < imageCount) message.warning(`${imageCount - optimizedCount} 张图片优化失败`);
  } finally {
    aiImageBatchLoading.value = false;
  }
}

async function handleAiGenerateImages(row: EditableSkuRow) {
  if (!editProduct.value) return;
  const selectedTitle = displayValue(row.name) || displayValue(editProduct.value.title);
  if (!selectedTitle) {
    message.warning("请先填写当前 SKU 标题");
    return;
  }
  aiImageGenerateLoading.value = true;
  try {
    const res = await generateImage({
      title: selectedTitle,
      category: editProduct.value.category || "",
      count: 4,
    });
    const generatedImages = normalizeWritableImageUrls(res.images);
    if (generatedImages.length) {
      if (!Array.isArray(row.images)) row.images = [];
      row.images.push(...generatedImages);
      message.success(`已为当前 SKU 生成 ${generatedImages.length} 张上架图片`);
    }
  } catch (e: any) {
    message.error("图片生成失败: " + e.message);
  } finally {
    aiImageGenerateLoading.value = false;
  }
}

// ── 采集数据兼容归一化 ──
interface ProductFact {
  name: string;
  value: string;
  sourcePath?: string;
}

interface ProductVariantValue {
  name: string;
  value: string;
}

interface ProductVariant {
  sku: string;
  barcode?: string;
  values: ProductVariantValue[];
  price?: number;
  oldPrice?: number;
  stock?: number;
  images?: string[];
  imageUrl?: string;
  videoUrls?: string[];
  weight?: number;
  depth?: number;
  width?: number;
  height?: number;
  sourceUrl?: string;
  id?: string;
  productId?: string;
  offerId?: string;
  supplierSkuId?: string;
  supplierSpecText?: string;
  supplierAttrs?: Array<Record<string, unknown>>;
  variantAttrs?: Record<string, unknown>;
  sourcePath?: string;
  [key: string]: unknown;
}

interface EditableSkuRow {
  sku: string;
  name?: string;
  barcode?: string;
  price?: number | null;
  stock?: number | null;
  images?: string[];
  [key: string]: unknown;
}

interface SkuEditorItem {
  key: string;
  row: EditableSkuRow;
  variant?: ProductVariant;
}

const skuRowKeys = new WeakMap<object, string>();
let skuRowKeySeed = 0;

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeSkuIdentity(value: unknown): string {
  return displayValue(value).trim();
}

function skuRowObjectKey(row: EditableSkuRow): string {
  const existing = skuRowKeys.get(row);
  if (existing) return existing;
  const created = `sku-row-${++skuRowKeySeed}`;
  skuRowKeys.set(row, created);
  return created;
}

function normalizeSkuList(value: unknown): EditableSkuRow[] {
  return parseArray(value).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = { ...(item as Record<string, unknown>) } as EditableSkuRow;
    const ownsImages = Object.prototype.hasOwnProperty.call(item, "images");
    row.sku = normalizeSkuIdentity(row.sku);
    const name = displayValue(row.name);
    const barcode = displayValue(row.barcode);
    if (name) row.name = name;
    else delete row.name;
    if (barcode) row.barcode = barcode;
    else delete row.barcode;
    if (ownsImages) row.images = normalizeWritableImageUrls(row.images);
    else delete row.images;
    return [row];
  });
}

function normalizeFacts(value: unknown): ProductFact[] {
  return parseArray(value).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const name = displayValue(raw.name);
    const factValue = displayValue(raw.value);
    if (!name && !factValue) return [];
    const sourcePath = displayValue(raw.sourcePath ?? raw.source_path);
    return [{ name, value: factValue, ...(sourcePath ? { sourcePath } : {}) }];
  });
}

function normalizeColors(value: unknown): string[] {
  const seen = new Set<string>();
  return parseArray(value).flatMap((item) => {
    const color = displayValue(item);
    const key = color.toLocaleLowerCase();
    if (!color || seen.has(key)) return [];
    seen.add(key);
    return [color];
  });
}

function normalizeIntegerList(value: unknown): number[] {
  return parseArray(value).flatMap((item) => {
    const number = typeof item === "number" ? item : Number(displayValue(item));
    return Number.isInteger(number) && number > 0 ? [number] : [];
  });
}

function normalizeMetrics(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function formatCollectedJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return displayValue(value);
  }
}

function normalizeTags(value: unknown): string[] {
  const seen = new Set<string>();
  return parseArray(value).flatMap((item) => {
    const tag = displayValue(item);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) return [];
    seen.add(key);
    return [tag];
  });
}

function normalizeVariants(value: unknown): ProductVariant[] {
  return parseArray(value).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const sku = displayValue(raw.sku);
    if (!sku) return [];
    const values = parseArray(raw.values).flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const rawEntry = entry as Record<string, unknown>;
      const name = displayValue(rawEntry.name);
      const entryValue = displayValue(rawEntry.value);
      if (!name && !entryValue) return [];
      return [{ name, value: entryValue }];
    });
    const normalized = { ...raw, sku, values } as ProductVariant;
    const barcode = displayValue(raw.barcode);
    const images = normalizeVariantUrls(raw.images);
    const legacyImageUrl = displayValue(raw.imageUrl ?? raw.image_url);
    if (legacyImageUrl && !images.includes(legacyImageUrl)) images.unshift(legacyImageUrl);
    const videoUrls = normalizeVariantUrls(raw.videoUrls ?? raw.video_urls);
    const sourcePath = displayValue(raw.sourcePath ?? raw.source_path);
    const sourceUrl = displayValue(raw.sourceUrl ?? raw.source_url);
    const price = normalizeVariantNumber(raw.price);
    const oldPrice = normalizeVariantNumber(raw.oldPrice ?? raw.old_price);
    const stock = normalizeVariantNumber(raw.stock);
    if (barcode) normalized.barcode = barcode;
    else delete normalized.barcode;
    if (images.length) {
      normalized.images = images;
      normalized.imageUrl = images[0];
    } else {
      delete normalized.images;
      delete normalized.imageUrl;
    }
    if (videoUrls.length) normalized.videoUrls = videoUrls;
    else delete normalized.videoUrls;
    if (sourcePath) normalized.sourcePath = sourcePath;
    else delete normalized.sourcePath;
    if (price !== undefined) normalized.price = price;
    else delete normalized.price;
    if (oldPrice !== undefined) normalized.oldPrice = oldPrice;
    else delete normalized.oldPrice;
    if (stock !== undefined) normalized.stock = stock;
    else delete normalized.stock;
    for (const field of ["weight", "depth", "width", "height"] as const) {
      const number = normalizeVariantNumber(raw[field]);
      if (number !== undefined) normalized[field] = number;
      else delete normalized[field];
    }
    if (sourceUrl) normalized.sourceUrl = sourceUrl;
    else delete normalized.sourceUrl;
    for (const field of ["id", "productId", "offerId", "supplierSkuId", "supplierSpecText"] as const) {
      const fieldValue = displayValue(raw[field]);
      if (fieldValue) normalized[field] = fieldValue;
      else delete normalized[field];
    }
    normalized.supplierAttrs = parseArray(raw.supplierAttrs ?? raw.supplier_attrs)
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
      .map((entry) => ({ ...entry }));
    normalized.variantAttrs = raw.variantAttrs && typeof raw.variantAttrs === "object" && !Array.isArray(raw.variantAttrs)
      ? { ...(raw.variantAttrs as Record<string, unknown>) }
      : {};
    return [normalized];
  });
}

function normalizeVariantUrls(value: unknown): string[] {
  const seen = new Set<string>();
  return parseArray(value).flatMap((item) => {
    const url = displayValue(item);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [url];
  });
}

function normalizeWritableImageUrls(value: unknown): string[] {
  const seen = new Set<string>();
  return parseArray(value).flatMap((item) => {
    const rawUrl = item && typeof item === "object"
      ? (item as Record<string, unknown>).result_url ?? (item as Record<string, unknown>).url
      : item;
    const url = displayValue(rawUrl);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [url];
  });
}

function normalizeVariantNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const numericText = value.replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  if (!numericText || numericText === "-" || numericText === "." || numericText === "-.") return undefined;
  const parsed = Number(numericText);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function createSkuRowFromVariant(variant: ProductVariant): EditableSkuRow {
  const row: EditableSkuRow = { sku: variant.sku, images: [...(variant.images || [])] };
  if (variant.barcode) row.barcode = variant.barcode;
  if (variant.price !== undefined) row.price = variant.price;
  if (variant.stock !== undefined) row.stock = variant.stock;
  return row;
}

function synchronizeSkuList(product: any): void {
  const skuList = normalizeSkuList(product?.sku_list);
  const rowsBySku = new Map<string, EditableSkuRow>();
  const fallbackTitle = displayValue(product?.title);

  for (const row of skuList) {
    const sku = normalizeSkuIdentity(row.sku);
    if (sku && !rowsBySku.has(sku)) rowsBySku.set(sku, row);
  }

  for (const variant of normalizeVariants(product?.variants)) {
    const sku = normalizeSkuIdentity(variant.sku);
    if (!sku) continue;
    let row = rowsBySku.get(sku);
    if (!row) {
      row = createSkuRowFromVariant(variant);
      skuList.push(row);
      rowsBySku.set(sku, row);
    }

    row.sku = variant.sku;
    if (!displayValue(row.name) && fallbackTitle) row.name = fallbackTitle;
    if (!row.barcode && variant.barcode) row.barcode = variant.barcode;
    if (row.price == null && variant.price !== undefined) row.price = variant.price;
    if (row.stock == null && variant.stock !== undefined) row.stock = variant.stock;
    if (!Object.prototype.hasOwnProperty.call(row, "images")) {
      row.images = [...(variant.images || [])];
    }
  }

  product.sku_list = skuList;
}

function normalizeProduct(product: any) {
  return {
    ...product,
    images: normalizeWritableImageUrls(product?.images),
    video_urls: normalizeVariantUrls(product?.video_urls),
    sku_list: normalizeSkuList(product?.sku_list),
    spec_list: parseArray(product?.spec_list),
    facts: normalizeFacts(product?.facts),
    tags: normalizeTags(product?.tags),
    color_list: normalizeColors(product?.color_list),
    variant_attr_ids: normalizeIntegerList(product?.variant_attr_ids),
    ozon_metrics: normalizeMetrics(product?.ozon_metrics),
    variants: normalizeVariants(product?.variants),
  };
}

function variantValueEntries(variant: ProductVariant): Array<ProductVariantValue & { key: string }> {
  return (variant.values || []).map((entry, index) => ({
    ...entry,
    key: `${entry.name}-${entry.value}-${index}`,
  }));
}

function formatVariantMoney(value: number): string {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${_currencySymbol(editProduct.value?.currency)}`;
}

function variantIdentityEntries(variant: ProductVariant): Array<{ label: string; value: string }> {
  const entries: Array<[string, string | undefined]> = [
    ["Product ID", variant.productId],
    ["Offer ID", variant.offerId],
    ["事实 ID", variant.id],
    ["供应商 SKU ID", variant.supplierSkuId],
    ["供应商规格", variant.supplierSpecText],
  ];
  return entries.flatMap(([label, value]) => value ? [{ label, value }] : []);
}

function supplierFactEntries(variant: ProductVariant): Array<{ key: string; name: string; value: string }> {
  return (variant.supplierAttrs || []).flatMap((fact, index) => {
    const name = displayValue(fact.name ?? fact.label ?? fact.propertyID);
    const value = displayValue(fact.value);
    if (!name || !value) return [];
    return [{ key: `${name}-${value}-${index}`, name, value }];
  });
}

const skuEditorRows = computed<SkuEditorItem[]>(() => {
  const product = editProduct.value;
  if (!product) return [];

  const skuList = Array.isArray(product.sku_list) ? product.sku_list as EditableSkuRow[] : [];
  const variants = Array.isArray(product.variants) ? product.variants as ProductVariant[] : [];
  const availableRowsBySku = new Map<string, EditableSkuRow[]>();
  const usedRows = new Set<EditableSkuRow>();
  const variantOccurrences = new Map<string, number>();

  for (const row of skuList) {
    const sku = normalizeSkuIdentity(row.sku);
    if (!sku) continue;
    const rows = availableRowsBySku.get(sku) || [];
    rows.push(row);
    availableRowsBySku.set(sku, rows);
  }

  const collectedItems = variants.flatMap((variant) => {
    const sku = normalizeSkuIdentity(variant.sku);
    if (!sku) return [];
    const matchingRows = availableRowsBySku.get(sku) || [];
    const row = matchingRows.find((candidate) => !usedRows.has(candidate)) || matchingRows[0];
    if (!row) return [];
    usedRows.add(row);
    const occurrence = (variantOccurrences.get(sku) || 0) + 1;
    variantOccurrences.set(sku, occurrence);
    return [{ key: `variant-${sku}-${occurrence}`, row, variant }];
  });

  const manualItems = skuList
    .filter((row) => !usedRows.has(row))
    .map((row) => ({ key: skuRowObjectKey(row), row }));

  return [...collectedItems, ...manualItems];
});

const activeSkuKey = computed<string | null>(() => {
  const rows = skuEditorRows.value;
  if (selectedSkuKey.value && rows.some((item) => item.key === selectedSkuKey.value)) {
    return selectedSkuKey.value;
  }
  return rows[0]?.key ?? null;
});

const selectedSkuEditorRows = computed<SkuEditorItem[]>(() => {
  const key = activeSkuKey.value;
  if (!key) return [];
  const item = skuEditorRows.value.find((candidate) => candidate.key === key);
  return item ? [item] : [];
});

function addSku() {
  if (!editProduct.value) return;
  if (!Array.isArray(editProduct.value.sku_list)) editProduct.value.sku_list = [];
  const row = { sku: "", barcode: "", price: null, stock: null, images: [] } as EditableSkuRow;
  editProduct.value.sku_list.push(row);
  selectedSkuKey.value = skuRowObjectKey(row);
}

function removeSku(row: EditableSkuRow) {
  const skuList = editProduct.value?.sku_list;
  if (!Array.isArray(skuList)) return;
  const index = skuList.indexOf(row);
  if (index < 0) return;
  if (activeSkuKey.value === skuRowObjectKey(row)) selectedSkuKey.value = null;
  skuList.splice(index, 1);
}

// ── 删除 ──
async function handleDelete() {
  if (!editProduct.value) return;
  try {
    await apiDelete(`/selection/products/${editProduct.value.id}`);
    message.success("已删除");
    drawerVisible.value = false;
    editProduct.value = null;
    await loadProducts();
  } catch (e: any) {
    message.error("删除失败: " + e.message);
  }
}

async function batchDeleteProducts() {
  if (!selectedKeys.value.length) return;
  try {
    await apiPost("/selection/products/batch-delete", { ids: selectedKeys.value });
    message.success(`已删除 ${selectedKeys.value.length} 个商品`);
    selectedKeys.value = [];
    await loadProducts();
  } catch (e: any) {
    message.error("批量删除失败: " + e.message);
  }
}

function handleCheck(keys: any[]) {
  selectedKeys.value = keys as number[];
}

// ── 表格列定义 ──
const columns = [
  {
    type: "selection" as const,
  },
  {
    title: "商品",
    key: "title",
    minWidth: 250,
    render(row: any) {
      const img = row.images?.[0];
      return h("div", { style: "display:flex; align-items:center; gap:8px;" }, [
        img ? h("img", { src: img, style: "width:40px; height:40px; border-radius:4px; object-fit:cover; flex-shrink:0;" }) : null,
        h("div", { style: "min-width:0;" }, [
          h("div", { style: "font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;" }, row.title || "—"),
          h("div", { style: "font-size:11px; color:#999;" }, [
            h(NTag, { size: "tiny", bordered: false, type: row.platform === "1688" ? "info" : "success" }, () => row.platform),
            row.brand ? h("span", { style: "margin-left:4px;" }, row.brand) : null,
          ]),
        ]),
      ]);
    },
  },
  {
    title: "价格",
    key: "price",
    width: 110,
    sorter: true,
    render(row: any) {
      const sym = _currencySymbol(row.currency);
      if (row.old_price && row.old_price > (row.price || 0)) {
        return h("div", [
          h("div", { style: "font-size:11px; color:#999; text-decoration:line-through;" }, `${row.old_price?.toLocaleString()} ${sym}`),
          h("div", { style: "font-weight:600; color:var(--accent);" }, `${row.price?.toLocaleString() || "—"} ${sym}`),
        ]);
      }
      return h("span", { style: "font-weight:600;" }, `${row.price?.toLocaleString() || "—"} ${sym}`);
    },
  },
  {
    title: "评分",
    key: "rating",
    width: 70,
    sorter: true,
    render(row: any) {
      return row.rating ? h(NTag, { size: "small", round: true, bordered: false, type: "warning" }, () => `⭐ ${row.rating}`) : h("span", { style: "color:#ccc;" }, "—");
    },
  },
  {
    title: "评论",
    key: "review_count",
    width: 70,
    sorter: true,
  },
  {
    title: "操作",
    key: "actions",
    width: 120,
    fixed: "right" as const,
    render(row: any) {
      return h(NSpace, { size: 4 }, () => [
        h(NButton, { size: "small", type: "primary", quaternary: true, onClick: () => openDrawer(row) }, () => "✏️ 编辑"),
        h(NPopconfirm, {
          onPositiveClick: () => deleteProduct(row),
        }, {
          trigger: () => h(NButton, { size: "small", type: "error", quaternary: true }, () => "🗑️"),
          default: () => "确定删除此商品?",
        }),
      ]);
    },
  },
];

async function deleteProduct(row: any) {
  try {
    await apiDelete(`/selection/products/${row.id}`);
    message.success("已删除");
    await loadProducts();
  } catch (e: any) {
    message.error("删除失败: " + e.message);
  }
}

// ── 数据加载 ──
async function loadProducts() {
  loading.value = true;
  try {
    const skip = (currentPage.value - 1) * pageSize.value;
    const params: Record<string, any> = { skip, limit: pageSize.value };
    if (filterBrand.value) params.brand = filterBrand.value;
    if (filterPlatform.value) params.platform = filterPlatform.value;
    if (keyword.value) params.keyword = keyword.value;
    if (filterCategory.value) params.category = filterCategory.value;
    if (minPrice.value != null) params.min_price = minPrice.value;
    if (maxPrice.value != null) params.max_price = maxPrice.value;
    if (minRating.value != null) params.min_rating = minRating.value;
    if (minReviews.value != null) params.min_reviews = minReviews.value;

    const [data, countRes] = await Promise.all([
      apiGet("/selection/products", params),
      apiGet("/selection/products/count", params),
    ]);
    products.value = Array.isArray(data) ? data.map(normalizeProduct) : [];
    totalCount.value = countRes.total;
  } catch (e: any) {
    message.error("加载失败: " + e.message);
  } finally {
    loading.value = false;
  }
}

async function loadBrands() {
  try {
    const brands = await apiGet("/selection/brands");
    brandOptions.value = [
      { label: "全部品牌", value: "" },
      ...brands.map((b: any) => ({ label: `${b.brand} (${b.count})`, value: b.brand })),
    ];
  } catch { /* ignore */ }
}

async function loadStoreOptions() {
  try {
    const stores = await apiGet("/stores/");
    storeOptions.value = stores.map((s: any) => ({ label: s.name || s.store_name || `Store #${s.id}`, value: s.id }));
  } catch { /* ignore */ }
}

// ── Category tree: store-independent local Chinese snapshot ──
interface OzonCategorySnapshot {
  categories?: any[];
  language?: string;
  count?: number;
  synced_at?: string | null;
  source_store_id?: number | null;
}

const categoryTreeNodes = ref<any[]>([]);
const selectedCategoryKeys = ref<any[]>([]);
const expandedCategoryKeys = ref<any[]>([]);
const categoryLoading = ref(false);
const categorySyncing = ref(false);
const categorySnapshotCount = ref(0);
const categorySyncedAt = ref<string | null>(null);
const categorySourceStoreId = ref<number | null>(null);
const categoryTreeMap = ref<Map<any, any[]>>(new Map()); // node key -> children[]
const categoryPathLabelMap = ref<Map<any, string>>(new Map()); // node key -> breadcrumb label

function formatCategorySyncedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `同步于 ${date.toLocaleString('zh-CN', { hour12: false })}`;
}

// n-tree filter: match node label against search pattern
function filterCategoryTree(pattern: string, node: any): boolean {
  if (!pattern) return true;
  const label = (node.label || '').toLowerCase();
  return label.includes(pattern.toLowerCase());
}

function getCategoryId(node: any) {
  return node.description_category_id ?? node.category_id ?? node.id ?? null;
}

function getCategoryTypeId(node: any) {
  return node.type_id ?? node.ozon_type_id ?? node.typeId ?? null;
}

function makeCategorySelectionKey(categoryId: any, typeId?: any) {
  const hasTypeId = typeId !== null && typeId !== undefined && String(typeId) !== '' && Number(typeId) !== 0;
  return hasTypeId ? `type:${categoryId}:${typeId}` : `cat:${categoryId}`;
}

function getEffectiveCategoryId(node: any, parentCategoryId: any = null) {
  return getCategoryId(node) ?? parentCategoryId ?? null;
}

function getCategoryNodeKey(node: any, parentCategoryId: any = null) {
  return makeCategorySelectionKey(getEffectiveCategoryId(node, parentCategoryId), getCategoryTypeId(node));
}

function getCategoryNodeLabel(node: any) {
  return node.type_name
    ?? node.category_name
    ?? node.title
    ?? node.label
    ?? node.name
    ?? String(getCategoryId(node) ?? getCategoryTypeId(node) ?? '未知分类');
}

function getCategoryPathLabelByKey(key: any) {
  const indexedPathLabel = categoryPathLabelMap.value.get(key);
  if (indexedPathLabel) return indexedPathLabel;
  const path = findCategoryTreeNodePathByKey(categoryTreeNodes.value, key);
  return path.map((node: any) => node.label).filter(Boolean).join(' > ');
}

function isSelectableCategoryNode(node: any) {
  if (!node) return false;
  return node.description_category_id !== null
    && node.description_category_id !== undefined
    && String(node.description_category_id) !== '';
}

function applyEditCategorySelection(key: any, node: any) {
  if (!isSelectableCategoryNode(node)) {
    resetEditCategorySelection();
    return;
  }
  const categoryId = node.description_category_id;
  const typeId = node.type_id ?? null;

  editSelectedCategoryKeys.value = [key];
  editSelectedCategoryPathLabel.value = getCategoryPathLabelByKey(key);
  if (editProduct.value) {
    editProduct.value.description_category_id = categoryId;
    editProduct.value.type_id = typeId;
    editProduct.value.ozon_category_id = categoryId || 0;
    editProduct.value.ozon_type_id = typeId || 0;
  }
}

function toTreeNode(node: any, parentCategoryId: any = null): any {
  const categoryId = getEffectiveCategoryId(node, parentCategoryId);
  const typeId = getCategoryTypeId(node);
  const key = makeCategorySelectionKey(categoryId, typeId);
  const children = Array.isArray(node?.children) ? node.children : [];
  const childParentCategoryId = categoryId ?? parentCategoryId;
  const treeNode: any = {
    key,
    label: getCategoryNodeLabel(node),
    raw: node,
    // Ozon type leaf nodes can omit description_category_id and inherit it from the parent category.
    // Keep the inherited category id on every tree node so selection, persistence and path lookup
    // use the same key: type:<description_category_id>:<type_id>.
    description_category_id: categoryId,
    type_id: typeId,
    // Naive UI will show a loading spinner for non-leaf nodes without children.
    // Since the backend returns the whole category tree at once, build children eagerly
    // and only mark nodes with actual children as expandable.
    isLeaf: children.length === 0,
  };
  if (children.length > 0) {
    treeNode.children = children.map((child: any) => toTreeNode(child, childParentCategoryId));
  }
  return treeNode;
}

function toTreeNodes(nodes: any[]): any[] {
  return (nodes || []).map(toTreeNode);
}

// Flatten the entire category tree into categoryTreeMap (parentId -> children[])
function flattenTree(nodes: any[], parentCategoryId: any = null) {
  for (const n of nodes || []) {
    const categoryId = getEffectiveCategoryId(n, parentCategoryId);
    const childParentCategoryId = categoryId ?? parentCategoryId;
    const id = getCategoryNodeKey(n, parentCategoryId);
    const children = Array.isArray(n.children) ? n.children : [];
    const childNodes = children.map((child: any) => toTreeNode(child, childParentCategoryId));
    categoryTreeMap.value.set(id, childNodes);
    if (children.length > 0) flattenTree(children, childParentCategoryId);
  }
}

function buildCategoryPathLabelMap(nodes: any[], parentLabels: string[] = [], parentCategoryId: any = null) {
  for (const node of nodes || []) {
    const categoryId = getEffectiveCategoryId(node, parentCategoryId);
    const childParentCategoryId = categoryId ?? parentCategoryId;
    const key = getCategoryNodeKey(node, parentCategoryId);
    const label = getCategoryNodeLabel(node);
    const pathLabels = [...parentLabels, label].filter(Boolean);
    categoryPathLabelMap.value.set(key, pathLabels.join(' > '));

    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length > 0) {
      buildCategoryPathLabelMap(children, pathLabels, childParentCategoryId);
    }
  }
}

// Read the complete Chinese taxonomy from this application's database only.
async function loadCategoryTree() {
  categoryLoading.value = true;
  try {
    const resp = await apiGet<OzonCategorySnapshot | any[]>('/selection/ozon-categories', { language: 'ZH_HANS' });
    const raw = Array.isArray(resp) ? resp : (resp?.categories || []);
    categorySnapshotCount.value = Array.isArray(resp) ? raw.length : Number(resp?.count || 0);
    categorySyncedAt.value = Array.isArray(resp) ? null : (resp?.synced_at || null);
    categorySourceStoreId.value = Array.isArray(resp) ? null : (resp?.source_store_id || null);
    categoryTreeMap.value.clear();
    categoryPathLabelMap.value.clear();
    expandedCategoryKeys.value = [];
    flattenTree(raw);
    buildCategoryPathLabelMap(raw);
    categoryTreeNodes.value = toTreeNodes(raw);
    if (editSelectedCategoryKeys.value.length && !editSelectedCategoryPathLabel.value) {
      editSelectedCategoryPathLabel.value = getCategoryPathLabelByKey(editSelectedCategoryKeys.value[0]);
    }
  } catch (e) {
    console.error("loadCategoryTree failed:", e);
    message.error('加载分类失败');
  } finally {
    categoryLoading.value = false;
  }
}

async function syncCategoryTree() {
  const storeId = Number(editProduct.value?.store_id || 0);
  if (!storeId) {
    message.warning('请先选择用于同步 Ozon 分类的店铺');
    return;
  }

  categorySyncing.value = true;
  try {
    await apiPost(`/selection/ozon-categories/sync?store_id=${encodeURIComponent(String(storeId))}`);
    await loadCategoryTree();
    message.success('Ozon 中文分类已同步到本地数据库');
  } catch (e: any) {
    message.error(`同步分类失败: ${e?.message || '未知错误'}`);
  } finally {
    categorySyncing.value = false;
  }
}

// Children are built eagerly from the full category tree, so expand only tracks state.
function onCategoryTreeExpand(keys: any[]) {
  expandedCategoryKeys.value = keys;
}

// Select the clicked category node. Parent nodes are also selectable because Ozon's
// category tree may expose valid description_category_id values at intermediate
// levels; if a node has children we keep the popover open and expand it so users
// can continue drilling down to a more specific type/category if needed.
function onCategoryTreeSelect(keys: any[]) {
  if (!keys || keys.length === 0) {
    resetEditCategorySelection();
    return;
  }

  const value = keys[keys.length - 1];
  const localChildren = categoryTreeMap.value.get(value) || [];
  const selectedNode = findCategoryTreeNodeByKey(categoryTreeNodes.value, value);

  applyEditCategorySelection(value, selectedNode);

  if (localChildren.length > 0) {
    if (!expandedCategoryKeys.value.includes(value)) {
      expandedCategoryKeys.value = [...expandedCategoryKeys.value, value];
    }
    return;
  }

  // Leaf selected: collapse the tree state and close the popover.
  // The selected value remains visible in the input as a breadcrumb path.
  expandedCategoryKeys.value = [];
  nextTick(() => {
    editCategoryPopoverShow.value = false;
  });
}

function findCategoryTreeNodeByKey(nodes: any[], key: any): any | null {
  for (const node of nodes || []) {
    if (node.key === key) return node;
    const found = findCategoryTreeNodeByKey(node.children || [], key);
    if (found) return found;
  }
  return null;
}

function findCategoryTreeNodePathByKey(nodes: any[], key: any, parents: any[] = []): any[] {
  for (const node of nodes || []) {
    const currentPath = [...parents, node];
    if (node.key === key) return currentPath;
    const found = findCategoryTreeNodePathByKey(node.children || [], key, currentPath);
    if (found.length) return found;
  }
  return [];
}

function onPageSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1;
  loadProducts();
}

onMounted(() => {
  loadProducts();
  loadBrands();
  loadStoreOptions();
  loadCategoryTree();
});
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════
   选品中心 — 全局样式
   ═══════════════════════════════════════════════════════ */
.gallery-item {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  flex-shrink: 0;
  cursor: pointer;
}

/* ━━━ PowerPaint 图片选择器 ━━━ */
.pp-selectable {
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.pp-selectable:hover {
  border-color: var(--accent, #2080f0);
}

.pp-selected {
  border-color: var(--accent, #2080f0);
  box-shadow: 0 0 0 2px rgba(32, 128, 240, 0.25);
}

.pp-mask-canvas {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  max-width: 100%;
}

/* Category tree wrapper — constrains height to prevent page blow-out */
.category-tree-wrapper {
  max-height: 360px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px;
}

.card {
  background: var(--bg-card);
  border-radius: 10px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
}

/* ── 筛选栏 ── */
.filter-bar {
  margin-bottom: 12px;
  padding: 12px;
  background: var(--bg-elevated);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.filter-actions {
  margin-left: auto;
}

.filter-advanced {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color);
}

.table-info {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 8px;
  padding: 0 4px;
}

.pagination-wrap {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

/* ━━━ 编辑抽屉 — 单栏编辑面板 ━━━ */
.edit-drawer-body {
  width: 100%;
}

.panel-right {
  width: 100%;
  box-sizing: border-box;
  padding: 14px;
  background: var(--bg-card, #fff);
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid #18a058;
}

.section-block {
  margin-bottom: 14px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-actions {
  display: flex;
  gap: 2px;
}

.readonly-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  padding: 8px;
  background: var(--bg-elevated);
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 0;
}

/* ── 采集事实与颜色 ── */
.collected-facts-panel {
  padding: 10px 12px;
  border: 1px solid rgba(32, 128, 240, 0.2);
  border-radius: 8px;
  background: var(--bg-elevated);
}

.collected-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 10px;
}

.collected-meta-item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
}

.collected-meta-item span {
  color: var(--text-muted);
  font-size: 10px;
}

.collected-meta-item strong {
  color: var(--text-secondary);
  font-size: 12px;
  word-break: break-word;
}

.collected-fact-block {
  margin-top: 10px;
}

.collected-media-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
}

.collected-media-summary span {
  padding: 4px 7px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
}

.collected-video-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 6px;
  font-size: 11px;
  word-break: break-all;
}

.collected-video-list a {
  color: #2080f0;
}

.collected-json {
  max-height: 220px;
  overflow: auto;
  margin: 8px 0 0;
  padding: 8px;
  border-radius: 6px;
  background: var(--bg-card, #fff);
  color: var(--text-secondary);
  font-size: 10px;
  white-space: pre-wrap;
  word-break: break-all;
}

.tag-list,
.variant-values {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.facts-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  background: var(--bg-elevated);
  border-radius: 6px;
}

.fact-row {
  display: grid;
  grid-template-columns: minmax(72px, 0.75fr) minmax(0, 1.25fr);
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 12px;
}

.fact-row:last-child {
  border-bottom: none;
}

.fact-name {
  color: var(--text-muted);
  word-break: break-word;
}

.fact-value {
  color: var(--text-secondary);
  word-break: break-word;
}

.fact-source {
  grid-column: 1 / -1;
  color: var(--text-muted);
  font-size: 10px;
  word-break: break-all;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 3px 0;
}

.info-key {
  color: var(--text-muted);
  font-size: 12px;
}

.field-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

@media (max-width: 600px) {
  .collected-meta-grid {
    grid-template-columns: 1fr;
  }
}

/* ── Ozon 分类选择反馈 ── */
.category-selected-card {
  padding: 8px 12px;
  background: rgba(24, 160, 88, 0.08);
  border-bottom: 1px solid rgba(24, 160, 88, 0.16);
  font-size: 12px;
  color: var(--text-secondary, #333);
}

.category-selected-card.is-empty {
  background: var(--bg-elevated, #f8f9fa);
  color: var(--text-muted, #999);
}

.category-selected-card__head {
  font-weight: 600;
  color: #18a058;
  margin-bottom: 4px;
}

.category-selected-card__path {
  line-height: 1.5;
  word-break: break-all;
}

.category-selected-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.category-selection-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 7px 8px;
  border-radius: 6px;
  background: rgba(24, 160, 88, 0.08);
  border: 1px solid rgba(24, 160, 88, 0.16);
}

.category-selection-summary__label {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #18a058;
}

.category-selection-summary__path {
  min-width: 0;
  flex: 1 1 100%;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary, #333);
  word-break: break-all;
}

.category-selection-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-muted, #999);
}

/* ── 统一 SKU 编辑器 ── */
.sku-editor-section {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--bg-card, #fff);
}

.sku-editor-hint {
  margin-bottom: 10px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.sku-editor-content {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.sku-selector-list {
  display: flex;
  position: sticky;
  top: 0;
  flex-direction: column;
  gap: 8px;
  max-height: 720px;
  overflow-y: auto;
}

.sku-selector-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
}

.sku-selector-item:hover {
  border-color: rgba(24, 160, 88, 0.55);
}

.sku-selector-item--active {
  border-color: #18a058;
  background: rgba(24, 160, 88, 0.08);
  box-shadow: 0 0 0 2px rgba(24, 160, 88, 0.1);
}

.sku-selector-item img,
.sku-selector-item__placeholder {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 6px;
}

.sku-selector-item img {
  object-fit: cover;
}

.sku-selector-item__placeholder {
  display: grid;
  place-items: center;
  background: var(--bg-card, #fff);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
}

.sku-selector-item__content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.sku-selector-item__content strong {
  overflow: hidden;
  font-family: monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sku-selector-item__content small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sku-selector-item__status {
  flex: none;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(24, 160, 88, 0.12);
  color: #18a058;
  font-size: 10px;
}

.sku-selector-item__status.is-manual {
  background: rgba(32, 128, 240, 0.12);
  color: #2080f0;
}

.sku-editor-card {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-elevated);
}

.sku-editor-card--collected {
  border-color: rgba(24, 160, 88, 0.28);
  box-shadow: inset 3px 0 0 #18a058;
}

.sku-editor-card__header {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sku-editor-card__image {
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 6px;
}

.sku-editor-card__identity {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.sku-editor-card__eyebrow {
  color: var(--text-muted);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.sku-editor-card__identity strong {
  color: var(--text-secondary);
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
}

.sku-editor-card__identity span {
  color: var(--text-muted);
  font-size: 11px;
  word-break: break-word;
}

.sku-editor-card__values {
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed var(--border-color);
}

.sku-facts {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid rgba(24, 160, 88, 0.2);
  border-radius: 6px;
  background: var(--bg-card, #fff);
}

.sku-subsection-title {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.sku-subsection-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sku-subsection-heading--editable,
.sku-subsection-title--editable {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-color);
}

.sku-editable-images {
  margin-top: 12px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-card, #fff);
}

.sku-image-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 8px;
}

.image-manager {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.image-card {
  position: relative;
  width: 82px;
  height: 82px;
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-elevated, #f8f9fa);
}

.image-card .gallery-img {
  display: block;
}

.image-actions {
  position: absolute;
  right: 2px;
  bottom: 2px;
  left: 2px;
  display: flex;
  justify-content: center;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.58);
}

.image-actions :deep(.n-button) {
  min-width: 22px;
  height: 22px;
  padding: 0 3px;
}

.image-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-muted);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.image-add:hover {
  border-color: rgba(24, 160, 88, 0.55);
  color: #18a058;
}

.image-add__icon {
  font-size: 24px;
  line-height: 1;
}

.main-badge {
  position: absolute;
  top: 3px;
  left: 3px;
  padding: 1px 4px;
  border-radius: 4px;
  background: rgba(24, 160, 88, 0.9);
  color: #fff;
  font-size: 9px;
  line-height: 1.4;
}

.image-upload-input {
  display: none;
}

.image-editor-modal {
  width: 100%;
  height: 100%;
  background: var(--bg-card, #fff);
}

.sku-media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 72px);
  gap: 6px;
  margin-top: 8px;
}

.sku-video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.sku-video-grid video {
  width: 100%;
  max-height: 180px;
  border-radius: 6px;
  background: #111;
}

.sku-fact-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 9px;
}

.sku-fact-grid > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
}

.sku-fact-grid span,
.sku-identifiers span,
.sku-supplier-fact span {
  color: var(--text-muted);
  font-size: 10px;
}

.sku-fact-grid strong {
  color: var(--text-secondary);
  font-size: 12px;
  word-break: break-word;
}

.sku-identifiers {
  display: grid;
  gap: 4px;
  margin-top: 9px;
}

.sku-identifiers > div,
.sku-supplier-fact {
  display: grid;
  grid-template-columns: minmax(90px, 0.45fr) minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
}

.sku-identifiers code,
.sku-supplier-fact strong {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  word-break: break-all;
}

.sku-supplier-facts {
  margin-top: 8px;
}

.sku-editor-card__source {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sku-editor-card__source a {
  color: #2080f0;
}

.sku-editor-card__empty {
  margin-top: 9px;
  color: var(--text-muted);
  font-size: 11px;
}

.sku-editor-card__empty--manual {
  padding: 10px;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  background: var(--bg-elevated);
  line-height: 1.5;
}

.sku-pricing-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.sku-readonly-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 7px 9px;
  border: 1px solid rgba(24, 160, 88, 0.2);
  border-radius: 6px;
  background: var(--bg-card, #fff);
}

.sku-readonly-field span {
  color: var(--text-muted);
  font-size: 10px;
}

.sku-readonly-field strong {
  color: var(--text-secondary);
  font-size: 13px;
  word-break: break-word;
}

.sku-editor-card__hint {
  margin-top: 7px;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.5;
}

.sku-editor-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.sku-editor-field {
  min-width: 0;
}

.sku-editor-field--wide {
  margin-top: 10px;
}

.sku-editor-card__source {
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 10px;
  word-break: break-all;
}

.sku-editor-empty {
  padding: 18px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  background: var(--bg-elevated);
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

.sku-add-button {
  margin-top: 10px;
}

/* ── 编辑抽屉底部 ── */
.edit-drawer-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* ── 响应式 ── */
@media (max-width: 760px) {
  .sku-editor-content {
    grid-template-columns: 1fr;
  }

  .sku-selector-list {
    position: static;
    max-height: 240px;
  }
}

@media (max-width: 600px) {
  .panel-right {
    padding: 10px 0;
  }

  .sku-editor-card__header {
    flex-wrap: wrap;
  }

  .sku-editor-fields,
  .sku-pricing-grid {
    grid-template-columns: 1fr;
  }

  .sku-fact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* ── 深色模式: 抽屉及内部组件适配 ── */
[data-theme="dark"] .n-drawer {
  --n-color: var(--bg-main, #1a1a2e) !important;
}

[data-theme="dark"] .n-drawer-content {
  background-color: var(--bg-main, #1a1a2e) !important;
}

[data-theme="dark"] .n-drawer-header {
  background-color: var(--bg-main, #1a1a2e) !important;
  border-bottom-color: var(--border-color, rgba(255, 255, 255, 0.08)) !important;
}

[data-theme="dark"] .n-drawer-footer {
  background-color: var(--bg-main, #1a1a2e) !important;
  border-top-color: var(--border-color, rgba(255, 255, 255, 0.08)) !important;
}

[data-theme="dark"] .panel-right {
  background: #16213e !important;
}

[data-theme="dark"] .n-collapse-item {
  --n-title-font-size: 14px;
}

@media (max-width: 700px) {
  .filter-row {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-group {
    flex-wrap: wrap;
  }

  .filter-actions {
    margin-left: 0;
    justify-content: flex-end;
  }
}

/* ── 上传弹窗 ── */
.upload-modal {
  width: 860px !important;
}

.upload-modal .n-card-body {
  max-height: 65vh;
  overflow-y: auto;
}

.upload-modal .n-card-header {
  padding-bottom: 0;
}

.upload-modal__header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.upload-modal__title {
  font-size: 18px;
  font-weight: 700;
}

.upload-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px 0;
}

.upload-section {
  background: var(--bg-elevated, #f8f9fa);
  border-radius: 10px;
  padding: 16px 20px;
}

.upload-section__title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.upload-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.upload-field__label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary, #666);
}

.upload-field .required {
  color: #d03050;
  margin-left: 2px;
}

.upload-price-result {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--border-color, #e0e0e0);
}

.upload-price-result__header {
  font-size: 13px;
  font-weight: 600;
  color: #18a058;
  margin-bottom: 10px;
}

.price-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 10px;
  background: var(--card-bg, #fff);
  border-radius: 8px;
  border: 1px solid var(--border-color, #e0e0e0);
  transition: border-color 0.2s;
}

.price-card:hover {
  border-color: #18a058;
}

.price-card__label {
  font-size: 11px;
  color: var(--text-muted, #999);
}

.price-card__value {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-color, #333);
}

.price-card--final {
  background: linear-gradient(135deg, #e8f8ef, #d4f1e4);
  border-color: #18a058;
}

.price-card--final .price-card__value {
  color: #18a058;
}

.upload-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 4px;
}

/* ── 1688 搜索结果 ── */
.search1688-results {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.search1688-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color, #e0e0e0);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search1688-card:hover {
  border-color: #18a058;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.12);
}

.search1688-card__info {
  flex: 1;
  min-width: 0;
}

.search1688-card__title {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.search1688-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}
</style>
