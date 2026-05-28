<template>
  <div>
    <table class="table">
      <thead>
        <tr>
          <th>订单编号</th>
          <th>店铺ID</th>
          <th>是否质检单</th>
          <th>GMV</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="order in orders" :key="order.id">
          <td>{{ order.order_number }}</td>
          <td>{{ order.store_id }}</td>
          <td>{{ order.is_quality_check ? "是" : "否" }}</td>
          <td>¥ {{ order.gmv.toFixed(2) }}</td>
          <td>{{ order.status }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { PropType } from "vue";

defineProps({
  orders: {
    type: Array as PropType<Array<{ id: number; order_number: string; store_id: number; is_quality_check: boolean; gmv: number; status: string }>>,
    default: () => [],
  },
});
</script>
