/**
 * 巡查跟卖：对齐 ozon_old/src/ozon/ozon/crawler.js window.onload 内 page_changed / ac=getprice 逻辑（原样移植）。
 * 独立轻量脚本 + document_idle 注入，避免被 index.ts 大包拖过 load 时机。
 */
;(function () {
  const hostname = String(window.location.hostname || '').toLowerCase()
  if (hostname === 'seller.ozon.ru') return
  if (!/(^|\.)ozon\.ru$/i.test(hostname) && !/(^|\.)ozon\.kz$/i.test(hostname)) return

  const url = window.location.href

  window.onload = function () {
    //判断是否是数据页面，存储缓存
    if (url.indexOf('page_changed') != -1) {
      // console.log("当前页面正确！获取被跟数量");

      // 获取<body>标签下的第一个<div>元素
      var firstDiv = document.querySelector('body > pre:first-child')
      // 检查是否找到了元素
      // 检查是否找到了元素
      if (firstDiv) {
        // 获取并打印这个<div>的文本内容
        // 解析JSON字符串为JavaScript对象
        var jsonObject = JSON.parse((firstDiv as HTMLElement).innerText)

        // 检查 widgetStates 是否存在
        if (jsonObject.widgetStates) {
          // 获取 widgetStates 的第一个键名
          var webSellerKeys = Object.keys(jsonObject.widgetStates).filter(function (key) { return key.startsWith('webSellerList') })
          // 获取第一个匹配的键
          var firstKey = webSellerKeys.length > 0 ? webSellerKeys[0] : null
          if (firstKey) {
            // 检查对应的值是否存在
            if (jsonObject.widgetStates[firstKey] != null) {
              // 解析并发送消息
              var sellersData = JSON.parse(jsonObject.widgetStates[firstKey]).sellers
              window.opener.postMessage({ type: 'sellers', text: JSON.stringify(sellersData) }, '*')
            } else {
              window.opener.postMessage({ type: 'sellers', text: '空' }, '*')
            }
          } else {
            console.log('widgetStates 中没有找到键名')
            window.opener.postMessage({ type: 'sellers', text: '空' }, '*')
          }
        } else {
          console.log('JSON 对象中没有找到 widgetStates')
          window.opener.postMessage({ type: 'sellers', text: '空' }, '*')
        }
      } else {
        console.log('没有找到<body>下的第一个<pre>元素')
        window.opener.postMessage({ type: 'sellers', text: '空' }, '*')
      }
    }
    if (url.indexOf('ac=getprice') != -1 || url.indexOf('deny_category_prediction') != -1) {
      // console.log("当前页面正确！获取价格");
      // 获取<body>标签下的第一个<div>元素
      var firstDiv2 = document.querySelector('body > pre:first-child')
      // 检查是否找到了元素
      if (firstDiv2) {
        // 获取并打印这个<div>的文本内容 firstDiv.innerText
        // 解析JSON字符串为JavaScript对象
        var jsonObject2 = JSON.parse((firstDiv2 as HTMLElement).innerText)
        // console.log(jsonObject.widgetStates['webPrice-3121879-default-1'])
        if (jsonObject2.widgetStates['webPrice-3121879-default-1'] != null) {
          // console.log(JSON.parse(jsonObject.widgetStates['webPrice-3121879-default-1']));
          // localStorage.setItem("sellersData",JSON.stringify(JSON.parse(jsonObject.widgetStates['webSellerList-711858-pdpPage2column-2']).sellers));
          // 假设你要向https://example.com发送消息
          window.opener.postMessage({ type: 'getprice', text: jsonObject2.widgetStates['webPrice-3121879-default-1'] }, '*')
          // console.log("消息发送，完成！");
        } else {
          // localStorage.setItem("sellersData",JSON.stringify(JSON.parse(jsonObject.widgetStates['webSellerList-711858-pdpPage2column-2']).sellers));
          // 假设你要向https://example.com发送消息
          window.opener.postMessage({ type: 'getprice', text: '空' }, '*')
          // console.log("消息发送，完成！");
        }
      } else {
        // console.log('没有找到<body>下的第一个<div>元素');
        window.opener.postMessage({ type: 'getprice', text: '空' }, '*')
      }
    }
  }
})()
