<template>
  <div class="grid grid-3">
    <div class="summary-item">
      <h4>总订单</h4>
      <p>{{ summary.total_orders }}</p>
    </div>
    <div class="summary-item">
      <h4>质检单数量</h4>
      <p>{{ summary.quality_check_orders }}</p>
    </div>
    <div class="summary-item">
      <h4>真实订单数量</h4>
      <p>{{ summary.real_orders }}</p>
    </div>
    <div class="summary-item">
      <h4>总 GMV</h4>
      <p>¥ {{ summary.total_gmv.toFixed(2) }}</p>
    </div>
    <div class="summary-item">
      <h4>质检单 GMV</h4>
      <p>¥ {{ summary.quality_check_gmv.toFixed(2) }}</p>
    </div>
    <div class="summary-item">
      <h4>真实 GMV</h4>
      <p>¥ {{ summary.real_gmv.toFixed(2) }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PropType } from "vue";

defineProps({
  summary: {
    type: Object as PropType<{
      total_orders: number;
      quality_check_orders: number;
      real_orders: number;
      total_gmv: number;
      quality_check_gmv: number;
      real_gmv: number;
    }>,
    required: true,
  },
});
</script>
