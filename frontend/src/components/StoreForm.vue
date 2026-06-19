<template>
  <n-modal :show="visible" preset="card" :title="editingStore ? '编辑店铺' : '添加店铺'" :style="{ maxWidth: '640px' }"
    @update:show="(v) => !v && close()">
    <n-form label-placement="top" :model="form">
      <n-grid :cols="2" :x-gap="16">
        <n-gi>
          <n-form-item label="所属账号">
            <n-input v-model:value="form.account_name" placeholder="请输入所属账号" />
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="店铺名称" :validation-status="errors.name ? 'error' : undefined"
            :feedback="errors.name || undefined">
            <n-input v-model:value="form.name" placeholder="请输入店铺名称" />
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="Client ID" :validation-status="errors.client_id ? 'error' : undefined"
            :feedback="errors.client_id || undefined">
            <n-input v-model:value="form.client_id" placeholder="请输入 Client ID" />
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="API Key" :validation-status="errors.api_key ? 'error' : undefined"
            :feedback="errors.api_key || undefined">
            <n-input v-model:value="form.api_key" :type="showApiKey ? 'text' : 'password'" placeholder="请输入 API Key">
              <template #suffix>
                <n-button text size="small" @click="showApiKey = !showApiKey">
                  {{ showApiKey ? '🙈' : '👁' }}
                </n-button>
              </template>
            </n-input>
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="仓库 ID">
            <n-input v-model:value="form.warehouse_id" placeholder="请输入仓库 ID" />
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="仓库状态">
            <n-select v-model:value="form.warehouse_status" :options="[
              { label: '请选择', value: '' },
              { label: '有效', value: 'active' },
              { label: '停用', value: 'inactive' },
            ]" placeholder="请选择" />
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="类型 ID">
            <n-input v-model:value="form.type_id" placeholder="请输入类型 ID" />
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="状态">
            <n-select v-model:value="form.status" :options="[
              { label: '有效', value: 'active' },
              { label: '停用', value: 'inactive' },
            ]" />
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="合同货币">
            <n-input v-model:value="form.contract_currency" placeholder="例如 USD" />
          </n-form-item>
        </n-gi>
        <n-gi>
          <n-form-item label="备注">
            <n-input v-model:value="form.notes" placeholder="备注信息" />
          </n-form-item>
        </n-gi>
      </n-grid>
      <p v-if="submitError" class="error">{{ submitError }}</p>
    </n-form>
    <template #footer>
      <div style="display: flex; gap: 12px; justify-content: flex-end;">
        <n-button @click="close">取消</n-button>
        <n-button type="primary" :loading="submitting" @click="submitStore">
          {{ editingStore ? '保存更改' : '添加店铺' }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { NModal, NForm, NFormItem, NInput, NSelect, NButton, NGrid, NGi } from "naive-ui";
import { apiPost, apiPut } from "../api";
import type { StoreItem } from "../store";

const props = defineProps<{
  visible: boolean;
  editingStore?: Partial<StoreItem> | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const showApiKey = ref(false);
const submitting = ref(false);

const form = reactive({
  account_name: "",
  name: "",
  client_id: "",
  api_key: "",
  warehouse_id: "",
  warehouse_status: "",
  type_id: "",
  status: "active",
  contract_currency: "",
  notes: "",
});

const errors = reactive<Record<string, string | null>>({ name: null, client_id: null, api_key: null });
const submitError = ref("");

watch(
  () => props.editingStore,
  (val) => {
    if (val) {
      Object.assign(form, {
        account_name: val.account_name || "",
        name: val.name || "",
        client_id: val.client_id || "",
        api_key: val.api_key || "",
        warehouse_id: val.warehouse_id || "",
        warehouse_status: val.warehouse_status || "",
        type_id: val.type_id || "",
        status: val.status || "active",
        contract_currency: val.contract_currency || "",
        notes: val.notes || "",
      });
    } else {
      resetForm();
    }
    showApiKey.value = false;
  },
  { immediate: true }
);

function resetForm() {
  form.account_name = "";
  form.name = "";
  form.client_id = "";
  form.api_key = "";
  form.warehouse_id = "";
  form.warehouse_status = "";
  form.type_id = "";
  form.status = "active";
  form.contract_currency = "";
  form.notes = "";
  errors.name = errors.client_id = errors.api_key = null;
  submitError.value = "";
}

function close() {
  resetForm();
  emit("close");
}

function validate() {
  errors.name = form.name ? null : "请填写店铺名称";
  errors.client_id = form.client_id ? null : "请填写 Client ID";
  errors.api_key = form.api_key ? null : "请填写 API Key";
  return !errors.name && !errors.client_id && !errors.api_key;
}

async function submitStore() {
  submitError.value = "";
  if (!validate()) return;
  submitting.value = true;

  const body: Record<string, any> = {
    account_name: form.account_name,
    name: form.name,
    client_id: form.client_id,
    api_key: form.api_key,
    warehouse_id: form.warehouse_id,
    warehouse_status: form.warehouse_status,
    type_id: form.type_id,
    status: form.status,
    contract_currency: form.contract_currency,
    notes: form.notes,
  };

  try {
    if (props.editingStore?.id) {
      await apiPut(`/stores/${props.editingStore.id}`, body);
    } else {
      await apiPost("/stores/", body);
    }
    emit("saved");
    close();
  } catch (error: any) {
    console.error(error);
    submitError.value = error?.message || "操作失败，请重试";
  } finally {
    submitting.value = false;
  }
}
</script>
