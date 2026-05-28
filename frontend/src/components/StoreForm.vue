<template>
  <form class="grid" @submit.prevent="submitStore">
    <div>
      <label class="label">店铺名称</label>
      <input v-model="form.name" class="input" placeholder="请输入店铺名称" required />
      <p v-if="errors.name" class="error">{{ errors.name }}</p>
    </div>
    <div>
      <label class="label">Client ID</label>
      <input v-model="form.client_id" class="input" placeholder="请输入 Client ID" required />
      <p v-if="errors.client_id" class="error">{{ errors.client_id }}</p>
    </div>
    <div>
      <label class="label">API Key</label>
      <input v-model="form.api_key" class="input" placeholder="请输入 API Key" required />
      <p v-if="errors.api_key" class="error">{{ errors.api_key }}</p>
    </div>
    <div>
      <label class="label">状态</label>
      <select v-model="form.status" class="select" required>
        <option value="active">有效</option>
        <option value="inactive">停用</option>
      </select>
    </div>
    <div class="grid grid-2" style="grid-column: span 2; gap: 16px; align-items: end;">
      <button type="submit" class="button-primary">{{ isEditing ? '保存更改' : '添加店铺' }}</button>
      <button v-if="!isEditing" type="button" class="button-secondary" @click="resetForm">重置</button>
      <button v-else type="button" class="button-secondary" @click="cancelEdit">取消编辑</button>
    </div>
    <p v-if="submitError" class="error" style="grid-column: span 2">{{ submitError }}</p>
  </form>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import type { PropType } from "vue";

const props = defineProps<{
  editingStore?: { id: number; name: string; client_id: string; api_key: string; status: string } | null;
}>();

const emit = defineEmits<{
  "store-added": [];
  "store-updated": [{ id: number; name: string; client_id: string; api_key: string; status: string }];
  "cancel-edit": [];
}>();

const isEditing = () => !!props.editingStore;

const form = reactive({
  id: undefined as number | undefined,
  name: "",
  client_id: "",
  api_key: "",
  status: "active",
});

const errors = reactive<{ [k: string]: string | null }>({ name: null, client_id: null, api_key: null });
const submitError = reactive({ value: "" });

watch(
  () => props.editingStore,
  (val) => {
    if (val) {
      form.id = val.id;
      form.name = val.name;
      form.client_id = val.client_id;
      form.api_key = val.api_key;
      form.status = val.status || "active";
    } else {
      resetForm();
    }
  },
  { immediate: true }
);

function validate() {
  errors.name = form.name ? null : "请填写店铺名称";
  errors.client_id = form.client_id ? null : "请填写 Client ID";
  errors.api_key = form.api_key ? null : "请填写 API Key";
  return !errors.name && !errors.client_id && !errors.api_key;
}

async function submitStore() {
  submitError.value = "";
  if (!validate()) return;

  try {
    if (isEditing()) {
      const response = await fetch(`http://localhost:8000/api/stores/${form.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, client_id: form.client_id, api_key: form.api_key, status: form.status }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "更新店铺失败");
      }
      const updated = await response.json();
      emit("store-updated", updated);
    } else {
      const response = await fetch("http://localhost:8000/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, client_id: form.client_id, api_key: form.api_key, status: form.status }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "添加店铺失败");
      }
      await response.json();
      resetForm();
      emit("store-added");
    }
  } catch (error: any) {
    console.error(error);
    submitError.value = error?.message || "操作失败，请重试";
  }
}

function resetForm() {
  form.id = undefined;
  form.name = "";
  form.client_id = "";
  form.api_key = "";
  form.status = "active";
  errors.name = errors.client_id = errors.api_key = null;
  submitError.value = "";
}

function cancelEdit() {
  resetForm();
  emit("cancel-edit");
}
</script>
