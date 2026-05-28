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
          <th>刊登状态</th>
          <th>自动广告</th>
          <th>自动归档</th>
          <th>自动删除</th>
          <th>备注</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="store in stores" :key="store.id">
          <td>{{ store.account_name }}</td>
          <td>{{ store.name }}</td>
          <td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis;">{{ store.client_id }}</td>
          <td style="max-width: 80px; overflow: hidden; text-overflow: ellipsis;">{{ store.api_key }}</td>
          <td>{{ store.warehouse_id }}</td>
          <td>
            <span :class="['badge', store.warehouse_status === 'active' ? 'badge-active' : 'badge-inactive']">
              {{ store.warehouse_status === 'active' ? '有效' : '停用' }}
            </span>
          </td>
          <td>
            <span :class="['badge', store.status === 'active' ? 'badge-active' : 'badge-inactive']">
              {{ store.status === 'active' ? '有效' : '停用' }}
            </span>
          </td>
          <td>{{ listingStatusLabel(store.listing_status) }}</td>
          <td>{{ store.auto_ad ? '是' : '否' }}</td>
          <td>{{ store.auto_archive ? '是' : '否' }}</td>
          <td>{{ store.auto_delete ? '是' : '否' }}</td>
          <td style="max-width: 120px; overflow: hidden; text-overflow: ellipsis;">{{ store.notes }}</td>
          <td>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              <button class="button-link" @click.prevent="emitEdit(store)">编辑</button>
              <button class="button-link" @click.prevent="emitSync(store)">同步仓库</button>
              <button class="button-link" @click.prevent="emitAccounting(store)">核算</button>
              <button class="button-link danger" @click.prevent="emitDelete(store.id)">删除</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import type { StoreItem } from "../store";

const props = defineProps({
  stores: {
    type: Array as PropType<StoreItem[]>,
    default: () => [],
  },
});

const emit = defineEmits<{
  "edit-store": [store: StoreItem];
  "sync-warehouse": [store: StoreItem];
  "accounting": [store: StoreItem];
  "delete-store": [id: number];
}>();

function listingStatusLabel(s: string) {
  const map: Record<string, string> = { active: "在售", inactive: "停售", draft: "草稿" };
  return map[s] || s || "-";
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
