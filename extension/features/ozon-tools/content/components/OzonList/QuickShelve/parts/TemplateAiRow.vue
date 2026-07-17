<template>
  <div class="mjgd_tpl_edit_ai_row">
    <!-- AI 改图：勾选=启用 → flags.aiImage=false（旧版反向，aiImage 为 true 表示不改） -->
    <section class="mjgd_tpl_edit_ai_card" data-ai="image">
      <header class="mjgd_tpl_edit_ai_head">
        <span class="mjgd_tpl_edit_ai_title">AI改图</span>
        <span class="mjgd_tpl_edit_tip_icon mjgd_tpl_edit_tip_icon--rich">
          ?
          <span class="mjgd_tpl_edit_tip_pop">
            1. 请前往上架设置-AI改图模板功能中维护模板数据
            <br />
            <a
              class="mjgd_tpl_edit_tip_link"
              :href="aiImageTemplateUrl"
              target="_blank"
              rel="noopener"
            >点击前往配置AI改图模板</a>
          </span>
        </span>
        <label class="mjgd_tpl_edit_switch">
          <input
            type="checkbox"
            :checked="!state.flags.aiImage"
            @change="onAiImageToggle(($event.target as HTMLInputElement).checked)"
          />
          <span class="mjgd_tpl_edit_switch_slider"></span>
        </label>
      </header>
      <div class="mjgd_tpl_edit_ai_body">
        <select
          v-if="!state.flags.aiImage"
          v-model="state.flags.aiTemplateId"
          class="mjgd_tpl_edit_select mjgd_tpl_edit_ai_template_select"
          :disabled="state.loadingOptions"
        >
          <option v-for="tpl in state.aiTemplates" :key="tpl.id" :value="tpl.id">{{ tpl.label }}</option>
        </select>
      </div>
    </section>

    <!-- AI 重写 -->
    <section class="mjgd_tpl_edit_ai_card" data-ai="rewrite">
      <header class="mjgd_tpl_edit_ai_head">
        <span class="mjgd_tpl_edit_ai_title">AI重写</span>
        <label class="mjgd_tpl_edit_switch">
          <input
            type="checkbox"
            :checked="state.flags.bigmodelAi === 1"
            @change="state.flags.bigmodelAi = ($event.target as HTMLInputElement).checked ? 1 : 0"
          />
          <span class="mjgd_tpl_edit_switch_slider"></span>
        </label>
        <a class="mjgd_tpl_edit_ai_recharge" :href="localSettingsUrl" target="_blank" rel="noopener">本地设置</a>
      </header>
      <div class="mjgd_tpl_edit_ai_body">
        <div class="mjgd_tpl_edit_ai_quota">由本地 AI 服务配置决定，不使用插件账户额度</div>
      </div>
    </section>

    <!-- 防跟卖签名 -->
    <section class="mjgd_tpl_edit_ai_card" data-ai="antiFollow">
      <header class="mjgd_tpl_edit_ai_head">
        <span class="mjgd_tpl_edit_ai_title">防跟卖签名</span>
        <span
          class="mjgd_tpl_edit_tip_icon"
          data-tip="开启后上品时自动追加防跟卖签名内容到描述/富内容"
        >?</span>
        <label class="mjgd_tpl_edit_switch">
          <input
            type="checkbox"
            :checked="state.flags.antiFollowEnabled === 1"
            @change="onAntiFollowToggle(($event.target as HTMLInputElement).checked)"
          />
          <span class="mjgd_tpl_edit_switch_slider"></span>
        </label>
      </header>
      <div class="mjgd_tpl_edit_ai_body">
        <select
          v-if="state.flags.antiFollowEnabled === 1"
          v-model="state.flags.antiFollowTemplateId"
          class="mjgd_tpl_edit_select mjgd_tpl_edit_ai_template_select"
          :disabled="state.loadingOptions"
        >
          <option
            v-for="tpl in state.antiFollowTemplates"
            :key="tpl.id"
            :value="Number(tpl.id)"
          >{{ tpl.label }}</option>
        </select>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { API_CONFIG } from '../../../../../utils/api-config'
import {
  onAiImageToggle,
  onAntiFollowToggle,
  templateEditState as state,
} from '../../../../utils/ozonQuickShelve/templateEditController'

const localFrontendBase = API_CONFIG.LOCAL_FRONTEND_URL.replace(/\/$/, '')
const aiImageTemplateUrl =
  `${localFrontendBase}/loadingZone/shelfFormwork?tab=${encodeURIComponent('AI改图模板')}`
const localSettingsUrl = `${localFrontendBase}/settings`
</script>
