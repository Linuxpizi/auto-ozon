export type SourcePlatformKey =
  | '1688'
  | 'taobao'
  | 'pddPifa'
  | 'pdd'
  | 'amazon'
  | 'aliexpress'
  | 'wildberries'
  | 'temu'

export interface SourcePlatform {
  key: SourcePlatformKey
  platformType: number
  label: string
  supportsAI: boolean
  usesBridge: boolean
  isDetailPage(): boolean
}

export interface CollectGoodData {
  platformType: number
  orderUrl: string
  title: string
  mainImage: string
  images: string
  videos: string | null
  description?: string
  goodsSkuList?: string
  priceList?: string
  fileListBt?: string
  variantCollection?: string
  features?: string
  richTextList?: string[]
  [key: string]: unknown
}