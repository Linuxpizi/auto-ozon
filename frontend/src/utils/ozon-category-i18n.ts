/**
 * Ozon top-level category EN → CN translation map.
 * Ozon API does NOT support Chinese natively (language=ZH returns Russian).
 * We fetch with language=EN and translate top-level categories client-side.
 */

const CATEGORY_EN_TO_CN: Record<string, string> = {
  "Antiques & Collectibles": "古董与收藏",
  "Construction & Renovation": "建材与装修",
  "Smoking Products & Accessories": "烟草与配件",
  "Pharmacy": "保健品与药品",
  "Books": "图书",
  "Food Products": "食品",
  "Kids Products": "母婴用品",
  "Adult Products": "成人用品",
  "Home Appliances": "家居电器",
  "Haberdashery & Accessories": "服饰配件",
  "Hobbies & Creative Activities": "爱好与创意",
  "Beauty & Hygiene": "美妆与个护",
  "Footwear": "鞋靴",
  "Car Products": "汽车用品",
  "House & Garden": "家居与花园",
  "Sport & Recreation": "运动与休闲",
  "Stationery": "文具",
  "Pet Products": "宠物用品",
  "Movies, Music, Video Games, Software": "影视游戏与软件",
  "Farming": "农业用品",
  "Musical Instruments": "乐器",
  "Clothing": "服装",
  "Furniture": "家具",
  "Household Chemicals": "日用化学品",
  "Electronics": "电子产品",
};

/** Translate an EN category name to CN if a mapping exists. */
export function translateCategoryName(enName: string): string {
  return CATEGORY_EN_TO_CN[enName.trim()] || enName;
}

/** Recursively translate all category_name fields in a tree from EN to CN. */
export function translateCategoryTree(nodes: any[]): any[] {
  return nodes.map((node) => {
    const translated = { ...node };
    if (translated.category_name) {
      translated.category_name = translateCategoryName(translated.category_name);
    }
    if (translated.children && translated.children.length > 0) {
      translated.children = translateCategoryTree(translated.children);
    }
    return translated;
  });
}
