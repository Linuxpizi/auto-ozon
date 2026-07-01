<template>
  <div class="container">
    <n-tabs v-model:value="activeTab" type="line" style="margin-bottom: 0">
      <n-tab-pane name="scrape" tab="采集商品">
    <div class="card">
      <div class="page-header">
        <n-h2 class="page-title" style="margin: 0">采集商品</n-h2>
        <n-space>
          <n-popconfirm @positive-click="batchDeleteProducts">
            <template #trigger>
              <n-button size="small" type="error" :disabled="selectedKeys.length === 0">
                删除选中 ({{ selectedKeys.length }})
              </n-button>
            </template>
            确定删除选中的 {{ selectedKeys.length }} 个商品？
          </n-popconfirm>
          <n-button size="small" @click="loadProducts" :loading="loading">刷新</n-button>
        </n-space>
      </div>

      <!-- 筛选栏 -->
      <div class="filter-bar">
        <div class="filter-row">
          <div class="filter-group">
            <n-input v-model:value="keyword" placeholder="搜索名称 / SKU / 品类" clearable size="small" @keyup.enter="loadProducts" />
            <n-select v-model:value="filterBrand" :options="brandOptions" placeholder="品牌" clearable filterable size="small" @update:value="loadProducts" />
            <n-select v-model:value="filterPlatform" :options="platformOptions" placeholder="平台" clearable size="small" @update:value="loadProducts" />
          </div>
          <div class="filter-group">
            <n-input-number v-model:value="minPrice" placeholder="最低价" :min="0" size="small" @update:value="loadProducts" />
            <n-input-number v-model:value="maxPrice" placeholder="最高价" :min="0" size="small" @update:value="loadProducts" />
            <n-input-number v-model:value="minRating" placeholder="最低评分" :min="0" :max="5" :step="0.1" size="small" @update:value="loadProducts" />
            <n-input-number v-model:value="minReviews" placeholder="最低评论数" :min="0" size="small" @update:value="loadProducts" />
          </div>
          <div class="filter-group filter-actions">
            <n-button type="primary" size="small" @click="loadProducts">搜索</n-button>
            <n-button size="small" @click="resetFilters">重置</n-button>
          </div>
        </div>
      </div>

      <!-- 统计信息 -->
      <div class="table-info">
        共 <strong>{{ totalCount }}</strong> 个商品
        <span v-if="filterBrand"> · 品牌: {{ filterBrand }}</span>
        <span v-if="keyword"> · 关键词: {{ keyword }}</span>
        <span v-if="filterPlatform"> · 平台: {{ filterPlatform }}</span>
      </div>

      <!-- 数据表格 -->
      <n-data-table
        :columns="columns"
        :data="products"
        :loading="loading"
        :row-key="(row: any) => row.id"
        :checked-row-keys="selectedKeys"
        @update:checked-row-keys="(keys: any) => selectedKeys = keys as number[]"
        size="small"
        striped
        :scroll-x="1600"
        :max-height="600"
        :pagination="pagination"
        remote
        @update:page="onPageChange"
        @update:page-size="onPageSizeChange"
      />
    </div>

  <!-- ========== 详情抽屉 ========== -->
  <n-drawer v-model:show="drawerVisible" :width="720" placement="right" :closable="true">
    <n-drawer-content :title="null" :native-scrollbar="false" body-content-style="padding: 20px 24px 16px">
      <!-- 标题栏：平台标签 + 来源ID -->
      <template v-if="detailProduct">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px">
          <n-tag :type="detailProduct.platform === 'ozon' ? 'info' : 'success'" size="small" round>
            {{ detailProduct.platform?.toUpperCase() }}
          </n-tag>
          <n-text depth="3" style="font-size: 12px">ID: {{ detailProduct.source_id }}</n-text>
        </div>

        <!-- 数据指标行：评分 / 评论数 / 折扣 / 库存 (只读展示) -->
        <div class="metrics-bar">
          <div class="metric-item">
            <span class="metric-value" style="color: #f5a623">★ {{ detailProduct.rating || '—' }}</span>
            <span class="metric-label">{{ detailProduct.review_count?.toLocaleString() || 0 }} 评论</span>
          </div>
          <div v-if="detailProduct.discount" class="metric-item">
            <n-tag type="error" size="small" round>{{ detailProduct.discount }}</n-tag>
          </div>
          <div v-if="detailProduct.old_price && detailProduct.old_price > (detailProduct.price || 0)" class="metric-item">
            <span class="metric-label" style="text-decoration: line-through">{{ detailProduct.old_price?.toLocaleString() }} {{ (detailProduct.currency || '').toUpperCase() === 'CNY' ? '¥' : '₽' }}</span>
            <span class="metric-value">{{ detailProduct.price?.toLocaleString() }} {{ (detailProduct.currency || '').toUpperCase() === 'CNY' ? '¥' : '₽' }}</span>
          </div>
          <div v-else class="metric-item">
            <span class="metric-value">{{ detailProduct.price?.toLocaleString() || '—' }} {{ (detailProduct.currency || '').toUpperCase() === 'CNY' ? '¥' : '₽' }}</span>
          </div>
          <div v-if="detailProduct.stock" class="metric-item">
            <n-tag size="small" round :bordered="false">{{ detailProduct.stock }}</n-tag>
          </div>
        </div>

        <n-divider style="margin: 12px 0" />

        <!-- 图片区：主图 + 附图 -->
        <div style="margin-bottom: 12px">
          <div class="section-label">图片</div>
          <div v-if="detailProduct.images?.length" class="gallery-row">
            <div v-for="(img, idx) in detailProduct.images" :key="idx" class="gallery-item" :class="{ 'is-main': idx === 0 }">
              <n-image
                :src="img"
                :width="idx === 0 ? 110 : 72"
                :height="idx === 0 ? 110 : 72"
                object-fit="cover"
                class="gallery-img"
              />
              <span v-if="idx === 0" class="main-badge">主图</span>
              <span v-else class="img-index">{{ idx + 1 }}</span>
            </div>
          </div>
          <div v-else style="padding: 10px 0; color: #999; font-size: 13px">暂无图片</div>
        </div>

        <n-divider style="margin: 12px 0" />

        <!-- 可折叠区 -->
        <n-collapse default-expanded-names="basic" accordion>
          <!-- ━━ 基本信息 ━━ -->
          <n-collapse-item name="basic" title="📋 基本信息">
            <div class="section-body">
              <div class="field-group">
                <label class="field-label">标题 <n-button size="tiny" quaternary type="primary" @click="handleAiOptimize('title')"><template #icon><span>✨</span></template>AI 优化</n-button></label>
                <n-input v-model:value="detailProduct.title" type="textarea" :rows="2" placeholder="商品标题" />
                <div v-if="isModified('title')" class="original-hint">
                  <n-text depth="3" tag="span" style="font-size: 11px">原始：</n-text>
                  <n-text depth="3" tag="span" style="font-size: 11px; text-decoration: line-through">{{ originalProduct?.title || '无' }}</n-text>
                </div>
              </div>
              <div class="field-row-3">
                <div class="field-group">
                  <label class="field-label">品牌</label>
                  <n-input v-model:value="detailProduct.brand" size="small" placeholder="品牌" />
                  <div v-if="isModified('brand')" class="original-hint">
                    <n-text depth="3" tag="span" style="font-size: 11px">原始：{{ originalProduct?.brand || '无' }}</n-text>
                  </div>
                </div>
                <div class="field-group">
                  <label class="field-label">分类</label>
                  <n-input v-model:value="detailProduct.category" size="small" placeholder="分类" />
                  <div v-if="isModified('category')" class="original-hint">
                    <n-text depth="3" tag="span" style="font-size: 11px">原始：{{ originalProduct?.category || '无' }}</n-text>
                  </div>
                </div>
                <div class="field-group">
                  <label class="field-label">卖家</label>
                  <n-input v-model:value="detailProduct.seller_name" size="small" placeholder="卖家" />
                </div>
              </div>
              <div class="field-row-2">
                <div class="field-group">
                  <label class="field-label">现价 ({{ (detailProduct?.currency || '').toUpperCase() === 'CNY' ? '¥' : '₽' }})</label>
                  <n-input-number v-model:value="detailProduct.price" :min="0" size="small" style="width: 100%" />
                  <div v-if="isModified('price')" class="original-hint">
                    <n-text depth="3" tag="span" style="font-size: 11px">原始：{{ originalProduct?.price?.toLocaleString() || '无' }} {{ (detailProduct?.currency || '').toUpperCase() === 'CNY' ? '¥' : '₽' }}</n-text>
                  </div>
                </div>
                <div class="field-group">
                  <label class="field-label">原价 ({{ (detailProduct?.currency || '').toUpperCase() === 'CNY' ? '¥' : '₽' }})</label>
                  <n-input-number v-model:value="detailProduct.old_price" :min="0" size="small" style="width: 100%" />
                  <div v-if="isModified('old_price')" class="original-hint">
                    <n-text depth="3" tag="span" style="font-size: 11px">原始：{{ originalProduct?.old_price?.toLocaleString() || '无' }} {{ (detailProduct?.currency || '').toUpperCase() === 'CNY' ? '¥' : '₽' }}</n-text>
                  </div>
                </div>
              </div>
            </div>
          </n-collapse-item>

          <!-- ━━ 规格与标识 ━━ -->
          <n-collapse-item name="specs" title="📐 规格与标识">
            <div class="section-body">
              <div class="field-row-3">
                <div class="field-group">
                  <label class="field-label">供应商 SKU</label>
                  <n-input v-model:value="detailProduct.supplier_sku" size="small" placeholder="供应商 SKU" />
                </div>
                <div class="field-group">
                  <label class="field-label">条形码</label>
                  <n-input v-model:value="detailProduct.barcode" size="small" placeholder="EAN / GTIN" />
                </div>
                <div class="field-group">
                  <label class="field-label">视频 URL</label>
                  <n-input v-model:value="detailProduct.video_url" size="small" placeholder="https://..." />
                </div>
              </div>
              <div class="field-row-4">
                <div class="field-group">
                  <label class="field-label">重量 (g)</label>
                  <n-input-number v-model:value="detailProduct.weight_g" :min="0" size="small" style="width: 100%" />
                </div>
                <div class="field-group">
                  <label class="field-label">长 (mm)</label>
                  <n-input-number v-model:value="detailProduct.depth_mm" :min="0" size="small" style="width: 100%" />
                </div>
                <div class="field-group">
                  <label class="field-label">高 (mm)</label>
                  <n-input-number v-model:value="detailProduct.height_mm" :min="0" size="small" style="width: 100%" />
                </div>
                <div class="field-group">
                  <label class="field-label">宽 (mm)</label>
                  <n-input-number v-model:value="detailProduct.width_mm" :min="0" size="small" style="width: 100%" />
                </div>
              </div>
            </div>
          </n-collapse-item>

          <!-- ━━ 商品属性 ━━ -->
          <n-collapse-item name="attrs" title="🏷️ 商品属性">
            <div class="section-body">
              <div v-if="detailProduct.attributes?.length">
                <div v-for="(attr, idx) in detailProduct.attributes" :key="idx" class="attr-row">
                  <n-input v-model:value="attr.name" size="small" placeholder="属性名" style="flex: 0 0 110px" />
                  <n-input v-model:value="attr.value" size="small" placeholder="属性值" style="flex: 1" />
                  <n-button size="tiny" quaternary type="error" circle @click="removeAttribute(idx)">✕</n-button>
                </div>
              </div>
              <n-empty v-else description="暂无属性" size="small" />
              <n-space style="margin-top: 10px">
                <n-button size="small" dashed @click="addAttribute">+ 添加属性</n-button>
                <n-button size="small" type="primary" @click="handleAiOptimize('attrs')">
                  ✨ AI 优化全部属性
                </n-button>
              </n-space>
            </div>
          </n-collapse-item>

          <!-- ━━ 商品描述 ━━ -->
          <n-collapse-item name="desc" title="📝 商品描述">
            <div class="section-body">
              <n-input v-model:value="detailProduct.description" type="textarea" :rows="4" placeholder="商品描述内容" />
              <div v-if="isModified('description')" class="original-hint" style="margin-top: 4px">
                <n-text depth="3" tag="span" style="font-size: 11px">原始描述已修改</n-text>
              </div>
              <div style="margin-top: 8px">
                <n-button size="small" type="primary" @click="handleAiOptimize('description')">
                  ✨ AI 优化描述
                </n-button>
              </div>
            </div>
          </n-collapse-item>

          <!-- ━━ 来源 ━━ -->
          <n-collapse-item name="source" title="🔗 来源链接">
            <div style="padding: 4px 0; font-size: 13px; word-break: break-all">
              <a v-if="detailProduct.source_url" :href="detailProduct.source_url" target="_blank" rel="noopener" style="color: #2080f0; text-decoration: none">
                {{ detailProduct.source_url }}
              </a>
              <n-text v-else depth="3">无链接</n-text>
            </div>
          </n-collapse-item>
        </n-collapse>
      </template>

      <template #footer>
        <n-space justify="end">
          <n-popconfirm @positive-click="handleDelete">
            <template #trigger>
              <n-button type="error" size="small">删除</n-button>
            </template>
            确定删除此商品？
          </n-popconfirm>
          <n-button size="small" @click="openUpload">上传到店铺</n-button>
          <n-button type="primary" size="small" :loading="drawerSaving" @click="saveDetail">保存修改</n-button>
        </n-space>
      </template>
    </n-drawer-content>
  </n-drawer>

  <!-- ========== 上传弹窗 ========== -->
  <n-modal v-model:show="uploadVisible" preset="card" title="上传到 Ozon" style="width: 640px" :bordered="false">
    <n-alert v-if="uploadProduct" type="info" style="margin-bottom: 12px">
      <strong>{{ truncateText(uploadProduct.title, 50) }}</strong>
      <span style="margin-left: 8px; color: #999">ID: {{ uploadProduct.source_id }}</span>
    </n-alert>

    <n-spin :show="uploadCatLoading">
      <n-form label-placement="left" label-width="100" :model="uploadForm">

        <!-- ── 店铺 ── -->
        <n-form-item label="目标店铺" required>
          <n-select v-model:value="uploadForm.store_id" :options="storeOptions" placeholder="选择目标店铺" filterable style="width: 100%" @update:value="onUploadStoreChange" />
        </n-form-item>

        <!-- ── 分类 ── -->
        <n-form-item label="Ozon 分类" required>
          <n-space vertical :size="8" style="width: 100%">
            <n-input v-model:value="categorySearchText" placeholder="搜索分类名称…" size="small" clearable :disabled="!uploadForm.store_id" @update:value="filterCategoryTree" />
            <div style="border: 1px solid var(--border-light); border-radius: 6px; max-height: 220px; overflow-y: auto; padding: 4px">
              <n-empty v-if="filteredCategoryTree.length === 0 && !uploadCatLoading" description="无匹配分类" />
              <n-tree
                v-else
                :data="filteredCategoryTree"
                :default-expand-all="false"
                :selected-keys="categorySelectedKeys"
                selectable
                cascade
                :select-leaf="true"
                block-line
                node-key="category_id"
                label-field="title"
                children-field="children"
                style="font-size: 13px"
                @update:selected-keys="onCategorySelect"
              />
            </div>
            <n-text v-if="uploadForm.description_category_id" depth="3" tag="div" style="font-size: 12px">
              已选分类 ID: {{ uploadForm.description_category_id }}
              <template v-if="uploadForm.type_id"> · Type: {{ uploadForm.type_id }}</template>
            </n-text>
          </n-space>
        </n-form-item>

        <!-- ── 分类属性 ── -->
        <n-form-item v-if="uploadAttrs.length > 0" label="分类属性">
          <n-space vertical :size="8" style="width: 100%">
            <div v-for="attr in uploadAttrs" :key="attr.attribute_id" style="display: flex; align-items: center; gap: 8px">
              <span style="min-width: 120px; font-size: 13px; flex-shrink: 0">
                {{ attr.name }}
                <n-tag v-if="attr.is_required" type="error" size="tiny" :bordered="false" style="margin-left: 2px">必填</n-tag>
              </span>
              <!-- 字典类型属性: 下拉选择 -->
              <n-select
                v-if="attr.type === 'String' && attr.dictionary_id && attr.attribute_values.length > 0"
                :value="getUploadAttrValue(attr.attribute_id)"
                :options="attr.attribute_values.map((v: any) => ({ label: v.value, value: v.dictionary_value_id }))"
                placeholder="请选择"
                filterable
                size="small"
                style="flex: 1"
                @update:value="(val: any) => setUploadAttrValue(attr.attribute_id, val)"
              />
              <!-- 布尔类型 -->
              <n-switch
                v-else-if="attr.type === 'Boolean'"
                :value="!!getUploadAttrValue(attr.attribute_id)"
                size="small"
                @update:value="(val: boolean) => setUploadAttrValue(attr.attribute_id, val)"
              />
              <!-- 数值类型 -->
              <n-input-number
                v-else-if="attr.type === 'Integer' || attr.type === 'Decimal'"
                :value="getUploadAttrValue(attr.attribute_id)"
                size="small"
                style="flex: 1"
                @update:value="(val: any) => setUploadAttrValue(attr.attribute_id, val)"
              />
              <!-- 字符串/日期等: 文本输入 -->
              <n-input
                v-else
                :value="getUploadAttrValue(attr.attribute_id)"
                size="small"
                :placeholder="attr.description || '请输入'"
                style="flex: 1"
                @update:value="(val: string) => setUploadAttrValue(attr.attribute_id, val)"
              />
            </div>
            <n-button v-if="uploadAttrs.length > 5" quaternary size="tiny" @click="uploadAttrsExpanded = !uploadAttrsExpanded">
              {{ uploadAttrsExpanded ? '收起' : `展开全部 (${uploadAttrs.length})` }}
            </n-button>
          </n-space>
        </n-form-item>

        <!-- ── 价格 ── -->
        <n-form-item label="定价 (₽)">
          <n-space vertical :size="8" style="width: 100%">
            <n-grid :cols="2" :x-gap="8">
              <n-gi>
                <div style="font-size: 12px; color: #999; margin-bottom: 2px">人民币进价 (¥)</div>
                <n-input-number v-model:value="uploadForm.price_cny" :min="0" size="small" style="width: 100%" @update:value="calcUploadPrice" />
              </n-gi>
              <n-gi>
                <div style="font-size: 12px; color: #999; margin-bottom: 2px">目标售价 (₽)</div>
                <n-input-number v-model:value="uploadForm.price_rub" :min="0" size="small" style="width: 100%" />
              </n-gi>
            </n-grid>
            <n-grid :cols="3" :x-gap="8">
              <n-gi>
                <div style="font-size: 12px; color: #999; margin-bottom: 2px">汇率</div>
                <n-input-number v-model:value="uploadForm.exchange_rate" :min="1" :step="0.5" size="small" style="width: 100%" @update:value="calcUploadPrice" />
              </n-gi>
              <n-gi>
                <div style="font-size: 12px; color: #999; margin-bottom: 2px">加价倍率</div>
                <n-input-number v-model:value="uploadForm.markup_factor" :min="1" :step="0.1" size="small" style="width: 100%" @update:value="calcUploadPrice" />
              </n-gi>
              <n-gi>
                <div style="font-size: 12px; color: #999; margin-bottom: 2px">佣金 %</div>
                <n-input-number v-model:value="uploadForm.commission_pct" :min="0" :max="100" :step="1" size="small" style="width: 100%" @update:value="calcUploadPrice" />
              </n-gi>
            </n-grid>
            <n-grid :cols="2" :x-gap="8">
              <n-gi>
                <div style="font-size: 12px; color: #999; margin-bottom: 2px">物流 (₽)</div>
                <n-input-number v-model:value="uploadForm.logistics_rub" :min="0" size="small" style="width: 100%" @update:value="calcUploadPrice" />
              </n-gi>
              <n-gi>
                <div style="font-size: 12px; color: #999; margin-bottom: 2px">包装 (₽)</div>
                <n-input-number v-model:value="uploadForm.packaging_rub" :min="0" size="small" style="width: 100%" @update:value="calcUploadPrice" />
              </n-gi>
            </n-grid>
            <n-alert v-if="priceCalcResult" type="success" size="small" style="margin: 0">
              <n-space :size="16">
                <span>进价 <strong>₽{{ priceCalcResult.cost_rub }}</strong></span>
                <span>加价后 <strong>₽{{ priceCalcResult.markup_price_rub }}</strong></span>
                <span>佣金 <strong>₽{{ priceCalcResult.commission_rub }}</strong></span>
                <span>最终 <strong style="color: #d03050; font-size: 15px">₽{{ priceCalcResult.final_price_rub }}</strong></span>
              </n-space>
            </n-alert>
          </n-space>
        </n-form-item>

        <!-- ── 物流规格 ── -->
        <n-form-item label="物流规格">
          <n-grid :cols="4" :x-gap="8">
            <n-gi>
              <div style="font-size: 12px; color: #999; margin-bottom: 2px">重量 (g)</div>
              <n-input-number v-model:value="uploadForm.weight_g" :min="0" size="small" style="width: 100%" />
            </n-gi>
            <n-gi>
              <div style="font-size: 12px; color: #999; margin-bottom: 2px">高 (mm)</div>
              <n-input-number v-model:value="uploadForm.height_mm" :min="0" size="small" style="width: 100%" />
            </n-gi>
            <n-gi>
              <div style="font-size: 12px; color: #999; margin-bottom: 2px">深 (mm)</div>
              <n-input-number v-model:value="uploadForm.depth_mm" :min="0" size="small" style="width: 100%" />
            </n-gi>
            <n-gi>
              <div style="font-size: 12px; color: #999; margin-bottom: 2px">宽 (mm)</div>
              <n-input-number v-model:value="uploadForm.width_mm" :min="0" size="small" style="width: 100%" />
            </n-gi>
          </n-grid>
        </n-form-item>

        <!-- ── Offer ID ── -->
        <n-form-item label="Offer ID">
          <n-input v-model:value="uploadForm.offer_id" placeholder="留空自动生成" />
        </n-form-item>

      </n-form>
    </n-spin>

    <template #footer>
      <n-space justify="end">
        <n-button @click="uploadVisible = false">取消</n-button>
        <n-button type="primary" :loading="uploading" :disabled="!uploadForm.store_id || !uploadForm.description_category_id" @click="doUpload">上传到 Ozon</n-button>
      </n-space>
    </template>
  </n-modal>
      </n-tab-pane>
      <n-tab-pane name="precision" tab="精铺管理">
        <div class="precision-tab">
          <!-- 顶部:模式选择 + 输入 -->
          <n-card size="small" style="margin-bottom: 12px">
            <n-space align="center" :size="8">
              <n-select
                v-model:value="precisionMode"
                :options="[
                  { label: 'OZON 链接', value: 'copy_ozon' },
                  { label: '手动填写', value: 'external' },
                ]"
                style="width: 130px"
                size="small"
              />
              <n-input
                v-if="precisionMode === 'copy_ozon'"
                v-model:value="precisionSourceUrl"
                placeholder="粘贴 OZON 商品链接"
                size="small"
                style="width: 420px"
                @keyup.enter="fetchPrecisionProduct"
              />
              <n-input
                v-if="precisionMode === 'external'"
                v-model:value="precisionManualName"
                placeholder="商品名称(中文)"
                size="small"
                style="width: 320px"
              />
              <n-button
                v-if="precisionMode === 'copy_ozon'"
                type="primary"
                size="small"
                :loading="precisionFetching"
                @click="fetchPrecisionProduct"
              >
                获取
              </n-button>
              <n-button
                v-if="precisionMode === 'external'"
                type="primary"
                size="small"
                @click="initManualProduct"
              >
                开始编辑
              </n-button>
            </n-space>
          </n-card>

          <!-- 左右对比布局 -->
          <div v-if="precisionOriginal" class="precision-editor">
            <!-- 左侧:原始采集数据(只读) -->
            <div class="precision-left">
              <div class="panel-header">
                <span class="panel-title">📋 原始采集数据</span>
                <n-tag size="tiny" :bordered="false" type="info">只读</n-tag>
              </div>
              <SourceProductAttributes :product="precisionOriginal" />
            </div>

            <!-- 右侧:可编辑的优化表单 -->
            <div class="precision-right">
              <div class="panel-header">
                <span class="panel-title">✏️ 优化编辑</span>
                <n-tag size="tiny" :bordered="false" type="warning">可编辑</n-tag>
              </div>

              <n-collapse default-expanded-names="basic">
                <!-- 基础信息 -->
                <n-collapse-item title="📦 基础信息" name="basic">
                  <div class="edit-section">
                    <div class="field-group">
                      <div class="field-label">
                        商品名称
                        <n-button size="tiny" quaternary type="primary" @click="aiOptimize('title')">
                          🤖 AI 翻译
                        </n-button>
                      </div>
                      <n-input
                        v-model:value="precisionEdit.title"
                        type="textarea"
                        :rows="2"
                        size="small"
                        placeholder="OZON 俄语标题"
                      />
                      <div v-if="precisionEdit.title_cn" class="original-hint">
                        中文: {{ precisionEdit.title_cn }}
                      </div>
                    </div>
                    <div class="field-row-3">
                      <div class="field-group">
                        <div class="field-label">品牌</div>
                        <n-input v-model:value="precisionEdit.brand" size="small" placeholder="品牌" />
                      </div>
                      <div class="field-group">
                        <div class="field-label">类目</div>
                        <n-input v-model:value="precisionEdit.category" size="small" placeholder="类目" />
                      </div>
                      <div class="field-group">
                        <div class="field-label">类目 ID</div>
                        <n-input-number v-model:value="precisionEdit.category_id" size="small" :show-button="false" style="width: 100%" placeholder="类目 ID" />
                      </div>
                    </div>
                  </div>
                </n-collapse-item>

                <!-- 价格与促销 -->
                <n-collapse-item title="💰 价格与促销" name="price">
                  <div class="edit-section">
                    <div class="field-row-3">
                      <div class="field-group">
                        <div class="field-label">售价 (₽)</div>
                        <n-input-number v-model:value="precisionEdit.price" size="small" :min="0" :precision="2" style="width: 100%" />
                      </div>
                      <div class="field-group">
                        <div class="field-label">原价 (₽)</div>
                        <n-input-number v-model:value="precisionEdit.old_price" size="small" :min="0" :precision="2" style="width: 100%" />
                      </div>
                      <div class="field-group">
                        <div class="field-label">VAT</div>
                        <n-select
                          v-model:value="precisionEdit.vat"
                          size="small"
                          :options="[
                            { label: '0% (跨境默认)', value: '0' },
                            { label: '10%', value: '0.1' },
                            { label: '20%', value: '0.2' },
                          ]"
                          style="width: 100%"
                        />
                      </div>
                    </div>
                  </div>
                </n-collapse-item>

                <!-- 物理规格(顶级,默认同步第一个变体) -->
                <n-collapse-item title="📐 物理规格 (默认变体)" name="specs">
                  <div class="edit-section">
                    <div class="original-hint" v-if="(precisionEdit.sku_list || []).length > 1">
                      💡 以下为默认变体规格,每个 SKU 变体也有独立的物理规格
                    </div>
                    <div class="field-row-4">
                      <div class="field-group">
                        <div class="field-label">重量 (g)</div>
                        <n-input-number v-model:value="precisionEdit.weight" size="small" :min="0" style="width: 100%" />
                      </div>
                      <div class="field-group">
                        <div class="field-label">宽 (mm)</div>
                        <n-input-number v-model:value="precisionEdit.width" size="small" :min="0" style="width: 100%" />
                      </div>
                      <div class="field-group">
                        <div class="field-label">高 (mm)</div>
                        <n-input-number v-model:value="precisionEdit.height" size="small" :min="0" style="width: 100%" />
                      </div>
                      <div class="field-group">
                        <div class="field-label">深 (mm)</div>
                        <n-input-number v-model:value="precisionEdit.depth" size="small" :min="0" style="width: 100%" />
                      </div>
                    </div>
                  </div>
                </n-collapse-item>

                <!-- 商品属性 -->
                <n-collapse-item title="🏷️ 商品属性" name="attrs">
                  <div class="edit-section">
                    <div class="field-label" style="margin-bottom: 8px">
                      通用属性
                      <n-button size="tiny" quaternary type="primary" @click="aiOptimize('attrs')">
                        🤖 AI 优化属性
                      </n-button>
                    </div>
                    <div v-for="(attr, idx) in (precisionEdit.attributes || [])" :key="idx" class="attr-row">
                      <n-input v-model:value="attr.name" size="small" placeholder="属性名" style="width: 140px" />
                      <n-input v-model:value="attr.value" size="small" placeholder="属性值" style="flex: 1" />
                      <n-button size="tiny" quaternary type="error" @click="precisionEdit.attributes.splice(idx, 1)">
                        ✕
                      </n-button>
                    </div>
                    <n-button size="small" quaternary @click="addPrecisionAttribute">+ 添加属性</n-button>
                  </div>
                </n-collapse-item>

                <!-- 描述内容 -->
                <n-collapse-item title="📝 描述内容" name="desc">
                  <div class="edit-section">
                    <div class="field-label">
                      商品描述 (HTML)
                      <n-button size="tiny" quaternary type="primary" @click="aiOptimize('description')">
                        🤖 AI 翻译描述
                      </n-button>
                    </div>
                    <n-input
                      v-model:value="precisionEdit.description"
                      type="textarea"
                      :rows="6"
                      size="small"
                      placeholder="OZON 俄语描述 (HTML)"
                    />
                    <div v-if="precisionEdit.description_cn" class="original-hint" style="margin-top: 6px">
                      <div style="font-size: 12px; color: #666; margin-bottom: 4px">中文描述:</div>
                      <div style="font-size: 12px; color: #999; max-height: 80px; overflow-y: auto" v-html="precisionEdit.description_cn" />
                    </div>
                  </div>
                </n-collapse-item>

                <!-- 媒体资源 -->
                <n-collapse-item title="🖼️ 媒体资源" name="media">
                  <div class="edit-section">
                    <div class="field-label" style="margin-bottom: 8px">商品图片</div>
                    <div class="gallery-row">
                      <div
                        v-for="(img, idx) in (precisionEdit.images || [])"
                        :key="idx"
                        class="gallery-item"
                        :class="{ 'is-main': idx === 0 }"
                      >
                        <n-image :src="img" width="80" height="80" object-fit="cover" style="display: block" />
                        <span v-if="idx === 0" class="main-badge">主图</span>
                      </div>
                      <n-empty v-if="!(precisionEdit.images || []).length" description="暂无图片" style="padding: 16px" />
                    </div>
                    <div class="field-group" style="margin-top: 8px">
                      <div class="field-label">视频 URL</div>
                      <n-input v-model:value="precisionEdit.video_url" size="small" placeholder="视频链接" />
                    </div>
                  </div>
                </n-collapse-item>

                <!-- SKU 变体 -->
                <n-collapse-item title="📦 SKU 变体" name="sku">
                  <div class="edit-section">
                    <div v-for="(sku, idx) in (precisionEdit.sku_list || [])" :key="idx" class="attr-row" style="flex-wrap: wrap; gap: 6px">
                      <div style="display: flex; gap: 6px; width: 100%; align-items: center">
                        <n-input v-model:value="sku.sku" size="small" placeholder="SKU" style="width: 120px" />
                        <n-input v-model:value="sku.barcode" size="small" placeholder="条形码" style="width: 120px" />
                        <n-input v-model:value="sku.name" size="small" placeholder="变体名称" style="flex: 1" />
                        <n-input-number v-model:value="sku.price" size="small" :min="0" :precision="2" placeholder="价格" style="width: 100px" />
                        <n-input-number v-model:value="sku.stock" size="small" :min="0" placeholder="库存" style="width: 80px" />
                        <n-button size="tiny" quaternary type="error" @click="precisionEdit.sku_list.splice(idx, 1)">✕</n-button>
                      </div>
                      <!-- 每个变体自带物理规格 -->
                      <div style="display: flex; gap: 6px; width: 100%; padding-left: 4px; opacity: 0.85">
                        <span style="font-size: 11px; color: var(--text-color-3); line-height: 28px; white-space: nowrap">📐</span>
                        <n-input-number v-model:value="sku.weight_g" size="tiny" :min="0" placeholder="重量g" style="width: 80px" />
                        <n-input-number v-model:value="sku.width_mm" size="tiny" :min="0" placeholder="宽mm" style="width: 80px" />
                        <n-input-number v-model:value="sku.height_mm" size="tiny" :min="0" placeholder="高mm" style="width: 80px" />
                        <n-input-number v-model:value="sku.depth_mm" size="tiny" :min="0" placeholder="深mm" style="width: 80px" />
                      </div>
                    </div>
                    <n-button size="small" quaternary @click="addPrecisionSku">+ 添加 SKU</n-button>
                  </div>
                </n-collapse-item>
              </n-collapse>

              <!-- 底部操作栏 -->
              <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--n-border-color)">
                <n-space justify="end">
                  <n-button size="small" @click="resetPrecisionEditor">重置</n-button>
                  <n-button size="small" :loading="precisionSaving" @click="savePrecisionDraft">保存草稿</n-button>
                  <n-button type="primary" size="small" :loading="precisionSaving" @click="submitPrecisionListing">提交上架</n-button>
                </n-space>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <n-empty v-if="!precisionOriginal" description="请选择商品或输入链接开始精铺编辑" style="padding: 60px 0" />
        </div>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script setup lang="ts">
import { h, ref, onMounted, reactive, watch } from "vue";
import {
  NH2, NH4, NSpace, NButton, NInput, NSelect, NInputNumber,
  NDataTable, NTag, NTooltip, NImage, NPopconfirm, NModal, NDrawer, NDrawerContent,
  NCard, NForm, NFormItem, NGrid, NGi, NAlert, NEmpty, NText, NDivider,
  NCollapse, NCollapseItem, NTabs, NTabPane,
  useMessage, type DataTableColumns, type SelectOption,
} from "naive-ui";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";
import SourceProductAttributes from "../components/SourceProductAttributes.vue";

// ── tab state ─────────────────────────────────────────────────────
const activeTab = ref("scrape");

// ── state ─────────────────────────────────────────────────────────
const loading = ref(false);
const products = ref<any[]>([]);
const selectedKeys = ref<number[]>([]);
const totalCount = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

const filterBrand = ref<string | null>(null);
const filterPlatform = ref<string | null>(null);
const keyword = ref("");
const minPrice = ref<number | null>(null);
const maxPrice = ref<number | null>(null);
const minRating = ref<number | null>(null);
const minReviews = ref<number | null>(null);
const brandOptions = ref<SelectOption[]>([]);

const platformOptions = [
  { label: "全部平台", value: "" },
  { label: "Ozon", value: "ozon" },
  { label: "Wildberries", value: "wb" },
  { label: "1688", value: "1688" },
];

const message = useMessage();

const pagination = reactive({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  pageSizes: [10, 20, 50, 100],
  showSizePicker: true,
  prefix: ({ itemCount }: { itemCount: number }) => `共 ${itemCount} 条`,
});

// ── drawer state ──────────────────────────────────────────────────
const drawerVisible = ref(false);
const drawerSaving = ref(false);
const detailProduct = ref<any>(null);
const originalProduct = ref<any>(null);  // 快照：用于区分原始值 vs 已修改值

// ── upload state ──────────────────────────────────────────────────
const uploadVisible = ref(false);
const uploading = ref(false);
const uploadProduct = ref<any>(null);
const uploadForm = reactive({
  store_id: null as number | null,
  offer_id: "",
  description_category_id: null as number | null,
  type_id: null as number | null,
  attributes: [] as { attribute_id: number; values: any[] }[],
  price_rub: null as number | null,
  price_cny: null as number | null,
  exchange_rate: 12.5,
  markup_factor: 1.5,
  commission_pct: 10,
  logistics_rub: 0,
  packaging_rub: 0,
  weight_g: null as number | null,
  height_mm: null as number | null,
  depth_mm: null as number | null,
  width_mm: null as number | null,
});
const storeOptions = ref<SelectOption[]>([]);
const uploadCatLoading = ref(false);
const categoryTreeRaw = ref<any[]>([]);
const filteredCategoryTree = ref<any[]>([]);
const categorySearchText = ref("");
const categorySelectedKeys = ref<number[]>([]);
const uploadAttrs = ref<any[]>([]);
const uploadAttrsExpanded = ref(false);
const priceCalcResult = ref<any>(null);

// ── precision editor state ────────────────────────────────────────
const precisionMode = ref("copy_ozon");
const precisionSourceUrl = ref("");
const precisionManualName = ref("");
const precisionFetching = ref(false);
const precisionSaving = ref(false);
const precisionOriginal = ref<any>(null);
const precisionEdit = ref<any>(null);

// ── helpers ───────────────────────────────────────────────────────
const _CURRENCY_MAP: Record<string, string> = { RUB: '₽', CNY: '¥', USD: '$', EUR: '€' };

function formatPrice(price: number | string, currency?: string): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  if (!num) return "—";
  const sym = _CURRENCY_MAP[(currency || '').toUpperCase()] || '₽';
  return num.toLocaleString('zh-CN') + ' ' + sym;
}

function calcDiscount(price: number, oldPrice: number): string {
  if (!oldPrice || oldPrice <= price) return "";
  const pct = Math.round(((oldPrice - price) / oldPrice) * 100);
  return pct > 0 ? `-${pct}%` : "";
}

function truncateText(text: string, maxLen: number): string {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

function truncateUrl(url: string): string {
  if (!url) return "";
  return url.length > 60 ? url.slice(0, 60) + "..." : url;
}

function brandTagType(brand: string): "" | "info" | "success" | "warning" | "error" {
  const b = (brand || "").toLowerCase();
  if (b.includes("samsung") || b.includes("apple")) return "success";
  if (b.includes("xiaomi") || b.includes("huawei")) return "info";
  if (b.includes("weiss") || b.includes("indesit")) return "warning";
  return "";
}

function imageSlot(row: any) {
  const imgs = row.images || [];
  if (!imgs.length) {
    return h("span", { style: "color: #999; font-size: 12px" }, "无图");
  }
  return h(NImage, {
    src: imgs[0],
    width: 48,
    height: 48,
    objectFit: "cover",
    style: "border-radius: 4px; border: 1px solid #e0e0e6; cursor: pointer",
    fallbackSrc: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect fill=%22%23f0f0f0%22 width=%2248%22 height=%2248%22/><text x=%2224%22 y=%2228%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%228%22>/img</text></svg>",
  });
}

function nameSlot(row: any) {
  return h("div", { style: "max-width: 280px" }, [
    h("div", {
      style: "font-size: 13px; font-weight: 500; cursor: pointer; color: var(--n-text-color)",
      onClick: () => openDrawer(row),
    }, truncateText(row.title || "", 55)),
    row.discount
      ? h(NTag, { type: "error", size: "tiny", style: "margin-top: 2px" }, () => row.discount)
      : null,
  ]);
}

function priceSlot(row: any) {
  const discount = calcDiscount(row.price, row.old_price);
  const cur = row.currency || '';
  return h("div", { style: "white-space: nowrap" }, [
    h("div", { style: "font-weight: 600; font-size: 13px" }, formatPrice(row.price, cur)),
    row.old_price && row.old_price > row.price
      ? h("div", { style: "font-size: 11px; color: #999; text-decoration: line-through" }, formatPrice(row.old_price, cur))
      : null,
    discount
      ? h(NTag, { type: "error", size: "tiny", style: "margin-top: 2px" }, () => discount)
      : null,
  ]);
}

function ratingSlot(row: any) {
  const r = row.rating || 0;
  const c = row.review_count || 0;
  if (!r) return h("span", { style: "color: #999" }, "—");
  return h("div", [
    h("span", { style: "color: #f5a623; font-weight: 600" }, "\u2605 " + r.toFixed(1)),
    h("span", { style: "color: #999; font-size: 11px; margin-left: 4px" }, `(${c.toLocaleString()})`),
  ]);
}

function attrsSlot(row: any) {
  const attrs = row.attributes || [];
  if (!attrs.length) return h("span", { style: "color: #999; font-size: 12px" }, "—");
  const display = attrs.slice(0, 3);
  const items = display.map((a: any) =>
    h(NTooltip, { trigger: "hover" }, {
      trigger: () => h(NTag, { size: "tiny", bordered: false, style: "margin: 1px 2px" },
        () => `${a.name}: ${truncateText(a.value || "", 20)}`),
      default: () => `${a.name}: ${a.value || ""}`,
    })
  );
  if (attrs.length > 3) {
    items.push(h(NTag, { size: "tiny", bordered: false, type: "info" }, () => `+${attrs.length - 3}`));
  }
  return h("div", { style: "max-width: 260px" }, items);
}

function actionsSlot(row: any) {
  return h(NSpace, { size: 2, wrap: false }, () => [
    h(NButton, { size: "tiny", secondary: true, type: "primary", onClick: () => goToPrecision(row), style: "padding: 0 6px" }, () => "详情"),
    h(NButton, { size: "tiny", secondary: true, onClick: () => openDrawer(row), style: "padding: 0 6px" }, () => "编辑"),
    h(NButton, { size: "tiny", secondary: true, type: "info", onClick: () => openUpload(row), style: "padding: 0 6px" }, () => "上传"),
    h(
      NPopconfirm,
      { onPositiveClick: () => deleteSingleProduct(row.id) },
      {
        trigger: () => h(NButton, { size: "tiny", secondary: true, type: "error", style: "padding: 0 6px" }, () => "删除"),
        default: () => "确定删除该商品？",
      }
    ),
  ]);
}

// ── columns ───────────────────────────────────────────────────────
const columns: DataTableColumns<any> = [
  {
    type: "selection",
    width: 40,
    fixed: "left" as const,
  },
  { title: "图片", key: "images", width: 64, render: imageSlot, fixed: "left" as const },
  { title: "商品名称", key: "title", minWidth: 260, render: nameSlot, ellipsis: { tooltip: true } },
  { title: "品牌", key: "brand", width: 110, render: (row) => h(NTag, { type: brandTagType(row.brand), size: "small", bordered: false }, () => row.brand || "\u2014") },
  { title: "价格", key: "price", width: 140, render: priceSlot },
  { title: "评分", key: "rating", width: 110, render: ratingSlot },
  { title: "属性", key: "attributes", minWidth: 260, render: attrsSlot },
  { title: "分类", key: "category", width: 140, render: (row) => h("span", { style: "font-size: 12px; color: #999" }, truncateText(row.category || "", 30)) },
  { title: "操作", key: "actions", width: 210, render: actionsSlot, fixed: "right" as const },
];

// ── drawer ────────────────────────────────────────────────────────
function openDrawer(row: any) {
  detailProduct.value = JSON.parse(JSON.stringify(row));
  originalProduct.value = JSON.parse(JSON.stringify(row)); // 快照
  drawerVisible.value = true;
}

/** 判断某字段是否被修改过（与原始值不同） */
function isModified(field: string): boolean {
  if (!originalProduct.value || !detailProduct.value) return false;
  const orig = originalProduct.value[field];
  const curr = detailProduct.value[field];
  if (typeof orig === "number" && typeof curr === "number") return orig !== curr;
  return String(orig ?? "") !== String(curr ?? "");
}

/** AI 优化（预留入口，后续接入 AI API） */
function handleAiOptimize(target: "title" | "attrs" | "description") {
  if (target === "title") {
    message.info("AI 优化标题功能即将上线，敬请期待 ✨");
  } else if (target === "attrs") {
    message.info("AI 优化属性功能即将上线，敬请期待 ✨");
  } else {
    message.info("AI 优化描述功能即将上线，敬请期待 ✨");
  }
}

function addAttribute() {
  if (!detailProduct.value) return;
  if (!detailProduct.value.attributes) detailProduct.value.attributes = [];
  detailProduct.value.attributes.push({ name: "", value: "" });
}

function removeAttribute(idx: number) {
  if (!detailProduct.value?.attributes) return;
  detailProduct.value.attributes.splice(idx, 1);
}

async function saveDetail() {
  if (!detailProduct.value) return;
  drawerSaving.value = true;
  try {
    const d = detailProduct.value;
    // 只提交可编辑字段，评分/评论数/折扣/库存为只读不提交
    await apiPut(`/selection/products/${d.id}`, {
      title: d.title,
      brand: d.brand,
      category: d.category,
      price: d.price,
      old_price: d.old_price,
      description: d.description,
      source_url: d.source_url,
      images: d.images,
      attributes: d.attributes,
      seller_name: d.seller_name,
      seller_url: d.seller_url,
      video_urls: d.video_urls || [],
      sku_list: d.sku_list || [],
      spec_list: d.spec_list || [],
    });
    message.success("保存成功");
    drawerVisible.value = false;
    await loadProducts();
  } catch (e: any) {
    message.error("保存失败: " + e.message);
  } finally {
    drawerSaving.value = false;
  }
}

async function handleDelete() {
  if (!detailProduct.value) return;
  try {
    await apiDelete(`/selection/products/${detailProduct.value.id}`);
    message.success("已删除");
    drawerVisible.value = false;
    await loadProducts();
    await loadBrands();
  } catch (e: any) {
    message.error("删除失败: " + e.message);
  }
}

// ── upload ────────────────────────────────────────────────────────
function resetUploadForm() {
  uploadForm.store_id = null;
  uploadForm.offer_id = "";
  uploadForm.description_category_id = null;
  uploadForm.type_id = null;
  uploadForm.attributes = [];
  uploadForm.price_rub = null;
  uploadForm.price_cny = null;
  uploadForm.exchange_rate = 12.5;
  uploadForm.markup_factor = 1.5;
  uploadForm.commission_pct = 10;
  uploadForm.logistics_rub = 0;
  uploadForm.packaging_rub = 0;
  uploadForm.weight_g = null;
  uploadForm.height_mm = null;
  uploadForm.depth_mm = null;
  uploadForm.width_mm = null;
  categoryTreeRaw.value = [];
  filteredCategoryTree.value = [];
  categorySearchText.value = "";
  categorySelectedKeys.value = [];
  uploadAttrs.value = [];
  priceCalcResult.value = null;
}

function openUpload(row: any) {
  uploadProduct.value = row;
  resetUploadForm();
  // Pre-fill physical specs from product if available
  if (row.weight) uploadForm.weight_g = row.weight;
  if (row.width) uploadForm.width_mm = row.width;
  if (row.height) uploadForm.height_mm = row.height;
  if (row.depth) uploadForm.depth_mm = row.depth;
  uploadVisible.value = true;
  loadStores();
}

async function loadStores() {
  try {
    const stores = await apiGet("/selection/stores");
    storeOptions.value = stores.map((s: any) => ({ label: s.name, value: s.id }));
  } catch { /* ignore */ }
}

/** When store is selected, load category tree */
async function onUploadStoreChange(storeId: number | null) {
  if (!storeId) return;
  categoryTreeRaw.value = [];
  filteredCategoryTree.value = [];
  uploadForm.description_category_id = null;
  uploadForm.type_id = null;
  uploadAttrs.value = [];
  categorySelectedKeys.value = [];
  uploadCatLoading.value = true;
  try {
    const tree = await apiGet("/selection/ozon-categories", { store_id: storeId });
    categoryTreeRaw.value = tree;
    filteredCategoryTree.value = tree;
  } catch (e: any) {
    message.warning("加载分类失败: " + e.message);
  } finally {
    uploadCatLoading.value = false;
  }
}

/** Filter category tree by search text */
function filterCategoryTree(val: string) {
  if (!val || !val.trim()) {
    filteredCategoryTree.value = categoryTreeRaw.value;
    return;
  }
  const q = val.toLowerCase();
  function filterNodes(nodes: any[]): any[] {
    return nodes
      .filter((n) => {
        const titleMatch = (n.title || "").toLowerCase().includes(q);
        const childMatch = n.children && filterNodes(n.children).length > 0;
        return titleMatch || childMatch;
      })
      .map((n) => {
        if (n.children) {
          return { ...n, children: filterNodes(n.children) };
        }
        return n;
      });
  }
  filteredCategoryTree.value = filterNodes(categoryTreeRaw.value);
}

/** When a leaf category is selected, load its attributes */
async function onCategorySelect(keys: number[]) {
  if (!keys.length || !uploadForm.store_id) return;
  const catId = keys[0];
  categorySelectedKeys.value = keys;
  uploadForm.description_category_id = catId;
  uploadForm.type_id = null;
  uploadAttrs.value = [];

  try {
    const attrs = await apiGet("/selection/ozon-attributes", {
      store_id: uploadForm.store_id,
      description_category_id: catId,
    });
    uploadAttrs.value = attrs;
    // Collect type_ids from attributes if present
    const typeIds = new Set<number>();
    for (const a of attrs) {
      if (a.type_id) typeIds.add(a.type_id);
    }
    if (typeIds.size === 1) {
      uploadForm.type_id = [...typeIds][0];
    }
    // Initialize attribute values
    uploadForm.attributes = attrs
      .filter((a: any) => a.is_required || a.default_value)
      .map((a: any) => ({
        attribute_id: a.attribute_id,
        values: a.default_value ? [a.default_value] : [],
      }));
  } catch (e: any) {
    message.warning("加载属性失败: " + e.message);
  }
}

/** Get attribute value for upload form */
function getUploadAttrValue(attrId: number): any {
  const found = uploadForm.attributes.find((a) => a.attribute_id === attrId);
  return found ? found.values[0] ?? null : null;
}

/** Set attribute value in upload form */
function setUploadAttrValue(attrId: number, val: any) {
  const existing = uploadForm.attributes.find((a) => a.attribute_id === attrId);
  if (existing) {
    existing.values = val !== null && val !== undefined ? [val] : [];
  } else {
    uploadForm.attributes.push({ attribute_id: attrId, values: val !== null && val !== undefined ? [val] : [] });
  }
}

/** Calculate price from CNY input */
function calcUploadPrice() {
  const cny = uploadForm.price_cny;
  if (!cny) { priceCalcResult.value = null; return; }
  const rate = uploadForm.exchange_rate || 12.5;
  const markup = uploadForm.markup_factor || 1.5;
  const comm = (uploadForm.commission_pct || 10) / 100;
  const logi = uploadForm.logistics_rub || 0;
  const pack = uploadForm.packaging_rub || 0;

  const costRub = Math.round(cny * rate);
  const markupPrice = Math.round(costRub * markup);
  const commission = Math.round(markupPrice * comm);
  const finalPrice = Math.round(markupPrice + commission + logi + pack);

  priceCalcResult.value = {
    cost_rub: costRub,
    markup_price_rub: markupPrice,
    commission_rub: commission,
    final_price_rub: finalPrice,
  };
  uploadForm.price_rub = finalPrice;
}

async function doUpload() {
  if (!uploadForm.store_id) { message.warning("请选择店铺"); return; }
  if (!uploadForm.description_category_id) { message.warning("请选择Ozon分类"); return; }
  if (!uploadForm.price_rub) { message.warning("请设置价格"); return; }
  uploading.value = true;
  try {
    await apiPost(`/selection/products/${uploadProduct.value.id}/upload`, {
      store_id: uploadForm.store_id,
      offer_id: uploadForm.offer_id || undefined,
      description_category_id: uploadForm.description_category_id,
      type_id: uploadForm.type_id || undefined,
      attributes: uploadForm.attributes.filter((a) => a.values.length > 0),
      price_rub: uploadForm.price_rub,
      old_price_rub: undefined,
      weight_g: uploadForm.weight_g || undefined,
      height_mm: uploadForm.height_mm || undefined,
      depth_mm: uploadForm.depth_mm || undefined,
      width_mm: uploadForm.width_mm || undefined,
    });
    message.success("上传任务已提交，请在 Ozon 后台查看状态");
    uploadVisible.value = false;
  } catch (e: any) {
    message.error("上传失败: " + e.message);
  } finally {
    uploading.value = false;
  }
}

// ── data loading ──────────────────────────────────────────────────
async function loadProducts() {
  loading.value = true;
  try {
    const skip = (currentPage.value - 1) * pageSize.value;
    const params: Record<string, any> = { skip, limit: pageSize.value };
    if (filterBrand.value) params.brand = filterBrand.value;
    if (filterPlatform.value) params.platform = filterPlatform.value;
    if (keyword.value) params.keyword = keyword.value;
    if (minPrice.value != null) params.min_price = minPrice.value;
    if (maxPrice.value != null) params.max_price = maxPrice.value;
    if (minRating.value != null) params.min_rating = minRating.value;
    if (minReviews.value != null) params.min_reviews = minReviews.value;

    const [data, countRes] = await Promise.all([
      apiGet("/selection/products", params),
      apiGet("/selection/products/count", params),
    ]);
    products.value = data;
    totalCount.value = countRes.total;
    pagination.itemCount = countRes.total;
    pagination.page = currentPage.value;
    pagination.pageSize = pageSize.value;
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

function resetFilters() {
  filterBrand.value = null;
  filterPlatform.value = null;
  keyword.value = "";
  minPrice.value = null;
  maxPrice.value = null;
  minRating.value = null;
  minReviews.value = null;
  currentPage.value = 1;
  loadProducts();
}

function onPageChange(page: number) { currentPage.value = page; loadProducts(); }
function onPageSizeChange(size: number) { pageSize.value = size; currentPage.value = 1; loadProducts(); }

// ── 删除 ───────────────────────────────────────────────────────
async function deleteSingleProduct(id: number) {
  try {
    await apiDelete(`/selection/products/${id}`);
    message.success("删除成功");
    selectedKeys.value = selectedKeys.value.filter((k) => k !== id);
    loadProducts();
  } catch (e: any) {
    message.error("删除失败: " + e.message);
  }
}

async function batchDeleteProducts() {
  if (selectedKeys.value.length === 0) return;
  try {
    const res = await apiPost(`/selection/products/batch-delete`, { ids: [...selectedKeys.value] });
    message.success(`成功删除 ${res.deleted} 个商品`);
    selectedKeys.value = [];
    loadProducts();
  } catch (e: any) {
    message.error("批量删除失败: " + e.message);
  }
}

// ── precision editor methods ──────────────────────────────────────

/** 顶级物理规格 ↔ 第一个SKU变体 双向同步 */
let _syncingSpecs = false;
watch(
  () => {
    const e = precisionEdit.value;
    if (!e) return null;
    return { w: e.weight, wi: e.width, h: e.height, d: e.depth };
  },
  (newVals) => {
    if (_syncingSpecs || !newVals || !precisionEdit.value) return;
    const e = precisionEdit.value;
    const skus = e.sku_list || [];
    if (skus.length > 0) {
      _syncingSpecs = true;
      skus[0].weight_g = newVals.w || 0;
      skus[0].width_mm = newVals.wi || 0;
      skus[0].height_mm = newVals.h || 0;
      skus[0].depth_mm = newVals.d || 0;
      _syncingSpecs = false;
    }
  },
);

watch(
  () => {
    const e = precisionEdit.value;
    if (!e || !(e.sku_list || []).length) return null;
    const s = e.sku_list[0];
    return { wg: s.weight_g, wm: s.width_mm, hm: s.height_mm, dm: s.depth_mm };
  },
  (newVals) => {
    if (_syncingSpecs || !newVals || !precisionEdit.value) return;
    const e = precisionEdit.value;
    _syncingSpecs = true;
    e.weight = newVals.wg || 0;
    e.width = newVals.wm || 0;
    e.height = newVals.hm || 0;
    e.depth = newVals.dm || 0;
    _syncingSpecs = false;
  },
);

/** 从采集商品表格点击"详情"→ 自动切换到精铺管理 tab 并填充所有数据 */
function goToPrecision(row: any) {
  // 切换到精铺管理 tab
  activeTab.value = "precision";
  precisionMode.value = "copy_ozon";

  // 填充来源链接
  precisionSourceUrl.value = row.source_url || "";

  // 构建左侧原始数据(只读展示用)
  const original = JSON.parse(JSON.stringify(row));
  precisionOriginal.value = original;

  // ── 合并 spec_list[i] ↔ sku_list[i] 为统一变体对象 ──
  // spec_list 和 sku_list 是平行数组: spec_list[i] 对应 sku_list[i]
  const specs = row.spec_list || [];
  const skus = row.sku_list || [];
  const maxLen = Math.max(specs.length, skus.length, 1);
  const mergedVariants: any[] = [];
  for (let i = 0; i < maxLen; i++) {
    const sp = specs[i] || {};
    const sk = skus[i] || {};
    mergedVariants.push({
      sku: sk.sku || sk.skuId || "",
      barcode: sk.barcode || "",
      name: sk.name || "",
      price: sk.price || row.price || 0,
      stock: sk.stock || 0,
      // 物理规格: 从 spec_list 对应条目提取,而非全局
      weight_g: sp.weight_g || 0,
      width_mm: sp.width_mm || 0,
      height_mm: sp.height_mm || 0,
      depth_mm: sp.depth_mm || 0,
    });
  }

  // 顶级物理规格取第一个变体的值(便于全局预览)
  const firstSpec = specs[0] || {};

  // 构建右侧可编辑数据
  const editData = {
    title: row.title || "",
    title_cn: row.title_cn || "",
    brand: row.brand || "",
    category: row.category || "",
    category_id: row.ozon_category_id || row.category_id || null,
    price: row.price || 0,
    old_price: row.old_price || 0,
    vat: row.vat || "0",
    weight: firstSpec.weight_g || 0,
    width: firstSpec.width_mm || 0,
    height: firstSpec.height_mm || 0,
    depth: firstSpec.depth_mm || 0,
    description: row.description || "",
    description_cn: row.description_cn || "",
    images: row.images || [],
    video_urls: row.video_urls || [],
    video_url: (row.video_urls || [])[0] || "",
    attributes: (row.attributes || []).map((a: any) => ({ name: a.name || "", value: a.value || "" })),
    // spec_list 原始数据(保存时用于重建)
    spec_list: specs,
    // 合并后的变体列表(含物理规格)
    sku_list: mergedVariants,
  };

  precisionEdit.value = editData;
  message.success("已加载采集数据到精铺编辑器");
}

async function fetchPrecisionProduct() {
  if (!precisionSourceUrl.value.trim()) { message.warning("请输入 OZON 商品链接"); return; }
  precisionFetching.value = true;
  try {
    const data = await apiPost("/selection/products/fetch", { url: precisionSourceUrl.value.trim() });
    precisionOriginal.value = data;
    // 深拷贝用于编辑
    precisionEdit.value = JSON.parse(JSON.stringify(data));
    message.success("商品信息获取成功");
  } catch (e: any) {
    message.error(e.message || "获取失败");
  } finally {
    precisionFetching.value = false;
  }
}

function initManualProduct() {
  if (!precisionManualName.value.trim()) { message.warning("请输入商品名称"); return; }
  const empty = {
    title: precisionManualName.value,
    title_cn: precisionManualName.value,
    brand: "",
    category: "",
    category_id: null,
    currency: "",
    price: 0,
    old_price: 0,
    vat: "0",
    weight: 0,
    width: 0,
    height: 0,
    depth: 0,
    description: "",
    description_cn: "",
    images: [],
    video_urls: [],
    video_url: "",
    attributes: [],
    spec_list: [],
    sku_list: [{ sku: "", barcode: "", name: "", price: 0, stock: 0, weight_g: 0, width_mm: 0, height_mm: 0, depth_mm: 0 }],
  };
  precisionOriginal.value = empty;
  precisionEdit.value = JSON.parse(JSON.stringify(empty));
  message.info("已初始化空白编辑表单");
}

function aiOptimize(target: "title" | "attrs" | "description") {
  const labels: Record<string, string> = {
    title: "AI 翻译标题",
    attrs: "AI 优化属性",
    description: "AI 翻译描述",
  };
  message.info(`${labels[target]}功能即将上线,敬请期待 ✨`);
}

function addPrecisionAttribute() {
  if (!precisionEdit.value) return;
  if (!precisionEdit.value.attributes) precisionEdit.value.attributes = [];
  precisionEdit.value.attributes.push({ name: "", value: "" });
}

function addPrecisionSku() {
  if (!precisionEdit.value) return;
  if (!precisionEdit.value.sku_list) precisionEdit.value.sku_list = [];
  precisionEdit.value.sku_list.push({ sku: "", barcode: "", name: "", price: precisionEdit.value.price || 0, stock: 0, weight_g: 0, width_mm: 0, height_mm: 0, depth_mm: 0 });
}

function resetPrecisionEditor() {
  if (!precisionOriginal.value) return;
  precisionEdit.value = JSON.parse(JSON.stringify(precisionOriginal.value));
  message.info("已重置为原始值");
}

/** 从合并后的 sku_list 拆分出 spec_list (保存前处理) */
function prepareForSave() {
  if (!precisionEdit.value) return;
  const e = precisionEdit.value;
  // 从每个 sku_list 条目中提取物理规格,重建 spec_list
  e.spec_list = (e.sku_list || []).map((s: any) => ({
    weight_g: s.weight_g || 0,
    width_mm: s.width_mm || 0,
    height_mm: s.height_mm || 0,
    depth_mm: s.depth_mm || 0,
  }));
  // 同步顶级物理规格到第一个变体
  if (e.spec_list.length > 0) {
    e.spec_list[0].weight_g = e.weight || e.spec_list[0].weight_g;
    e.spec_list[0].width_mm = e.width || e.spec_list[0].width_mm;
    e.spec_list[0].height_mm = e.height || e.spec_list[0].height_mm;
    e.spec_list[0].depth_mm = e.depth || e.spec_list[0].depth_mm;
  }
  // 合并 video_url 到 video_urls
  if (e.video_url && (!e.video_urls || !e.video_urls.includes(e.video_url))) {
    e.video_urls = [e.video_url, ...(e.video_urls || [])].filter(Boolean);
  }
  // 清理 sku_list 中的冗余字段
  e.sku_list = (e.sku_list || []).map((s: any) => ({
    sku: s.sku || "",
    barcode: s.barcode || "",
    name: s.name || "",
    price: s.price || 0,
    stock: s.stock || 0,
  }));
}

async function savePrecisionDraft() {
  if (!precisionEdit.value) return;
  precisionSaving.value = true;
  try {
    prepareForSave();
    await apiPost("/selection/products", {
      ...precisionEdit.value,
      source_url: precisionSourceUrl.value,
      status: "draft",
    });
    message.success("草稿保存成功");
  } catch (e: any) {
    message.error("保存失败: " + e.message);
  } finally {
    precisionSaving.value = false;
  }
}

async function submitPrecisionListing() {
  if (!precisionEdit.value) return;
  precisionSaving.value = true;
  try {
    prepareForSave();
    await apiPost("/selection/products", {
      ...precisionEdit.value,
      source_url: precisionSourceUrl.value,
      status: "pending",
    });
    message.success("已提交上架,等待审核");
    precisionOriginal.value = null;
    precisionEdit.value = null;
    precisionSourceUrl.value = "";
  } catch (e: any) {
    message.error("提交失败: " + e.message);
  } finally {
    precisionSaving.value = false;
  }
}

onMounted(() => { loadProducts(); loadBrands(); });
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════
   选品中心 — 全局样式
   ═══════════════════════════════════════════════════════ */

/* ── 采集商品 tab ── */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-light);
}
.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

/* ── 筛选栏 ── */
.filter-bar {
  background: var(--bg-card-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  margin-bottom: 16px;
  transition: box-shadow 0.2s ease;
}
.filter-bar:hover {
  box-shadow: var(--shadow-sm);
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-group :deep(.n-input),
.filter-group :deep(.n-select) {
  min-width: 140px;
}
.filter-group :deep(.n-input-number) {
  width: 120px;
}
.filter-actions {
  margin-left: auto;
}

/* ── 表格信息条 ── */
.table-info {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 12px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.table-info strong {
  color: var(--accent);
  font-weight: 600;
}
.table-info span + span::before {
  content: '';
  display: inline-block;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--text-muted);
  margin-right: 6px;
  vertical-align: middle;
}

/* ═══════════════════════════════════════════════════════
   精铺管理 — 左右分栏编辑器
   ═══════════════════════════════════════════════════════ */
.precision-tab {
  width: 100%;
}
.precision-editor {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}
.precision-left {
  flex: 0 0 38%;
  min-width: 320px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 20px;
  max-height: calc(100vh - 260px);
  overflow-y: auto;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.25s ease;
}
.precision-left:hover {
  box-shadow: var(--shadow-md);
}
.precision-right {
  flex: 1;
  min-width: 0;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 20px;
  max-height: calc(100vh - 260px);
  overflow-y: auto;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.25s ease;
}
.precision-right:hover {
  box-shadow: var(--shadow-md);
}

/* ── 面板头部 ── */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--border-light);
}
.panel-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── 编辑分区 ── */
.edit-section {
  padding: 12px 0;
}
.edit-section + .edit-section {
  border-top: 1px dashed var(--border-light);
}

/* ═══════════════════════════════════════════════════════
   抽屉详情 — 指标、图片、属性
   ═══════════════════════════════════════════════════════ */

/* ── 指标卡片 ── */
.metrics-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 4px 0;
}
.metric-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: var(--bg-card-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 10px 16px;
  min-width: 80px;
  transition: all 0.2s ease;
}
.metric-item:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
  transform: translateY(-1px);
}
.metric-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}
.metric-label {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

/* ── 图片画廊 ── */
.gallery-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 0;
}
.gallery-item {
  position: relative;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 2px solid var(--border-light);
  transition: all 0.25s ease;
  cursor: pointer;
}
.gallery-item:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  transform: translateY(-3px);
}
.gallery-item.is-main {
  border-color: var(--accent);
}
.gallery-img {
  display: block;
}
.main-badge {
  position: absolute;
  bottom: 6px;
  left: 6px;
  font-size: 10px;
  font-weight: 600;
  background: linear-gradient(135deg, var(--accent), #7c3aed);
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  box-shadow: 0 2px 6px rgba(79, 70, 229, 0.4);
}
.img-index {
  position: absolute;
  bottom: 6px;
  right: 6px;
  font-size: 10px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

/* ── 区块标签 ── */
.section-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.section-body {
  padding: 4px 0;
}

/* ── 表单字段组 ── */
.field-group {
  margin-bottom: 14px;
}
.field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.field-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field-row-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}
.field-row-4 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  gap: 12px;
}

/* ── 原始值提示 ── */
.original-hint {
  margin-top: 4px;
  padding: 5px 10px;
  background: var(--bg-card-hover);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--accent);
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

/* ── 属性行 ── */
.attr-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}
.attr-row:hover {
  background: var(--bg-card-hover);
}

/* ── 响应式 ── */
@media (max-width: 900px) {
  .precision-editor {
    flex-direction: column;
  }
  .precision-left {
    flex: none;
    width: 100%;
    max-height: none;
  }
  .precision-right {
    max-height: none;
  }
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
  .field-row-3, .field-row-4 {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
