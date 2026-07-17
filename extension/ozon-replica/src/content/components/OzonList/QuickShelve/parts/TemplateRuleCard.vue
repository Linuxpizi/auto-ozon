<template>
  <section class="mjgd_tpl_edit_card mjgd_tpl_edit_card--rule">
    <header class="mjgd_tpl_edit_card_head">
      <span class="mjgd_tpl_edit_card_title">上品规则配置</span>
      <span class="mjgd_tpl_edit_card_subtitle">设置商品上品的各项规则参数</span>
    </header>

    <div class="mjgd_tpl_edit_rule_grid">
      <!-- 方式 -->
      <div class="mjgd_tpl_edit_rule_field">
        <label class="mjgd_tpl_edit_rule_label">方式</label>
        <select
          :value="state.flags.upperShelveDirect ? 'true' : 'false'"
          class="mjgd_tpl_edit_select"
          @change="state.flags.upperShelveDirect = ($event.target as HTMLSelectElement).value === 'true'"
        >
          <option value="false">修改</option>
          <option value="true">直上</option>
        </select>
      </div>

      <!-- 执行 -->
      <div class="mjgd_tpl_edit_rule_field">
        <label class="mjgd_tpl_edit_rule_label">执行</label>
        <select
          :value="state.flags.handMovementStatus ? 'true' : 'false'"
          class="mjgd_tpl_edit_select"
          @change="state.flags.handMovementStatus = ($event.target as HTMLSelectElement).value === 'true'"
        >
          <option value="false">模拟手</option>
          <option value="true">API接口</option>
        </select>
      </div>

      <!-- 类型（跟卖/复制） -->
      <div class="mjgd_tpl_edit_rule_field">
        <label class="mjgd_tpl_edit_rule_label">类型</label>
        <select
          :value="state.flags.oModel ? 'true' : 'false'"
          class="mjgd_tpl_edit_select"
          @change="state.flags.oModel = ($event.target as HTMLSelectElement).value === 'true'"
        >
          <option value="false">复制</option>
          <option value="true">跟卖</option>
        </select>
      </div>

      <!-- 品牌 -->
      <div class="mjgd_tpl_edit_rule_field mjgd_tpl_edit_rule_field--brand">
        <label class="mjgd_tpl_edit_rule_label">品牌</label>
        <div class="mjgd_tpl_edit_brand_wrap">
          <select v-model="state.brandMode" class="mjgd_tpl_edit_select">
            <option value="original">原品牌</option>
            <option value="none">无品牌</option>
            <option value="custom">自定义品牌</option>
          </select>
          <BrandSearchInput v-if="state.brandMode === 'custom'" />
        </div>
      </div>

      <!-- 删除品牌文字 -->
      <div class="mjgd_tpl_edit_rule_field">
        <label class="mjgd_tpl_edit_rule_label" title="开启后可自动删除商品标题和描述里的品牌文字">删除品牌文字</label>
        <select
          :value="state.flags.removeBrandText ? 'true' : 'false'"
          class="mjgd_tpl_edit_select"
          @change="state.flags.removeBrandText = ($event.target as HTMLSelectElement).value === 'true'"
        >
          <option value="true">删除</option>
          <option value="false">不删除</option>
        </select>
      </div>

      <!-- 生成条形码 -->
      <div class="mjgd_tpl_edit_rule_field">
        <label class="mjgd_tpl_edit_rule_label" title="开启后上品时自动生成条形码">生成条形码</label>
        <select
          :value="state.flags.generateBarcode === 1 ? 'true' : 'false'"
          class="mjgd_tpl_edit_select"
          @change="state.flags.generateBarcode = ($event.target as HTMLSelectElement).value === 'true' ? 1 : 0"
        >
          <option value="true">生成</option>
          <option value="false">不生成</option>
        </select>
      </div>

      <!-- 制造国/品牌国 -->
      <div class="mjgd_tpl_edit_rule_field">
        <label class="mjgd_tpl_edit_rule_label">制造国/品牌国</label>
        <select
          :value="state.flags.madeCountryStatus ? 'true' : 'false'"
          class="mjgd_tpl_edit_select"
          @change="state.flags.madeCountryStatus = ($event.target as HTMLSelectElement).value === 'true'"
        >
          <option value="false">中国</option>
          <option value="true">原始国</option>
        </select>
      </div>

      <!-- 主题标签 -->
      <div class="mjgd_tpl_edit_rule_field">
        <label class="mjgd_tpl_edit_rule_label">主题标签</label>
        <select
          :value="state.flags.tagStatus ? 'true' : 'false'"
          class="mjgd_tpl_edit_select"
          @change="state.flags.tagStatus = ($event.target as HTMLSelectElement).value === 'true'"
        >
          <option value="false">空标签</option>
          <option value="true">原始内容</option>
        </select>
      </div>

      <!-- JSON 富内容 -->
      <div class="mjgd_tpl_edit_rule_field">
        <label class="mjgd_tpl_edit_rule_label">JSON 富内容</label>
        <select
          :value="state.flags.jsonStatus ? 'true' : 'false'"
          class="mjgd_tpl_edit_select"
          @change="state.flags.jsonStatus = ($event.target as HTMLSelectElement).value === 'true'"
        >
          <option value="false">空JSON</option>
          <option value="true">原始内容</option>
        </select>
      </div>

      <!-- 图片上传模式 -->
      <div class="mjgd_tpl_edit_rule_field">
        <label class="mjgd_tpl_edit_rule_label">图片上传模式</label>
        <select
          v-model.number="state.flags.pricateStatus"
          class="mjgd_tpl_edit_select"
        >
          <option :value="0">默认</option>
          <option :value="1">随机打乱</option>
          <option :value="2">随机打乱(含主图)</option>
        </select>
      </div>

      <!-- 合并卡片：仅在类型=复制（oModel=false）时显示 -->
      <div v-if="!state.flags.oModel" class="mjgd_tpl_edit_rule_field mjgd_tpl_edit_rule_field--merge">
        <label class="mjgd_tpl_edit_rule_label">合并卡片</label>
        <select
          :value="state.flags.Btxh ? 'true' : 'false'"
          class="mjgd_tpl_edit_select"
          @change="state.flags.Btxh = ($event.target as HTMLSelectElement).value === 'true'"
        >
          <option value="false">合并</option>
          <option value="true">不合并</option>
        </select>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { templateEditState as state } from '../../../../utils/ozonQuickShelve/templateEditController'
import BrandSearchInput from './BrandSearchInput.vue'
</script>
