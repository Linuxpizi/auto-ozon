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
    <n-drawer v-model:show="drawerVisible" :width="680" placement="right" :closable="true" :mask-closable="true" :theme-overrides="drawerThemeOverrides">
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
                  <n-image :src="img" :width="idx === 0 ? 100 : 64" :height="idx === 0 ? 100 : 64" object-fit="cover" preview-disabled class="gallery-img" />
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
                <div class="info-item"><span class="info-key">评论</span><span>{{ editProduct.review_count ?? '—' }}</span></div>
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
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
              <div class="panel-title" style="margin-bottom:0">✨ 优化数据</div>
              <n-button size="small" type="primary" :loading="aiOneClickLoading" @click="handleOneClickAiOptimize">
                🤖 一键AI优化
              </n-button>
            </div>

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
                  <n-image :src="img" width="80" height="80" object-fit="cover" preview-disabled class="gallery-img" />
                  <div class="image-actions">
                    <n-button size="tiny" quaternary type="primary" @click="handleAiOptimizeImage(idx)" :loading="aiImageLoading === idx">✨</n-button>
                    <n-button size="tiny" quaternary type="info" @click="openEditor(idx)">✏️</n-button>
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

            <!-- 店铺与 Ozon 分类 -->
            <div class="section-block">
              <div class="section-label">🏪 店铺与 Ozon 分类</div>
              <n-grid :cols="1" :x-gap="8">
                <n-gi>
                  <div class="field-label">Ozon 店铺</div>
                  <n-select
                    v-model:value="editProduct.store_id"
                    :options="storeOptions"
                    placeholder="选择店铺"
                    size="small"
                    clearable
                    @update:value="onEditStoreChange"
                  />
                </n-gi>
                <n-gi style="margin-top:8px">
                  <div class="field-label">商品分类</div>
                  <n-popover
                    trigger="click"
                    placement="bottom-start"
                    :disabled="!editProduct.store_id"
                    :show="editCategoryPopoverShow"
                    @update:show="(v: boolean) => editCategoryPopoverShow = v"
                    raw
                    :style="{ width: '420px' }"
                  >
                    <template #trigger>
                      <n-input
                        :value="editSelectedCategoryLabel"
                        placeholder="请先选择店铺,然后点击选择分类"
                        readonly
                        :disabled="!editProduct.store_id"
                        size="small"
                        style="cursor: pointer"
                      >
                        <template #suffix>
                          <n-icon v-if="editSelectedCategoryLabel" @click.stop="clearEditCategorySelection" style="cursor: pointer">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>
                          </n-icon>
                        </template>
                      </n-input>
                    </template>
                    <div style="background: var(--n-color); border-radius: 8px; box-shadow: 0 6px 16px rgba(0,0,0,.12); overflow: hidden;">
                      <div style="padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,.06);">
                        <n-input
                          v-model:value="editCategorySearchPattern"
                          placeholder="🔍 搜索分类..."
                          clearable
                          size="small"
                        />
                      </div>
                      <div style="height: 360px; overflow-y: auto; padding: 4px 0;">
                        <n-tree
                          :data="categoryTreeNodes"
                          :selected-keys="editSelectedCategoryKeys"
                          :expanded-keys="expandedCategoryKeys"
                          :cascade="false"
                          :pattern="editCategorySearchPattern || undefined"
                          :filter="filterCategoryTree"
                          @update:selected-keys="onCategoryTreeSelect"
                          @update:expanded-keys="onCategoryTreeExpand"
                        />
                      </div>
                    </div>
                  </n-popover>
                </n-gi>
              </n-grid>
            </div>

            <!-- 价格 -->
            <div class="section-block">
              <div class="section-label">
                价格与促销
                <div class="section-actions">
                  <n-button size="tiny" type="warning" @click="showSmartPricingModal" :loading="smartPricingLoading">💰 智能定价</n-button>
                </div>
              </div>
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

            <!-- ━━━ 1688找同款 ━━━ -->
            <div class="section-block">
              <div class="section-label">
                🔗 1688 同款
                <div class="section-actions">
                  <n-button size="tiny" quaternary type="warning" :loading="extract1688Loading" @click="handleExtract1688Specs" :disabled="!linked1688Info && !editProduct?.source_url?.includes('1688')">📥 提取参数</n-button>
                  <n-button size="tiny" type="primary" @click="showSearch1688Modal" :loading="search1688Loading">🔍 搜索同款</n-button>
                </div>
              </div>
              <div v-if="linked1688Info" class="linked-1688-info">
                <n-tag size="small" type="info" :bordered="false">✅ 已绑定</n-tag>
                <div class="linked-1688-title" @click="openUrl(linked1688Info.url)">{{ linked1688Info.title || linked1688Info.url }}</div>
                <n-button size="tiny" quaternary type="error" @click="unlink1688">解绑</n-button>
              </div>
              <div v-else class="empty-hint">
                <span v-if="editProduct.source_url?.includes('1688')">当前商品来自1688，可直接提取参数</span>
                <span v-else>未绑定1688同款，点击搜索按钮查找</span>
              </div>
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
            <div v-for="item in search1688Results" :key="item.offer_id" class="search1688-card" @click="handleLink1688(item)">
              <n-image :src="item.image" width="80" height="80" object-fit="cover" style="border-radius: 6px; flex-shrink: 0;" v-if="item.image" />
              <div v-else style="width:80px;height:80px;background:#f0f0f0;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">📦</div>
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
          <div v-else-if="!search1688Loading && search1688Keyword && search1688Searched" style="text-align:center; padding:20px; color:#999;">
            未找到结果，换个关键词试试
          </div>
        </n-spin>
      </n-space>
    </n-modal>

    <!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         上传到 Ozon 弹窗
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

    <!-- ━━━ 智能定价弹窗 ━━━ -->
    <n-modal v-model:show="smartPricingVisible" preset="card" style="width: 600px;" :bordered="false">
      <template #header>
        <span>💰 智能定价</span>
      </template>
      <n-space vertical :size="16">
        <n-grid :cols="2" :x-gap="12" :y-gap="8">
          <n-gi>
            <div class="field-label">采购价 (CNY)</div>
            <n-input-number v-model:value="pricingForm.cost_cny" :min="0" :precision="2" size="small" style="width:100%" placeholder="1688 采购价" />
          </n-gi>
          <n-gi>
            <div class="field-label">运费 (CNY)</div>
            <n-input-number v-model:value="pricingForm.shipping_cny" :min="0" :precision="2" size="small" style="width:100%" placeholder="国际运费" />
          </n-gi>
          <n-gi>
            <div class="field-label">包装费 (CNY)</div>
            <n-input-number v-model:value="pricingForm.packaging_cny" :min="0" :precision="2" size="small" style="width:100%" placeholder="包装费" />
          </n-gi>
          <n-gi>
            <div class="field-label">汇率 (CNY→RUB)</div>
            <n-input-number v-model:value="pricingForm.exchange_rate" :min="0" :precision="2" size="small" style="width:100%" />
          </n-gi>
          <n-gi>
            <div class="field-label">Ozon 佣金 (%)</div>
            <n-input-number v-model:value="pricingForm.ozon_commission_pct" :min="0" :max="100" :precision="1" size="small" style="width:100%" />
          </n-gi>
          <n-gi>
            <div class="field-label">目标利润率 (%)</div>
            <n-input-number v-model:value="pricingForm.target_margin_pct" :min="0" :max="500" :precision="1" size="small" style="width:100%" />
          </n-gi>
          <n-gi>
            <div class="field-label">竞品价格 (RUB)</div>
            <n-input-number v-model:value="pricingForm.competitor_price_rub" :min="0" :precision="2" size="small" style="width:100%" placeholder="可选" />
          </n-gi>
        </n-grid>
        <n-button type="warning" block :loading="smartPricingLoading" @click="handleSmartPricing">
          🧮 计算建议价格
        </n-button>
        <!-- 计算结果 -->
        <n-card v-if="pricingResult" size="small" title="📊 定价结果" :bordered="true">
          <n-grid :cols="2" :x-gap="8" :y-gap="4">
            <n-gi>
              <div class="pricing-result-item">
                <span class="pricing-result-label">💰 建议售价</span>
                <span class="pricing-result-value" style="color: #d03050; font-size: 18px;">₽ {{ pricingResult.suggested_price_rub }}</span>
              </div>
            </n-gi>
            <n-gi>
              <div class="pricing-result-item">
                <span class="pricing-result-label">🏷️ 划线价</span>
                <span class="pricing-result-value">₽ {{ pricingResult.old_price_rub }}</span>
              </div>
            </n-gi>
            <n-gi>
              <div class="pricing-result-item">
                <span class="pricing-result-label">📦 总成本</span>
                <span class="pricing-result-value">₽ {{ pricingResult.cost_total_rub }} (¥{{ pricingResult.cost_total_cny }})</span>
              </div>
            </n-gi>
            <n-gi>
              <div class="pricing-result-item">
                <span class="pricing-result-label">📈 利润率</span>
                <span class="pricing-result-value">{{ pricingResult.margin_pct }}%</span>
              </div>
            </n-gi>
            <n-gi>
              <div class="pricing-result-item">
                <span class="pricing-result-label">💎 预计利润</span>
                <span class="pricing-result-value" style="color: #18a058;">₽ {{ pricingResult.profit_rub }}</span>
              </div>
            </n-gi>
            <n-gi>
              <div class="pricing-result-item">
                <span class="pricing-result-label">🏦 佣金</span>
                <span class="pricing-result-value">₽ {{ pricingResult.commission_rub }}</span>
              </div>
            </n-gi>
          </n-grid>
        </n-card>
      </n-space>
      <template #footer>
        <div class="upload-footer">
          <n-button @click="smartPricingVisible = false">取消</n-button>
        </div>
      </template>
    </n-modal>

    <!-- ━━━ 图片编辑器 (ImageEditor) ━━━ -->
    <n-modal
      v-model:show="editorVisible"
      :mask-closable="true"
      :close-on-esc="true"
      style="width: 85vw; max-width: 1400px; height: 75vh;"
      content-style="padding: 0; height: 75vh; overflow: hidden;"
    >
      <div class="image-editor-modal">
        <ImageEditor
          :image-url="editorImageUrl"
          @apply="onEditorApply"
          @close="editorVisible = false"
        />
      </div>
    </n-modal>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, h, onMounted, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import {
  NButton, NTag, NSpace, NInput, NInputNumber, NSelect, NDataTable,
  NPopconfirm, NPagination, NDrawer, NDrawerContent, NImage, NDivider,
  NModal, NForm, NFormItem, NGrid, NGi, NH2, NAlert,
  NTree, NA, NSpin, NDatePicker, NInputGroup, NCard,
  type GlobalThemeOverrides,
} from "naive-ui";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";
import { translateText, translateBatch, optimizeDescription, translateImage, replaceImageSubject, generateImage } from "../api/ai";
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

function onEditStoreChange(val: number | null) {
  editProduct.value.description_category_id = null;
  editProduct.value.type_id = null;
  editProduct.value.ozon_category_id = 0;
  editProduct.value.ozon_type_id = 0;
  editSelectedCategoryKeys.value = [];
  editSelectedCategoryPathLabel.value = '';
  if (val) {
    loadCategoryTree(val);
  } else {
    categoryTreeNodes.value = [];
    categoryTreeMap.value.clear();
  }
}

function clearEditCategorySelection() {
  editSelectedCategoryKeys.value = [];
  editSelectedCategoryPathLabel.value = '';
  editProduct.value.description_category_id = null;
  editProduct.value.type_id = null;
  editProduct.value.ozon_category_id = 0;
  editProduct.value.ozon_type_id = 0;
}

const hasChanges = computed(() => {
  if (!editProduct.value || !editProductSnapshot.value) return false;
  return JSON.stringify(editProduct.value) !== JSON.stringify(editProductSnapshot.value);
});

function openDrawer(product: any) {
  const normalizedProduct = {
    ...JSON.parse(JSON.stringify(product)),
    description_category_id: product.description_category_id || product.ozon_category_id || null,
    type_id: product.type_id || product.ozon_type_id || null,
  };
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
  // load category tree if store_id is set
  if (product.store_id) {
    loadCategoryTree(product.store_id);
  }
  if (!storeOptions.value.length) {
    loadStoreOptions();
  }
  drawerVisible.value = true;
  // Auto-detect PowerPaint service when drawer opens
  if (!ppDeviceInfo.value && !ppDeviceLoading.value) {
    loadPpDeviceInfo();
  }
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
      store_id: d.store_id || null,
      description_category_id: d.description_category_id || null,
      type_id: d.type_id || null,
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

// ── 店铺选项（编辑抽屉使用） ──
const storeOptions = ref<any[]>([]);

// ── 创建上架草稿 ──
const drawerCreatingDraft = ref(false);

async function handleCreateDraft() {
  if (!editProduct.value) return;
  drawerCreatingDraft.value = true;
  try {
    const d = editProduct.value;
    await apiPost("/upload/drafts", {
      store_id: d.store_id,
      source_type: "selection",
      source_product_id: d.id,
      name: d.title || "",
      description: d.description || "",
      category_name: d.category || "",
      price_cny: d.price || 0,
      description_category_id: d.description_category_id || 0,
      type_id: d.type_id || 0,
      weight: d.weight_g || 500,
      height: d.height_mm || 100,
      depth: d.depth_mm || 100,
      width: d.width_mm || 100,
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

// ── 图片编辑器 ──
const editorVisible = ref(false);
const editorImageUrl = ref("");
const editorImageIdx = ref(-1);

function openEditor(idx: number) {
  if (!editProduct.value?.images?.[idx]) return;
  editorImageIdx.value = idx;
  editorImageUrl.value = typeof editProduct.value.images[idx] === 'string'
    ? editProduct.value.images[idx]
    : (editProduct.value.images[idx] as any)?.url || editProduct.value.images[idx];
  editorVisible.value = true;
}

function onEditorApply(editedUrl: string) {
  const idx = editorImageIdx.value;
  if (idx < 0 || !editProduct.value?.images) return;
  editProduct.value.images[idx] = editedUrl;
  editorVisible.value = false;
  message.success("编辑结果已应用到图片");
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

// ── 智能定价 ──
const smartPricingVisible = ref(false);
const smartPricingLoading = ref(false);
const pricingResult = ref<any>(null);
const pricingForm = ref({
  cost_cny: 0,
  shipping_cny: 0,
  packaging_cny: 0,
  exchange_rate: 12.5,
  ozon_commission_pct: 15.0,
  target_margin_pct: 30.0,
  competitor_price_rub: 0,
});

function showSmartPricingModal() {
  if (editProduct.value) {
    pricingForm.value.cost_cny = editProduct.value.price || 0;
  }
  pricingResult.value = null;
  smartPricingVisible.value = true;
}

async function handleSmartPricing() {
  smartPricingLoading.value = true;
  try {
    const result = await apiPost("/selection/smart-pricing", {
      product_id: editProduct.value?.id || 0,
      ...pricingForm.value,
    });
    pricingResult.value = result;
  } catch (e: any) {
    message.error("定价计算失败: " + e.message);
  } finally {
    smartPricingLoading.value = false;
  }
}

function applySmartPricing() {
  if (!pricingResult.value || !editProduct.value) return;
  editProduct.value.price = pricingResult.value.suggested_price_rub;
  editProduct.value.old_price = pricingResult.value.old_price_rub;
  message.success(`✅ 已应用：售价 ₽${pricingResult.value.suggested_price_rub}，划线价 ₽${pricingResult.value.old_price_rub}`);
  smartPricingVisible.value = false;
}

// ── 1688 找同款 ──
const search1688Visible = ref(false);
const search1688Keyword = ref("");
const search1688Results = ref<any[]>([]);
const search1688Loading = ref(false);
const search1688Searched = ref(false);

const linked1688Info = computed(() => {
  if (!editProduct.value?.attributes) return null;
  const linkAttr = editProduct.value.attributes.find((a: any) => a.name === "1688_同款链接");
  if (!linkAttr) return null;
  const titleAttr = editProduct.value.attributes.find((a: any) => a.name === "1688_同款标题");
  return { url: linkAttr.value, title: titleAttr?.value || "" };
});

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
    // 更新本地属性
    if (result.total_attributes) {
      const existingAttrs = editProduct.value.attributes || [];
      const filtered = existingAttrs.filter((a: any) => !["1688_同款链接", "1688_同款标题", "1688_offer_id", "1688_供应商"].includes(a.name));
      filtered.push(
        { name: "1688_同款链接", value: item.url || `https://detail.1688.com/offer/${item.offer_id}.html` },
        { name: "1688_同款标题", value: item.title || "" },
      );
      if (item.offer_id) filtered.push({ name: "1688_offer_id", value: item.offer_id });
      if (item.seller) filtered.push({ name: "1688_供应商", value: item.seller });
      editProduct.value.attributes = filtered;
    }
    message.success(`✅ 已绑定1688同款${result.specs_extracted?.length ? `，提取了 ${result.specs_extracted.length} 个规格参数` : ""}`);
    search1688Visible.value = false;
  } catch (e: any) {
    message.error("绑定失败: " + e.message);
  }
}

function unlink1688() {
  if (!editProduct.value?.attributes) return;
  editProduct.value.attributes = editProduct.value.attributes.filter(
    (a: any) => !["1688_同款链接", "1688_同款标题", "1688_offer_id", "1688_供应商"].includes(a.name)
  );
  message.success("已解绑1688同款");
}

function openUrl(url: string) {
  if (url) window.open(url, "_blank");
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
    // 更新属性
    if (result.total_attributes) {
      const res = await apiGet(`/selection/products/${editProduct.value.id}`);
      if (res.attributes) editProduct.value.attributes = res.attributes;
    }
    message.success(`✅ 已提取 ${result.specs_extracted?.length || 0} 个参数` +
      (result.weight_g ? `，重量: ${result.weight_g}g` : ""));
  } catch (e: any) {
    message.error("参数提取失败: " + e.message);
  } finally {
    extract1688Loading.value = false;
  }
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

// ── 一键AI优化 ──
const aiOneClickLoading = ref(false);

async function handleOneClickAiOptimize() {
  if (!editProduct.value) return;
  aiOneClickLoading.value = true;
  try {
    const steps: string[] = [];

    // Step 1: AI 优化标题
    if (editProduct.value.title) {
      try {
        const titleRes = await optimizeDescription({
          title: editProduct.value.title,
          attributes: (editProduct.value.attributes || []).reduce((acc: any, a: any) => {
            if (a.name) acc[a.name] = a.value;
            return acc;
          }, {}),
          context: editProduct.value.category || "",
        });
        if (titleRes.description) {
          editProduct.value.title = titleRes.description;
          steps.push("标题优化");
        }
      } catch { /* skip */ }
    }

    // Step 2: AI 优化描述
    if (editProduct.value.description) {
      try {
        const descRes = await optimizeDescription({
          description: editProduct.value.description,
          context: editProduct.value.category || "",
        });
        if (descRes.description) {
          editProduct.value.description = descRes.description;
          steps.push("描述优化");
        }
      } catch { /* skip */ }
    }

    // Step 3: 翻译属性
    if (editProduct.value.attributes?.length) {
      try {
        const items = editProduct.value.attributes
          .filter((a: any) => a.name || a.value)
          .map((a: any) => ({ key: a.name || "", value: a.value || "" }));
        if (items.length > 0) {
          const attrRes = await translateBatch({ items, field_type: "attribute" });
          if (attrRes.items?.length) {
            for (const item of attrRes.items) {
              const attr = editProduct.value.attributes.find((a: any) => a.name === item.key);
              if (attr && item.translated) attr.value = item.translated;
            }
            steps.push(`翻译${attrRes.items.length}个属性`);
          }
        }
      } catch { /* skip */ }
    }

    // Step 4: AI 优化图片
    if (editProduct.value.images?.length) {
      let optimizedCount = 0;
      for (let i = 0; i < editProduct.value.images.length; i++) {
        try {
          const img = editProduct.value.images[i];
          const url = typeof img === "string" ? img : img.url;
          const res = await replaceImageSubject({
            image_url: url,
            prompt: "Professional e-commerce product photo on white background, studio lighting, clean",
          });
          if (res.result_url) {
            if (typeof editProduct.value.images[i] === "string") {
              editProduct.value.images[i] = res.result_url;
            } else {
              editProduct.value.images[i].result_url = res.result_url;
            }
            optimizedCount++;
          }
        } catch { /* skip */ }
      }
      if (optimizedCount) steps.push(`优化${optimizedCount}张图片`);
    }

    if (steps.length) {
      message.success(`✅ 一键优化完成: ${steps.join(" → ")}`);
    } else {
      message.info("没有需要优化的内容");
    }
  } catch (e: any) {
    message.error("一键优化失败: " + e.message);
  } finally {
    aiOneClickLoading.value = false;
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

// ── Category tree: fetch all once per store, local lazy load ──
const categoryTreeNodes = ref<any[]>([]);
const selectedCategoryKeys = ref<any[]>([]);
const expandedCategoryKeys = ref<any[]>([]);
const categorySearchPattern = ref('');
const categoryPopoverShow = ref(false);
const categoryLoading = ref(false);
const categoryTreeMap = ref<Map<any, any[]>>(new Map()); // node key -> children[]
const categoryPathLabelMap = ref<Map<any, string>>(new Map()); // node key -> breadcrumb label

const selectedCategoryLabel = computed(() => {
  if (!selectedCategoryKeys.value.length) return '';
  const key = selectedCategoryKeys.value[0];
  return getCategoryPathLabelByKey(key);
});

function clearCategorySelection() {
  editSelectedCategoryKeys.value = [];
  editSelectedCategoryPathLabel.value = '';
  if (editProduct.value) {
    editProduct.value.description_category_id = null;
    editProduct.value.type_id = null;
    editProduct.value.ozon_category_id = 0;
    editProduct.value.ozon_type_id = 0;
  }
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
  return typeId ? `type:${categoryId}:${typeId}` : `cat:${categoryId}`;
}

function getCategoryNodeKey(node: any) {
  return makeCategorySelectionKey(getCategoryId(node), getCategoryTypeId(node));
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
  return path.map((node: any) => node.label).filter(Boolean).join(' -> ');
}

function hasCategoryChildren(node: any) {
  return Array.isArray(node?.children) && node.children.length > 0;
}

function toTreeNode(node: any): any {
  const key = getCategoryNodeKey(node);
  const children = Array.isArray(node?.children) ? node.children : [];
  const treeNode: any = {
    key,
    label: getCategoryNodeLabel(node),
    raw: node,
    description_category_id: getCategoryId(node),
    type_id: getCategoryTypeId(node),
    // Naive UI will show a loading spinner for non-leaf nodes without children.
    // Since the backend returns the whole category tree at once, build children eagerly
    // and only mark nodes with actual children as expandable.
    isLeaf: children.length === 0,
  };
  if (children.length > 0) {
    treeNode.children = children.map(toTreeNode);
  }
  return treeNode;
}

function toTreeNodes(nodes: any[]): any[] {
  return (nodes || []).map(toTreeNode);
}

// Flatten the entire category tree into categoryTreeMap (parentId -> children[])
function flattenTree(nodes: any[]) {
  for (const n of nodes || []) {
    const id = getCategoryNodeKey(n);
    const children = Array.isArray(n.children) ? n.children : [];
    const childNodes = children.map(toTreeNode);
    categoryTreeMap.value.set(id, childNodes);
    if (children.length > 0) flattenTree(children);
  }
}

function buildCategoryPathLabelMap(nodes: any[], parentLabels: string[] = []) {
  for (const node of nodes || []) {
    const key = getCategoryNodeKey(node);
    const label = getCategoryNodeLabel(node);
    const pathLabels = [...parentLabels, label].filter(Boolean);
    categoryPathLabelMap.value.set(key, pathLabels.join(' -> '));

    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length > 0) {
      buildCategoryPathLabelMap(children, pathLabels);
    }
  }
}

// Fetch ALL categories once when store is selected
async function loadCategoryTree(storeId?: number) {
  if (!storeId) {
    categoryTreeNodes.value = [];
    categoryTreeMap.value.clear();
    categoryPathLabelMap.value.clear();
    return;
  }
  categoryLoading.value = true;
  try {
    const params = new URLSearchParams();
    params.set('category_id', '0');
    params.set('store_id', String(storeId));
    const resp = await apiGet<any>(`/selection/ozon-categories?${params}`);
    const raw = Array.isArray(resp) ? resp : (resp?.categories || []);
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

// Children are built eagerly from the full category tree, so expand only tracks state.
function onCategoryTreeExpand(keys: any[]) {
  expandedCategoryKeys.value = keys;
}

// Only allow selecting leaf nodes (last level only); clicking a parent expands it.
function onCategoryTreeSelect(keys: any[]) {
  if (!keys || keys.length === 0) {
    editSelectedCategoryKeys.value = [];
    editSelectedCategoryPathLabel.value = '';
    if (editProduct.value) {
      editProduct.value.description_category_id = null;
      editProduct.value.type_id = null;
      editProduct.value.ozon_category_id = 0;
      editProduct.value.ozon_type_id = 0;
    }
    return;
  }

  const value = keys[keys.length - 1];
  const localChildren = categoryTreeMap.value.get(value) || [];

  if (localChildren.length > 0) {
    if (!expandedCategoryKeys.value.includes(value)) {
      expandedCategoryKeys.value = [...expandedCategoryKeys.value, value];
    }
    // Parent categories are navigation nodes, not selectable Ozon leaf categories.
    editSelectedCategoryKeys.value = [];
    editSelectedCategoryPathLabel.value = '';
    if (editProduct.value) {
      editProduct.value.description_category_id = null;
      editProduct.value.type_id = null;
      editProduct.value.ozon_category_id = 0;
      editProduct.value.ozon_type_id = 0;
    }
    return;
  }

  editSelectedCategoryKeys.value = [value];
  editSelectedCategoryPathLabel.value = getCategoryPathLabelByKey(value);
  if (editProduct.value) {
    const selectedNode = findCategoryTreeNodeByKey(categoryTreeNodes.value, value);
    const categoryId = selectedNode?.description_category_id ?? null;
    const typeId = selectedNode?.type_id ?? null;
    editProduct.value.description_category_id = categoryId;
    editProduct.value.type_id = typeId;
    editProduct.value.ozon_category_id = categoryId || 0;
    editProduct.value.ozon_type_id = typeId || 0;
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

// Watch store_id change -> reload full category tree
watch(() => editProduct.value?.store_id, (newVal) => {
  if (newVal) {
    loadCategoryTree(newVal);
  } else {
    categoryTreeNodes.value = [];
    categoryTreeMap.value.clear();
    categoryPathLabelMap.value.clear();
    expandedCategoryKeys.value = [];
    editSelectedCategoryKeys.value = [];
    editSelectedCategoryPathLabel.value = '';
    if (editProduct.value) {
      editProduct.value.description_category_id = null;
      editProduct.value.type_id = null;
      editProduct.value.ozon_category_id = 0;
      editProduct.value.ozon_type_id = 0;
    }
  }
});

function onPageSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1;
  loadProducts();
}

onMounted(() => {
  loadProducts();
  loadBrands();
  loadStoreOptions();
  // Don't load category tree here — it requires a store to be selected first
});
</script>

<style scoped>
.image-editor-modal {
  width: 100%;
  height: 75vh;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

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

/* ━━━ 编辑抽屉 — 左右联动面板 ━━━ */
.edit-drawer-body {
  display: flex;
  gap: 0;
}

.panel-left {
  flex: 0 0 42%;
  padding: 14px;
  background: #f0f2f5;
  border-radius: 6px;
  overflow-y: auto;
  border-right: 1px solid var(--border-color);
}

.panel-right {
  flex: 1;
  padding: 14px;
  overflow-y: auto;
  background: #fff;
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
  display: block;
  max-width: 80px;
  max-height: 80px;
  border-radius: 4px;
  object-fit: cover;
}

.image-actions {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 2px;
  padding: 3px 2px;
  background: rgba(0,0,0,0.6);
  opacity: 1;
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
@media (max-width: 600px) {
  .edit-drawer-body {
    flex-direction: column;
  }
  .panel-left {
    flex: none;
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }
  .panel-right {
    flex: none;
    width: 100%;
    border-right: none;
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
[data-theme="dark"] .panel-left {
  background: #1a1a2e !important;
}
[data-theme="dark"] .panel-right {
  background: #16213e !important;
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

/* ── 智能定价结果 ── */
.pricing-result-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
}

.pricing-result-label {
  font-size: 12px;
  color: #999;
}

.pricing-result-value {
  font-size: 14px;
  font-weight: 600;
  color: #333;
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

/* ── 已绑定 1688 信息 ── */
.linked-1688-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--bg-elevated, #f8f9fa);
  border-radius: 6px;
}

.linked-1688-title {
  flex: 1;
  font-size: 12px;
  color: #18a058;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.linked-1688-title:hover {
  text-decoration: underline;
}
</style>
