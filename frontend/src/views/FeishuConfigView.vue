<template>
  <div class="container">
    <div class="page-header">
      <n-h2 class="page-title" style="margin: 0;">飞书通知配置</n-h2>
    </div>

    <n-card title="全局飞书配置" style="margin-top: 16px; max-width: 640px;">
      <n-form label-placement="left" label-width="100" :model="form">
        <n-form-item label="启用通知">
          <n-switch v-model:value="form.enabled" :checked-value="1" :unchecked-value="0" />
        </n-form-item>
        <n-form-item label="App ID">
          <n-input v-model:value="form.app_id" placeholder="飞书应用 App ID" clearable />
        </n-form-item>
        <n-form-item label="App Secret">
          <n-input v-model:value="form.app_secret" type="password" show-password-on="click"
            placeholder="飞书应用 App Secret" clearable />
        </n-form-item>
        <n-form-item label="Chat ID">
          <n-input v-model:value="form.chat_id" placeholder="群聊 Chat ID (oc_xxxx)" clearable />
        </n-form-item>
        <n-form-item label="Webhook URL">
          <n-input v-model:value="form.webhook_url" placeholder="自定义机器人 Webhook 地址（可选）" clearable />
        </n-form-item>
      </n-form>

      <template #footer>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <n-button size="small" :loading="testing" @click="testNotification">测试通知</n-button>
          <n-button type="primary" size="small" :loading="saving" @click="saveConfig">保存配置</n-button>
        </div>
      </template>
    </n-card>

    <n-card title="使用说明" style="margin-top: 16px; max-width: 640px;">
      <n-space vertical size="small">
        <n-text>1. 在飞书开放平台创建自建应用，获取 App ID 和 App Secret</n-text>
        <n-text>2. 将应用添加到目标群聊，获取群聊的 Chat ID（oc_xxxx）</n-text>
        <n-text>3. 或者使用自定义机器人 Webhook 地址（不需要 App ID / Secret）</n-text>
        <n-text>4. 保存配置后，系统将自动监控退货订单并推送飞书通知</n-text>
        <n-text depth="3">提示：如使用 App 消息方式，需在飞书开放平台开启 im:message 权限</n-text>
      </n-space>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { NCard, NH2, NForm, NFormItem, NInput, NSwitch, NButton, NSpace, NText, useMessage } from "naive-ui";
import { apiGet, apiPut, apiPost } from "../api";

const message = useMessage();

const form = ref({
  id: 0,
  app_id: "",
  app_secret: "",
  chat_id: "",
  webhook_url: "",
  enabled: 0 as number,
});

const saving = ref(false);
const testing = ref(false);

async function loadConfig() {
  try {
    const data = await apiGet("/feishu/config");
    if (data) {
      form.value = {
        id: data.id || 0,
        app_id: data.app_id || "",
        app_secret: data.app_secret || "",
        chat_id: data.chat_id || "",
        webhook_url: data.webhook_url || "",
        enabled: data.enabled ?? 0,
      };
    }
  } catch (err: any) {
    console.error("Failed to load feishu config:", err);
  }
}

async function saveConfig() {
  saving.value = true;
  try {
    await apiPut("/feishu/config", form.value);
    message.success("飞书配置已保存");
  } catch (err: any) {
    message.error("保存失败: " + (err.message || "未知错误"));
  } finally {
    saving.value = false;
  }
}

async function testNotification() {
  testing.value = true;
  try {
    const data = await apiPost("/feishu/test");
    message.success(data?.message || "测试通知发送成功");
  } catch (err: any) {
    message.error("测试失败: " + (err.message || "未知错误"));
  } finally {
    testing.value = false;
  }
}

onMounted(loadConfig);
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px 32px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}
</style>
