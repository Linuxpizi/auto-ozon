<template>
  <div class="container">
    <div class="card">
      <h2 class="section-title">订单管理</h2>
      <OrderSummary :orders="orders" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import { useAppStore } from "../store";
import OrderSummary from "../components/OrderSummary.vue";

const appStore = useAppStore();

async function loadOrders() {
  try {
    const response = await fetch("http://localhost:8000/api/orders");
    const data = await response.json();
    appStore.orders = data;
  } catch (error) {
    console.error("Failed to load orders", error);
  }
}

onMounted(loadOrders);
</script>
