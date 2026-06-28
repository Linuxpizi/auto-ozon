<template>
  <div class="container">
    <div class="card">
      <div class="page-header">
        <n-h2 class="page-title" style="margin: 0">选品中心</n-h2>
        <n-space>
          <n-button size="small" @click="loadProducts" :loading="loading">刷新</n-button>
        </n-space>
      </div>

      <!-- 筛选栏 -->
      <n-space style="margin-bottom: 12px" align="center" wrap>
        <n-input v-model:value="keyword" placeholder="搜索名称 / SKU / 品类" clearable style="width: 220px" size="small" @keyup.enter="loadProducts" />
        <n-select v-model:value="filterBrand" :options="brandOptions" placeholder="品牌" clearable filterable style="width: 160px" size="small" @update:value="loadProducts" />
        <n-select v-model:value="filterPlatform" :options="platformOptions" placeholder="平台" clearable style="width: 130px" size="small" @update:value="loadProducts" />
        <n-input-number v-model:value="minPrice" placeholder="最低价" :min="0" style="width: 110px" size="small" @update:value="loadProducts" />
        <n-input-number v-model:value="maxPrice" placeholder="最高价" :min="0" style="width: 110px" size="small" @update:value="loadProducts" />
        <n-input-number v-model:value="minRating" placeholder="最低评分" :min="0" :max="5" :step="0.1" style="width: 110px" size="small" @update:value="loadProducts" />
        <n-input-number v-model:value="minReviews" placeholder="最低评论数" :min="0" style="width: 120px" size="small" @update:value="loadProducts" />
        <n-button size="small" @click="loadProducts">搜索</n-button>
        <n-button size="small" @click="resetFilters">重置</n-button>
      </n-space>

      <!-- 统计信息 -->
      <div style="margin-bottom: 12px; font-size: 13px; color: var(--text-secondary)">
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
            <span class="metric-label" style="text-decoration: line-through">{{ detailProduct.old_price?.toLocaleString() }} ₽</span>
            <span class="metric-value">{{ detailProduct.price?.toLocaleString() }} ₽</span>
          </div>
          <div v-else class="metric-item">
            <span class="metric-value">{{ detailProduct.price?.toLocaleString() || '—' }} ₽</span>
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
                  <label class="field-label">现价 (₽)</label>
                  <n-input-number v-model:value="detailProduct.price" :min="0" size="small" style="width: 100%" />
                  <div v-if="isModified('price')" class="original-hint">
                    <n-text depth="3" tag="span" style="font-size: 11px">原始：{{ originalProduct?.price?.toLocaleString() || '无' }} ₽</n-text>
                  </div>
                </div>
                <div class="field-group">
                  <label class="field-label">原价 (₽)</label>
                  <n-input-number v-model:value="detailProduct.old_price" :min="0" size="small" style="width: 100%" />
                  <div v-if="isModified('old_price')" class="original-hint">
                    <n-text depth="3" tag="span" style="font-size: 11px">原始：{{ originalProduct?.old_price?.toLocaleString() || '无' }} ₽</n-text>
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
  <n-modal v-model:show="uploadVisible" preset="card" title="上传到店铺" style="width: 480px" :bordered="false">
    <n-alert v-if="uploadProduct" type="info" style="margin-bottom: 12px">
      <strong>{{ truncateText(uploadProduct.title, 50) }}</strong>
      <span style="margin-left: 8px; color: #999">ID: {{ uploadProduct.source_id }}</span>
    </n-alert>
    <n-form label-placement="left" label-width="80" :model="uploadForm">
      <n-form-item label="选择店铺">
        <n-select v-model:value="uploadForm.store_id" :options="storeOptions" placeholder="选择目标店铺" filterable style="width: 100%" />
      </n-form-item>
      <n-form-item label="Offer ID">
        <n-input v-model:value="uploadForm.offer_id" placeholder="留空自动生成" />
      </n-form-item>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button @click="uploadVisible = false">取消</n-button>
        <n-button type="primary" :loading="uploading" @click="doUpload">上传</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { h, ref, onMounted, reactive } from "vue";
import {
  NH2, NH4, NSpace, NButton, NInput, NSelect, NInputNumber,
  NDataTable, NTag, NTooltip, NImage, NPopconfirm, NModal, NDrawer, NDrawerContent,
  NCard, NForm, NFormItem, NGrid, NGi, NAlert, NEmpty, NText, NDivider,
  NCollapse, NCollapseItem,
  useMessage, type DataTableColumns, type SelectOption,
} from "naive-ui";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";

// ── state ─────────────────────────────────────────────────────────
const loading = ref(false);
const products = ref<any[]>([]);
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

// ── upload modal state ────────────────────────────────────────────
const uploadVisible = ref(false);
const uploading = ref(false);
const uploadProduct = ref<any>(null);
const uploadForm = reactive({ store_id: null as number | null, offer_id: "" });
const storeOptions = ref<SelectOption[]>([]);

// ── helpers ───────────────────────────────────────────────────────
function formatPrice(price: number | string): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  if (!num) return "—";
  return num.toLocaleString("ru-RU") + " ₽";
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
  return h("div", { style: "white-space: nowrap" }, [
    h("div", { style: "font-weight: 600; font-size: 13px" }, formatPrice(row.price)),
    row.old_price && row.old_price > row.price
      ? h("div", { style: "font-size: 11px; color: #999; text-decoration: line-through" }, formatPrice(row.old_price))
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
  return h(NSpace, { size: 4 }, () => [
    h(NButton, { size: "tiny", quaternary: true, onClick: () => openDrawer(row) }, () => "详情"),
    h(NButton, { size: "tiny", quaternary: true, type: "info", onClick: () => openUpload(row) }, () => "上传"),
  ]);
}

// ── columns ───────────────────────────────────────────────────────
const columns: DataTableColumns<any> = [
  { title: "图片", key: "images", width: 64, render: imageSlot, fixed: "left" as const },
  { title: "商品名称", key: "title", minWidth: 260, render: nameSlot, ellipsis: { tooltip: true } },
  { title: "品牌", key: "brand", width: 110, render: (row) => h(NTag, { type: brandTagType(row.brand), size: "small", bordered: false }, () => row.brand || "\u2014") },
  { title: "价格", key: "price", width: 140, render: priceSlot },
  { title: "评分", key: "rating", width: 110, render: ratingSlot },
  { title: "属性", key: "attributes", minWidth: 260, render: attrsSlot },
  { title: "分类", key: "category", width: 140, render: (row) => h("span", { style: "font-size: 12px; color: #999" }, truncateText(row.category || "", 30)) },
  { title: "操作", key: "actions", width: 100, render: actionsSlot, fixed: "right" as const },
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
function openUpload(row: any) {
  uploadProduct.value = row;
  uploadForm.store_id = null;
  uploadForm.offer_id = "";
  uploadVisible.value = true;
  loadStores();
}

async function loadStores() {
  try {
    const stores = await apiGet("/selection/stores");
    storeOptions.value = stores.map((s: any) => ({ label: s.name, value: s.id }));
  } catch { /* ignore */ }
}

async function doUpload() {
  if (!uploadForm.store_id) { message.warning("请选择店铺"); return; }
  uploading.value = true;
  try {
    await apiPost(`/selection/products/${uploadProduct.value.id}/upload`, {
      store_id: uploadForm.store_id,
      offer_id: uploadForm.offer_id,
    });
    message.success("上传成功");
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

onMounted(() => { loadProducts(); loadBrands(); });
</script>

<style scoped>
/* ── 指标行 ── */
.metrics-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.metric-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.metric-value {
  font-size: 14px;
  font-weight: 600;
}
.metric-label {
  font-size: 12px;
  color: #999;
}

/* ── 图片区 ── */
.gallery-row {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 6px 0;
}
.gallery-item {
  position: relative;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid var(--n-border-color, #e0e0e6);
}
.gallery-item.is-main {
  border-color: #2080f0;
  box-shadow: 0 0 0 1px #2080f033;
}
.gallery-img {
  display: block;
}
.main-badge {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background: #2080f0;
  color: #fff;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
}
.img-index {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
}

/* ── 折叠面板内容 ── */
.section-body {
  padding: 6px 0;
}
.section-label {
  font-size: 12px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

/* ── 表单字段组 ── */
.field-group {
  margin-bottom: 12px;
}
.field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #666;
  margin-bottom: 4px;
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
  margin-top: 3px;
  padding: 3px 8px;
  background: #fafafa;
  border-radius: 4px;
  border-left: 2px solid #e0e0e6;
}

/* ── 属性行 ── */
.attr-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

/* ── 响应式 ── */
@media (max-width: 700px) {
  .field-row-3, .field-row-4 { grid-template-columns: 1fr 1fr; }
}
</style>
