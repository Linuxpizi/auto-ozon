<script setup lang="ts">
defineProps<{
  logoUrl: string
}>()
</script>

<template>
  <section
    id="ozon-floating-panel"
    class="sidebar fixed bottom-5 right-5 bg-white rounded-xl z-[2147483647] flex flex-col items-stretch shadow-[0_0_16px_4px_rgba(238,19,27,0.2)] ring ring-gray-100 w-36 transition-all duration-300 pb-2"
    aria-label="鲸智 AI Ozon 工具"
  >
    <header class="sidebar-header flex items-center justify-between px-3 pt-2">
      <div class="sidebar-brand flex items-center flex-nowrap">
        <img class="brand-logo w-5 h-5 mr-2" :src="logoUrl" width="20" height="20" alt="">
        <span class="brand-name text-sm">鲸智 AI</span>
      </div>
      <button id="ozon-panel-collapse" class="collapse" type="button" aria-label="收起鲸智 AI 浮窗">
        <span class="collapse-icon" aria-hidden="true">
          <svg viewBox="64 64 896 896" focusable="false">
            <path fill="currentColor" d="M872 474H152c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h720c4.4 0 8-3.6 8-8v-60c0-4.4-3.6-8-8-8z" />
          </svg>
        </span>
      </button>
    </header>

    <div id="ozon-panel-actions" class="authenticated-actions px-5 pt-2 flex flex-col items-center justify-center gap-2" hidden>
      <button id="ozon-one-click-listing" class="ant-btn ant-btn-primary ant-btn-dangerous ant-btn-block ant-btn-round" type="button" data-page="detail">一键上架</button>
      <button id="ozon-profit-calculator" class="ant-btn ant-btn-primary ant-btn-block ant-btn-round" type="button">计算利润</button>
      <button id="ozon-pricing-tool" class="ant-btn ant-btn-default ant-btn-amber ant-btn-block ant-btn-round" type="button">定价工具</button>
      <button id="ozon-bind-cookie" class="ant-btn ant-btn-primary ant-btn-block ant-btn-round" type="button" aria-busy="false">绑定Cookie</button>
      <button id="ozon-start-list-crawl" class="ant-btn ant-btn-primary ant-btn-block ant-btn-round" type="button" data-page="list">启动爬取</button>
      <div id="ozon-list-card-control" class="switch-control" data-page="list">
        <button id="ozon-list-card-switch" class="ant-switch" type="button" role="switch" aria-label="隐藏列表分析卡片" aria-checked="false">
          <span class="ant-switch-handle" />
          <span class="ant-switch-inner"><span class="ant-switch-inner-checked">隐藏卡片</span></span>
        </button>
      </div>
      <div id="ozon-detail-card-control" class="switch-control" data-page="detail">
        <button id="ozon-detail-card-switch" class="ant-switch" type="button" role="switch" aria-label="显示商品详情分析卡片" aria-checked="true">
          <span class="ant-switch-handle" />
          <span class="ant-switch-inner"><span class="ant-switch-inner-checked">其它卡片</span></span>
        </button>
      </div>
      <button id="ozon-enter-erp" class="ant-btn ant-btn-link ant-btn-sm" type="button">进入ERP</button>
    </div>

    <div id="ozon-panel-login-actions" class="login-actions p-5" hidden>
      <button id="ozon-panel-login" class="ant-btn ant-btn-primary ant-btn-block ant-btn-round" type="button">请登录</button>
      <div class="login-help">
        <button id="ozon-panel-login-help" class="ant-btn ant-btn-link ant-btn-block ant-btn-round" type="button" aria-describedby="ozon-panel-login-tooltip">登录有问题？</button>
        <div id="ozon-panel-login-tooltip" class="ant-tooltip" role="tooltip">
          1.关闭浏览器重新打开<br>2.卸载插件重新安装<br>3.仍然无法登录请联系客服
        </div>
      </div>
    </div>
  </section>

  <button
    id="ozon-panel-launcher"
    class="launcher fixed bg-white rounded-full shadow-[0_0_16px_4px_rgba(238,19,27,0.6)] z-[9999] p-3 flex items-center justify-center transition-all duration-300 cursor-move"
    type="button"
    aria-label="展开鲸智 AI 浮窗"
    hidden
  >
    <img :src="logoUrl" width="40" draggable="false" alt="鲸智 AI">
  </button>

  <div id="ozon-tool-dialog-backdrop" class="ant-modal-root" hidden>
    <div class="ant-modal-mask" />
    <div class="ant-modal-wrap" role="dialog" aria-modal="true" aria-labelledby="ozon-tool-dialog-title" aria-describedby="ozon-tool-dialog-content">
      <div class="ant-modal">
        <div class="ant-modal-content">
          <div class="ant-modal-confirm-body-wrapper">
            <div id="ozon-tool-dialog-title" class="ant-modal-confirm-title" />
            <div id="ozon-tool-dialog-content" class="ant-modal-confirm-content" />
            <div class="ant-modal-confirm-btns">
              <button id="ozon-tool-dialog-confirm" class="ant-btn ant-btn-primary" type="button" aria-busy="false">确定</button>
              <button id="ozon-tool-dialog-cancel" class="ant-btn ant-btn-default" type="button">取消</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>