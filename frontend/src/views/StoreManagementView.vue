<template>
  <div class="container">
    <div class="page-header">
      <n-h2 class="page-title" style="margin: 0;">店铺管理</n-h2>
      <div class="toolbar">
        <n-input v-model:value="keyword" placeholder="搜索名称/账号/Client ID" clearable style="width: 200px;"
          size="small" @keyup.enter="searchStores" />
        <n-button size="small" @click="searchStores">搜索</n-button>
        <n-button size="small" @click="showImport = true">导入 Excel</n-button>
        <n-button type="primary" size="small" @click="openAdd">添加店铺</n-button>
      </div>
    </div>

    <div class="card">
      <StoreList :stores="appStore.stores" @edit-store="openEdit" @delete-store="handleDelete"
      @sync-store="handleSync" />
      <div v-if="appStore.storeTotal > 0"
        class="pagination-footer">
        <n-select :value="appStore.storePageSize" :options="pageSizes" size="small" style="width: 120px;"
          @update:value="onStorePageSizeChange" />
        <n-pagination :value="appStore.storePage" :page-count="totalPages"
          :page-slot="7" @update:page="changePage" />
      </div>
    </div>

    <StoreForm :visible="formVisible" :editing-store="editingStore" @close="closeForm" @saved="refreshStores" />

    <n-modal v-model:show="showImport" preset="card" title="导入店铺 (Excel)" style="max-width: 420px;">
      <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
        选择 .xlsx 文件导入店铺数据。
      </p>
      <a :href="templateUrl"
        style="display: inline-block; margin-bottom: 12px; font-size: 13px; color: var(--accent); cursor: pointer;"
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
import { NH2, NInput, NButton, NPagination, NModal, NUpload, NSelect } from "naive-ui";
import { apiDelete, apiPost, apiUrl } from "../api";
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
const pageSizes = [
  { label: "10 条/页", value: 10 },
  { label: "20 条/页", value: 20 },
  { label: "50 条/页", value: 50 },
];

const totalPages = computed(() => Math.max(1, Math.ceil(appStore.storeTotal / appStore.storePageSize)));

async function refreshStores() {
  await appStore.fetchStores({
    skip: (appStore.storePage - 1) * appStore.storePageSize,
    limit: appStore.storePageSize,
    keyword: keyword.value || undefined,
  });
}

function changePage(page: number) {
  appStore.storePage = page;
  refreshStores();
}

function onStorePageSizeChange(size: number) {
  appStore.storePageSize = size;
  appStore.storePage = 1;
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

async function handleDelete(id: number) {
  try {
    await apiDelete(`/stores/${id}`);
    await refreshStores();
  } catch (error) {
    console.error("Failed to delete store", error);
    alert("删除店铺失败，请稍后重试。");
  }
}

async function handleSync(id: number, done: () => void) {
  try {
    await apiPost(`/stores/${id}/sync`);
    await refreshStores();
  } catch (error: any) {
    console.error("Failed to sync store", error);
    alert(error?.message || "同步失败");
  } finally {
    done();
  }
}

function onFileChange(payload: { fileList: { file: File | null }[] }) {
  const f = payload.fileList?.[0]?.file;
  if (f) {
    importFile.value = f;
    importError.value = "";
  }
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

onMounted(() => {
  appStore.storePage = 1;
  refreshStores();
});
</script>
