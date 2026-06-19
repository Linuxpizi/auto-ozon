<template>
  <div>
    <table class="table" style="font-size: 13px;">
      <thead>
        <tr>
          <th>所属账号</th>
          <th>店铺名称</th>
          <th>Client ID</th>
          <th>API Key</th>
          <th>仓库 ID</th>
          <th>仓库状态</th>
          <th>状态</th>
          <th>备注</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="store in stores" :key="store.id">
          <td>{{ store.account_name }}</td>
          <td>{{ store.name }}</td>
          <td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis;">{{ store.client_id }}</td>
          <td>
            <n-tooltip trigger="hover">
              <template #trigger>
                <span style="font-family: monospace; letter-spacing: 1px;">{{ maskKey(store.api_key) }}</span>
              </template>
              点击查看完整 Key 时需通过编辑弹窗
            </n-tooltip>
          </td>
          <td>{{ store.warehouse_id }}</td>
          <td>
            <n-tag :type="store.warehouse_status === 'active' ? 'success' : 'default'" size="small" round>
              {{ store.warehouse_status === 'active' ? '有效' : '停用' }}
            </n-tag>
          </td>
          <td>
            <n-tag :type="store.status === 'active' ? 'success' : 'default'" size="small" round>
              {{ store.status === 'active' ? '有效' : '停用' }}
            </n-tag>
          </td>
          <td style="max-width: 120px; overflow: hidden; text-overflow: ellipsis;">{{ store.notes }}</td>
          <td>
            <n-space :size="4">
              <n-button text type="primary" size="small" @click="emitEdit(store)">编辑</n-button>
              <n-button text type="primary" size="small" @click="emitSync(store)">同步仓库</n-button>
              <n-button text type="primary" size="small" @click="emitAccounting(store)">核算</n-button>
              <n-button text type="error" size="small" @click="emitDelete(store.id)">删除</n-button>
            </n-space>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import { NTag, NTooltip, NButton, NSpace } from "naive-ui";
import type { StoreItem } from "../store";

defineProps({
  stores: {
    type: Array as PropType<StoreItem[]>,
    default: () => [],
  },
});

const emit = defineEmits<{
  "edit-store": [store: StoreItem];
  "sync-warehouse": [store: StoreItem];
  accounting: [store: StoreItem];
  "delete-store": [id: number];
}>();

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "*".repeat(key.length);
  return key.slice(0, 4) + "****" + key.slice(-4);
}

function emitEdit(store: StoreItem) {
  emit("edit-store", store);
}
function emitSync(store: StoreItem) {
  emit("sync-warehouse", store);
}
function emitAccounting(store: StoreItem) {
  emit("accounting", store);
}
function emitDelete(id: number) {
  if (!confirm("确认删除该店铺吗？此操作不可恢复。")) return;
  emit("delete-store", id);
}
</script>
