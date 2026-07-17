<template>
  <div class="remove-watermark-page" :class="{ is_embedded: embedded }">
    <!-- 主体内容 -->
    <div class="page-body">
      <!-- 左侧工具栏 -->
      <aside class="left-toolbar">
        <div class="tool-group">
          <!-- 画笔 -->
          <button class="tool-btn" :class="{ active: activeTool === 'brush' }" title="画笔" @click="setActiveTool('brush')">
            <svg fill="currentColor" t="1779953519916" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2282" width="22" height="22"><path d="M1014.252005 108.047065l-83.735501-53.020051L843.789058 0 444.925201 637.598581c-55.540005-7.176871-113.300971 15.379725-145.257398 94.844301C228.063085 941.91413 9.747995 935.421246 9.747995 935.421246s312.221408 198.960437 536.089399 0.511991c46.568166-41.354259 65.280831-102.706161 53.660039-159.571142l414.754572-668.31503zM513.196979 635.120625l51.437078-81.258545 73.910677 46.781162-51.523078 81.301544-73.824677-46.824161z" p-id="2283"></path></svg>
          </button>
          <!-- 框选 -->
          <button class="tool-btn" :class="{ active: activeTool === 'rect' }" title="框选" @click="setActiveTool('rect')">
            <svg fill="currentColor" t="1779954563291" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1676" width="22" height="22"><path d="M907.29411781 32h-197.64705937v84.70588219h169.41176531a28.23529406 28.23529406 0 0 1 28.23529406 28.23529406v169.41176531h84.70588219V116.70588219a84.70588219 84.70588219 0 0 0-84.70588219-84.70588219zM370.82352969 32h282.35294062v84.70588219H370.82352969zM907.29411781 370.82352969h84.70588219v282.35294062h-84.70588219zM370.82352969 907.29411781h282.35294062v84.70588219H370.82352969zM32 370.82352969h84.70588219v282.35294062H32zM116.70588219 879.05882375v-169.41176531H32v197.64705937a84.70588219 84.70588219 0 0 0 84.70588219 84.70588219h197.64705937v-84.70588219H144.94117625a28.23529406 28.23529406 0 0 1-28.23529406-28.23529406zM907.29411781 879.05882375a28.23529406 28.23529406 0 0 1-28.23529406 28.23529406h-169.41176531v84.70588219h197.64705937a84.70588219 84.70588219 0 0 0 84.70588219-84.70588219v-197.64705937h-84.70588219zM32 116.70588219v197.64705937h84.70588219V144.94117625a28.23529406 28.23529406 0 0 1 28.23529406-28.23529406h169.41176531V32H116.70588219a84.70588219 84.70588219 0 0 0-84.70588219 84.70588219z" p-id="1677"></path></svg>
          </button>
          <!-- 橡皮擦 -->
          <button class="tool-btn" :class="{ active: activeTool === 'eraser' }" title="橡皮擦" @click="setActiveTool('eraser')">
            <svg fill="currentColor" t="1779953832937" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2717" id="mx_n_1779953832938" width="22" height="22"><path d="M980.9 424.1c12.5-12.5 12.5-32.8 0-45.3L636.7 34.6c-12.5-12.5-32.8-12.5-45.3 0L90.5 535.5c-50 50-50 131 0 181l272 270.3c24 23.8 56.4 37.2 90.2 37.2H864c17.7 0 32-14.3 32-32 0-8.8-3.6-16.8-9.4-22.6-5.8-5.8-13.8-9.4-22.6-9.4H599.5c-57 0-85.6-68.9-45.3-109.3l426.7-426.6zM434.8 879.7c-25 25-65.5 25-90.5 0L135.8 671.3c-25-25-25-65.5 0-90.5l127.9-127.9 299 299-127.9 127.8z" p-id="2718"></path></svg>
          </button>
          <!-- 移动 -->
          <button class="tool-btn" :class="{ active: activeTool === 'move' }" title="移动" @click="setActiveTool('move')">
            <svg fill="currentColor" t="1779954476464" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1522" width="22" height="22"><path d="M482.87288889 812.98014777v-242.72592555H211.01985223v121.36296335L26.54814777 512l184.47170446-184.47170333V512h271.85303666V211.01985223H327.52829667L512 26.54814777l184.47170333 184.47170446h-150.49007332V512h271.85303666V327.52829667L997.45185223 512l-184.47170446 184.47170333v-121.36296221h-271.85303666v242.72592555h150.49007446L512 997.45185223l-184.47170333-184.47170446h155.34459222z" p-id="1523"></path></svg>
          </button>
        </div>

        <div class="toolbar-divider"></div>

        <!-- 画笔大小：+/- 按钮 + 滑动条，单位为原图像素半径 -->
        <div class="brush-size-section">
          <span class="brush-size-label">画笔大小</span>
          <div class="brush-size-controls">
            <button class="size-btn" :disabled="brushSize >= brushSizeMax" @click="adjustBrushSize(5)">
              <i class="el-icon-plus"></i>
            </button>
            <span class="size-value">{{ brushSize }}</span>
            <button class="size-btn" :disabled="brushSize <= brushSizeMin" @click="adjustBrushSize(-5)">
              <i class="el-icon-minus"></i>
            </button>
          </div>
          <input
            v-model.number="brushSize"
            type="range"
            class="brush_slider"
            :min="brushSizeMin"
            :max="brushSizeMax"
            step="1"
          />
        </div>

        <div class="toolbar-spacer"></div>
      </aside>

      <!-- 右侧操作区 -->
      <div class="right-workspace">
        <!-- 顶部功能区 -->
        <div class="workspace-header">
          <div class="header-info">
            <svg t="1778812766514" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1188" width="24" height="24">
              <path
                d="M980.9 424.1c12.5-12.5 12.5-32.8 0-45.3L636.7 34.6c-12.5-12.5-32.8-12.5-45.3 0L90.5 535.5c-50 50-50 131 0 181l272 270.3c24 23.8 56.4 37.2 90.2 37.2H864c17.7 0 32-14.3 32-32 0-8.8-3.6-16.8-9.4-22.6-5.8-5.8-13.8-9.4-22.6-9.4H599.5c-57 0-85.6-68.9-45.3-109.3l426.7-426.6zM434.8 879.7c-25 25-65.5 25-90.5 0L135.8 671.3c-25-25-25-65.5 0-90.5l127.9-127.9 299 299-127.9 127.8z"
                fill="#ec4899" p-id="1189"></path>
            </svg>
            <h2 class="workspace-title">智能消除水印</h2>
            <span v-if="images.length" class="image-counter">{{ currentIndex + 1 }} / {{ images.length }}</span>
          </div>
          <div class="header-actions">
            <button class="action-btn inpaint_btn" :class="{ has_pending: hasPendingMask }" title="提交已标记区域进行智能消除" @click="handleStartInpaint">
              <i class="el-icon-magic-stick"></i>
              <span>开始消除</span>
              <svg class="xianmian_svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" fill="none" version="1.1" width="40" height="20" viewBox="0 0 40 20">
                <defs>
                  <linearGradient x1="0.1015625" y1="-0.17105263471603394" x2="1.258437475698135" y2="0.31605259885367243" id="master_svg0_6_245">
                    <stop offset="0%" stop-color="#F59E0B" stop-opacity="1" />
                    <stop offset="100%" stop-color="#EF4444" stop-opacity="1" />
                  </linearGradient>
                </defs>
                <g>
                  <rect x="0" y="0" width="40" height="20" rx="9.5" fill="url(#master_svg0_6_245)" fill-opacity="1" style="mix-blend-mode:passthrough" />
                  <rect x="0" y="0" width="40" height="20" rx="9.5" fill="#000000" fill-opacity="0" style="mix-blend-mode:passthrough" />
                  <g>
                    <path
                      d="M7.2851562,3.81815624L10.6536875,3.81815624L10.6536875,4.7701559L8.2207501,4.7701559L8.2207501,16.094625L7.2851562,16.094625L7.2851562,3.81815624ZM10.4657812,3.81815624L10.6427503,3.81815624L10.8030939,3.77374935L11.4925938,4.1828117Q11.1808753,5.0361557,10.8184066,6.007186900000001Q10.4561563,6.978218099999999,10.0993752,7.8188748Q10.8612814,8.6993437,11.107593999999999,9.4588437Q11.354125,10.2181249,11.354125,10.8798437Q11.354125,11.442687,11.225719,11.8716564Q11.097312500000001,12.3006248,10.7930312,12.5209064Q10.6536875,12.6267815,10.4649062,12.6867189Q10.2763438,12.7466564,10.0641565,12.7801247Q9.856344,12.7995939,9.6082814,12.8022184Q9.3602188,12.8048439,9.125281300000001,12.7963123Q9.11675,12.6116877,9.0474064,12.3426247Q8.978281299999999,12.0733433,8.859062699999999,11.8716564Q9.0983751,11.8856564,9.3070626,11.8926563Q9.5157502,11.8996563,9.6822188,11.8856564Q9.9434063,11.8685932,10.1175313,11.7620621Q10.280718799999999,11.6439371,10.3424063,11.3753128Q10.4043126,11.1066875,10.4043126,10.7870936Q10.4043126,10.205656099999999,10.154718899999999,9.4903436Q9.9053438,8.7748122,9.1482501,7.9350309Q9.3427188,7.4559684,9.5310626,6.9344683Q9.719625,6.4127493,9.8898127,5.8971558Q10.060218800000001,5.3813438,10.209406399999999,4.9169369Q10.358593899999999,4.4525309,10.4657812,4.1018744L10.4657812,3.81815624ZM12.731594099999999,3.86081219L18.366374999999998,3.86081219L18.366374999999998,10.013155900000001L12.731594099999999,10.013155900000001L12.731594099999999,9.0885L17.348750000000003,9.0885L17.348750000000003,4.7856874000000005L12.731594099999999,4.7856874000000005L12.731594099999999,3.86081219ZM12.8000627,6.4755306L17.896718999999997,6.4755306L17.896718999999997,7.3566561L12.8000627,7.3566561L12.8000627,6.4755306ZM15.3557186,9.4693437Q15.6645937,10.778999800000001,16.217594,11.8930931Q16.770813,13.007188,17.593094,13.832094Q18.415594,14.656781,19.511969999999998,15.107187Q19.398875,15.209125,19.259532,15.371875Q19.120188,15.534843,19.000094,15.701531Q18.880219,15.868218,18.794469,16.02025Q17.645813,15.464625,16.805594,14.537781Q15.9653749,13.610937,15.3953133,12.3634062Q14.825469,11.1156559,14.4864063,9.635375L15.3557186,9.4693437ZM18.511407,10.4664063L19.203969,11.1996565Q18.800375000000003,11.5308437,18.318687,11.8747187Q17.837,12.2183752,17.356406,12.520031Q16.876032000000002,12.8216877,16.460188000000002,13.060344L15.8883753,12.3896561Q16.293281999999998,12.1455307,16.776719,11.8189373Q17.260375,11.4923439,17.721282000000002,11.1351252Q18.182406,10.777687499999999,18.511407,10.4664063ZM12.146875399999999,16.121312L12.0674691,15.191188L12.5697188,14.797218L15.6976252,14.046906Q15.6921568,14.267406,15.7044067,14.545875Q15.7168751,14.824344,15.7472811,14.99825Q14.6625004,15.295969,13.9970627,15.483656Q13.331843899999999,15.671562,12.9639063,15.786187Q12.5959687,15.901031,12.4242501,15.977593Q12.2527504,16.054375,12.146875399999999,16.121312ZM12.146875399999999,16.121312Q12.1112189,15.999687,12.0280938,15.839562Q11.9451876,15.679656,11.8539691,15.516469Q11.762969,15.353281,11.6772189,15.253531Q11.8439064,15.15925,12.0178127,14.93Q12.1917191,14.70075,12.1917191,14.25975L12.1917191,3.86081219L13.2233438,3.86081219L13.2233438,15.08925Q13.2233438,15.08925,13.1155005,15.161219Q13.0076566,15.233406,12.8499379,15.345407Q12.6922188,15.457625,12.5275002,15.593031Q12.3627815,15.728657,12.2547188,15.866906Q12.146875399999999,16.005157,12.146875399999999,16.121312ZM27.678562,10.7177501L28.756126,10.7177501L28.756126,14.389031Q28.756126,14.710375,28.894157,14.797218Q29.032188,14.883843,29.510157,14.883843Q29.614281,14.883843,29.906532,14.883843Q30.198782,14.883843,30.548782,14.883843Q30.898781,14.883843,31.209187,14.883843Q31.519814,14.883843,31.663532,14.883843Q31.964314,14.883843,32.114813,14.749312Q32.265312,14.614781,32.327,14.195219Q32.388906,13.775656,32.416906,12.9282188Q32.532844999999995,13.005219,32.703907,13.086813Q32.874969,13.168187,33.054127,13.231625Q33.233282,13.295062,33.385313,13.339469Q33.321438,14.335218,33.168751,14.879031Q33.016281,15.422625,32.683563,15.630656Q32.350845,15.838906,31.748405,15.838906Q31.66222,15.838906,31.421593,15.838906Q31.180969,15.838906,30.873844,15.838906Q30.566936,15.838906,30.258282,15.838906Q29.949844,15.838906,29.716219,15.838906Q29.482594,15.838906,29.396187,15.838906Q28.714344,15.838906,28.342688,15.71575Q27.971251,15.592813,27.824905,15.273875Q27.678562,14.955156,27.678562,14.399969L27.678562,10.7177501ZM24.646906,3.20215607L25.794468,3.42265606Q25.311251,4.2576246,24.652374,5.1245308000000005Q23.993719,5.9914369999999995,23.170782,6.8226871Q22.347843,7.6537185,21.328906,8.377780900000001Q21.251688,8.250906,21.121969,8.106312299999999Q20.99225,7.9617186,20.847219000000003,7.8254371Q20.702406,7.6891561,20.575530999999998,7.611937Q21.533656,6.9703436,22.314156,6.2108431Q23.094656,5.4513435,23.684406,4.6725931Q24.274376,3.89362431,24.646906,3.20215607ZM23.195499,7.7186871L23.195499,10.1684685L31.180531,10.1684685L31.180531,7.7186871L23.195499,7.7186871ZM22.150749,6.7721558L32.283031,6.7721558L32.283031,11.1235313L22.150749,11.1235313L22.150749,6.7721558ZM28.48225,4.3055305L28.713688,4.3055305L28.890438,4.2556562L29.609688,4.7215939Q29.355282,5.1805305,29.003094,5.6792812Q28.651125,6.1778126,28.272688,6.6358747000000005Q27.894251,7.0937185,27.539438,7.4452496Q27.393749,7.3269062,27.167782,7.1823125Q26.941813,7.0377183,26.762657,6.9497814Q27.089907,6.628437,27.424376,6.197937Q27.758844,5.7672186,28.040375,5.3181248Q28.321907,4.8688126,28.48225,4.5126867L28.48225,4.3055305ZM24.42028,4.3055305L28.790688,4.3055305L28.790688,5.1921244L23.858749,5.1921244L24.42028,4.3055305ZM26.549376,7.392312L27.655157,7.392312Q27.565687,8.581437099999999,27.387844,9.6659999Q27.210218,10.7503438,26.83375,11.7126245Q26.457281,12.6746874,25.775875,13.483625Q25.094469,14.292344,24.011656,14.926063Q22.928844,15.559563,21.328906,15.989843Q21.251688,15.78575,21.076468,15.519313Q20.901249999999997,15.252875,20.727344000000002,15.093187Q22.258812,14.71825,23.276875,14.153656Q24.295156,13.588843,24.914438,12.8599682Q25.533937,12.1308746,25.862062,11.2709684Q26.190187,10.410843400000001,26.334782,9.4310622Q26.479376,8.4512811,26.549376,7.392312Z"
                      fill="#FFFFFF" fill-opacity="1" style="mix-blend-mode:passthrough" />
                  </g>
                </g>
              </svg>
            </button>
            <button class="action-btn" :disabled="!canUndo" title="撤销" @click="handleUndo">
              <i class="el-icon-refresh-left"></i>
              <span>撤销</span>
            </button>
            <button class="action-btn" :disabled="!canRedo" title="恢复" @click="handleRedo">
              <i class="el-icon-refresh-right"></i>
              <span>恢复</span>
            </button>
            <button class="action-btn primary" :disabled="!hasCurrentImage" @click="handleDownloadCurrent">
              <i class="el-icon-download"></i>
              <span>下载当前</span>
            </button>
            <button class="action-btn success" :disabled="!images.length" @click="handleDownloadAll">
              <i class="el-icon-download"></i>
              <span>下载全部</span>
            </button>
            <div class="exit_editor_actions">
              <button type="button" class="exit_editor_btn exit_editor_btn_cancel" :disabled="saveExiting" @click="handleCancelEdit">取消编辑</button>
              <button type="button" class="exit_editor_btn exit_editor_btn_save" :disabled="saveExiting || processing" @click="handleSaveAndExit">
                <i v-if="saveExiting" class="el-icon-loading exit_editor_btn_loading"></i>
                <span>{{ saveExiting ? '保存中…' : '保存并退出' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 绘制区 -->
        <div ref="viewport" class="canvas-viewport" :class="{
          'is-move': activeTool === 'move',
          'is-stroking': isDrawing,
          'is-panning': isPanning,
          'is_brush_tool': activeTool === 'brush' && hasCurrentImage,
          'is_eraser_tool': activeTool === 'eraser' && hasCurrentImage
        }" @mousedown="onViewportMouseDown" @mousemove="onViewportMouseMove" @mouseup="onViewportMouseUp" @mouseleave="onViewportMouseLeave" @wheel.prevent="onViewportWheel">
          <!-- 画笔/橡皮擦范围预览：原图半径 brushSize，随缩放换算为视口像素 -->
          <div v-show="brushPreviewVisible" class="brush_preview_ring" :class="{ eraser_preview_ring: activeTool === 'eraser' }" :style="brushPreviewStyle" />
          <!-- 嵌入模式：加载队列勾选图片中 -->
          <div v-if="imagesLoading" class="canvas-empty canvas_empty_loading">
            <i class="el-icon-loading"></i>
            <span>正在加载图片...</span>
          </div>
          <!-- 空白状态 -->
          <div v-else-if="!hasCurrentImage" class="canvas-empty">
            <!-- 添加图片按钮，支持点击选择与拖入上传 -->
            <button class="add-image-btn add-image-btn2" :class="{ 'is-dragover': isDragOver2 }" @click="triggerFileInput" @dragover.prevent="handleDragOver2" @dragleave.prevent="handleDragLeave2"
              @drop.prevent="handleDrop">
              <svg t="1779170187188" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1449" id="mx_n_1779170187189" width="48" height="48">
                <path
                  d="M853.14 924H194.86A139.02 139.02 0 0 1 56 785.14V660a32 32 0 0 1 64 0v125.14A74.94 74.94 0 0 0 194.86 860h658.28A74.94 74.94 0 0 0 928 785.14V660a32 32 0 0 1 64 0v125.14A139.02 139.02 0 0 1 853.14 924z"
                  p-id="1450" fill="#2563eb"></path>
                <path d="M524 712a32 32 0 0 1-32-32V94a32 32 0 0 1 64 0v586a32 32 0 0 1-32 32z" p-id="1451" fill="#2563eb"></path>
                <path d="M807.4 360.4a31.8 31.8 0 0 1-20.38-7.34L503.6 118.66a32 32 0 0 1 40.8-49.32l283.4 234.4a32 32 0 0 1-20.4 56.66z" p-id="1452" fill="#2563eb"></path>
                <path d="M240.6 360.4a32 32 0 0 1-20.4-56.66l283.4-234.4a32 32 0 0 1 40.8 49.32l-283.42 234.4a31.8 31.8 0 0 1-20.38 7.34z" p-id="1453" fill="#2563eb"></path>
              </svg>
              <span>点击添加图片或拖入图片</span>
              <span>支持 JPG、PNG、WebP、BMP 格式，单张图片不超过 10MB</span>
            </button>
          </div>

          <!-- 上一张 / 下一张 -->
          <template v-if="images.length > 1">
            <button class="nav-btn nav-prev" :disabled="currentIndex <= 0" @mousedown.stop @click.stop="switchImage(currentIndex - 1)">
              <i class="el-icon-arrow-left"></i>
            </button>
            <button class="nav-btn nav-next" :disabled="currentIndex >= images.length - 1" @mousedown.stop @click.stop="switchImage(currentIndex + 1)">
              <i class="el-icon-arrow-right"></i>
            </button>
          </template>

          <!-- Canvas 容器 -->
          <div v-show="hasCurrentImage" ref="canvasWrapper" class="canvas-wrapper" :class="{ 'is-draw-surface': activeTool === 'brush' || activeTool === 'rect' || activeTool === 'eraser' }"
            :style="[canvasTransformStyle, brushCanvasWrapperStyle]" @mouseenter="onCanvasWrapperMouseEnter" @mouseleave="onCanvasWrapperMouseLeave">
            <canvas ref="mainCanvas" class="main-canvas"></canvas>
            <!-- 蒙版预览层，绘制中显示笔刷/框选效果，不参与最终合成 -->
            <canvas ref="overlayCanvas" class="overlay-canvas"></canvas>
          </div>

          <!-- 待提交蒙版逐步撤销/恢复，不影响已消除的画布历史 -->
          <div v-if="hasCurrentImage" class="mask_undo_controls" @mousedown.stop>
            <button class="mask_undo_btn" :disabled="!canUndoPendingMask" title="撤销上一步涂抹、框选或擦除" @click="handleUndoPendingMask">
              <i class="el-icon-refresh-left"></i>
              <span>撤销涂抹</span>
            </button>
            <button class="mask_undo_btn" :disabled="!canRedoPendingMask" title="恢复上一步撤销的涂抹或擦除" @click="handleRedoPendingMask">
              <i class="el-icon-refresh-right"></i>
              <span>恢复涂抹</span>
            </button>
          </div>

          <!-- 缩放控制 -->
          <div v-if="hasCurrentImage" class="zoom-controls" @mousedown.stop>
            <button class="zoom-btn" :disabled="zoom <= minZoom" @click="adjustZoom(-0.1)">
              <i class="el-icon-minus"></i>
            </button>
            <span class="zoom-value">{{ zoomPercent }}%</span>
            <button class="zoom-btn" :disabled="zoom >= maxZoom" @click="adjustZoom(0.1)">
              <i class="el-icon-plus"></i>
            </button>
          </div>
        </div>

        <!-- 图片列表 -->
        <div class="picture-list-section">
          <div class="list-header">
            <span class="list-title">图片列表</span>
            <span v-if="images.length" class="list-badge">{{ images.length }}</span>
            <button class="action-btn delete_btn" :disabled="!hasCurrentImage || isDeleting" @click="handleDeleteAllImages">
              <i class="el-icon-delete"></i>
              <span>清空图片</span>
            </button>
          </div>
          <div class="picture-list">
            <div v-for="(img, index) in images" :key="img.id" class="thumb-item" :class="{ active: index === currentIndex }" @click="switchImage(index)">
              <span class="thumb-index">{{ index + 1 }}</span>
              <img :src="img.thumbUrl" :alt="img.name" />
              <button class="thumb-remove" title="移除" @click.stop="removeImage(index)">
                <i class="el-icon-close"></i>
              </button>
            </div>
            <!-- 添加图片按钮，支持点击选择与拖入上传 -->
            <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp,image/bmp" multiple style="display: none" @change="handleFileSelect" />
            <button class="add-image-btn" :class="{ 'is-dragover': isDragOver }" @click="triggerFileInput" @dragover.prevent="handleDragOver" @dragleave.prevent="handleDragLeave"
              @drop.prevent="handleDrop" v-if="images.length">
              <i class="el-icon-picture-outline"></i>
              <span>添加图片</span>
            </button>
            <div v-else class="list-empty">暂无图片</div>
          </div>
        </div>

        <!-- 处理中遮罩 -->
        <div v-if="processing" class="processing-overlay">
          <i class="el-icon-loading"></i>
          <span>正在调用AI处理...</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
/**
 * 智能去水印页面
 * - 左侧：画笔 / 框选 / 橡皮擦 / 移动工具 + 画笔大小调节
 * - 右侧：Canvas 编辑区 + 底部图片列表
 * - 坐标体系统一使用原图像素尺寸，与 CleanPixel API 对齐
 * - 会话与修图通过本地服务接口 /vision/Watermark 完成
 */
import brushCursorIcon from '../../assets/tool_brush.png'
import eraserCursorIcon from '../../assets/tool_eraser.png'
import { messageBoxConfirm } from '../../utils/messageBox'
import { showToast } from '../../utils/toast'
import { urlToDataUrl } from '../../utils/imageProcessor'
import {
  createWatermarkSession,
  inpaintWatermark,
  deleteWatermarkSession,
} from '../utils/removeWatermarkApi'

/** 最多可上传图片数量 */
const MAX_IMAGES = 20
/** 单张图片大小上限 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024

/** 蒙版 alpha 阈值：高于此视为有涂抹 */
const MASK_ALPHA_THRESHOLD = 128

/** 在蒙版画布上绘制笔刷（白色不透明并集，重复涂抹不加深） */
function drawBrushOnMask(ctx, points, radius) {
  if (!points || !points.length) return
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#ffffff'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  points.forEach(([x, y]) => {
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  })
  if (points.length > 1) {
    ctx.beginPath()
    points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.lineWidth = radius * 2
    ctx.stroke()
  }
  ctx.restore()
}

/** 在蒙版画布上绘制框选矩形 */
function drawRectOnMask(ctx, rect) {
  const [x, y, w, h] = rect
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, w, h)
  ctx.restore()
}

/** 在蒙版画布上擦除（仅去掉 cursor 范围内像素） */
function eraseOnMask(ctx, points, radius) {
  if (!points || !points.length) return
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.globalAlpha = 1
  ctx.fillStyle = '#000000'
  ctx.strokeStyle = '#000000'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  points.forEach(([x, y]) => {
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  })
  if (points.length > 1) {
    ctx.beginPath()
    points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.lineWidth = radius * 2
    ctx.stroke()
  }
  ctx.restore()
}

/** 将单条 opLog 操作重放到蒙版 ctx */
function applyMaskOpToContext(ctx, op) {
  if (!op) return
  if (op.kind === 'brush') {
    drawBrushOnMask(ctx, op.points, op.radius)
  } else if (op.kind === 'rect') {
    drawRectOnMask(ctx, op.rect)
  } else if (op.kind === 'erase') {
    eraseOnMask(ctx, op.points, op.radius)
  }
}

/**
 * 从 maskCanvas 栅格按行 RLE 切段导出 strokes（与 CleanPixel demo 一致）
 * 每段独立两点/一点 stroke，段间断开以保留橡皮擦镂空；radius=1 保证行间纵向相切
 */
function buildStrokesFromMaskCanvas(maskCanvas) {
  if (!maskCanvas || !maskCanvas.width || !maskCanvas.height) return []
  const w = maskCanvas.width
  const h = maskCanvas.height
  const data = maskCanvas.getContext('2d').getImageData(0, 0, w, h).data
  const radius = 1
  const strokes = []
  for (let y = 0; y < h; y++) {
    let runStart = -1
    for (let x = 0; x <= w; x++) {
      const painted = x < w && data[(y * w + x) * 4 + 3] >= MASK_ALPHA_THRESHOLD
      if (painted && runStart < 0) {
        runStart = x
      } else if (!painted && runStart >= 0) {
        const x0 = runStart
        const x1 = x - 1
        const oy = y
        strokes.push(
          x0 === x1
            ? { points: [[x0, oy]], radius }
            : { points: [[x0, oy], [x1, oy]], radius }
        )
        runStart = -1
      }
    }
  }
  return strokes
}

/** 蒙版是否有有效像素（稀疏采样） */
function maskCanvasHasPixels(maskCanvas) {
  if (!maskCanvas || !maskCanvas.width || !maskCanvas.height) return false
  const w = maskCanvas.width
  const h = maskCanvas.height
  const { data } = maskCanvas.getContext('2d').getImageData(0, 0, w, h)
  const step = Math.max(8, Math.floor(Math.min(w, h) / 64))
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (data[(y * w + x) * 4 + 3] >= MASK_ALPHA_THRESHOLD) return true
    }
  }
  return false
}

/** 将旧版矢量 action 转为 opLog 条目 */
function legacyActionToOp(action) {
  if (!action) return null
  if (action.type === 'brush') {
    return { kind: 'brush', points: action.points, radius: action.radius }
  }
  if (action.type === 'rect') {
    return { kind: 'rect', rect: action.rect }
  }
  return null
}

export default {
  name: 'RemoveWatermark',
  props: {
    /** 嵌入 ImageQueuePage 弹层时使用，去掉全页 padding */
    embedded: {
      type: Boolean,
      default: false
    }
  },
  emits: ['cancel', 'save'],
  data() {
    return {
      /** 已上传图片列表，每项含 session、历史记录、视图状态等 */
      images: [],
      /** 当前编辑的图片索引，-1 表示无图片 */
      currentIndex: -1,
      /** 当前激活工具：brush | rect | eraser | move */
      activeTool: 'brush',
      /** 笔刷半径（原图像素） */
      brushSize: 45,
      brushSizeMin: 5,
      brushSizeMax: 120,
      /** 画布缩放与平移 */
      zoom: 1,
      minZoom: 0.1,
      maxZoom: 5,
      panX: 0,
      panY: 0,
      /** 是否正在调用修图接口 */
      processing: false,
      /** 交互状态 */
      isPanning: false,
      isDrawing: false,
      strokePoints: [], // 当前笔刷轨迹点 [[x,y], ...]
      rectStart: null, // 框选起点（原图坐标）
      rectCurrent: null, // 框选当前点（原图坐标）
      panStart: null, // 平移起始状态
      resizeObserver: null, // 监听视口尺寸变化以自适应缩放
      isDragOver: false, // 添加图片按钮拖入悬停状态
      isDragOver2: false,
      /** 画笔涂抹范围圆环是否在画布上显示 */
      brushPreviewVisible: false,
      /** 圆环中心在视口内的坐标（px） */
      brushPreviewX: 0,
      brushPreviewY: 0,
      isDeleting: false, //删除按钮loading
      /** 保存并退出进行中，防止重复点击 */
      saveExiting: false,
      /** 嵌入模式从队列加载勾选图片中 */
      imagesLoading: true,
      /** 蒙版预览用临时画布，避免每帧 new Canvas */
      maskPreviewCanvas: null
    }
  },
  computed: {
    /** 是否有可编辑的当前图片 */
    hasCurrentImage() {
      return this.currentIndex >= 0 && !!this.images[this.currentIndex]
    },
    currentImage() {
      return this.hasCurrentImage ? this.images[this.currentIndex] : null
    },
    /** 缩放百分比展示值 */
    zoomPercent() {
      return Math.round(this.zoom * 100)
    },
    /** Canvas 容器的平移 + 缩放变换 */
    canvasTransformStyle() {
      return {
        transform: `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`
      }
    },
    /** 画笔工具：移入画布时使用 url(brush.svg) 自定义光标，热点对齐笔尖 */
    brushCanvasWrapperStyle() {
      if (!this.hasCurrentImage) return {}
      if (this.activeTool === 'brush') {
        return {
          cursor: `url(${brushCursorIcon}) 4 28, crosshair`
        }
      } else if (this.activeTool === 'eraser') {
        return {
          cursor: `url(${eraserCursorIcon}) 4 28, crosshair`
        }
      } else {
        return {}
      }
    },
    /** 涂抹范围圆环尺寸与位置（视口坐标，直径 = 2 * brushSize * zoom） */
    brushPreviewStyle() {
      const radiusPx = this.brushSize * this.zoom
      const diameterPx = radiusPx * 2
      return {
        left: `${this.brushPreviewX - radiusPx}px`,
        top: `${this.brushPreviewY - radiusPx}px`,
        width: `${diameterPx}px`,
        height: `${diameterPx}px`
      }
    },
    /** 是否可撤销（历史索引 > 0） */
    canUndo() {
      if (!this.currentImage) return false
      return this.currentImage.historyIndex > 0
    },
    /** 是否可恢复（历史索引未到最后） */
    canRedo() {
      if (!this.currentImage) return false
      return this.currentImage.historyIndex < this.currentImage.history.length - 1
    },
    /** 当前图是否有未提交的涂抹/框选标记（以蒙版栅格为准） */
    hasPendingMask() {
      const img = this.currentImage
      if (!img || !img.pendingMaskOpLog || !img.pendingMaskOpLog.length) return false
      if (!img.maskCanvas) return true
      return maskCanvasHasPixels(img.maskCanvas)
    },
    /** 待提交蒙版操作步数（涂抹/框选/擦除），用于撤销按钮 */
    pendingMaskCount() {
      const img = this.currentImage
      if (!img || !img.pendingMaskOpLog) return 0
      return img.pendingMaskOpLog.length
    },
    /** 可撤销一步待提交涂抹（与顶部画布撤销互不干扰） */
    canUndoPendingMask() {
      return this.pendingMaskCount > 0 && !this.processing
    },
    /** 可恢复一步已撤销的待提交涂抹 */
    canRedoPendingMask() {
      const img = this.currentImage
      if (!img || !img.pendingMaskRedoActions) return false
      return img.pendingMaskRedoActions.length > 0 && !this.processing
    },
    /** 有待提交蒙版且未在处理中时可点击开始消除 */
    canStartInpaint() {
      return this.hasCurrentImage && this.hasPendingMask && !this.processing
    }
  },
  mounted() {
    window.addEventListener('beforeunload', this.handleBeforeUnload)
    // 等待 DOM 渲染后再绑定 ResizeObserver
    this.$nextTick(() => {
      this.initResizeObserver()
    })
  },
  beforeUnmount() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
    this.closeSessions()
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }
    this.revokeAllUrls()
  },
  methods: {
    // ========== 页面生命周期 / 离开拦截 ==========

    /** 离开页面前是否需要提示（修图处理中） */
    shouldWarnOnLeave() {
      return this.processing
    },

    /** 浏览器刷新/关闭时拦截 */
    handleBeforeUnload(e) {
      if (!this.shouldWarnOnLeave()) return
      const message = '当前仍有图片在处理中，离开页面后处理进度和结果将无法恢复。'
      e.returnValue = message
      return message
    },

    /** 取消编辑：不写回，直接关闭 */
    handleCancelEdit() {
      if (this.saveExiting) return
      if (this.processing) {
        messageBoxConfirm('当前仍有图片在处理中，取消后将丢失未完成结果。是否仍要取消？')
          .then(() => {
            this.$emit('cancel')
          })
          .catch(() => {})
        return
      }
      this.$emit('cancel')
    },

    /** 保存并退出：写回队列后关闭 */
    handleSaveAndExit() {
      if (this.saveExiting) return
      if (this.processing) {
        messageBoxConfirm('当前仍有图片在处理中，保存将不包含未完成结果。是否继续？')
          .then(() => {
            this.saveExiting = true
            this.$emit('save')
          })
          .catch(() => {})
        return
      }
      this.saveExiting = true
      this.$emit('save')
    },

    /** data URL 转 File，供从队列拉图后建立会话 */
    async dataUrlToFile(dataUrl, fileName) {
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const ext = blob.type.includes('png') ? 'png' : 'jpg'
      const name = fileName.includes('.') ? fileName : `${fileName}.${ext}`
      return new File([blob], name, { type: blob.type || 'image/jpeg' })
    },

    /** 外部传入勾选图片 URL 列表，建立编辑会话 */
    async loadImagesFromUrls(urls) {
      await this.resetEditor()
      const list = (urls || []).slice(0, MAX_IMAGES)
      if ((urls || []).length > MAX_IMAGES) {
        showToast(`单次最多添加 ${MAX_IMAGES} 张图片`, 3000)
        return
      }
      if (!list.length) return
      showToast(`正在加载 ${list.length} 张图片...`, 2000)
      for (let i = 0; i < list.length; i++) {
        const sourceUrl = list[i]
        try {
          const dataUrl = await urlToDataUrl(sourceUrl)
          const file = await this.dataUrlToFile(dataUrl, `image_${i + 1}.jpg`)
          await this.addImage(file, sourceUrl)
        } catch (err) {
          showToast(`图片加载失败: ${err.message || sourceUrl}`, 3000)
        }
      }
      if (this.images.length) {
        showToast('图片加载成功', 2000)
        this.imagesLoading = false
      }
    },

    /** 收集需写回队列的编辑结果（仅含已消除过的图） */
    async getWritebackPayload() {
      const results = []
      for (const img of this.images) {
        if (!img.sourceUrl || img.history.length === 0) continue
        const dataUrl = img.history[img.history.length - 1]
        const blob = await new Promise((resolve) => {
          const image = new Image()
          image.onload = async () => {
            const b = await this.exportImageElementToBlob(image, img.width, img.height)
            resolve(b)
          }
          image.onerror = () => resolve(null)
          image.src = dataUrl
        })
        if (blob) {
          results.push({ sourceUrl: img.sourceUrl, blob })
        }
      }
      return results
    },

    /** 重置编辑器状态并释放远端会话 */
    async resetEditor() {
      await this.closeSessions()
      this.revokeAllUrls()
      this.images = []
      this.currentIndex = -1
      this.processing = false
      this.isDrawing = false
      this.isPanning = false
      this.strokePoints = []
      this.rectStart = null
      this.rectCurrent = null
      this.panStart = null
      this.brushPreviewVisible = false
      this.zoom = 1
      this.panX = 0
      this.panY = 0
      this.clearCanvases()
      this.saveExiting = false
      if (this.$refs.fileInput) {
        this.$refs.fileInput.value = ''
      }
    },

    /** 监听视口尺寸变化，窗口缩放时重新适配图片 */
    initResizeObserver() {
      if (!window.ResizeObserver || !this.$refs.viewport) return
      this.resizeObserver = new ResizeObserver(() => {
        if (this.hasCurrentImage) {
          this.fitImageToView(false)
        }
      })
      this.resizeObserver.observe(this.$refs.viewport)
    },

    // ========== 工具栏操作 ==========

    /** 切换当前工具 */
    setActiveTool(toolId) {
      this.activeTool = toolId
      this.strokePoints = []
      this.rectStart = null
      this.rectCurrent = null
      this.isDrawing = false
      this.brushPreviewVisible = false
      // 切换工具后仍保留已标记区域预览
      this.redrawPendingOverlay()
    },

    /** 确保离屏蒙版画布尺寸与当前图一致 */
    ensureMaskCanvas(img) {
      if (!img || !img.width || !img.height) return null
      if (!img.maskCanvas) {
        img.maskCanvas = document.createElement('canvas')
      }
      const resized = img.maskCanvas.width !== img.width || img.maskCanvas.height !== img.height
      if (resized) {
        img.maskCanvas.width = img.width
        img.maskCanvas.height = img.height
      }
      return img.maskCanvas
    },

    /** 将旧版 pendingMaskActions / opLog 迁移为栅格 opLog 并重放 */
    migrateLegacyMaskData(img) {
      if (!img || img._maskMigrated) return
      img._maskMigrated = true
      if (!img.pendingMaskOpLog) img.pendingMaskOpLog = []

      const ops = []
      const log = img.pendingMaskOpLog
      for (let i = 0; i < log.length; i++) {
        const entry = log[i]
        if (entry.kind === 'brush' || entry.kind === 'rect') {
          ops.push(entry)
        } else if (entry.kind === 'erase' && entry.points) {
          ops.push(entry)
        } else if (entry.kind === 'add' && entry.action) {
          const op = legacyActionToOp(entry.action)
          if (op) ops.push(op)
        }
      }

      if (!ops.length && img.pendingMaskActions && img.pendingMaskActions.length) {
        for (let j = 0; j < img.pendingMaskActions.length; j++) {
          const op = legacyActionToOp(img.pendingMaskActions[j])
          if (op) ops.push(op)
        }
      }

      img.pendingMaskOpLog = ops
      img.pendingMaskActions = []
      this.ensureMaskCanvas(img)
      this.rebuildMaskFromOpLog(img)
    },

    /** 按 opLog 全量重放蒙版栅格 */
    rebuildMaskFromOpLog(img) {
      if (!img) return
      const canvas = this.ensureMaskCanvas(img)
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const log = img.pendingMaskOpLog || []
      for (let i = 0; i < log.length; i++) {
        applyMaskOpToContext(ctx, log[i])
      }
    },

    /** 清空当前图蒙版与操作记录 */
    clearMaskForImage(img) {
      if (!img) return
      if (img.maskCanvas) {
        const ctx = img.maskCanvas.getContext('2d')
        ctx.clearRect(0, 0, img.maskCanvas.width, img.maskCanvas.height)
      }
      img.pendingMaskOpLog = []
      img.pendingMaskRedoActions = []
      img.pendingMaskActions = []
    },

    /** 压入一步蒙版操作并重建栅格 */
    commitMaskOp(op) {
      const img = this.currentImage
      if (!img || !op) return
      if (!img.pendingMaskOpLog) img.pendingMaskOpLog = []
      img.pendingMaskOpLog.push(op)
      img.pendingMaskRedoActions = []
      this.rebuildMaskFromOpLog(img)
      this.redrawPendingOverlay()
    },

    /** 从 maskCanvas 栅格导出 API 蒙版（含橡皮擦镂空，与预览一致） */
    exportMaskPayloadForSubmit(img) {
      if (!img) return []
      this.rebuildMaskFromOpLog(img)
      return buildStrokesFromMaskCanvas(img.maskCanvas)
    },

    /** 调整笔刷大小 */
    adjustBrushSize(delta) {
      this.brushSize = Math.min(this.brushSizeMax, Math.max(this.brushSizeMin, this.brushSize + delta))
    },

    // ========== 缩放 / 平移 ==========

    /** 通过按钮调整缩放，以视口中心为锚点 */
    adjustZoom(delta) {
      const oldZoom = this.zoom
      const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, +(oldZoom + delta).toFixed(2)))
      if (newZoom === oldZoom) return
      this.zoomAtCenter(newZoom)
    },

    /** 以视口中心为锚点设置缩放 */
    zoomAtCenter(newZoom) {
      const viewport = this.$refs.viewport
      if (!viewport) {
        this.zoom = newZoom
        return
      }
      const rect = viewport.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2
      const ratio = newZoom / this.zoom
      this.panX = cx - (cx - this.panX) * ratio
      this.panY = cy - (cy - this.panY) * ratio
      this.zoom = newZoom
      this.saveViewState()
    },

    /** 滚轮缩放，以鼠标位置为锚点 */
    onViewportWheel(e) {
      if (!this.hasCurrentImage) return
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const viewport = this.$refs.viewport
      const rect = viewport.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const oldZoom = this.zoom
      const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, +(oldZoom + delta).toFixed(2)))
      if (newZoom === oldZoom) return
      const ratio = newZoom / oldZoom
      this.panX = mx - (mx - this.panX) * ratio
      this.panY = my - (my - this.panY) * ratio
      this.zoom = newZoom
      this.saveViewState()
    },

    // ========== 图片上传 / 管理 ==========

    /** 触发隐藏的文件选择框 */
    triggerFileInput() {
      if (this.$refs.fileInput) {
        this.$refs.fileInput.click()
      }
    },

    /** 处理文件选择，批量添加图片 */
    async handleFileSelect(event) {
      const files = Array.from(event.target.files || [])
      event.target.value = ''
      await this.processFiles(files)
    },

    /** 拖入图片到添加按钮 */
    handleDragOver() {
      this.isDragOver = true
    },
    handleDragLeave() {
      this.isDragOver = false
    },
    handleDragOver2() {
      this.isDragOver2 = true
    },
    handleDragLeave2() {
      this.isDragOver2 = false
    },
    async handleDrop(e) {
      this.isDragOver = false
      this.isDragOver2 = false
      const files = Array.from(e.dataTransfer.files || [])
      await this.processFiles(files)
    },

    /** 批量处理待添加的图片文件 */
    async processFiles(files) {
      if (!files.length) return

      const remaining = MAX_IMAGES - this.images.length
      if (remaining <= 0) {
        showToast(`最多只能添加 ${MAX_IMAGES} 张图片`, 3000)
        return
      }
      const toAdd = files.slice(0, remaining)
      if (files.length > remaining) {
        showToast(`最多只能添加 ${MAX_IMAGES} 张图片，已忽略多余文件`, 3000)
      }

      showToast(`正在添加 ${toAdd.length} 张图片...`, 2000)
      for (const file of toAdd) {
        await this.addImage(file)
      }
      if (this.images.length > 0) {
        showToast('图片添加成功', 2000)
      }
    },

    /** 校验文件格式、大小及是否可解码 */
    async validateFile(file) {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp']
      if (!validTypes.includes(file.type)) {
        showToast(`${file.name}: 只支持 JPG/PNG/WebP/BMP 格式`, 3000)
        return false
      }
      if (file.size > MAX_FILE_SIZE) {
        showToast(`${file.name}: 图片大小不能超过 10MB`, 3000)
        return false
      }
      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          URL.revokeObjectURL(img.src)
          resolve(true)
        }
        img.onerror = () => {
          URL.revokeObjectURL(img.src)
          showToast(`${file.name}: 无法读取图片`, 3000)
          resolve(false)
        }
        img.src = URL.createObjectURL(file)
      })
    },

    /**
     * 添加单张图片
     * 1. 建立 CleanPixel 会话
     * 2. 若为当前图则加载到 canvas 并记录初始历史
     */
    async addImage(file, sourceUrl = '') {
      const valid = await this.validateFile(file)
      if (!valid) return

      const thumbUrl = URL.createObjectURL(file)
      // 单张图片的数据结构
      const imageItem = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: file.name,
        file, // 原始文件，会话过期时备用
        sourceUrl: sourceUrl || '', // 队列原始 transformUrl，写回时匹配
        sessionId: null, // CleanPixel 会话 ID
        width: 0, // 原图宽度（像素）
        height: 0, // 原图高度（像素）
        format: 'jpeg',
        thumbUrl, // 底部列表缩略图
        pendingMaskActions: [], // 已废弃，仅用于旧数据迁移
        maskCanvas: null, // 离屏蒙版栅格（唯一绘制来源）
        pendingMaskOpLog: [], // { kind:'brush'|'rect'|'erase', ... }
        pendingMaskRedoActions: [],
        history: [], // 撤销/恢复历史（dataURL 快照，仅消除成功后的画布）
        historyIndex: -1,
        zoom: 1, // 该图独立的视图缩放
        panX: 0, // 该图独立的水平平移
        panY: 0 // 该图独立的垂直平移
      }

      this.images.push(imageItem)
      const index = this.images.length - 1

      try {
        const session = await createWatermarkSession(file)
        imageItem.sessionId = session.session_id
        imageItem.width = session.width
        imageItem.height = session.height
        imageItem.format = session.format || 'jpeg'

        if (this.currentIndex < 0) {
          this.currentIndex = index
        }

        if (index === this.currentIndex) {
          await this.$nextTick()
          await this.loadImageToCanvas(imageItem)
          this.fitImageToView(true)
          await this.pushHistoryState()
        }
      } catch (err) {
        this.images.splice(index, 1)
        URL.revokeObjectURL(thumbUrl)
        showToast(`${file.name}: ${err.message || '加载失败'}`, 3000)
        if (this.currentIndex >= this.images.length) {
          this.currentIndex = this.images.length - 1
        }
      }
    },

    /** 切换当前编辑的图片，保存/恢复各自的历史；视图按当前图宽高重新适配并居中 */
    async switchImage(index) {
      if (index < 0 || index >= this.images.length || index === this.currentIndex) return
      this.saveViewState()
      this.clearOverlay()
      this.currentIndex = index
      await this.$nextTick()
      await this.restoreFromHistory()
      const img = this.currentImage
      // 非首张图添加时未写入初始快照，消除后只有一条 history 会导致无法撤销
      if (img && img.history.length === 0) {
        await this.pushHistoryState()
      } else if (img && img.historyIndex < 0 && img.history.length > 0) {
        img.historyIndex = img.history.length - 1
      }
      this.fitImageToView(true)
      this.migrateLegacyMaskData(img)
      this.rebuildMaskFromOpLog(img)
      this.redrawPendingOverlay()
    },

    /** 将当前缩放/平移状态保存到图片对象 */
    saveViewState() {
      if (!this.currentImage) return
      this.currentImage.zoom = this.zoom
      this.currentImage.panX = this.panX
      this.currentImage.panY = this.panY
    },

    /** 移除图片并清理会话与 blob URL */
    async removeImage(index) {
      const img = this.images[index]
      if (!img) return
      await deleteWatermarkSession(img.sessionId)
      URL.revokeObjectURL(img.thumbUrl)
      this.images.splice(index, 1)

      if (!this.images.length) {
        this.currentIndex = -1
        this.clearCanvases()
        return
      }

      if (index < this.currentIndex) {
        this.currentIndex--
      } else if (index === this.currentIndex) {
        this.currentIndex = Math.min(this.currentIndex, this.images.length - 1)
        await this.$nextTick()
        await this.restoreFromHistory()
        this.fitImageToView(true)
      }
    },

    // ========== Canvas 渲染 ==========

    /** 将图片缩放至适应视口，可选是否重置平移居中 */
    fitImageToView(resetPan = true) {
      const viewport = this.$refs.viewport
      const img = this.currentImage
      if (!viewport || !img || !img.width) return

      const padding = 40
      const vw = viewport.clientWidth - padding * 2
      const vh = viewport.clientHeight - padding * 2
      const scaleX = vw / img.width
      const scaleY = vh / img.height
      const fitZoom = Math.min(scaleX, scaleY, 1)

      this.zoom = Math.max(this.minZoom, +fitZoom.toFixed(2))
      if (resetPan) {
        this.panX = (viewport.clientWidth - img.width * this.zoom) / 2
        this.panY = (viewport.clientHeight - img.height * this.zoom) / 2
      }
      this.saveViewState()
    },

    /** 获取主画布与蒙版预览画布引用 */
    getCanvasRefs() {
      return {
        main: this.$refs.mainCanvas,
        overlay: this.$refs.overlayCanvas
      }
    },

    /** 按原图像素尺寸设置 canvas 宽高 */
    setupCanvasSize() {
      const img = this.currentImage
      const { main, overlay } = this.getCanvasRefs()
      if (!img || !main || !overlay) return

      main.width = img.width
      main.height = img.height
      overlay.width = img.width
      overlay.height = img.height
      this.ensureMaskCanvas(img)
      this.migrateLegacyMaskData(img)
      this.rebuildMaskFromOpLog(img)
    },

    /** 清空主画布与蒙版层 */
    clearCanvases() {
      const { main, overlay } = this.getCanvasRefs()
      if (main) {
        const ctx = main.getContext('2d')
        ctx.clearRect(0, 0, main.width, main.height)
      }
      if (overlay) {
        const ctx = overlay.getContext('2d')
        ctx.clearRect(0, 0, overlay.width, overlay.height)
      }
    },

    /** 清空蒙版预览层 */
    clearOverlay() {
      const { overlay } = this.getCanvasRefs()
      if (!overlay) return
      const ctx = overlay.getContext('2d')
      ctx.clearRect(0, 0, overlay.width, overlay.height)
    },

    /** 将原始文件绘制到主画布（首次加载） */
    async loadImageToCanvas(imageItem) {
      this.setupCanvasSize()
      const { main } = this.getCanvasRefs()
      if (!main) return

      const bitmap = await createImageBitmap(imageItem.file)
      const ctx = main.getContext('2d')
      ctx.clearRect(0, 0, main.width, main.height)
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      this.clearOverlay()
    },

    /** 从历史快照恢复主画布内容 */
    async restoreFromHistory() {
      const img = this.currentImage
      if (!img) return

      this.setupCanvasSize()
      const { main } = this.getCanvasRefs()
      if (!main) return

      const dataUrl = img.history[img.historyIndex]
      if (!dataUrl) {
        await this.loadImageToCanvas(img)
        return
      }

      await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => {
          const ctx = main.getContext('2d')
          ctx.clearRect(0, 0, main.width, main.height)
          ctx.drawImage(image, 0, 0)
          this.clearOverlay()
          resolve()
        }
        image.onerror = reject
        image.src = dataUrl
      })
    },

    /** 将当前主画布状态压入历史栈（用于撤销/恢复） */
    async pushHistoryState() {
      const img = this.currentImage
      const { main } = this.getCanvasRefs()
      if (!img || !main) return

      const dataUrl = main.toDataURL('image/png')
      const trimmed = img.history.slice(0, img.historyIndex + 1)
      trimmed.push(dataUrl)
      img.history = trimmed
      img.historyIndex = trimmed.length - 1
    },

    // ========== 坐标转换 ==========

    /**
     * 屏幕坐标 → 原图像素坐标
     * 需扣除平移并除以缩放比，保证与 API 蒙版坐标一致
     */
    screenToImage(clientX, clientY) {
      const viewport = this.$refs.viewport
      if (!viewport) return { x: 0, y: 0 }
      const rect = viewport.getBoundingClientRect()
      return {
        x: (clientX - rect.left - this.panX) / this.zoom,
        y: (clientY - rect.top - this.panY) / this.zoom
      }
    },

    /** 将坐标限制在原图范围内 */
    clampToImage(x, y) {
      const img = this.currentImage
      if (!img) return { x: 0, y: 0 }
      return {
        x: Math.max(0, Math.min(img.width, x)),
        y: Math.max(0, Math.min(img.height, y))
      }
    },

    /** 屏幕坐标是否落在当前变换后的画布区域（画笔/框选仅在此区域内开始） */
    isClientOverCanvas(clientX, clientY) {
      const wrap = this.$refs.overlayCanvas
      if (!wrap) return false
      const r = wrap.getBoundingClientRect()
      return (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      )
    },

    // ========== 画布鼠标交互 ==========

    /** 鼠标按下：移动工具开始平移，画笔/框选开始绘制 */
    onViewportMouseDown(e) {
      if (!this.hasCurrentImage || this.processing || e.button !== 0) return

      if (this.activeTool === 'move') {
        this.isPanning = true
        this.panStart = { x: e.clientX, y: e.clientY, panX: this.panX, panY: this.panY }
        return
      }

      if ((this.activeTool === 'brush' || this.activeTool === 'rect' || this.activeTool === 'eraser') && !this.isClientOverCanvas(e.clientX, e.clientY)) {
        return
      }

      const coords = this.screenToImage(e.clientX, e.clientY)
      const point = this.clampToImage(coords.x, coords.y)

      if (this.activeTool === 'brush' || this.activeTool === 'eraser') {
        this.isDrawing = true
        this.strokePoints = [[Math.round(point.x), Math.round(point.y)]]
        this.drawBrushPreview()
      } else if (this.activeTool === 'rect') {
        this.isDrawing = true
        this.rectStart = point
        this.rectCurrent = point
        this.drawRectPreview()
      }
    },

    /** 更新画笔涂抹范围圆环位置（视口坐标，仅在画布区域内显示） */
    updateBrushPreviewPosition(e) {
      if ((this.activeTool !== 'brush' && this.activeTool !== 'eraser') || !this.hasCurrentImage || this.processing) {
        this.brushPreviewVisible = false
        return
      }
      if (!this.isClientOverCanvas(e.clientX, e.clientY)) {
        this.brushPreviewVisible = false
        return
      }
      const viewport = this.$refs.viewport
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      this.brushPreviewX = e.clientX - rect.left
      this.brushPreviewY = e.clientY - rect.top
      this.brushPreviewVisible = true
    },

    onCanvasWrapperMouseEnter(e) {
      this.updateBrushPreviewPosition(e)
    },

    onCanvasWrapperMouseLeave() {
      if (this.activeTool === 'brush' || this.activeTool === 'eraser') {
        this.brushPreviewVisible = false
      }
    },

    /** 鼠标移动：更新平移或绘制预览 */
    onViewportMouseMove(e) {
      if (!this.hasCurrentImage) return

      if (this.activeTool === 'brush' || this.activeTool === 'eraser') {
        this.updateBrushPreviewPosition(e)
      }

      if (this.isPanning && this.panStart) {
        this.panX = this.panStart.panX + (e.clientX - this.panStart.x)
        this.panY = this.panStart.panY + (e.clientY - this.panStart.y)
        return
      }

      if (!this.isDrawing) return

      const coords = this.screenToImage(e.clientX, e.clientY)
      const point = this.clampToImage(coords.x, coords.y)

      if (this.activeTool === 'brush' || this.activeTool === 'eraser') {
        const last = this.strokePoints[this.strokePoints.length - 1]
        const dx = point.x - last[0]
        const dy = point.y - last[1]
        if (Math.sqrt(dx * dx + dy * dy) >= 2) {
          this.strokePoints.push([Math.round(point.x), Math.round(point.y)])
          this.drawBrushPreview()
        }
      } else if (this.activeTool === 'rect') {
        this.rectCurrent = point
        this.drawRectPreview()
      }
    },

    /** 鼠标松开：结束平移，或将笔刷/框选加入待提交队列 */
    onViewportMouseUp() {
      if (this.isPanning) {
        this.isPanning = false
        this.panStart = null
        this.saveViewState()
        return
      }

      if (!this.isDrawing) return
      this.isDrawing = false

      if (this.activeTool === 'brush') {
        const points = this.strokePoints
        this.strokePoints = []
        if (points.length < 1) {
          this.redrawPendingOverlay()
          return
        }
        this.commitMaskOp({ kind: 'brush', points, radius: this.brushSize })
      } else if (this.activeTool === 'eraser') {
        const points = this.strokePoints
        this.strokePoints = []
        if (points.length < 1) {
          this.redrawPendingOverlay()
          return
        }
        this.commitMaskOp({ kind: 'erase', points, radius: this.brushSize })
      } else if (this.activeTool === 'rect') {
        const start = this.rectStart
        const end = this.rectCurrent
        this.rectStart = null
        this.rectCurrent = null
        if (!start || !end) {
          this.redrawPendingOverlay()
          return
        }
        const x = Math.round(Math.min(start.x, end.x))
        const y = Math.round(Math.min(start.y, end.y))
        const w = Math.round(Math.abs(end.x - start.x))
        const h = Math.round(Math.abs(end.y - start.y))
        if (w < 2 || h < 2) {
          this.redrawPendingOverlay()
          return
        }
        this.commitMaskOp({ kind: 'rect', rect: [x, y, w, h] })
      }
    },

    /** 鼠标离开视口：结束未完成的交互 */
    onViewportMouseLeave() {
      this.brushPreviewVisible = false
      if (this.isPanning) {
        this.isPanning = false
        this.panStart = null
        this.saveViewState()
      }
      if (this.isDrawing) {
        this.onViewportMouseUp()
      }
    },

    // ========== 待提交蒙版预览与撤销 / 恢复 ==========

    /**
     * 由蒙版栅格单次着色到 overlay（固定半透明，重叠区域不加深）
     * 拖拽中在临时画布上叠加当前笔划/擦除/框选预览
     */
    redrawPendingOverlay() {
      const { overlay } = this.getCanvasRefs()
      const img = this.currentImage
      if (!overlay || !img) return

      this.migrateLegacyMaskData(img)
      this.ensureMaskCanvas(img)

      if (!this.maskPreviewCanvas) {
        this.maskPreviewCanvas = document.createElement('canvas')
      }
      const preview = this.maskPreviewCanvas
      preview.width = img.width
      preview.height = img.height
      const pCtx = preview.getContext('2d')
      pCtx.clearRect(0, 0, preview.width, preview.height)

      if (img.maskCanvas) {
        pCtx.drawImage(img.maskCanvas, 0, 0)
      }

      if (this.isDrawing && this.activeTool === 'brush' && this.strokePoints.length) {
        drawBrushOnMask(pCtx, this.strokePoints, this.brushSize)
      } else if (this.isDrawing && this.activeTool === 'eraser' && this.strokePoints.length) {
        eraseOnMask(pCtx, this.strokePoints, this.brushSize)
      } else if (this.isDrawing && this.activeTool === 'rect' && this.rectStart && this.rectCurrent) {
        const x = Math.min(this.rectStart.x, this.rectCurrent.x)
        const y = Math.min(this.rectStart.y, this.rectCurrent.y)
        const w = Math.abs(this.rectCurrent.x - this.rectStart.x)
        const h = Math.abs(this.rectCurrent.y - this.rectStart.y)
        drawRectOnMask(pCtx, [x, y, w, h])
      }

      const ctx = overlay.getContext('2d')
      ctx.clearRect(0, 0, overlay.width, overlay.height)
      ctx.drawImage(preview, 0, 0)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = 'rgba(236, 72, 153, 0.6)'
      ctx.fillRect(0, 0, overlay.width, overlay.height)
      ctx.globalCompositeOperation = 'source-over'
    },

    /** 笔刷移动时刷新预览（委托给 redrawPendingOverlay） */
    drawBrushPreview() {
      this.redrawPendingOverlay()
    },

    /** 框选拖拽时刷新预览 */
    drawRectPreview() {
      this.redrawPendingOverlay()
    },

    /** 取消进行中的绘制，避免撤销/恢复与半截笔划状态冲突 */
    cancelActiveStroke() {
      this.isDrawing = false
      this.strokePoints = []
      this.rectStart = null
      this.rectCurrent = null
    },

    /** 撤销上一步待提交涂抹或框选（一步对应一次完整 mouseUp） */
    handleUndoPendingMask() {
      if (!this.canUndoPendingMask) return
      const img = this.currentImage
      this.cancelActiveStroke()
      if (!img.pendingMaskOpLog || !img.pendingMaskOpLog.length) return
      if (!img.pendingMaskRedoActions) img.pendingMaskRedoActions = []
      const entry = img.pendingMaskOpLog.pop()
      img.pendingMaskRedoActions.push(entry)
      this.rebuildMaskFromOpLog(img)
      this.redrawPendingOverlay()
    },

    /** 恢复上一步被撤销的待提交涂抹 */
    handleRedoPendingMask() {
      if (!this.canRedoPendingMask) return
      const img = this.currentImage
      this.cancelActiveStroke()
      const entry = img.pendingMaskRedoActions.pop()
      if (!img.pendingMaskOpLog) img.pendingMaskOpLog = []
      img.pendingMaskOpLog.push(entry)
      this.rebuildMaskFromOpLog(img)
      this.redrawPendingOverlay()
    },

    /**
     * 点击「开始消除」：从 maskCanvas 按行 RLE 切段提交，成功后清空待提交栈
     */
    async handleStartInpaint() {
      const img = this.currentImage
      if (!img || !img.sessionId || !this.canStartInpaint) return

      this.migrateLegacyMaskData(img)
      const strokes = this.exportMaskPayloadForSubmit(img)
      if (!strokes.length) return

      this.processing = true
      try {
        await this.doInpaint({ type: 'brush', strokes })
        this.clearMaskForImage(img)
        this.clearOverlay()
        showToast('消除完成', 2000)
      } catch (err) {
        // 失败时保留待提交蒙版，便于用户调整后重试
        showToast(err.message || '修图失败', 3000)
        this.redrawPendingOverlay()
      } finally {
        this.processing = false
      }
    },

    /**
     * 会话过期时导出整图用于重建会话
     * 优先用历史快照（与 img.width/height 一致），避免 canvas 内部尺寸异常时导出 patch 级小图
     */
    async getRecoveryFile() {
      const img = this.currentImage
      if (!img) return null

      const historyDataUrl = img.historyIndex >= 0 ? img.history[img.historyIndex] : null
      if (historyDataUrl) {
        const blob = await fetch(historyDataUrl).then((r) => r.blob())
        return new File([blob], img.name, { type: blob.type || 'image/png' })
      }

      const { main } = this.getCanvasRefs()
      if (main) {
        // canvas 像素尺寸与元数据不一致时先对齐并恢复，防止 toBlob 导出非全图
        if (main.width !== img.width || main.height !== img.height) {
          this.setupCanvasSize()
          await this.restoreFromHistory()
        }
        const blob = await new Promise((resolve) => main.toBlob(resolve, 'image/png'))
        return new File([blob], img.name, { type: 'image/png' })
      }

      return img.file || null
    },

    /**
     * 单次修图请求：贴回 patch、写入画布历史
     * 由 handleStartInpaint 统一包 processing，此处不再重复设 processing
     */
    async doInpaint(mask) {
      const img = this.currentImage
      if (!img) return

      const result = await inpaintWatermark(img.sessionId, mask, () => this.getRecoveryFile())
      if (result.session) {
        const prevW = img.width
        const prevH = img.height
        img.sessionId = result.session.session_id
        img.width = result.session.width
        img.height = result.session.height
        img.format = result.session.format || img.format
        const sizeChanged = prevW !== img.width || prevH !== img.height
        // 尺寸未变时不重置 canvas，避免清空已有全图后只剩 patch
        if (sizeChanged) {
          this.setupCanvasSize()
          await this.restoreFromHistory()
        }
      }
      await this.applyPatch(result.blob, result.bbox)
      await this.pushHistoryState()
      this.updateThumbFromCanvas()
    },

    /** 将接口返回的 patch 按 bbox 贴回主画布 */
    async applyPatch(blob, bbox) {
      const { main } = this.getCanvasRefs()
      if (!main) return

      const url = URL.createObjectURL(blob)
      await new Promise((resolve, reject) => {
        const patchImg = new Image()
        patchImg.onload = () => {
          const ctx = main.getContext('2d')
          ctx.drawImage(patchImg, bbox.x, bbox.y)
          URL.revokeObjectURL(url)
          resolve()
        }
        patchImg.onerror = reject
        patchImg.src = url
      })
    },

    /** 修图后更新底部缩略图 */
    updateThumbFromCanvas() {
      const img = this.currentImage
      const { main } = this.getCanvasRefs()
      if (!img || !main) return
      const newThumb = main.toDataURL('image/jpeg', 0.6)
      if (img.thumbUrl && img.thumbUrl.startsWith('blob:')) {
        URL.revokeObjectURL(img.thumbUrl)
      }
      img.thumbUrl = newThumb
    },

    // ========== 撤销 / 恢复 ==========

    /** 撤销一步 */
    async handleUndo() {
      if (!this.canUndo) return
      const img = this.currentImage
      img.historyIndex--
      await this.restoreFromHistory()
      this.clearMaskForImage(img)
    },

    /** 恢复一步 */
    async handleRedo() {
      if (!this.canRedo) return
      const img = this.currentImage
      img.historyIndex++
      await this.restoreFromHistory()
      this.clearMaskForImage(img)
    },

    // ========== 下载 ==========

    /** 下载当前正在编辑的图片 */
    handleDownloadCurrent() {
      const img = this.currentImage
      const { main } = this.getCanvasRefs()
      if (!img || !main) return

      main.toBlob((blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = this.getDownloadName(img.name)
        link.click()
        URL.revokeObjectURL(url)
      }, 'image/png')
    },

    /** 依次下载全部图片（未编辑下原图，已编辑下历史最新快照） */
    async handleDownloadAll() {
      for (let i = 0; i < this.images.length; i++) {
        await this.downloadImageByIndex(i)
        await this.delay(300)
      }
    },

    /** 触发浏览器下载，统一释放 object URL */
    triggerDownloadBlob(blob, fileName) {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = this.getDownloadName(fileName)
      link.click()
      URL.revokeObjectURL(url)
    },

    /** 将 Image 绘制到离屏 canvas 并导出 PNG */
    exportImageElementToBlob(image, width, height) {
      return new Promise((resolve) => {
        const canvas = document.createElement('canvas')
        canvas.width = width || image.naturalWidth
        canvas.height = height || image.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(image, 0, 0)
        canvas.toBlob((blob) => resolve(blob), 'image/png')
      })
    },

    /**
     * 按索引下载：有消除历史取栈顶快照，否则下载原 file
     * 与「下载当前」区分：批量下载始终取最新编辑结果
     */
    downloadImageByIndex(index) {
      const img = this.images[index]
      if (!img) return Promise.resolve()

      if (img.history.length > 0) {
        const dataUrl = img.history[img.history.length - 1]
        return new Promise((resolve) => {
          const image = new Image()
          image.onload = async () => {
            const blob = await this.exportImageElementToBlob(image, img.width, img.height)
            this.triggerDownloadBlob(blob, img.name)
            resolve()
          }
          image.onerror = () => resolve()
          image.src = dataUrl
        })
      }

      if (!img.file) return Promise.resolve()

      return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(img.file)
        const image = new Image()
        image.onload = async () => {
          URL.revokeObjectURL(objectUrl)
          const blob = await this.exportImageElementToBlob(image, img.width, img.height)
          this.triggerDownloadBlob(blob, img.name)
          resolve()
        }
        image.onerror = () => {
          URL.revokeObjectURL(objectUrl)
          resolve()
        }
        image.src = objectUrl
      })
    },

    /** 生成下载文件名 */
    getDownloadName(name) {
      const base = name.replace(/\.[^.]+$/, '')
      return `${base}_去水印.png`
    },

    /** 延迟工具，批量下载时避免浏览器拦截 */
    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    },

    // ========== 资源清理 ==========

    // 清空图片
    handleDeleteAllImages() {
      if (!this.images.length) return
      messageBoxConfirm('确定要清空所有图片吗？')
        .then(() => {
          this.isDeleting = true
          this.closeSessions().then(async () => {
            await this.resetEditor()
            showToast('已清空所有图片', 2000)
            this.isDeleting = false
          }).catch(() => {
            this.isDeleting = false
          })
        })
        .catch(() => {})
    },

    /** 页面销毁时删除所有 CleanPixel 会话 */
    async closeSessions() {
      const tasks = this.images.map((img) => deleteWatermarkSession(img.sessionId))
      await Promise.all(tasks)
    },

    /** 释放所有 blob 类型的缩略图 URL */
    revokeAllUrls() {
      this.images.forEach((img) => {
        if (img.thumbUrl && img.thumbUrl.startsWith('blob:')) {
          URL.revokeObjectURL(img.thumbUrl)
        }
      })
    }
  }
}
</script>

<style lang="scss" scoped>
/* 页面整体布局 */
.remove-watermark-page {
  padding: 72px 24px 20px;
  background: linear-gradient(135deg, #f5f7fa 0%, #f0f4f8 100%);
  min-height: calc(100vh - 84px);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;

  &.is_embedded {
    padding: 12px 16px 16px;
    min-height: 0;
    height: 100%;
  }
}

.exit_editor_actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 4px;
}

.exit_editor_btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  background: #fff;
  color: #606266;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;

  &:hover:not(:disabled) {
    background: #f5f7fa;
    color: #409eff;
    border-color: #c6e2ff;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }
}

.exit_editor_btn_save {
  border-color: #409eff;
  background: #409eff;
  color: #fff;

  &:hover:not(:disabled) {
    background: #66b1ff;
    border-color: #66b1ff;
    color: #fff;
  }
}

.exit_editor_btn_loading {
  font-size: 14px;
  animation: exit_editor_spin 1s linear infinite;
}

@keyframes exit_editor_spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.page-body {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

/* 左侧工具栏 */
.left-toolbar {
  width: 72px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  padding: 16px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  .tool-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .tool-btn {
    width: 48px;
    height: 48px;
    border: none;
    border-radius: 12px;
    background: #eff6ff;
    color: #3b82f6;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    margin: 0 auto;

    svg {
      fill: #3b82f6;
    }

    &:hover {
      background: #dbeafe;
      transform: translateY(-1px);
    }

    &.active {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: #fff;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);

      svg {
        fill: #ffffff;
      }
    }
  }

  .toolbar-divider {
    width: 32px;
    height: 1px;
    background: #e5e7eb;
  }

  .brush-size-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;

    .brush-size-label {
      color: #3b82f6;
      font-size: 11px;
      font-weight: 600;
      line-height: 20px;
    }

    .brush-size-controls {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;

      .size-btn {
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 8px;
        background: #eff6ff;
        color: #3b82f6;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;

        &:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        &:not(:disabled):hover {
          background: #dbeafe;
        }
      }

      .size-value {
        width: 40px;
        height: 32px;
        border: 1px solid #bfdbfe;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 600;
        color: #2563eb;
        background: #fff;
      }
    }

    .brush_slider {
      width: 100%;
      padding: 0 4px;
      margin: 8px 0;
      height: 4px;
      accent-color: #3b82f6;
      cursor: pointer;
    }
  }

  .toolbar-spacer {
    flex: 1;
    min-height: 12px;
  }
}

/* 右侧操作区 */
.right-workspace {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 8px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
    color: #374151;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;

    i {
      font-size: 15px;
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &:not(:disabled):hover {
      background: #f3f4f6;
    }

    &.primary {
      color: #3b82f6;
    }

    &.success {
      color: #16a34a;
    }

    &.delete_btn {
      margin: 0 26px 0 auto;
      color: #F02E2E;
    }

    /* 主操作：提交待消除区域 */
    &.inpaint_btn {
      position: relative;
      padding: 8px 18px;
      font-weight: 600;
      border: none;
      color: #fff;
      background: linear-gradient(135deg, #f472b6 0%, #ec4899 45%, #db2777 100%);
      box-shadow: 0 2px 8px rgba(236, 72, 153, 0.35);

      i {
        font-size: 16px;
      }

      &:not(:disabled):hover {
        background: linear-gradient(135deg, #f9a8d4 0%, #f472b6 45%, #ec4899 100%);
        box-shadow: 0 4px 14px rgba(236, 72, 153, 0.45);
      }

      &:not(:disabled):active {
        box-shadow: 0 2px 6px rgba(236, 72, 153, 0.3);
      }

      /* 有待提交蒙版时显示动效 */
      &.has_pending:not(:disabled) {
        animation: inpaint_pulse 2s ease-in-out infinite;
      }

      .xianmian_svg {
        position: absolute;
        top: -14px;
        right: -6px;
      }
    }
  }

  // 添加图片
  .add-image-btn {
    flex-shrink: 0;
    box-sizing: border-box;
    width: 88px;
    height: 88px;
    padding: 0;
    margin: 0;
    border: 1px dashed #93c5fd;
    border-radius: 10px;
    background: #f0f9ff;
    color: #2563eb;
    font-size: 11px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.2s ease;

    &.add-image-btn2 {
      width: 40%;
      height: 400px;
      padding: 0 20px;
      gap: 20px;

      span {
        font-size: 18px;
        font-weight: 600;
      }

      span:last-child {
        margin-top: -10px;
        color: #999999;
        font-size: 14px;
        font-weight: 400;
      }
    }

    i {
      font-size: 28px;
    }

    &:hover {
      background: #dbeafe;
      border-color: #3b82f6;
    }

    &.is-dragover {
      background: #dbeafe;
      border-color: #3b82f6;
      border-style: solid;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }
  }
}

.workspace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #f3f4f6;
  flex-shrink: 0;
  gap: 12px;
  flex-wrap: wrap;

  .header-info {
    display: flex;
    align-items: center;
    gap: 12px;

    .workspace-title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #111827;
    }

    .image-counter {
      font-size: 13px;
      color: #6b7280;
      background: #f3f4f6;
      padding: 2px 10px;
      border-radius: 12px;
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
}

/* 开始消除按钮：有待提交时的呼吸阴影 */
@keyframes inpaint_pulse {

  0%,
  100% {
    box-shadow: 0 2px 8px rgba(236, 72, 153, 0.35);
  }

  50% {
    box-shadow: 0 4px 18px rgba(236, 72, 153, 0.55);
  }
}

/* Canvas 绘制视口 */
.canvas-viewport {
  position: relative;
  flex: 1;
  min-height: 320px;
  background: #f8fafc;
  overflow: hidden;
  cursor: default;

  &.is-stroking:not(.is_brush_tool) {
    cursor: crosshair;
  }

  &.is_brush_tool {
    .canvas-wrapper.is-draw-surface {
      cursor: inherit;
    }
  }

  &.is_eraser_tool {
    .canvas-wrapper.is-draw-surface {
      cursor: crosshair;
    }
  }

  .brush_preview_ring {
    position: absolute;
    pointer-events: none;
    z-index: 6;
    box-sizing: border-box;
    border: 2px solid rgba(219, 39, 119, 0.9);
    border-radius: 50%;
    background: rgba(236, 72, 153, 0.5);

    &.eraser_preview_ring {
      border-style: dashed;
      border-color: rgba(100, 116, 139, 0.95);
      background: rgba(255, 255, 255, 0.35);
    }
  }

  &.is-move {
    cursor: grab;

    &.is-panning {
      cursor: grabbing;
    }
  }

  .canvas-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    gap: 12px;

    i {
      font-size: 56px;
      opacity: 0.5;
    }

    p {
      margin: 0;
      font-size: 14px;
    }
  }

  .canvas_empty_loading {
    color: #3b82f6;
    font-size: 14px;
    i {
      font-size: 32px;
      opacity: 1;
      animation: exit_editor_spin 1s linear infinite;
    }
  }

  .canvas-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;

    &.is-draw-surface {
      cursor: crosshair;
    }
  }

  .main-canvas,
  .overlay-canvas {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
  }

  .overlay-canvas {
    pointer-events: none;
  }

  .nav-btn {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.85);
    color: #374151;
    font-size: 20px;
    cursor: pointer;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      background: #fff;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    }

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    &.nav-prev {
      left: 16px;
    }

    &.nav-next {
      right: 16px;
    }
  }

  /* 画布左下：待提交蒙版逐步撤销/恢复 */
  .mask_undo_controls {
    position: absolute;
    right: 40px;
    bottom: 16px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px;
    background: rgba(255, 255, 255, 0.92);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

    .mask_undo_btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border: 1px solid #fce7f3;
      border-radius: 6px;
      background: #fff;
      color: #9d174d;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;

      i {
        font-size: 14px;
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      &:not(:disabled):hover {
        background: #fdf2f8;
        border-color: #f9a8d4;
        color: #db2777;
      }
    }
  }

  .zoom-controls {
    position: absolute;
    left: 16px;
    bottom: 16px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 255, 255, 0.92);
    border-radius: 8px;
    padding: 4px 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

    .zoom-btn {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: #f3f4f6;
      color: #374151;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      &:not(:disabled):hover {
        background: #e5e7eb;
      }
    }

    .zoom-value {
      min-width: 44px;
      text-align: center;
      font-size: 12px;
      font-weight: 600;
      color: #374151;
    }
  }
}

.picture-list-section {
  /* 底部图片列表：横向滚动 */
  flex-shrink: 0;
  border-top: 1px solid #f3f4f6;
  padding: 12px 16px 16px;

  .list-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;

    .list-title {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
    }

    .list-badge {
      background: #3b82f6;
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 1px 8px;
      border-radius: 10px;
    }
  }

  .picture-list {
    box-sizing: content-box !important;
    display: flex;
    gap: 10px;
    height: 88px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 6px;

    &::-webkit-scrollbar {
      height: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }
  }

  .thumb-item {
    position: relative;
    flex-shrink: 0;
    box-sizing: border-box;
    width: 88px;
    height: 88px;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid #dddddd;
    cursor: pointer;
    transition: all 0.2s ease;

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    .thumb-index {
      position: absolute;
      top: 4px;
      left: 4px;
      background: rgba(0, 0, 0, 0.55);
      color: #fff;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 8px;
      z-index: 1;
    }

    .thumb-remove {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 18px;
      height: 18px;
      border: none;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.55);
      color: #fff;
      font-size: 10px;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1;
    }

    &:hover .thumb-remove {
      display: flex;
    }

    &.active {
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);

      .thumb-index {
        background: #3b82f6;
      }
    }
  }

  .list-empty {
    color: #9ca3af;
    font-size: 13px;
    padding: 24px 0;
    width: 100%;
    text-align: center;
  }
}

// 处理中遮罩
.processing-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgba(255, 255, 255, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #3b82f6;
  font-size: 14px;
  backdrop-filter: blur(2px);

  i {
    font-size: 32px;
  }
}

/* 响应式适配 */
@media (max-width: 1024px) {
  .page-body {
    flex-direction: column;
  }

  .left-toolbar {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    padding: 12px 16px;

    .tool-group {
      flex-direction: row;
    }

    .brush-size-section {
      flex-direction: row;
      flex: 1;
      min-width: 200px;

      .brush-size-label {
        writing-mode: horizontal-tb;
        letter-spacing: 0;
      }

      .brush-size-controls {
        flex-direction: row;
      }

      .brush_slider {
        flex: 1;
        max-width: 160px;
      }
    }

    .toolbar-divider {
      width: 1px;
      height: 40px;
    }

    .toolbar-spacer {
      display: none;
    }
  }

  .canvas-viewport {
    min-height: 280px;
  }
}

@media (max-width: 640px) {
  .remove-watermark-page {
    padding: 72px 12px 12px;
  }

  .right-workspace {
    .header-actions {
      width: 100%;
    }

    .action-btn span {
      display: none;
    }
  }
}
</style>
