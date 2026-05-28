<template>
  <div>
    <table class="table">
      <thead>
        <tr>
          <th>店铺名称</th>
          <th>Client ID</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="store in stores" :key="store.id">
          <td>{{ store.name }}</td>
          <td>{{ store.client_id }}</td>
          <td>{{ store.status }}</td>
          <td>
            <button class="button-link" @click.prevent="() => emitEdit(store)">编辑</button>
            <button class="button-link danger" @click.prevent="() => emitDelete(store.id)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { PropType } from "vue";

const props = defineProps({
  stores: {
    type: Array as PropType<Array<{ id: number; name: string; client_id: string; status: string; api_key?: string }>>,
    default: () => [],
  },
});

const emit = defineEmits<{
  "edit-store": [{ id: number; name: string; client_id: string; api_key?: string; status: string }];
  "delete-store": [{ id: number }];
}>();

function emitEdit(store: { id: number; name: string; client_id: string; api_key?: string; status: string }) {
  emit("edit-store", store);
}

function emitDelete(id: number) {
  if (!confirm("确认删除该店铺吗？此操作不可恢复。")) return;
  emit("delete-store", { id });
}
</script>
