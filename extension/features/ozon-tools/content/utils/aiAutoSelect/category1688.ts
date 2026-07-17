import categoryTreeJson from './1688CategoryTree.json'

export type Category1688Section = {
  title: string
  items: string[]
}

export type Category1688Group = {
  id: string
  mains: string[]
  sections: Category1688Section[]
}

/** 从 1688 全类目 HTML 解析的类目树（10 组主类目 + 二级/三级子类目） */
export const CATEGORY_1688_TREE = categoryTreeJson as Category1688Group[]
