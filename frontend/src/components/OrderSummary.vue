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
              <img
                v-if="order.image_url"
                :src="order.image_url"
                style="width: 36px; height: 36px; object-fit: cover; border-radius: 4px; flex-shrink: 0;"
                alt=""
              />
              <div style="min-width: 0;">
                <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ order.shipment_number }}</div>
                <div style="font-size: 12px; color: #64748b;">{{ order.sku }}</div>
              </div>
            </div>
          </td>
          <td style="white-space: nowrap;">{{ order.order_number }}</td>
          <td>
            <span :class="['badge', statusBadge(order.status)]">
              {{ statusLabel(order.status) }}
            </span>
          </td>
          <td>
            <div style="min-width: 0;">
              <div v-if="order.must_ship_by" style="font-size: 12px; color: #b91c1c; white-space: nowrap;">
                截止: {{ formatDate(order.must_ship_by) }}
              </div>
              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ order.product_name }}</div>
            </div>
          </td>
          <td>
            <div>{{ order.tracking_number || '-' }}</div>
            <div style="font-size: 12px; color: #64748b;">x{{ order.quantity }} / ¥{{ order.unit_price.toFixed(2) }}</div>
          </td>
          <td>
            <div>{{ order.store_name }}</div>
            <div style="font-size: 12px; color: #64748b;">{{ order.account_name }}</div>
            <div v-if="order.express_delivery" style="font-size: 12px; color: #0891b2; font-weight: 500;">极速</div>
          </td>
          <td>
            <div style="display: flex; gap: 4px;">
              <button class="button-link" @click.prevent="emitEdit(order)">编辑</button>
              <button class="button-link danger" @click.prevent="emitDelete(order.id)">删除</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from "vue";
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

const statusMap: Record<string, { label: string; badge: string }> = {
  accepted: { label: "已接单", badge: "badge-active" },
  processing: { label: "处理中", badge: "badge-active" },
  shipped: { label: "已发货", badge: "" },
  delivered: { label: "已送达", badge: "" },
  cancelled: { label: "已取消", badge: "badge-inactive" },
};

function statusLabel(status: string) {
  return statusMap[status]?.label || status;
}
function statusBadge(status: string) {
  return statusMap[status]?.badge || "badge-inactive";
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
