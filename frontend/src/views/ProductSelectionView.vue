<template>
  <div class="container">
    <div class="card">
      <div class="page-header">
        <n-h2 class="page-title" style="margin: 0;">选品中心</n-h2>
        <n-space>
          <n-button type="primary" size="small" @click="importJson" :loading="importing">
            导入 Ozon 数据
          </n-button>
          <n-button size="small" @click="loadProducts" :loading="loading">刷新</n-button>
        </n-space>
      </div>

      <!-- 筛选栏 -->
      <n-space style="margin-bottom: 12px;" align="center">
        <n-select
          v-model:value="filterBrand"
          :options="brandOptions"
          placeholder="品牌筛选"
          clearable
          style="width: 160px;"
          size="small"
          @update:value="loadProducts"
        />
        <n-input
          v-model:value="keyword"
          placeholder="搜索商品名称"
          clearable
          style="width: 220px;"
          size="small"
          @keyup.enter="loadProducts"
        />
        <n-input-number
          v-model:value="minPrice"
          placeholder="最低价"
          :min="0"
          style="width: 120px;"
          size="small"
          @keyup.enter="loadProducts"
        />
        <n-input-number
          v-model:value="maxPrice"
          placeholder="最高价"
          :min="0"
          style="width: 120px;"
          size="small"
          @keyup.enter="loadProducts"
        />
        <n-button size="small" @click="loadProducts">搜索</n-button>
        <n-button size="small" @click="resetFilters">重置</n-button>
      </n-space>

      <!-- 统计信息 -->
      <div style="margin-bottom: 12px; font-size: 13px; color: var(--text-secondary);">
        共 <strong>{{ totalCount }}</strong> 个商品
        <span v-if="filterBrand"> · 品牌: {{ filterBrand }}</span>
        <span v-if="keyword"> · 关键词: {{ keyword }}</span>
      </div>

      <!-- 产品卡片网格 -->
      <n-spin :show="loading">
        <div class="product-grid" v-if="products.length > 0">
          <div
            class="product-card"
            v-for="product in products"
            :key="product.id"
          >
            <div class="product-card-header">
              <n-tag :type="brandTagType(product.brand)" size="small" round>
                {{ product.brand || '未知品牌' }}
              </n-tag>
              <n-tag v-if="product.discount" type="error" size="small" round>
                {{ product.discount }}
              </n-tag>
            </div>

            <div class="product-card-title">{{ product.title }}</div>

            <div class="product-card-price">
              <span class="current-price">{{ formatPrice(product.price) }}</span>
              <span v-if="product.old_price > 0" class="old-price">{{ formatPrice(product.old_price) }}</span>
            </div>

            <div class="product-card-meta">
              <span v-if="product.rating > 0">⭐ {{ product.rating }}</span>
              <span v-if="product.review_count > 0">{{ product.review_count }} 评价</span>
              <span v-if="product.description" class="stock-info">📦 {{ product.description }}</span>
            </div>

            <!-- 属性列表 -->
            <div class="product-card-attrs" v-if="product.attributes && product.attributes.length > 0">
              <div
                class="attr-item"
                v-for="(attr, idx) in product.attributes.slice(0, 5)"
                :key="idx"
              >
                <span class="attr-name">{{ attr.name }}:</span>
                <span class="attr-value">{{ attr.value }}</span>
              </div>
            </div>

            <div class="product-card-footer">
              <n-button
                v-if="product.source_url"
                text
                type="primary"
                size="small"
                tag="a"
                :href="product.source_url"
                target="_blank"
              >
                查看 Ozon 详情 →
              </n-button>
              <n-button
                text
                type="error"
                size="small"
                @click="deleteProduct(product.id)"
              >
                删除
              </n-button>
            </div>
          </div>
        </div>

        <n-empty v-else-if="!loading" description="暂无选品数据,请先导入" />
      </n-spin>

      <!-- 分页 -->
      <div style="margin-top: 16px; display: flex; justify-content: center;" v-if="totalCount > pageSize">
        <n-pagination
          v-model:page="currentPage"
          :page-count="Math.ceil(totalCount / pageSize)"
          :page-size="pageSize"
          @update:page="onPageChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, h, onMounted } from "vue";
import {
  NH2, NSpace, NButton, NInput, NSelect, NInputNumber,
  NTag, NDataTable, NPagination, NSpin, NEmpty, NPopconfirm,
  useMessage, type DataTableColumns, type SelectOption,
} from "naive-ui";
import { apiGet, apiPost } from "../api";

// ── state ─────────────────────────────────────────────────────────
const loading = ref(false);
const importing = ref(false);
const products = ref<any[]>([]);
const totalCount = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

const filterBrand = ref<string | null>(null);
const keyword = ref("");
const minPrice = ref<number | null>(null);
const maxPrice = ref<number | null>(null);
const brandOptions = ref<SelectOption[]>([]);

const message = useMessage();

// ── helpers ───────────────────────────────────────────────────────
function formatPrice(price: number | string): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  if (!num) return "—";
  return num.toLocaleString("ru-RU") + " ₽";
}

function brandTagType(brand: string): "" | "info" | "success" | "warning" | "error" {
  const map: Record<string, "" | "info" | "success" | "warning" | "error"> = {
    Samsung: "info",
    iQOO: "success",
    Tecno: "warning",
    OPPO: "success",
    Hotwav: "error",
  };
  return map[brand] || "";
}

// ── data loading ──────────────────────────────────────────────────
async function loadProducts() {
  loading.value = true;
  try {
    const skip = (currentPage.value - 1) * pageSize.value;
    const params: Record<string, string | number | undefined> = {
      skip,
      limit: pageSize.value,
    };
    if (filterBrand.value) params.brand = filterBrand.value;
    if (keyword.value) params.keyword = keyword.value;
    if (minPrice.value !== null) params.min_price = minPrice.value;
    if (maxPrice.value !== null) params.max_price = maxPrice.value;

    products.value = await apiGet("/selection/products", params);

    // load total count
    const countParams: Record<string, string | number | undefined> = {};
    if (filterBrand.value) countParams.brand = filterBrand.value;
    if (keyword.value) countParams.keyword = keyword.value;
    if (minPrice.value !== null) countParams.min_price = minPrice.value;
    if (maxPrice.value !== null) countParams.max_price = maxPrice.value;

    const countRes = await apiGet("/selection/products/count", countParams);
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
      ...brands.map((b: any) => ({
        label: `${b.brand} (${b.count})`,
        value: b.brand,
      })),
    ];
  } catch (e) {
    // ignore
  }
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
    await apiGet(`/browser-sync/products/${id}`, undefined);
    // use DELETE via fetch
    await fetch(`http://127.0.0.1:9000/api/browser-sync/products/${id}`, { method: "DELETE" });
    message.success("已删除");
    await loadProducts();
    await loadBrands();
  } catch (e: any) {
    message.error("删除失败: " + e.message);
  }
}

function resetFilters() {
  filterBrand.value = null;
  keyword.value = "";
  minPrice.value = null;
  maxPrice.value = null;
  currentPage.value = 1;
  loadProducts();
}

function onPageChange(page: number) {
  currentPage.value = page;
  loadProducts();
}

// ── init ──────────────────────────────────────────────────────────
onMounted(() => {
  loadProducts();
  loadBrands();
});
</script>

<style scoped>
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.product-card {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 16px;
  transition: box-shadow 0.2s;
}

.product-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.product-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.product-card-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 8px;
}

.product-card-price {
  margin-bottom: 8px;
}

.current-price {
  font-size: 20px;
  font-weight: 700;
  color: #e53e3e;
}

.old-price {
  font-size: 13px;
  color: var(--text-muted, #999);
  text-decoration: line-through;
  margin-left: 8px;
}

.product-card-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary, #666);
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.stock-info {
  color: #e53e3e;
}

.product-card-attrs {
  background: var(--bg-hover, #f9fafb);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
}

.attr-item {
  font-size: 12px;
  line-height: 1.8;
  display: flex;
  gap: 4px;
}

.attr-name {
  color: var(--text-secondary, #666);
  white-space: nowrap;
}

.attr-value {
  color: var(--text-primary, #333);
  font-weight: 500;
}

.product-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 8px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}

/* Dark mode adjustments */
:root[data-theme="dark"] .product-card {
  background: var(--bg-card, #1a1a2e);
  border-color: var(--border-color, #333);
}

:root[data-theme="dark"] .product-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

:root[data-theme="dark"] .product-card-attrs {
  background: rgba(255, 255, 255, 0.05);
}
</style>
