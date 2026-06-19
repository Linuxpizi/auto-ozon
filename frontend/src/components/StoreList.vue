<template>
  <div>
    <table class="table" style="font-size: 13px;">
      <thead>
        <tr>
          <th>店铺名称</th>
          <th>Client ID</th>
          <th>API Key</th>
          <th>卖家评级</th>
          <th>仓库 ID</th>
          <th>仓库状态</th>
          <th>状态</th>
          <th>备注</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="store in stores" :key="store.id">
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
          <td>
            <n-popover trigger="click" v-if="parseRating(store.seller_rating)">
              <template #trigger>
                <n-button text type="info" size="small" style="font-weight: 600; font-size: 15px;">
                  {{ parseRating(store.seller_rating)?.index }}
                </n-button>
              </template>
              <div style="min-width: 200px;">
                <div style="margin-bottom: 6px;"><b>评级指数：</b>{{ parseRating(store.seller_rating)?.index }}</div>
                <div style="margin-bottom: 6px;"><b>币种：</b>{{ parseRating(store.seller_rating)?.currency_code }}</div>
                <div style="margin-bottom: 6px;"><b>周期：</b>{{ parseRating(store.seller_rating)?.period_from }} ~ {{ parseRating(store.seller_rating)?.period_to }}</div>
                <div style="margin-bottom: 6px;"><b>处理费用：</b>{{ parseRating(store.seller_rating)?.processing_costs_sum }}</div>
                <div v-if="parseRating(store.seller_rating)?.defects?.length">
                  <b>缺陷记录：</b>
                  <div v-for="(d, i) in parseRating(store.seller_rating)?.defects" :key="i" style="padding-left: 8px; margin-top: 2px;">
                    {{ d.date }} — 指数: {{ d.index_by_date }}，费用: {{ d.processing_costs_sum_by_date }}
                  </div>
                </div>
              </div>
            </n-popover>
            <span v-else style="color: var(--text-muted);">--</span>
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
import { NTag, NTooltip, NButton, NSpace, NPopover } from "naive-ui";
import type { StoreItem } from "../store";

defineProps({
  stores: {
    type: Array as PropType<StoreItem[]>,
    default: () => [],
  },
});

const emit = defineEmits<{
  "edit-store": [store: StoreItem];
  "delete-store": [id: number];
}>();

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "*".repeat(key.length);
  return key.slice(0, 4) + "****" + key.slice(-4);
}

function parseRating(raw: string | null | undefined): Record<string, any> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function emitEdit(store: StoreItem) {
  emit("edit-store", store);
}
function emitDelete(id: number) {
  if (!confirm("确认删除该店铺吗？此操作不可恢复。")) return;
  emit("delete-store", id);
}
</script>
