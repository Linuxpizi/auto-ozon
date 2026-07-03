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
            <n-input
              v-model:value="keyword"
              placeholder="搜索商品名称/品牌"
              clearable
              size="small"
              style="width: 220px"
              @keyup.enter="loadProducts"
              @clear="loadProducts"
            />
            <n-select
              v-model:value="filterPlatform"
              :options="platformOptions"
              placeholder="平台"
              clearable
              size="small"
              style="width: 120px"
              @update:value="loadProducts"
            />
            <n-input-number
              v-model:value="minRating"
              placeholder="最低评分"
              :min="0"
              :max="5"
              :step="0.1"
              size="small"
              style="width: 110px"
              @update:value="loadProducts"
            />
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
            <n-input v-model:value="filterBrand" placeholder="品牌" clearable size="small" style="width: 140px" @keyup.enter="loadProducts" @clear="loadProducts" />
            <n-input v-model:value="filterCategory" placeholder="分类" clearable size="small" style="width: 140px" @keyup.enter="loadProducts" @clear="loadProducts" />
            <n-input-number v-model:value="minPrice" placeholder="最低价" :min="0" size="small" style="width: 100px" @update:value="loadProducts" />
            <n-input-number v-model:value="maxPrice" placeholder="最高价" :min="0" size="small" style="width: 100px" @update:value="loadProducts" />
            <n-input-number v-model:value="minReviews" placeholder="最低评论" :min="0" size="small" style="width: 100px" @update:value="loadProducts" />
          </div>
          <div class="filter-group">
            <n-date-picker v-model:value="dateRange" type="daterange" clearable size="small" style="width: 240px" @update:value="loadProducts" />
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
      <n-data-table
        :columns="columns"
        :data="products"
        :row-key="(r: any) => r.id"
        :checked-row-keys="selectedKeys"
        @update:checked-row-keys="handleCheck"
        :pagination="false"
        :loading="loading"
        size="small"
        striped
        :scroll-x="1000"
      />

      <!-- 分页 -->
      <div class="pagination-wrap">
        <n-pagination
          v-model:page="currentPage"
          v-model:page-size="pageSize"
          :item-count="totalCount"
          :page-sizes="[20, 50, 100]"
          show-size-picker
          @update:page="loadProducts"
          @update:page-size="onPageSizeChange"
        />
      </div>
    </div>

    <!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         编辑抽屉 — 左右联动面板
         左侧:原始数据 (只读)
         右侧:编辑数据 + AI按钮
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
    <n-drawer v-model:show="drawerVisible" :width="1100" placement="right" :closable="true" :theme-overrides="drawerThemeOverrides">
      <n-drawer-content :title="null" :native-scrollbar="false" closable>
        <template #header>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:15px; font-weight:600;">编辑商品</span>
            <n-tag v-if="editProduct" size="small" :bordered="false" :type="editProduct.platform === '1688' ? 'info' : 'success'">
              {{ editProduct.platform }}
            </n-tag>
            <n-tag v-if="hasChanges" size="small" type="warning" :bordered="false">已修改</n-tag>
          </div>
        </template>

        <div v-if="editProduct" class="edit-drawer-body">
          <!-- 左栏: 原始数据 (只读) -->
          <div ref="panelLeftRef" class="panel-left" @scroll="handlePanelScroll('left')">
            <div class="panel-title">📋 原始数据</div>

            <div class="section-block">
              <div class="section-label">商品名称</div>
              <div class="readonly-text">{{ editProduct.title || '—' }}</div>
            </div>

            <div class="section-block">
              <div class="section-label">商品图片</div>
              <div v-if="editProduct.images?.length" class="gallery-row">
                <div v-for="(img, idx) in editProduct.images" :key="idx" class="gallery-item" :class="{ 'is-main': idx === 0 }">
                  <n-image :src="img" :width="idx === 0 ? 100 : 64" :height="idx === 0 ? 100 : 64" object-fit="cover" class="gallery-img" />
                  <span v-if="idx === 0" class="main-badge">主</span>
                </div>
              </div>
              <div v-else class="empty-hint">暂无图片</div>
            </div>

            <n-divider style="margin:8px 0" />

            <div class="section-block">
              <div class="section-label">基础信息</div>
              <div class="info-grid">
                <div class="info-item"><span class="info-key">品牌</span><span>{{ editProduct.brand || '—' }}</span></div>
                <div class="info-item"><span class="info-key">分类</span><span>{{ editProduct.category || '—' }}</span></div>
                <div class="info-item"><span class="info-key">评分</span><span>{{ editProduct.rating ?? '—' }}</span></div>
                <div class="info-item"><span class="info-key">评论</span><span>{{ editProduct.reviews_count ?? '—' }}</span></div>
              </div>
            </div>

            <div class="section-block">
              <div class="section-label">价格</div>
              <div class="info-grid">
                <div class="info-item"><span class="info-key">现价</span><span>{{ editProduct.price?.toLocaleString() }} {{ _currencySymbol(editProduct.currency) }}</span></div>
                <div class="info-item" v-if="editProduct.old_price"><span class="info-key">原价</span><span style="text-decoration:line-through; color:#999">{{ editProduct.old_price?.toLocaleString() }} {{ _currencySymbol(editProduct.currency) }}</span></div>
                <div class="info-item" v-if="editProduct.discount"><span class="info-key">折扣</span><span>{{ editProduct.discount }}</span></div>
              </div>
            </div>

            <div class="section-block">
              <div class="section-label">商品描述</div>
              <div class="readonly-text">{{ editProduct.description || '暂无描述' }}</div>
            </div>

            <div class="section-block" v-if="editProduct.attributes?.length">
              <div class="section-label">商品属性</div>
              <div v-for="attr in editProduct.attributes" :key="attr.name" class="attr-row readonly">
                <span class="attr-name">{{ attr.name }}</span>
                <span class="attr-value">{{ attr.value }}</span>
              </div>
            </div>

            <div class="section-block" v-if="editProduct.spec_list?.length">
              <div class="section-label">物理规格</div>
              <div class="info-grid">
                <div class="info-item" v-if="editProduct.spec_list[0]?.weight_g"><span class="info-key">重量</span><span>{{ editProduct.spec_list[0].weight_g }}g</span></div>
                <div class="info-item" v-if="editProduct.spec_list[0]?.width_mm"><span class="info-key">宽</span><span>{{ editProduct.spec_list[0].width_mm }}mm</span></div>
                <div class="info-item" v-if="editProduct.spec_list[0]?.height_mm"><span class="info-key">高</span><span>{{ editProduct.spec_list[0].height_mm }}mm</span></div>
                <div class="info-item" v-if="editProduct.spec_list[0]?.depth_mm"><span class="info-key">深</span><span>{{ editProduct.spec_list[0].depth_mm }}mm</span></div>
              </div>
            </div>

            <div class="section-block" v-if="editProduct.sku_list?.length">
              <div class="section-label">SKU 变体</div>
              <div v-for="sku in editProduct.sku_list" :key="sku.sku || sku.name" class="sku-row">
                <span>{{ sku.name || sku.sku }}</span>
                <span style="color:var(--accent)">{{ sku.price }} {{ _currencySymbol(editProduct.currency) }}</span>
                <span style="color:#999">库存 {{ sku.stock ?? '—' }}</span>
              </div>
            </div>

            <div class="section-block">
              <div class="section-label">来源信息</div>
              <div class="info-grid">
                <div class="info-item"><span class="info-key">平台</span><span>{{ editProduct.platform }}</span></div>
                <div class="info-item"><span class="info-key">卖家</span><span>{{ editProduct.seller_name || '—' }}</span></div>
                <div class="info-item" style="grid-column: span 2">
                  <span class="info-key">链接</span>
                  <n-a v-if="editProduct.source_url" :href="editProduct.source_url" target="_blank" style="font-size:12px; word-break:break-all">{{ editProduct.source_url }}</n-a>
                  <span v-else>—</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 右栏: 编辑数据 -->
          <div ref="panelRightRef" class="panel-right" @scroll="handlePanelScroll('right')">
            <div class="panel-title">✨ 优化数据</div>

            <!-- 标题 -->
            <div class="section-block">
              <div class="section-label">
                商品名称
                <div class="section-actions">
                  <n-button size="tiny" quaternary @click="handleAiTranslate('title')">🌐 翻译</n-button>
                  <n-button size="tiny" quaternary @click="handleAiOptimize('title')">✨ AI优化</n-button>
                </div>
              </div>
              <n-input v-model:value="editProduct.title" type="textarea" :rows="2" placeholder="商品名称" />
            </div>

            <!-- 图片管理 -->
            <div class="section-block">
              <div class="section-label">
                商品图片
                <div class="section-actions">
                  <n-button size="tiny" quaternary @click="handleAiOptimizeImages">✨ AI优化全部</n-button>
                  <n-button size="tiny" quaternary @click="handleAiGenerateImages">🎨 AI批量生成</n-button>
                </div>
              </div>
              <div class="image-manager">
                <div v-for="(img, idx) in editProduct.images" :key="idx" class="image-card">
                  <n-image :src="img" width="80" height="80" object-fit="cover" class="gallery-img" />
                  <div class="image-actions">
                    <n-button size="tiny" quaternary type="primary" @click="handleAiOptimizeImage(idx)" :loading="aiImageLoading === idx">✨</n-button>
                    <n-button size="tiny" quaternary type="error" @click="removeImage(idx)">✕</n-button>
                  </div>
                  <span v-if="idx === 0" class="main-badge">主图</span>
                </div>
                <div class="image-card image-add" @click="triggerImageUpload">
                  <span style="font-size:24px; color:#ccc">+</span>
                  <span style="font-size:11px; color:#999">添加图片</span>
                </div>
              </div>
              <input ref="imageUploadRef" type="file" accept="image/*" multiple style="display:none" @change="handleImageUpload" />
            </div>

            <n-divider style="margin:8px 0" />

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
            </div>

            <!-- 价格 -->
            <div class="section-block">
              <div class="section-label">价格与促销</div>
              <n-grid :cols="3" :x-gap="8">
                <n-gi>
                  <div class="field-label">现价</div>
                  <n-input-number v-model:value="editProduct.price" :min="0" :precision="2" size="small" style="width:100%" />
                </n-gi>
                <n-gi>
                  <div class="field-label">原价</div>
                  <n-input-number v-model:value="editProduct.old_price" :min="0" :precision="2" size="small" style="width:100%" />
                </n-gi>
                <n-gi>
                  <div class="field-label">折扣</div>
                  <n-input v-model:value="editProduct.discount" size="small" placeholder="e.g. -30%" />
                </n-gi>
              </n-grid>
            </div>

            <!-- 描述 -->
            <div class="section-block">
              <div class="section-label">
                商品描述
                <div class="section-actions">
                  <n-button size="tiny" quaternary @click="handleAiTranslate('description')">🌐 翻译</n-button>
                  <n-button size="tiny" quaternary @click="handleAiOptimize('description')">✨ AI优化</n-button>
                </div>
              </div>
              <n-input v-model:value="editProduct.description" type="textarea" :rows="4" placeholder="商品描述" />
            </div>

            <!-- 属性 -->
            <div class="section-block">
              <div class="section-label">
                商品属性
                <div class="section-actions">
                  <n-button size="tiny" quaternary @click="handleTranslateAllAttrs">🌐 翻译全部</n-button>
                </div>
              </div>
              <div v-if="editProduct.attributes?.length">
                <div v-for="(attr, idx) in editProduct.attributes" :key="idx" class="attr-row">
                  <n-input v-model:value="attr.name" size="small" placeholder="属性名" style="width:120px" />
                  <n-input v-model:value="attr.value" size="small" placeholder="属性值" style="flex:1" />
                  <n-button size="tiny" quaternary type="error" @click="removeAttribute(idx)">✕</n-button>
                </div>
              </div>
              <n-button size="small" quaternary @click="addAttribute">+ 添加属性</n-button>
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

            <!-- SKU 变体 -->
            <div class="section-block">
              <div class="section-label">SKU 变体</div>
              <div v-if="editProduct.sku_list?.length">
                <div v-for="(sku, idx) in editProduct.sku_list" :key="idx" class="sku-edit-row">
                  <n-input v-model:value="sku.name" size="small" placeholder="变体名称" style="flex:1" />
                  <n-input-number v-model:value="sku.price" size="small" :min="0" :precision="2" placeholder="价格" style="width:90px" />
                  <n-input-number v-model:value="sku.stock" size="small" :min="0" placeholder="库存" style="width:70px" />
                  <n-button size="tiny" quaternary type="error" @click="editProduct.sku_list.splice(idx, 1)">✕</n-button>
                </div>
              </div>
              <n-button size="small" quaternary @click="addSku">+ 添加 SKU</n-button>
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
              <n-button type="warning" :loading="drawerSaving" :disabled="!editProduct" @click="handleUploadFromDrawer">
                🚀 上传到 Ozon
              </n-button>
              <n-button type="primary" :loading="drawerSaving" :disabled="!editProduct" @click="saveEdit">
                💾 保存修改
              </n-button>
            </n-space>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

        <!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         上传到 Ozon 弹窗
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->
    <n-modal v-model:show="uploadVisible" preset="card" class="upload-modal" :bordered="false">
      <template #header>
        <div class="upload-modal__header">
          <span class="upload-modal__title">🚀 上传到 Ozon</span>
          <n-tag v-if="editProduct" size="small" :bordered="false" type="info">
            {{ editProduct.title?.slice(0, 30) }}{{ editProduct.title?.length > 30 ? '...' : '' }}
          </n-tag>
        </div>
      </template>

      <n-spin :show="uploading">
        <div class="upload-body">

          <!-- ── 🏪 店铺与分类 ── -->
          <div class="upload-section">
            <div class="upload-section__title">🏪 店铺与分类</div>
            <n-grid :cols="2" :x-gap="16" :y-gap="12">
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">Ozon 店铺 <span class="required">*</span></label>
                  <n-select v-model:value="uploadForm.store_id" :options="storeOptions" placeholder="选择店铺" />
                </div>
              </n-gi>
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">商品分类 <span class="required">*</span></label>
                  <n-tree-select
                    :value="uploadForm.description_category_id"
                    :options="categoryTreeNodes"
                    placeholder="选择 Ozon 分类"
                    :lazy="true"
                    :load="loadTreeChildren"
                    filterable
                    @update:value="onCategoryValueChange"
                  />
                </div>
              </n-gi>
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">Offer ID</label>
                  <n-input v-model:value="uploadForm.offer_id" placeholder="留空自动生成" />
                </div>
              </n-gi>
            </n-grid>
          </div>

          <!-- ── 📝 商品信息 ── -->
          <div class="upload-section">
            <div class="upload-section__title">📝 商品信息</div>
            <div class="upload-field">
              <label class="upload-field__label">商品名称</label>
              <n-input v-model:value="uploadForm.name" placeholder="Ozon 上显示的商品名" />
            </div>
            <div class="upload-field" style="margin-top: 8px;">
              <label class="upload-field__label">商品描述</label>
              <n-input v-model:value="uploadForm.description" type="textarea" :rows="3" placeholder="HTML / Markdown 描述" />
            </div>
          </div>

          <!-- ── 💰 定价 ── -->
          <div class="upload-section">
            <div class="upload-section__title">
              <span>💰 定价</span>
              <n-button text size="tiny" @click="calcUploadPrice">🔄 重新计算</n-button>
            </div>
            <n-grid :cols="3" :x-gap="16" :y-gap="12">
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">汇率 (CNY→RUB)</label>
                  <n-input-number v-model:value="uploadForm.exchange_rate" :min="1" :step="0.5" style="width: 100%" @update:value="calcUploadPrice" />
                </div>
              </n-gi>
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">加价倍率</label>
                  <n-input-number v-model:value="uploadForm.markup_factor" :min="1" :step="0.1" style="width: 100%" @update:value="calcUploadPrice" />
                </div>
              </n-gi>
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">佣金 (%)</label>
                  <n-input-number v-model:value="uploadForm.commission_pct" :min="0" :max="100" :step="1" style="width: 100%" @update:value="calcUploadPrice" />
                </div>
              </n-gi>
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">物流 (₽)</label>
                  <n-input-number v-model:value="uploadForm.logistics_rub" :min="0" style="width: 100%" @update:value="calcUploadPrice" />
                </div>
              </n-gi>
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">物流费 (₽)</label>
                  <n-input-number v-model:value="uploadForm.logistics_rub" :min="0" style="width: 100%" @update:value="calcUploadPrice" />
                </div>
              </n-gi>
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">包装 (₽)</label>
                  <n-input-number v-model:value="uploadForm.packaging_rub" :min="0" style="width: 100%" @update:value="calcUploadPrice" />
                </div>
              </n-gi>
            </n-grid>

            <!-- 自动定价结果 -->
            <div v-if="priceCalcResult" class="upload-price-result">
              <div class="upload-price-result__header">🧮 自动定价结果</div>
              <n-grid :cols="4" :x-gap="12">
                <n-gi>
                  <div class="price-card">
                    <span class="price-card__label">成本</span>
                    <span class="price-card__value">{{ priceCalcResult.cost_rub }} ₽</span>
                  </div>
                </n-gi>
                <n-gi>
                  <div class="price-card">
                    <span class="price-card__label">加价后</span>
                    <span class="price-card__value">{{ priceCalcResult.markup_price_rub }} ₽</span>
                  </div>
                </n-gi>
                <n-gi>
                  <div class="price-card">
                    <span class="price-card__label">佣金</span>
                    <span class="price-card__value">{{ priceCalcResult.commission_rub }} ₽</span>
                  </div>
                </n-gi>
                <n-gi>
                  <div class="price-card price-card--final">
                    <span class="price-card__label">最终售价</span>
                    <span class="price-card__value">{{ priceCalcResult.final_price_rub }} ₽</span>
                  </div>
                </n-gi>
              </n-grid>
            </div>
          </div>

          <!-- ── 📦 物流 ── -->
          <div class="upload-section">
            <div class="upload-section__title">📦 物流</div>
            <n-grid :cols="4" :x-gap="16" :y-gap="12">
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">重量 (g)</label>
                  <n-input-number v-model:value="uploadForm.weight_g" :min="0" style="width: 100%" />
                </div>
              </n-gi>
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">高 (mm)</label>
                  <n-input-number v-model:value="uploadForm.height_mm" :min="0" style="width: 100%" />
                </div>
              </n-gi>
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">深 (mm)</label>
                  <n-input-number v-model:value="uploadForm.depth_mm" :min="0" style="width: 100%" />
                </div>
              </n-gi>
              <n-gi>
                <div class="upload-field">
                  <label class="upload-field__label">宽 (mm)</label>
                  <n-input-number v-model:value="uploadForm.width_mm" :min="0" style="width: 100%" />
                </div>
              </n-gi>
            </n-grid>
          </div>

        </div>
      </n-spin>

      <template #footer>
        <div class="upload-footer">
          <n-button @click="uploadVisible = false" size="large">取消</n-button>
          <n-button
            type="primary"
            size="large"
            :loading="uploading"
            :disabled="!uploadForm.store_id || !uploadForm.description_category_id"
            @click="doUpload"
          >🚀 上传到 Ozon</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, h, onMounted, nextTick, watch } from "vue";
import {
  NButton, NTag, NSpace, NInput, NInputNumber, NSelect, NDataTable,
  NPopconfirm, NPagination, NDrawer, NDrawerContent, NImage, NDivider,
  NModal, NForm, NFormItem, NGrid, NGi, NH2, NAlert,
  NTreeSelect, NA, NSpin, NDatePicker,
  type GlobalThemeOverrides,
} from "naive-ui";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";
import { translateText, translateBatch, optimizeDescription, translateImage, replaceImageSubject, generateImage } from "../api/ai";
import { useMessage } from "naive-ui";

const message = useMessage();

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

// ── 左右面板滚动锚点联动 ──
const panelLeftRef = ref<HTMLElement | null>(null);
const panelRightRef = ref<HTMLElement | null>(null);
const isSyncingScroll = ref(false);

function handlePanelScroll(side: 'left' | 'right') {
  if (isSyncingScroll.value) return;
  const source = side === 'left' ? panelLeftRef.value : panelRightRef.value;
  const target = side === 'left' ? panelRightRef.value : panelLeftRef.value;
  if (!source || !target) return;
  const sourceMax = source.scrollHeight - source.clientHeight;
  if (sourceMax <= 0) return;
  const ratio = source.scrollTop / sourceMax;
  const targetMax = target.scrollHeight - target.clientHeight;
  isSyncingScroll.value = true;
  target.scrollTop = ratio * targetMax;
  nextTick(() => { isSyncingScroll.value = false; });
}

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

const hasChanges = computed(() => {
  if (!editProduct.value || !editProductSnapshot.value) return false;
  return JSON.stringify(editProduct.value) !== JSON.stringify(editProductSnapshot.value);
});

function openDrawer(product: any) {
  editProduct.value = JSON.parse(JSON.stringify(product));
  editProductSnapshot.value = JSON.parse(JSON.stringify(product));
  drawerVisible.value = true;
}

async function saveEdit() {
  if (!editProduct.value) return;
  drawerSaving.value = true;
  try {
    const d = editProduct.value;
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
      weight_g: d.weight_g,
      width_mm: d.width_mm,
      height_mm: d.height_mm,
      depth_mm: d.depth_mm,
    });
    message.success("保存成功");
    editProductSnapshot.value = JSON.parse(JSON.stringify(editProduct.value));
    await loadProducts();
  } catch (e: any) {
    message.error("保存失败: " + e.message);
  } finally {
    drawerSaving.value = false;
  }
}

// ── 上传到 Ozon 弹窗 ──
const uploadVisible = ref(false);
const uploading = ref(false);
const storeOptions = ref<any[]>([]);
const categoryTree = ref<any[]>([]);
const priceCalcResult = ref<any>(null);

const uploadForm = reactive({
  store_id: null as number | null,
  description_category_id: null as number | null,
  name: "",
  description: "",
  exchange_rate: 12.5,
  markup_factor: 1.5,
  commission_pct: 15,
  logistics_rub: 500,
  packaging_rub: 50,
  weight_g: 0,
  height_mm: 0,
  depth_mm: 0,
  width_mm: 0,
  offer_id: "",
});

function openUpload(product: any) {
  editProduct.value = JSON.parse(JSON.stringify(product));
  uploadForm.name = product.title || "";
  uploadForm.description = product.description || "";
  uploadForm.weight_g = product.weight_g || product.spec_list?.[0]?.weight_g || 0;
  uploadForm.height_mm = product.height_mm || product.spec_list?.[0]?.height_mm || 0;
  uploadForm.depth_mm = product.depth_mm || product.spec_list?.[0]?.depth_mm || 0;
  uploadForm.width_mm = product.width_mm || product.spec_list?.[0]?.width_mm || 0;
  calcUploadPrice();
  uploadVisible.value = true;
}

function handleUploadFromDrawer() {
  if (!editProduct.value) return;
  openUpload(editProduct.value);
}

function calcUploadPrice() {
  if (!editProduct.value) return;
  const p = editProduct.value;
  const srcPrice = p.price || 0;
  const rate = uploadForm.exchange_rate || 12.5;
  const markup = uploadForm.markup_factor || 1.5;
  const commPct = (uploadForm.commission_pct || 15) / 100;
  const logistics = uploadForm.logistics_rub || 0;
  const packaging = uploadForm.packaging_rub || 0;

  const costRub = Math.round(srcPrice * rate + logistics + packaging);
  const markupPrice = Math.round(costRub * markup);
  const commission = Math.round(markupPrice * commPct);
  const finalPrice = Math.round(markupPrice + commission);

  priceCalcResult.value = {
    cost_rub: costRub,
    markup_price_rub: markupPrice,
    commission_rub: commission,
    final_price_rub: finalPrice,
  };
}

async function doUpload() {
  if (!editProduct.value) return;
  uploading.value = true;
  try {
    await apiPost("/ozon/upload", {
      scraped_product_id: editProduct.value.id,
      store_id: uploadForm.store_id,
      description_category_id: uploadForm.description_category_id,
      name: uploadForm.name,
      description: uploadForm.description,
      price: priceCalcResult.value?.final_price_rub,
      weight_g: uploadForm.weight_g || undefined,
      height_mm: uploadForm.height_mm || undefined,
      depth_mm: uploadForm.depth_mm || undefined,
      width_mm: uploadForm.width_mm || undefined,
    });
    message.success("上传任务已提交,请在 Ozon 后台查看状态");
    uploadVisible.value = false;
  } catch (e: any) {
    message.error("上传失败: " + e.message);
  } finally {
    uploading.value = false;
  }
}

// ── 图片管理 ──
const imageUploadRef = ref<HTMLInputElement | null>(null);

function triggerImageUpload() {
  imageUploadRef.value?.click();
}

function handleImageUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length || !editProduct.value) return;
  // TODO: Upload images to server and get URLs
  message.info("图片上传功能即将上线,敬请期待 ✨");
  input.value = "";
}

function removeImage(idx: number) {
  if (!editProduct.value?.images) return;
  editProduct.value.images.splice(idx, 1);
}

// ── AI 图片功能 ──
const aiImageLoading = ref<number | null>(null);

async function handleAiOptimizeImage(idx: number) {
  if (!editProduct.value?.images?.[idx]) return;
  aiImageLoading.value = idx;
  try {
    const img = editProduct.value.images[idx];
    const url = typeof img === "string" ? img : img.url;
    const res = await replaceImageSubject({
      image_url: url,
      prompt: "Professional e-commerce product photo on white background, studio lighting, clean",
    });
    if (res.result_url) {
      if (typeof editProduct.value.images[idx] === "string") {
        editProduct.value.images[idx] = res.result_url;
      } else {
        editProduct.value.images[idx].result_url = res.result_url;
      }
      message.success("图片优化完成");
    }
  } catch (e: any) {
    message.error("图片优化失败: " + e.message);
  } finally {
    aiImageLoading.value = null;
  }
}

async function handleAiOptimizeImages() {
  if (!editProduct.value?.images?.length) {
    message.warning("暂无图片");
    return;
  }
  try {
    for (let i = 0; i < editProduct.value.images.length; i++) {
      await handleAiOptimizeImage(i);
    }
    message.success("所有图片优化完成");
  } catch (e: any) {
    message.error("批量图片优化失败: " + e.message);
  }
}

async function handleAiGenerateImages() {
  if (!editProduct.value) return;
  try {
    const res = await generateImage({
      title: editProduct.value.title,
      category: editProduct.value.category,
      count: 4,
    });
    if (res.images?.length) {
      if (!editProduct.value.images) editProduct.value.images = [];
      editProduct.value.images.push(...res.images.map((url) => ({ url })));
      message.success(`生成 ${res.images.length} 张图片`);
    }
  } catch (e: any) {
    message.error("图片生成失败: " + e.message);
  }
}

// ── AI 文字功能 ──
const aiTextLoading = ref(false);

async function handleAiTranslate(target: "title" | "description") {
  if (!editProduct.value) return;
  const text = editProduct.value[target];
  if (!text) {
    message.warning("没有可翻译的文本");
    return;
  }
  aiTextLoading.value = true;
  try {
    const res = await translateText({
      text,
      field_type: target,
      context: editProduct.value.category || "",
    });
    if (res.translated) {
      editProduct.value[target] = res.translated;
      message.success(`${target === "title" ? "标题" : "描述"}翻译完成`);
    }
  } catch (e: any) {
    message.error("翻译失败: " + e.message);
  } finally {
    aiTextLoading.value = false;
  }
}

async function handleAiOptimize(target: "title" | "description") {
  if (!editProduct.value) return;
  const text = editProduct.value[target];
  if (!text) {
    message.warning("没有可优化的文本");
    return;
  }
  aiTextLoading.value = true;
  try {
    const res = await optimizeDescription({
      title: target === "title" ? undefined : editProduct.value.title,
      description: target === "description" ? text : undefined,
      attributes: (editProduct.value.attributes || []).reduce((acc: any, a: any) => {
        if (a.name) acc[a.name] = a.value;
        return acc;
      }, {}),
      context: editProduct.value.category || "",
    });
    if (res.description) {
      editProduct.value[target] = res.description;
      message.success(`${target === "title" ? "标题" : "描述"}优化完成`);
    }
  } catch (e: any) {
    message.error("优化失败: " + e.message);
  } finally {
    aiTextLoading.value = false;
  }
}

async function handleTranslateAllAttrs() {
  if (!editProduct.value?.attributes?.length) {
    message.warning("暂无属性可翻译");
    return;
  }
  aiTextLoading.value = true;
  try {
    const items = editProduct.value.attributes
      .filter((a: any) => a.name || a.value)
      .map((a: any) => ({ key: a.name || "", value: a.value || "" }));
    if (items.length === 0) {
      message.warning("属性为空");
      return;
    }
    const res = await translateBatch({
      items,
      field_type: "attribute",
    });
    if (res.items?.length) {
      for (const item of res.items) {
        const attr = editProduct.value.attributes.find((a: any) => a.name === item.key);
        if (attr) {
          if (item.translated) attr.value = item.translated;
        }
      }
      message.success(`翻译 ${res.items.length} 个属性`);
    }
  } catch (e: any) {
    message.error("属性翻译失败: " + e.message);
  } finally {
    aiTextLoading.value = false;
  }
}

// ── 属性管理 ──
function addAttribute() {
  if (!editProduct.value) return;
  if (!editProduct.value.attributes) editProduct.value.attributes = [];
  editProduct.value.attributes.push({ name: "", value: "" });
}

function removeAttribute(idx: number) {
  if (!editProduct.value?.attributes) return;
  editProduct.value.attributes.splice(idx, 1);
}

// ── SKU 管理 ──
function addSku() {
  if (!editProduct.value) return;
  if (!editProduct.value.sku_list) editProduct.value.sku_list = [];
  editProduct.value.sku_list.push({ sku: "", name: "", price: 0, stock: 0 });
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
    key: "reviews_count",
    width: 70,
    sorter: true,
  },
  {
    title: "折扣",
    key: "discount",
    width: 70,
    render(row: any) {
      return row.discount ? h(NTag, { size: "small", round: true, bordered: false, type: "error" }, () => row.discount) : h("span", { style: "color:#ccc;" }, "—");
    },
  },
  {
    title: "操作",
    key: "actions",
    width: 160,
    fixed: "right" as const,
    render(row: any) {
      return h(NSpace, { size: 4 }, () => [
        h(NButton, { size: "small", type: "primary", quaternary: true, onClick: () => openDrawer(row) }, () => "✏️ 编辑"),
        h(NButton, { size: "small", type: "success", quaternary: true, onClick: () => openUpload(row) }, () => "🚀 上传"),
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
    products.value = data;
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

// lazy-load category tree: only load root level first
const categoryTreeNodes = ref<any[]>([]);

function toTreeNodes(nodes: any[]): any[] {
  // Always set isLeaf=false so the expand arrow appears and lazy load can fire.
  // We strip nested children from the API response to force lazy loading at each level.
  return (nodes || []).map((n) => ({
    key: n.description_category_id ?? n.category_id,
    label: n.category_name ?? String(n.description_category_id ?? n.category_id),
    isLeaf: false,
  }));
}

async function loadCategoryTree(storeId?: number) {
  try {
    const params = new URLSearchParams();
    params.set('category_id', '0');
    if (storeId) params.set('store_id', String(storeId));
    const resp = await apiGet<any>(`/selection/ozon-categories?${params}`);
    const raw = Array.isArray(resp) ? resp : (resp?.categories || []);
    categoryTreeNodes.value = toTreeNodes(raw);
  } catch (e) {
    console.error("loadCategoryTree failed:", e);
  }
}

// called by n-tree-select when user expands a node
async function loadTreeChildren(node: any, done: (children: any[]) => void) {
  try {
    const categoryId = node.key;
    const params = new URLSearchParams();
    params.set('category_id', String(categoryId));
    const storeId = uploadForm.store_id;
    if (storeId) params.set('store_id', String(storeId));
    const resp = await apiGet<any>(`/selection/ozon-categories?${params}`);
    const raw = Array.isArray(resp) ? resp : (resp?.categories || []);
    // Strip nested children: API may return full tree, but for lazy loading
    // we only want one level at a time so the expand arrow works at every level.
    const stripped = raw.map((n: any) => ({ ...n, children: undefined }));
    done(toTreeNodes(stripped));
  } catch (e) {
    console.error("loadTreeChildren failed:", e);
    done([]);
  }
}

// Only allow selecting leaf nodes (last level only)
function onCategoryValueChange(value: any) {
  if (value == null) {
    uploadForm.description_category_id = null;
    return;
  }
  function findNode(nodes: any[]): any {
    for (const n of nodes) {
      if (n.key === value) return n;
      if (n.children) { const f = findNode(n.children); if (f) return f; }
    }
    return null;
  }
  const node = findNode(categoryTreeNodes.value);
  // If node has loaded children (non-empty array), it's not a leaf — reject selection
  if (node && node.children && node.children.length > 0) {
    message.warning('请展开选择最后一级分类');
    return;
  }
  uploadForm.description_category_id = value;
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

// Reload category tree when store is selected in upload dialog
watch(() => uploadForm.store_id, (newStoreId) => {
  if (newStoreId && newStoreId > 0) {
    loadCategoryTree(newStoreId);
  }
});
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════
   选品中心 — 全局样式
   ═══════════════════════════════════════════════════════ */
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

/* ━━━ 编辑抽屉 — 左右联动面板 ━━━ */
.edit-drawer-body {
  display: flex;
  gap: 0;
  min-height: calc(100vh - 120px);
}

.panel-left {
  flex: 0 0 45%;
  padding: 16px;
  background: var(--bg-elevated);
  border-radius: 6px;
  overflow-y: auto;
  max-height: calc(100vh - 160px);
  border-right: 1px solid var(--border-color);
}

.panel-right {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  max-height: calc(100vh - 160px);
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

/* ── 图片画廊 ── */
.gallery-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.gallery-item {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
  transition: border-color 0.15s ease;
}

.gallery-item.is-main {
  border-color: #18a058;
}

.gallery-img {
  border-radius: 6px;
  object-fit: cover;
}

.main-badge {
  position: absolute;
  top: 2px;
  left: 2px;
  background: #18a058;
  color: #fff;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
}

/* ── 图片管理器 ── */
.image-manager {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.image-card {
  position: relative;
  width: 84px;
  height: 84px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  transition: all 0.15s ease;
}

.image-card:hover {
  border-color: #18a058;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.image-card:hover .image-actions {
  opacity: 1;
}

.image-card .gallery-img {
  width: 100%;
  height: 100%;
}

.image-actions {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 2px;
  padding: 2px;
  background: rgba(0,0,0,0.5);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.image-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-style: dashed;
}

.image-add:hover {
  background: var(--bg-card-hover, #f8f9fa);
}

/* ── 属性行 ── */
.attr-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.attr-row:hover {
  background: var(--bg-card-hover, #f8f9fa);
}

.attr-row.readonly {
  font-size: 13px;
}

.attr-name {
  font-weight: 500;
  color: var(--text-secondary);
  min-width: 60px;
}

.attr-value {
  color: var(--text-primary);
  flex: 1;
}

/* ── SKU 编辑行 ── */
.sku-edit-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
  padding: 4px 6px;
  border-radius: 6px;
  background: var(--bg-elevated);
}

.sku-row {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  padding: 3px 0;
}

/* ── 编辑抽屉底部 ── */
.edit-drawer-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* ── 响应式 ── */
@media (max-width: 1100px) {
  .edit-drawer-body {
    flex-direction: column;
  }
  .panel-left, .panel-right {
    flex: none;
    width: 100%;
    max-height: none;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
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
  border-bottom-color: var(--border-color, rgba(255,255,255,0.08)) !important;
}
[data-theme="dark"] .n-drawer-footer {
  background-color: var(--bg-main, #1a1a2e) !important;
  border-top-color: var(--border-color, rgba(255,255,255,0.08)) !important;
}
[data-theme="dark"] .n-collapse-item {
  --n-title-font-size: 14px;
}
[data-theme="dark"] .attr-row:hover {
  background: var(--bg-card-hover, #1c2048) !important;
}
[data-theme="dark"] .image-add:hover {
  background: var(--bg-card-hover, #1c2048) !important;
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
</style>
