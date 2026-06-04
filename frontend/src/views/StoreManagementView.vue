<template>
  <div class="container">
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <h2 class="section-title" style="margin: 0;">店铺管理</h2>
      <div style="display: flex; gap: 8px; align-items: center;">
        <input
          v-model="keyword"
          class="input"
          style="width: 200px;"
          placeholder="搜索名称/账号/Client ID"
          @keyup.enter="searchStores"
        />
        <button class="button-secondary" @click="searchStores">搜索</button>
        <button class="button-secondary" @click="showImport = true">导入 Excel</button>
        <button class="button-primary" @click="openAdd">添加店铺</button>
      </div>
    </div>

    <div class="card">
      <StoreList
        :stores="appStore.stores"
        @edit-store="openEdit"
        @sync-warehouse="handleSyncWarehouse"
        @accounting="handleAccounting"
        @delete-store="handleDelete"
      />
      <div v-if="appStore.storeTotal > appStore.storePageSize" style="margin-top: 16px; display: flex; justify-content: center; align-items: center; gap: 12px;">
        <button class="button-secondary" :disabled="appStore.storePage <= 1" @click="changePage(appStore.storePage - 1)">上一页</button>
        <span style="font-size: 14px; color: #475569;">第 {{ appStore.storePage }} / {{ totalPages }} 页（共 {{ appStore.storeTotal }} 条）</span>
        <button class="button-secondary" :disabled="appStore.storePage >= totalPages" @click="changePage(appStore.storePage + 1)">下一页</button>
      </div>
    </div>

    <!-- Modal -->
    <StoreForm
      :visible="formVisible"
      :editing-store="editingStore"
      @close="closeForm"
      @saved="refreshStores"
    />

    <!-- Import Dialog -->
    <div v-if="showImport" class="dialog-overlay" @click.self="showImport = false">
      <div class="dialog" style="max-width: 420px;">
        <h2 class="section-title">导入店铺 (Excel)</h2>
        <p style="font-size: 14px; color: #5e6f7c; margin-bottom: 8px;">
          选择 .xlsx 文件导入店铺数据。
        </p>
        <a
          :href="templateUrl"
          style="display: inline-block; margin-bottom: 12px; font-size: 13px; color: #2563eb; cursor: pointer;"
          download
        >下载导入模板 →</a>
        <input type="file" accept=".xlsx,.xls" @change="onFileChange" style="margin-bottom: 12px;" />
        <p v-if="importError" class="error">{{ importError }}</p>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button class="button-secondary" @click="showImport = false">取消</button>
          <button class="button-primary" :disabled="!importFile" @click="uploadImport">导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAppStore } from "../store";
import type { StoreItem } from "../store";
import StoreForm from "../components/StoreForm.vue";
import StoreList from "../components/StoreList.vue";

const appStore = useAppStore();
const keyword = ref("");
const formVisible = ref(false);
const editingStore = ref<Partial<StoreItem> | null>(null);
const showImport = ref(false);
const importFile = ref<File | null>(null);
const importError = ref("");
const templateUrl = "http://localhost:8000/api/stores/import/template";

const totalPages = computed(() => Math.max(1, Math.ceil(appStore.storeTotal / appStore.storePageSize)));

async function refreshStores() {
  await appStore.fetchStores({ keyword: keyword.value || undefined });
}

function changePage(page: number) {
  appStore.storePage = page;
  refreshStores();
}

function searchStores() {
  appStore.storePage = 1;
  refreshStores();
}

function openAdd() {
  editingStore.value = null;
  formVisible.value = true;
}

function openEdit(store: StoreItem) {
  editingStore.value = { ...store };
  formVisible.value = true;
}

function closeForm() {
  formVisible.value = false;
  editingStore.value = null;
}

async function handleSyncWarehouse(store: StoreItem) {
  alert(`同步仓库功能开发中 — ${store.name}`);
}

async function handleAccounting(store: StoreItem) {
  alert(`核算功能开发中 — ${store.name}`);
}

async function handleDelete(id: number) {
  try {
    const res = await fetch(`http://localhost:8000/api/stores/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("删除失败");
    await refreshStores();
  } catch (error) {
    console.error("Failed to delete store", error);
    alert("删除店铺失败，请稍后重试。");
  }
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  importFile.value = target.files?.[0] || null;
  importError.value = "";
}

async function uploadImport() {
  if (!importFile.value) return;
  importError.value = "";
  try {
    const formData = new FormData();
    formData.append("file", importFile.value);
    const res = await fetch("http://localhost:8000/api/stores/import", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "导入失败");
    }
    const result = await res.json();
    alert(`成功导入 ${result.count} 条店铺记录`);
    showImport.value = false;
    importFile.value = null;
    await refreshStores();
  } catch (error: any) {
    console.error(error);
    importError.value = error?.message || "导入失败，请检查文件格式";
  }
}

onMounted(refreshStores);
</script>
