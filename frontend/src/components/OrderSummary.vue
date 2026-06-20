<template>
  <div>
    <!-- 图片放大浮层 -->
    <teleport to="body">
      <div v-if="zoomImage" style="position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; cursor: zoom-out;" @click="zoomImage = ''">
        <img :src="zoomImage" style="max-width: 90vw; max-height: 90vh; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.5);" />
      </div>
    </teleport>
    <table class="table" style="font-size: 13px;">
      <thead>
        <tr>
          <th>图片 / 货件号 / SKU</th>
          <th>订单号</th>
          <th>状态</th>
          <th>必须发货 / 商品名称</th>
          <th>运单号 / 数量 / 成交价</th>
          <th>店铺</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="order in orders" :key="order.id">
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <img v-if="order.image_url" :src="order.image_url"
                style="width: 36px; height: 36px; object-fit: cover; border-radius: 4px; flex-shrink: 0; cursor: zoom-in;" alt="" @click.stop="zoomImage = order.image_url" />
              <div style="min-width: 0;">
                <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{
                  order.shipment_number }}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">{{ order.offer_id || order.sku }}</div>
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
              <div v-if="order.must_ship_by" style="font-size: 12px; color: var(--danger); white-space: nowrap;">
                截止: {{ formatDate(order.must_ship_by) }}
              </div>
              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ order.product_name }}
              </div>
            </div>
          </td>
          <td>
            <div>{{ order.tracking_number || '-' }}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">x{{ order.quantity }} / ¥{{ displayPrice(order).toFixed(2) }}</div>
          </td>
          <td>
            <div>{{ order.store_name }}</div>
            <div v-if="order.express_delivery" style="font-size: 12px; color: var(--accent); font-weight: 500;">极速</div>
          </td>
          <td>
            <n-space :size="6">
              <n-button v-if="hasAction(order, 'ship')" type="warning" size="small"
                @click="emitShip(order)">备货</n-button>
              <n-button v-else-if="hasAction(order, 'cancel')" type="error" size="small" @click="emitCancel(order)">取消</n-button>
            </n-space>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { PropType } from "vue";
import { NTag, NButton, NSpace } from "naive-ui";
import type { OrderItem } from "../store";

const zoomImage = ref("");

defineProps({
  orders: {
    type: Array as PropType<OrderItem[]>,
    default: () => [],
  },
});

const emit = defineEmits<{
  "edit-order": [order: OrderItem];
  "delete-order": [id: number];
  "ship-order": [order: OrderItem];
  "cancel-order": [order: OrderItem];
}>();

const statusMap: Record<string, { label: string; type: "success" | "warning" | "error" | "info" | "default" }> = {
  awaiting_registration: { label: "等待登记", type: "default" },
  acceptance_in_progress: { label: "接收中", type: "info" },
  awaiting_approve: { label: "等待确认", type: "default" },
  awaiting_packaging: { label: "待包装", type: "warning" },
  awaiting_deliver: { label: "待发货", type: "info" },
  arbitration: { label: "仲裁", type: "error" },
  client_arbitration: { label: "客户配送仲裁", type: "error" },
  delivering: { label: "配送中", type: "info" },
  driver_pickup: { label: "司机正在送货", type: "info" },
  cancelled: { label: "已取消", type: "error" },
  not_accepted: { label: "未接收", type: "error" },
};

function statusLabel(status: string) {
  return statusMap[status]?.label || status;
}
function statusType(status: string) {
  return statusMap[status]?.type || "default";
}

function hasAction(order: OrderItem, action: string): boolean {
  if (action === "ship") {
    return order.status === "awaiting_packaging";
  }
  try {
    const actions = JSON.parse(order.available_actions || "[]");
    return Array.isArray(actions) && actions.includes(action);
  } catch {
    return false;
  }
}

function displayPrice(order: OrderItem): number {
  if (order.customer_price > 0) return order.customer_price;
  return order.unit_price * order.quantity;
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
function emitShip(order: OrderItem) {
  emit("ship-order", order);
}
function emitCancel(order: OrderItem) {
  emit("cancel-order", order);
}
</script>
