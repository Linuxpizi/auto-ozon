<template>
  <Teleport to="body">
    <div v-if="state.visible" class="mjgd_tpl_edit_mask is-open" @click.self="closeTemplateEditModal">
      <div class="mjgd_tpl_edit_dialog" role="dialog" aria-modal="true">
        <!-- Header -->
        <div class="mjgd_tpl_edit_header">
          <div class="mjgd_tpl_edit_header_text">
            <span class="mjgd_tpl_edit_title">上品模板设置</span>
            <p class="mjgd_tpl_edit_warning">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              修改仅对本次上品生效
            </p>
          </div>
          <button type="button" class="mjgd_tpl_edit_close" @click="closeTemplateEditModal">×</button>
        </div>

        <!-- Body -->
        <div class="mjgd_tpl_edit_body">
          <SuffixRow />
          <TemplateShopCard />
          <TemplateRuleCard />
          <TemplateAiRow />
        </div>

        <!-- Footer -->
        <div class="mjgd_tpl_edit_footer">
          <button type="button" class="mjgd_tpl_edit_btn" @click="closeTemplateEditModal">取消</button>
          <button type="button" class="mjgd_tpl_edit_btn mjgd_tpl_edit_btn_primary" @click="confirmTemplateEditModal">
            确定
          </button>
        </div>
      </div>
    </div>
    <!-- 第 3 级嵌套：批量库存弹窗 -->
    <BatchStockModal />
  </Teleport>
</template>

<script setup lang="ts">
import {
  closeTemplateEditModal,
  confirmTemplateEditModal,
  templateEditState as state,
} from '../../../utils/ozonQuickShelve/templateEditController'
import SuffixRow from './parts/SuffixRow.vue'
import TemplateShopCard from './parts/TemplateShopCard.vue'
import TemplateRuleCard from './parts/TemplateRuleCard.vue'
import TemplateAiRow from './parts/TemplateAiRow.vue'
import BatchStockModal from './BatchStockModal.vue'
</script>
