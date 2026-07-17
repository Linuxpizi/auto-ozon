export {
  isHeadlessPipelineActive,
  recoverAutoSelectItemAiFill,
  runAutoSelectItemAiFill,
} from './batchFill'

export {
  bindAutoSelectDraftItem,
  hydrateModalFromSession,
  syncSessionFromModal,
} from './sessionAdapter'
export type { ModalSessionBindings } from './sessionAdapter'

export { ensureSessionCategoryAndFeatureAttrs } from './sessionCategoryFeature'
export { sessionToAutoSelectPatch } from './sessionSerialize'
export type { ProductSession } from './types'