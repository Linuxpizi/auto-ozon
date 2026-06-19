<template>
  <div>
    <table class="table" style="font-size: 13px;">
      <thead>
        <tr>
          <th>图片 / 货件号 / SKU</th>
          <th>订单号</th>
          <th>状态</th>
          <th>必须发货 / 商品名称</th>
          <th>运单号 / 数量 / 成交价</th>
          <th>店铺 / 账号 / 极速下单</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="order in orders" :key="order.id">
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <img v-if="order.image_url" :src="order.image_url"
                style="width: 36px; height: 36px; object-fit: cover; border-radius: 4px; flex-shrink: 0;" alt="" />
              <div style="min-width: 0;">
                <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{
                  order.shipment_number }}</div>
                <div style="font-size: 12px; color: #64748b;">{{ order.sku }}</div>
              </div>
            </div>
          </td>
          <td style="white-space: nowrap;">{{ order.order_number }}</td>
          <td>
            <n-tag :type="statusType(order.status)" size="small" round>
              {{ statusLabel(order.status) }}
            </n-tag>
          </td>
          <td>
            <div style="min-width: 0;">
              <div v-if="order.must_ship_by" style="font-size: 12px; color: #b91c1c; white-space: nowrap;">
                截止: {{ formatDate(order.must_ship_by) }}
              </div>
              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ order.product_name }}
              </div>
            </div>
          </td>
          <td>
            <div>{{ order.tracking_number || '-' }}</div>
            <div style="font-size: 12px; color: #64748b;">x{{ order.quantity }} / ¥{{ order.unit_price.toFixed(2) }}
            </div>
          </td>
          <td>
            <div>{{ order.store_name }}</div>
            <div style="font-size: 12px; color: #64748b;">{{ order.account_name }}</div>
            <div v-if="order.express_delivery" style="font-size: 12px; color: #0891b2; font-weight: 500;">极速</div>
          </td>
          <td>
            <n-space :size="4">
              <n-button text type="primary" size="small" @click="emitEdit(order)">编辑</n-button>
              <n-button text type="error" size="small" @click="emitDelete(order.id)">删除</n-button>
            </n-space>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import { NTag, NButton, NSpace } from "naive-ui";
import type { OrderItem } from "../store";

defineProps({
  orders: {
    type: Array as PropType<OrderItem[]>,
    default: () => [],
  },
});

const emit = defineEmits<{
  "edit-order": [order: OrderItem];
  "delete-order": [id: number];
}>();

const statusMap: Record<string, { label: string; type: "success" | "warning" | "error" | "info" | "default" }> = {
  awaiting_packaging: { label: "待包装", type: "warning" },
  awaiting_deliver: { label: "待发货", type: "info" },
  delivering: { label: "配送中", type: "info" },
  delivered: { label: "已送达", type: "success" },
  cancelled: { label: "已取消", type: "error" },
  cancelled_from_pending: { label: "已取消(待发货)", type: "error" },
  returned: { label: "已退货", type: "error" },
  sold: { label: "已售出", type: "success" },
};

function statusLabel(status: string) {
  return statusMap[status]?.label || status;
}
function statusType(status: string) {
  return statusMap[status]?.type || "default";
}

function formatDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function emitEdit(order: OrderItem) {
  emit("edit-order", order);
}
function emitDelete(id: number) {
  if (!confirm("确认删除该订单吗？")) return;
  emit("delete-order", id);
}
</script>
