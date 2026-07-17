import type {
  AiAutoSelectAiStepConfig,
  ListingPriceAdjustConfig,
} from '../aiAutoSelect/types'

export interface UserSystemSettingsPayload {
  aiStep: AiAutoSelectAiStepConfig
  categoryPreference: string
  deepThinkEnabled: boolean
  maxVariantExecutionCount: number
  fullAutoAiStep: AiAutoSelectAiStepConfig
  fullAutoMaxVariantExecutionCount: number
  listingPriceAdjust?: ListingPriceAdjustConfig
}