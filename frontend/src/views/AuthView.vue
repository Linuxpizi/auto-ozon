<template>
  <div class="auth-page">
    <div class="auth-glow auth-glow-one"></div>
    <div class="auth-glow auth-glow-two"></div>
    <section class="auth-branding">
      <img src="/logo.png" alt="鲸智 AI" class="auth-logo" />
      <div>
        <p class="brand-kicker">OZON SELLER WORKSPACE</p>
        <h1>鲸智 AI</h1>
        <p class="brand-description">让每一次运营决策，都更智能。</p>
      </div>
    </section>

    <n-card class="auth-card" :bordered="false">
      <div class="auth-heading">
        <div>
          <p class="eyebrow">欢迎回来</p>
          <h2>{{ isRegister ? "创建你的账号" : "登录工作台" }}</h2>
        </div>
        <span class="secure-badge">🔒 安全登录</span>
      </div>

      <div class="auth-tabs" role="tablist">
        <button :class="{ active: !isRegister }" type="button" @click="switchMode(false)">登录</button>
        <button :class="{ active: isRegister }" type="button" @click="switchMode(true)">注册</button>
      </div>

      <n-alert v-if="errorMessage" type="error" :bordered="false" class="auth-alert">
        {{ errorMessage }}
      </n-alert>
      <n-alert v-if="successMessage" type="success" :bordered="false" class="auth-alert">
        {{ successMessage }}
      </n-alert>

      <n-form ref="formRef" :model="form" :rules="rules" label-placement="top" @submit.prevent="submit">
        <n-form-item label="邮箱地址" path="email">
          <n-input v-model:value="form.email" size="large" placeholder="name@example.com" autocomplete="email">
            <template #prefix>✉️</template>
          </n-input>
        </n-form-item>
        <n-form-item label="密码" path="password">
          <n-input v-model:value="form.password" size="large" type="password" show-password-on="click" placeholder="请输入 8 位以上密码" autocomplete="new-password">
            <template #prefix>🔑</template>
          </n-input>
        </n-form-item>
        <n-form-item v-if="isRegister" label="确认密码" path="confirmPassword">
          <n-input v-model:value="form.confirmPassword" size="large" type="password" show-password-on="click" placeholder="再次输入密码" autocomplete="new-password">
            <template #prefix>✓</template>
          </n-input>
        </n-form-item>
        <n-button attr-type="submit" type="primary" size="large" block :loading="submitting">
          {{ isRegister ? "创建账号" : "登录工作台" }}
        </n-button>
      </n-form>

      <p class="auth-tip">
        {{ isRegister ? "注册即表示你同意平台服务条款与隐私政策" : "首次使用？" }}
        <button v-if="!isRegister" type="button" @click="switchMode(true)">创建账号</button>
      </p>
    </n-card>
    <p class="copyright">© 2026 鲸智 AI · 专注跨境电商增长</p>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../store/auth";
import { NAlert, NButton, NCard, NForm, NFormItem, NInput, type FormInst, type FormRules } from "naive-ui";

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const formRef = ref<FormInst | null>(null);
const isRegister = ref(false);
const submitting = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const form = reactive({ email: "", password: "", confirmPassword: "" });

const rules: FormRules = {
  email: [
    { required: true, message: "请输入邮箱地址", trigger: ["blur", "input"] },
    { type: "email", message: "请输入有效的邮箱地址", trigger: ["blur", "input"] },
  ],
  password: [
    { required: true, message: "请输入密码", trigger: ["blur", "input"] },
    { min: 8, message: "密码长度不能少于 8 位", trigger: ["blur", "input"] },
  ],
  confirmPassword: [
    { required: true, message: "请确认密码", trigger: ["blur", "input"] },
    {
      validator: (_rule, value: string) => value === form.password || new Error("两次输入的密码不一致"),
      trigger: ["blur", "input"],
    },
  ],
};

function switchMode(register: boolean) {
  isRegister.value = register;
  errorMessage.value = "";
  successMessage.value = "";
  form.confirmPassword = "";
}

async function submit() {
  errorMessage.value = "";
  successMessage.value = "";
  try {
    await formRef.value?.validate();
    submitting.value = true;
    if (isRegister.value) {
      await auth.register(form.email.trim(), form.password);
      isRegister.value = false;
      form.password = "";
      form.confirmPassword = "";
      successMessage.value = "注册成功，请使用新账号登录";
    } else {
      await auth.login(form.email.trim(), form.password);
      const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/";
      await router.replace(redirect);
    }
  } catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : "操作失败，请稍后重试";
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px 24px;
  position: relative;
  overflow: hidden;
  background: var(--bg-page);
}
.auth-glow { position: absolute; border-radius: 50%; filter: blur(2px); pointer-events: none; }
.auth-glow-one { width: 520px; height: 520px; top: -260px; right: -120px; background: rgba(79, 70, 229, .12); }
.auth-glow-two { width: 380px; height: 380px; bottom: -210px; left: -110px; background: rgba(14, 165, 233, .1); }
.auth-branding { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; z-index: 1; }
.auth-logo { width: 58px; height: 58px; border-radius: 16px; box-shadow: 0 10px 24px rgba(79, 70, 229, .22); }
.brand-kicker, .eyebrow { margin: 0 0 5px; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: 1.5px; }
.auth-branding h1 { margin: 0; color: var(--text-primary); font-size: 26px; }
.brand-description { margin: 4px 0 0; color: var(--text-secondary); font-size: 13px; }
.auth-card { width: min(100%, 430px); padding: 10px 12px; background: var(--bg-card); box-shadow: var(--shadow-lg); z-index: 1; }
.auth-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 22px; }
.auth-heading h2 { margin: 0; color: var(--text-primary); font-size: 24px; }
.secure-badge { color: var(--success); background: rgba(16, 185, 129, .1); border-radius: 20px; padding: 6px 9px; font-size: 11px; white-space: nowrap; }
.auth-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; margin-bottom: 22px; background: var(--bg-card-hover); border-radius: 9px; }
.auth-tabs button { border: 0; border-radius: 7px; padding: 9px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 14px; font-weight: 600; }
.auth-tabs button.active { background: var(--bg-card); color: var(--accent); box-shadow: var(--shadow-sm); }
.auth-alert { margin-bottom: 16px; }
.auth-tip { margin: 20px 0 2px; color: var(--text-secondary); text-align: center; font-size: 12px; }
.auth-tip button { border: 0; padding: 0; background: transparent; color: var(--accent); cursor: pointer; font-weight: 600; }
.copyright { margin: 22px 0 0; color: var(--text-muted); font-size: 11px; z-index: 1; }
@media (max-width: 480px) { .auth-page { padding: 28px 16px 20px; } .auth-heading h2 { font-size: 21px; } .secure-badge { display: none; } }
</style>