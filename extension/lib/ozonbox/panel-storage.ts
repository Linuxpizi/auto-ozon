export const OZON_PANEL_STORAGE_KEY = 'jingzhi_ai_ozon_panel_state'
export const OZON_PANEL_LAUNCHER_SIZE_PX = 64
export const OZON_PANEL_VIEWPORT_MARGIN_PX = 10

export interface OzonPanelPosition {
  right: number
  bottom: number
}

export interface OzonCardVisibility {
  listCardsHidden: boolean
  detailCardsVisible: boolean
}

export interface OzonPanelState extends OzonCardVisibility {
  launcherPosition: OzonPanelPosition
}

export const DEFAULT_OZON_PANEL_POSITION: OzonPanelPosition = { right: 20, bottom: 20 }
export const DEFAULT_OZON_CARD_VISIBILITY: OzonCardVisibility = {
  listCardsHidden: false,
  detailCardsVisible: true,
}

export const DEFAULT_OZON_PANEL_STATE: OzonPanelState = {
  launcherPosition: DEFAULT_OZON_PANEL_POSITION,
  ...DEFAULT_OZON_CARD_VISIBILITY,
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function viewportMaximum(viewportSize: number, elementSize: number, margin: number): number {
  return Math.max(margin, viewportSize - elementSize - margin)
}

export function clampOzonPanelPosition(
  position: OzonPanelPosition,
  viewportWidth: number,
  viewportHeight: number,
  launcherSize = OZON_PANEL_LAUNCHER_SIZE_PX,
  margin = OZON_PANEL_VIEWPORT_MARGIN_PX,
): OzonPanelPosition {
  const maxRight = viewportMaximum(viewportWidth, launcherSize, margin)
  const maxBottom = viewportMaximum(viewportHeight, launcherSize, margin)
  return {
    right: Math.min(maxRight, Math.max(margin, position.right)),
    bottom: Math.min(maxBottom, Math.max(margin, position.bottom)),
  }
}

export function snapOzonPanelPositionToNearestEdge(
  position: OzonPanelPosition,
  viewportWidth: number,
  viewportHeight: number,
  launcherSize = OZON_PANEL_LAUNCHER_SIZE_PX,
  margin = OZON_PANEL_VIEWPORT_MARGIN_PX,
): OzonPanelPosition {
  const clamped = clampOzonPanelPosition(position, viewportWidth, viewportHeight, launcherSize, margin)
  const maxRight = viewportMaximum(viewportWidth, launcherSize, margin)
  const maxBottom = viewportMaximum(viewportHeight, launcherSize, margin)
  const edges = [
    { distance: clamped.right - margin, position: { ...clamped, right: margin } },
    { distance: maxRight - clamped.right, position: { ...clamped, right: maxRight } },
    { distance: clamped.bottom - margin, position: { ...clamped, bottom: margin } },
    { distance: maxBottom - clamped.bottom, position: { ...clamped, bottom: maxBottom } },
  ]
  return edges.reduce((nearest, candidate) => (
    candidate.distance < nearest.distance ? candidate : nearest
  )).position
}

export function parseOzonPanelState(value: unknown): OzonPanelState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      launcherPosition: { ...DEFAULT_OZON_PANEL_POSITION },
      ...DEFAULT_OZON_CARD_VISIBILITY,
    }
  }
  const record = value as Record<string, unknown>
  const rawPosition = record.launcherPosition
  const positionRecord = rawPosition && typeof rawPosition === 'object' && !Array.isArray(rawPosition)
    ? rawPosition as Record<string, unknown>
    : {}
  const right = finiteNumber(positionRecord.right)
  const bottom = finiteNumber(positionRecord.bottom)
  return {
    launcherPosition: right === undefined || bottom === undefined
      ? { ...DEFAULT_OZON_PANEL_POSITION }
      : { right, bottom },
    listCardsHidden: typeof record.listCardsHidden === 'boolean'
      ? record.listCardsHidden
      : DEFAULT_OZON_CARD_VISIBILITY.listCardsHidden,
    detailCardsVisible: typeof record.detailCardsVisible === 'boolean'
      ? record.detailCardsVisible
      : DEFAULT_OZON_CARD_VISIBILITY.detailCardsVisible,
  }
}

export async function readOzonPanelState(): Promise<OzonPanelState> {
  const stored = await browser.storage.local.get(OZON_PANEL_STORAGE_KEY)
  return parseOzonPanelState(stored[OZON_PANEL_STORAGE_KEY])
}

export async function saveOzonPanelState(state: OzonPanelState): Promise<void> {
  await browser.storage.local.set({ [OZON_PANEL_STORAGE_KEY]: state })
}
