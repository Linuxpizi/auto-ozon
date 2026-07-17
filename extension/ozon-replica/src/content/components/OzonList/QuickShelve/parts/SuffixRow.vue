<template>
  <div class="mjgd_tpl_edit_suffix_row">
    <label for="mjgd_tpl_edit_suffix_input">标题后缀：</label>
    <input
      id="mjgd_tpl_edit_suffix_input"
      v-model="suffix"
      class="mjgd_tpl_edit_input mjgd_tpl_edit_suffix_input"
      placeholder="可选"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { templateEditState as state } from '../../../../utils/ozonQuickShelve/templateEditController'

const suffix = computed<string>({
  get: () => state.flags.productSuffix || '',
  set: (v) => {
    state.flags.productSuffix = v
  },
})
</script>
