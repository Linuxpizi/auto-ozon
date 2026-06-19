<template>
  <div class="container">
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <n-h2 prefix="bar" style="margin: 0;">店铺管理</n-h2>
      <div style="display: flex; gap: 8px; align-items: center;">
        <n-input v-model:value="keyword" placeholder="搜索名称/账号/Client ID" clearable style="width: 200px;"
          @keyup.enter="searchStores" />
        <n-button @click="searchStores">搜索</n-button>
        <n-button @click="showImport = true">导入 Excel</n-button>
        <n-button type="primary" @click="openAdd">添加店铺</n-button>
      </div>
    </div>

    <div class="card">
      <StoreList :stores="appStore.stores" @edit-store="openEdit" @sync-warehouse="handleSyncWarehouse"
        @accounting="handleAccounting" @delete-store="handleDelete" />
      <div v-if="appStore.storeTotal > appStore.storePageSize"
        style="margin-top: 16px; display: flex; justify-content: center;">
        <n-pagination v-model:page="appStore.storePage" :page-count="totalPages" @update:page="changePage" />
      </div>
    </div>

    <StoreForm :visible="formVisible" :editing-store="editingStore" @close="closeForm" @saved="refreshStores" />

    <n-modal v-model:show="showImport" preset="card" title="导入店铺 (Excel)" style="max-width: 420px;">
      <p style="font-size: 14px; color: #5e6f7c; margin-bottom: 8px;">
        选择 .xlsx 文件导入店铺数据。
      </p>
      <a :href="templateUrl"
        style="display: inline-block; margin-bottom: 12px; font-size: 13px; color: #2563eb; cursor: pointer;"
        download>下载导入模板 →</a>
      <n-upload :max="1" accept=".xlsx,.xls" @change="onFileChange">
        <n-button>选择文件</n-button>
      </n-upload>
      <p v-if="importError" class="error" style="margin-top: 8px;">{{ importError }}</p>
      <template #footer>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <n-button @click="showImport = false">取消</n-button>
          <n-button type="primary" :disabled="!importFile" :loading="importing" @click="uploadImport">导入</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { NH2, NInput, NButton, NPagination, NModal, NUpload } from "naive-ui";
import { apiDelete, apiUrl } from "../api";
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
const importing = ref(false);
const templateUrl = apiUrl("/stores/import/template");

const totalPages = computed(() => Math.max(1, Math.ceil(appStore.storeTotal / appStore.storePageSize)));

async function refreshStores() {
  await appStore.fetchStores({ keyword: keyword.value || undefined });
}

function changePage(page: number) {
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
    await apiDelete(`/stores/${id}`);
    await refreshStores();
  } catch (error) {
    console.error("Failed to delete store", error);
    alert("删除店铺失败，请稍后重试。");
  }
}

function onFileChange(payload: { file: { file: File } }) {
  importFile.value = payload.file.file;
  importError.value = "";
}

async function uploadImport() {
  if (!importFile.value) return;
  importError.value = "";
  importing.value = true;
  try {
    const formData = new FormData();
    formData.append("file", importFile.value);
    const res = await fetch(`${apiUrl("/stores/import")}`, { method: "POST", body: formData });
    const result = await res.json();
    if (!res.ok) throw new Error(result.detail || "导入失败");
    alert(`成功导入 ${result.count} 条店铺记录`);
    showImport.value = false;
    importFile.value = null;
    await refreshStores();
  } catch (error: any) {
    console.error(error);
    importError.value = error?.message || "导入失败，请检查文件格式";
  } finally {
    importing.value = false;
  }
}
</script>
