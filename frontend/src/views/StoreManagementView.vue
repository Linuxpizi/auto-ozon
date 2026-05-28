<template>
  <div class="container">
    <div class="grid grid-2">
      <div class="card">
        <h2 class="section-title">店铺管理</h2>
        <StoreForm
          :editingStore="editingStore"
          @store-added="handleStoreAdded"
          @store-updated="handleStoreUpdated"
          @cancel-edit="clearEditing"
        />
      </div>
      <div class="card">
        <h2 class="section-title">店铺列表</h2>
        <StoreList :stores="stores" @edit-store="handleEdit" @delete-store="handleDelete" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useAppStore } from "../store";
import StoreForm from "../components/StoreForm.vue";
import StoreList from "../components/StoreList.vue";

const appStore = useAppStore();
const editingStore = ref<null | { id: number; name: string; client_id: string; api_key?: string; status: string }>(null);

async function refreshStores() {
  try {
    const response = await fetch("http://localhost:8000/api/stores");
    const data = await response.json();
    appStore.stores = data;
  } catch (error) {
    console.error("Failed to load stores", error);
  }
}

function handleEdit(store: { id: number; name: string; client_id: string; api_key?: string; status: string }) {
  editingStore.value = { ...store };
}

function clearEditing() {
  editingStore.value = null;
}

async function handleDelete(payload: { id: number }) {
  try {
    const response = await fetch(`http://localhost:8000/api/stores/${payload.id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("删除失败");
    await refreshStores();
  } catch (error) {
    console.error("Failed to delete store", error);
    alert("删除店铺失败，请稍后重试。");
  }
}

function handleStoreAdded() {
  refreshStores();
}

function handleStoreUpdated() {
  refreshStores();
  clearEditing();
}

onMounted(refreshStores);
</script>
