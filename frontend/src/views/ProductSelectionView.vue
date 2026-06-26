<template>
  <div class="container">
    <div class="card">
      <div class="page-header">
        <n-h2 class="page-title" style="margin: 0">选品中心</n-h2>
        <n-space>
          <n-button type="primary" size="small" @click="importJson" :loading="importing">
            导入 Ozon 数据
          </n-button>
          <n-button size="small" @click="loadProducts" :loading="loading">刷新</n-button>
        </n-space>
      </div>

      <!-- 筛选栏 -->
      <n-space style="margin-bottom: 12px" align="center" wrap>
        <n-input v-model:value="keyword" placeholder="搜索名称 / SKU / 品类" clearable style="width: 220px" size="small" @keyup.enter="loadProducts" />
        <n-select v-model:value="filterBrand" :options="brandOptions" placeholder="品牌" clearable filterable style="width: 160px" size="small" @update:value="loadProducts" />
        <n-select v-model:value="filterPlatform" :options="[{ label: '全部平台', value: '' }, { label: 'Ozon', value: 'ozon' }, { label: 'Wildberries', value: 'wb' }]" placeholder="平台" clearable style="width: 130px" size="small" @update:value="loadProducts" />
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
        :scroll-x="1800"
        :max-height="600"
        :pagination="pagination"
        remote
        @update:page="onPageChange"
        @update:page-size="onPageSizeChange"
      />
    </div>
  </div>

  <!-- 编辑弹窗 -->
  <n-modal v-model:show="editVisible" preset="card" title="编辑商品" style="width: 640px" :bordered="false">
    <n-form label-placement="left" label-width="80" :model="editForm">
      <n-form-item label="商品名称"><n-input v-model:value="editForm.title" type="textarea" :rows="2" placeholder="商品名称" /></n-form-item>
      <n-grid :cols="2" :x-gap="12">
        <n-gi><n-form-item label="品牌"><n-input v-model:value="editForm.brand" placeholder="品牌" /></n-form-item></n-gi>
        <n-gi><n-form-item label="品类"><n-input v-model:value="editForm.category" placeholder="品类" /></n-form-item></n-gi>
      </n-grid>
      <n-grid :cols="2" :x-gap="12">
        <n-gi><n-form-item label="现价"><n-input-number v-model:value="editForm.price" :min="0" style="width: 100%" placeholder="价格" /></n-form-item></n-gi>
        <n-gi><n-form-item label="原价"><n-input-number v-model:value="editForm.old_price" :min="0" style="width: 100%" placeholder="原价" /></n-form-item></n-gi>
      </n-grid>
      <n-form-item label="商品链接"><n-input v-model:value="editForm.source_url" placeholder="来源 URL" /></n-form-item>
      <n-form-item label="描述"><n-input v-model:value="editForm.description" type="textarea" :rows="3" placeholder="商品描述" /></n-form-item>
    </n-form>
    <template #footer>
      <n-space justify="end">
        <n-button @click="editVisible = false">取消</n-button>
        <n-button type="primary" :loading="editSaving" @click="saveEdit">保存</n-button>
      </n-space>
    </template>
  </n-modal>

  <!-- 上传弹窗 -->
  <n-modal v-model:show="uploadVisible" preset="card" title="上传到店铺" style="width: 480px" :bordered="false">
    <n-alert v-if="uploadProduct" type="info" style="margin-bottom: 12px">
      <strong>{{ truncate(uploadProduct.title, 50) }}</strong>
      <span style="margin-left: 8px; color: var(--text-secondary)">ID: {{ uploadProduct.source_id }}</span>
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
  NH2, NSpace, NButton, NInput, NSelect, NInputNumber,
  NDataTable, NTag, NTooltip, NImage, NPopconfirm, NModal,
  NForm, NFormItem, NGrid, NGi, NAlert,
  useMessage, type DataTableColumns, type SelectOption,
} from "naive-ui";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";

// ── state ─────────────────────────────────────────────────────────
const loading = ref(false);
const importing = ref(false);
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

const message = useMessage();

const pagination = reactive({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  pageSizes: [10, 20, 50, 100],
  showSizePicker: true,
  prefix: ({ itemCount }: { itemCount: number }) => `共 ${itemCount} 条`,
});

// ── edit modal state ──────────────────────────────────────────────
const editVisible = ref(false);
const editSaving = ref(false);
const editProductId = ref(0);
const editForm = reactive({
  title: "",
  brand: "",
  category: "",
  price: 0,
  old_price: 0,
  description: "",
  source_url: "",
});

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

function truncate(text: string, maxLen: number): string {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

function brandTagType(brand: string): "" | "info" | "success" | "warning" | "error" {
  const map: Record<string, "" | "info" | "success" | "warning" | "error"> = {
    Samsung: "info", iQOO: "success", Tecno: "warning", OPPO: "success", Hotwav: "error",
  };
  return map[brand] || "";
}

// ── columns ───────────────────────────────────────────────────────
const columns: DataTableColumns<any> = [
  {
    title: "图片", key: "images", width: 64, fixed: "left",
    render(row) {
      const img = row.images?.length > 0 ? row.images[0] : "";
      if (!img) return h("span", { style: { color: "#ccc" } }, "—");
      return h(NImage, { src: img, width: 48, height: 48, objectFit: "cover", style: "border-radius: 4px;", lazy: true });
    },
  },
  {
    title: "ID", key: "source_id", width: 120, sorter: "default",
    render(row) {
      const url = row.source_url || "";
      if (url) return h("a", { href: url, target: "_blank", style: "color: #1890ff; font-size: 12px;" }, row.source_id);
      return h("span", { style: "font-size: 12px;" }, row.source_id);
    },
  },
  {
    title: "商品名称", key: "title", minWidth: 280, ellipsis: { tooltip: true }, sorter: "default",
    render(row) {
      const title = row.title || "";
      const url = row.source_url || "";
      const children = [h("span", { style: "font-size: 13px; font-weight: 500; line-height: 1.5;" }, truncate(title, 80))];
      if (row.brand) children.unshift(h(NTag, { size: "small", round: true, type: brandTagType(row.brand), style: "margin-right: 6px;" }, { default: () => row.brand }));
      if (url) return h("a", { href: url, target: "_blank", style: "text-decoration: none; color: inherit;" }, children);
      return h("div", children);
    },
  },
  {
    title: "平台", key: "platform", width: 70,
    render(row) {
      return h(NTag, { size: "small", type: row.platform === "ozon" ? "warning" : "info", round: true }, { default: () => row.platform === "ozon" ? "Ozon" : "WB" });
    },
  },
  {
    title: "品类", key: "category", width: 150, ellipsis: { tooltip: true }, sorter: "default",
    render(row) { return h("span", { style: "font-size: 12px; color: var(--text-secondary);" }, truncate(row.category, 40) || "—"); },
  },
  {
    title: "现价", key: "price", width: 110, sorter: (a: any, b: any) => (a.price || 0) - (b.price || 0),
    render(row) { return h("span", { style: "font-weight: 700; color: #e53e3e; font-size: 13px;" }, formatPrice(row.price)); },
  },
  {
    title: "原价", key: "old_price", width: 100, sorter: (a: any, b: any) => (a.old_price || 0) - (b.old_price || 0),
    render(row) {
      if (!row.old_price) return h("span", { style: { color: "#ccc" } }, "—");
      return h("span", { style: "text-decoration: line-through; color: #999; font-size: 12px;" }, formatPrice(row.old_price));
    },
  },
  {
    title: "折扣", key: "discount", width: 70,
    render(row) {
      const d = calcDiscount(row.price, row.old_price);
      if (!d) return h("span", { style: { color: "#ccc" } }, "—");
      return h(NTag, { size: "small", type: "error", round: true }, { default: () => d });
    },
  },
  {
    title: "评分", key: "rating", width: 80, sorter: (a: any, b: any) => (a.rating || 0) - (b.rating || 0),
    render(row) {
      const r = row.rating || 0;
      if (!r) return h("span", { style: { color: "#ccc" } }, "—");
      return h("span", { style: `color: ${r >= 4 ? "#52c41a" : r >= 3 ? "#faad14" : "#ff4d4f"}; font-weight: 600;` }, `⭐ ${r.toFixed(1)}`);
    },
  },
  {
    title: "评论数", key: "review_count", width: 80, sorter: (a: any, b: any) => (a.review_count || 0) - (b.review_count || 0),
    render(row) {
      const c = row.review_count || 0;
      if (!c) return h("span", { style: { color: "#ccc" } }, "—");
      return h("span", { style: "font-size: 12px;" }, c.toLocaleString());
    },
  },
  {
    title: "卖家", key: "seller_name", width: 120, ellipsis: { tooltip: true },
    render(row) {
      if (!row.seller_name) return h("span", { style: { color: "#ccc" } }, "—");
      if (row.seller_url) return h("a", { href: row.seller_url, target: "_blank", style: "color: #1890ff; font-size: 12px;" }, truncate(row.seller_name, 20));
      return h("span", { style: "font-size: 12px;" }, truncate(row.seller_name, 20));
    },
  },
  {
    title: "属性", key: "attributes", width: 260,
    render(row) {
      const attrs = row.attributes || [];
      if (attrs.length === 0) return h("span", { style: "color: #ccc; font-size: 12px;" }, "—");
      const shown = attrs.slice(0, 3);
      const rest = attrs.slice(3);
      const items = shown.map((a: any) => h("span", {
        style: "display: inline-block; font-size: 11px; margin: 1px 3px 1px 0; padding: 1px 5px; background: #f5f5f5; border-radius: 3px; white-space: nowrap;",
      }, `${a.name}: ${a.value}`));
      if (rest.length > 0) {
        items.push(h(NTooltip, {}, {
          trigger: () => h("span", { style: "display: inline-block; font-size: 11px; padding: 1px 5px; background: #e6f7ff; border-radius: 3px; cursor: pointer;" }, `+${rest.length}`),
          default: () => h("pre", { style: "margin: 0; white-space: pre-wrap; font-size: 12px;" }, rest.map((a: any) => `${a.name}: ${a.value}`).join("\n")),
        }));
      }
      return h("div", { style: "line-height: 1.6;" }, items);
    },
  },
  {
    title: "描述", key: "description", width: 200, ellipsis: { tooltip: true },
    render(row) {
      if (!row.description) return h("span", { style: "color: #ccc; font-size: 12px;" }, "—");
      return h(NTooltip, {}, {
        trigger: () => h("span", { style: "font-size: 12px; color: var(--text-secondary);" }, truncate(row.description, 40)),
        default: () => h("div", { style: "max-width: 400px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; font-size: 13px; line-height: 1.6;" }, row.description),
      });
    },
  },
  {
    title: "采集时间", key: "scraped_at", width: 140, sorter: "default",
    render(row) {
      if (!row.scraped_at) return h("span", { style: { color: "#ccc" } }, "—");
      const d = new Date(row.scraped_at);
      return h("span", { style: "font-size: 12px; color: var(--text-secondary);" },
        d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }));
    },
  },
  {
    title: "操作", key: "actions", width: 140, fixed: "right",
    render(row) {
      return h(NSpace, { size: 2, wrap: false }, {
        default: () => [
          h(NButton, { size: "tiny", type: "primary", text: true, onClick: () => openEdit(row) }, { default: () => "编辑" }),
          h(NButton, { size: "tiny", type: "info", text: true, onClick: () => openUpload(row) }, { default: () => "上传" }),
          h(NPopconfirm, { onPositiveClick: () => deleteProduct(row.id) }, {
            trigger: () => h(NButton, { size: "tiny", type: "error", text: true }, { default: () => "删除" }),
            default: () => "确认删除此商品?",
          }),
        ],
      });
    },
  },
];

// ── edit / upload ─────────────────────────────────────────────────
function openEdit(row: any) {
  editProductId.value = row.id;
  editForm.title = row.title || "";
  editForm.brand = row.brand || "";
  editForm.category = row.category || "";
  editForm.price = row.price || 0;
  editForm.old_price = row.old_price || 0;
  editForm.description = row.description || "";
  editForm.source_url = row.source_url || "";
  editVisible.value = true;
}

async function saveEdit() {
  editSaving.value = true;
  try {
    await apiPut(`/selection/products/${editProductId.value}`, { ...editForm });
    message.success("保存成功");
    editVisible.value = false;
    await loadProducts();
  } catch (e: any) {
    message.error("保存失败: " + e.message);
  } finally {
    editSaving.value = false;
  }
}

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
    const res = await apiPost(`/selection/products/${uploadProduct.value.id}/upload`, {
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
    const params: Record<string, string | number | undefined> = { skip, limit: pageSize.value };
    if (filterBrand.value) params.brand = filterBrand.value;
    if (filterPlatform.value) params.platform = filterPlatform.value;
    if (keyword.value) params.keyword = keyword.value;
    if (minPrice.value !== null) params.min_price = minPrice.value;
    if (maxPrice.value !== null) params.max_price = maxPrice.value;
    if (minRating.value !== null) params.min_rating = minRating.value;
    if (minReviews.value !== null) params.min_reviews = minReviews.value;
    products.value = await apiGet("/selection/products", params);

    const countParams: Record<string, string | number | undefined> = {};
    if (filterBrand.value) countParams.brand = filterBrand.value;
    if (filterPlatform.value) countParams.platform = filterPlatform.value;
    if (keyword.value) countParams.keyword = keyword.value;
    if (minPrice.value !== null) countParams.min_price = minPrice.value;
    if (maxPrice.value !== null) countParams.max_price = maxPrice.value;
    if (minRating.value !== null) countParams.min_rating = minRating.value;
    if (minReviews.value !== null) countParams.min_reviews = minReviews.value;
    const countRes = await apiGet("/selection/products/count", countParams);
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

async function importJson() {
  importing.value = true;
  try {
    const res = await apiPost("/selection/import-json");
    message.success(`导入完成: 新增 ${res.created} 条, 跳过 ${res.skipped} 条`);
    await loadProducts();
    await loadBrands();
  } catch (e: any) {
    message.error("导入失败: " + e.message);
  } finally {
    importing.value = false;
  }
}

async function deleteProduct(id: number) {
  try {
    await apiDelete(`/selection/products/${id}`);
    message.success("已删除");
    await loadProducts();
    await loadBrands();
  } catch (e: any) {
    message.error("删除失败: " + e.message);
  }
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
