import {
  isCardFieldEnabled,
  needsCardFollowApi,
} from './cardFieldStore'
import { loadCardExtraData, needsCardShopsApi } from '../ozonList/loadCardExtraData'
import { loadCardFollowData } from '../ozonList/loadCardFollowData'
import { loadSkuData } from '../ozonList/loadSkuData'
import { handleSkuLoadRestriction } from '../ozonList/freeMemberCard'
import { cacheSkuData } from '../ozonList/skuDataCache'
import { fillCardWithData, markCardFillFailed } from '../ozonList/skuCardRenderer'
import { applySelectionTagForCard, setCardGoodsData } from '../ozonSelectionRules'

function isPlaceholderText(text: string): boolean {
  const t = text.trim()
  return !t || t.includes('加载中') || t === '--'
}

/** 偏好加载/保存后，为已贴卡片补拉因按需跳过或竞态而缺失的数据 */
export function refreshCardsDataByFieldConfig(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.mjgd_ozon_sku_card').forEach((card) => {
    const sku = card.dataset.sku || ''
    if (!sku) return

    if (isCardFieldEnabled('article')) {
      const articleText = card.querySelector('.mjgd_ozon_field_article')?.textContent?.trim() || ''
      const needsSku = !card.classList.contains('is_loaded') || isPlaceholderText(articleText)
      if (needsSku) {
        void (async () => {
          try {
            const data = await loadSkuData(sku)
            if (!card.isConnected) return
            cacheSkuData(sku, data)
            fillCardWithData(card, data)
            setCardGoodsData(card, data)
            applySelectionTagForCard(card)
          } catch (e) {
            if (handleSkuLoadRestriction(card, e)) return
            markCardFillFailed(card)
          }
        })()
      }
    }

    if (needsCardFollowApi()) {
      const gnumberText = card.querySelector('.mjgd_ozon_field_gnumber')?.textContent?.trim() || ''
      if (gnumberText.includes('加载中')) {
        void loadCardFollowData(card, sku).catch(() => {})
      }
    }

    if (needsCardShopsApi(card) && card.dataset.shopsLoaded !== '1') {
      const dimsText = card.querySelector('.mjgd_ozon_field_packaging')?.textContent?.trim() || ''
      if (isPlaceholderText(dimsText)) {
        void loadCardExtraData(card, sku).catch(() => {})
      }
    }
  })
}
