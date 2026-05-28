<template>
  <div class="container">
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <h2 class="section-title" style="margin: 0;">精铺刊登</h2>
      <div style="display: flex; gap: 8px; align-items: center;">
        <select class="select" v-model="filterStoreId" @change="loadListings" style="width: 160px;">
          <option :value="undefined">全部店铺</option>
          <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <select class="select" v-model="filterStatus" @change="loadListings" style="width: 130px;">
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="published">已刊登</option>
          <option value="archived">已归档</option>
        </select>
        <input class="input" v-model="keyword" @keyup.enter="loadListings" placeholder="搜索 SKU / 商品名称" style="width: 200px;" />
        <button class="button-secondary" @click="loadListings">搜索</button>
        <button class="button-primary" @click="openCreateDialog">+ 新建刊登</button>
      </div>
    </div>

    <div style="margin-bottom: 12px; font-size: 14px; color: #64748b;">
      共 {{ total }} 条记录
    </div>

    <div v-if="loading && !listings.length" style="text-align: center; padding: 48px; color: #64748b;">
      加载中...
    </div>

    <div v-else-if="!listings.length" style="text-align: center; padding: 48px; color: #64748b;">
      暂无刊登数据。
    </div>

    <template v-else>
      <table class="table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>商品名称</th>
            <th>价格</th>
            <th>店铺</th>
            <th>账号</th>
            <th>状态</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in listings" :key="item.id">
            <td>{{ item.sku }}</td>
            <td>{{ item.product_name }}</td>
            <td>{{ item.price.toFixed(2) }}</td>
            <td>{{ item.store_name }}</td>
            <td>{{ item.account_name }}</td>
            <td>
              <span class="badge" :class="statusBadgeClass(item.status)">{{ statusLabel(item.status) }}</span>
            </td>
            <td>{{ formatDate(item.updated_at) }}</td>
            <td>
              <button class="button-link" @click="openEditDialog(item)">编辑</button>
              <button class="button-link" style="color: #ef4444;" @click="handleDelete(item)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="pagination" v-if="totalPages > 1">
        <button class="button-secondary" :disabled="page <= 1" @click="page--; loadListings()">上一页</button>
        <span>{{ page }} / {{ totalPages }}</span>
        <button class="button-secondary" :disabled="page >= totalPages" @click="page++; loadListings()">下一页</button>
      </div>
    </template>

    <!-- Create / Edit Dialog -->
    <div class="dialog-overlay" v-if="dialogVisible" @click.self="closeDialog">
      <div class="dialog">
        <h3 style="margin: 0 0 16px;">{{ editingItem ? '编辑刊登' : '新建刊登' }}</h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label class="label">所属店铺</label>
            <select class="select" v-model="form.store_id">
              <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }} ({{ s.account_name }})</option>
            </select>
          </div>
          <div>
            <label class="label">SKU</label>
            <input class="input" v-model="form.sku" placeholder="输入 SKU" />
          </div>
          <div>
            <label class="label">商品名称</label>
            <input class="input" v-model="form.product_name" placeholder="输入商品名称" />
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label class="label">价格</label>
              <input class="input" type="number" step="0.01" v-model="form.price" />
            </div>
            <div>
              <label class="label">状态</label>
              <select class="select" v-model="form.status">
                <option value="draft">草稿</option>
                <option value="published">已刊登</option>
                <option value="archived">已归档</option>
              </select>
            </div>
          </div>
          <div>
            <label class="label">图片 URL</label>
            <input class="input" v-model="form.image_url" placeholder="输入图片链接" />
          </div>
          <div v-if="errorMsg" style="color: #ef4444; font-size: 13px;">{{ errorMsg }}</div>
          <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;">
            <button class="button-secondary" @click="closeDialog">取消</button>
            <button class="button-primary" :disabled="saving" @click="handleSave">{{ saving ? '保存中...' : '保存' }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from "vue";

interface StoreItem {
  id: number;
  account_name: string;
  name: string;
}

interface ListingItem {
  id: number;
  store_id: number;
  store_name: string;
  account_name: string;
  sku: string;
  product_name: string;
  price: number;
  status: string;
  image_url: string;
  updated_at: string;
}

const listings = ref<ListingItem[]>([]);
const stores = ref<StoreItem[]>([]);
const loading = ref(false);
const saving = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const keyword = ref("");
const filterStoreId = ref<number | undefined>(undefined);
const filterStatus = ref("");
const errorMsg = ref("");

const dialogVisible = ref(false);
const editingItem = ref<ListingItem | null>(null);

const defaultForm = { store_id: 0, sku: "", product_name: "", price: 0, status: "draft", image_url: "" };
const form = ref({ ...defaultForm });

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));

function statusLabel(s: string) {
  const map: Record<string, string> = { draft: "草稿", published: "已刊登", archived: "已归档" };
  return map[s] || s;
}
function statusBadgeClass(s: string) {
  const map: Record<string, string> = { draft: "badge-warning", published: "badge-success", archived: "badge-secondary" };
  return map[s] || "";
}
function formatDate(d: string) {
  return d ? d.slice(0, 16).replace("T", " ") : "";
}

async function fetchStores() {
  try {
    const res = await fetch("http://localhost:8000/api/stores/");
    if (res.ok) stores.value = await res.json();
  } catch {}
}

async function loadListings() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    params.set("skip", ((page.value - 1) * pageSize).toString());
    params.set("limit", pageSize.toString());
    if (filterStoreId.value) params.set("store_id", String(filterStoreId.value));
    if (filterStatus.value) params.set("status", filterStatus.value);
    if (keyword.value.trim()) params.set("keyword", keyword.value.trim());

    const [listRes, countRes] = await Promise.all([
      fetch(`http://localhost:8000/api/listings/?${params}`),
      fetch(`http://localhost:8000/api/listings/count?${params}`),
    ]);
    if (listRes.ok) listings.value = await listRes.json();
    if (countRes.ok) total.value = (await countRes.json()).total;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function openCreateDialog() {
  editingItem.value = null;
  form.value = { ...defaultForm, store_id: stores.value[0]?.id || 0 };
  errorMsg.value = "";
  dialogVisible.value = true;
}

function openEditDialog(item: ListingItem) {
  editingItem.value = item;
  form.value = {
    store_id: item.store_id,
    sku: item.sku,
    product_name: item.product_name,
    price: item.price,
    status: item.status,
    image_url: item.image_url,
  };
  errorMsg.value = "";
  dialogVisible.value = true;
}

function closeDialog() {
  dialogVisible.value = false;
  editingItem.value = null;
}

async function handleSave() {
  errorMsg.value = "";
  if (!form.value.store_id) { errorMsg.value = "请选择所属店铺"; return; }
  if (!form.value.sku.trim()) { errorMsg.value = "请输入 SKU"; return; }
  if (!form.value.product_name.trim()) { errorMsg.value = "请输入商品名称"; return; }

  saving.value = true;
  try {
    const method = editingItem.value ? "PUT" : "POST";
    const url = editingItem.value
      ? `http://localhost:8000/api/listings/${editingItem.value.id}`
      : "http://localhost:8000/api/listings/";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form.value),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "操作失败");
    }
    closeDialog();
    await loadListings();
  } catch (e: any) {
    errorMsg.value = e.message || "保存失败";
  } finally {
    saving.value = false;
  }
}

async function handleDelete(item: ListingItem) {
  if (!confirm(`确定删除刊登 "${item.product_name}"？`)) return;
  try {
    const res = await fetch(`http://localhost:8000/api/listings/${item.id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("删除失败");
    await loadListings();
  } catch (e) {
    console.error(e);
    alert("删除失败");
  }
}

onMounted(async () => {
  await fetchStores();
  await loadListings();
});
</script>
