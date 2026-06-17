# 主要功能介绍

## 开发要求

1. 前端
   1. 使用 Vue3，Pinia，Vue Router 框架
   2. [UI](https://www.naiveui.com/zh-CN/os-theme)
2. 后端
   1. 使用 FastAPI
   2. 数据持久话使用 SQLite
   3. [数据库操作 ORM](https://www.sqlalchemy.org/)
3. [Ozon 开放 API](https://docs.ozon.ru/api/seller/zh/?__rr=1&abt_att=1&origin_referer=docs.ozon.com)

## [产品功能介绍](./docs/Ozon%20UI%20总体设计.md)

## 补充说明

1. 什么是质检单?
   1. 0213 开头的订单编号是常见的质检单标识
   2. 0209 开头的订单编号也被确定为质检单
   3. 0247 开头的订单编号同样属于质检单范畴
   4. 0231 开头的订单编号也被识别为质检单

## 项目结构

- backend/
- frontend/

## 初始化与运行

1. 后端：
   - 进入 `backend`
   - 安装依赖：`pip install -r requirements.txt`
   - 启动服务：`uvicorn app.main:app --reload --host 0.0.0.0 --port 9000`
2. 前端：
   - 进入 `frontend`
   - 安装依赖：`npm install`
   - 启动开发服务器：`npm run dev`

前端页面已实现：仪表盘、店铺管理、订单管理、店铺流水四个功能页面；后端接口支持店铺查询、新增、订单列表和仪表盘汇总。