import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../entrypoints/popup/App.vue', import.meta.url), 'utf8')
const globalCss = readFileSync(new URL('../assets/main.css', import.meta.url), 'utf8')
const popupHtml = readFileSync(new URL('../entrypoints/popup/index.html', import.meta.url), 'utf8')

// Reference geometry and current project branding remain explicit source contracts.
assert.match(appSource, /const APP_NAME = '鲸智 AI'/)
assert.match(appSource, /src="\/brand-logo\.png"/)
assert.match(appSource, /\.popup-shell \{ width: 320px;/)
assert.match(appSource, /\.home-view \{ width: 320px; padding: 16px;/)
assert.match(appSource, /\.brand-logo \{ width: 60px; height: 60px; margin-bottom: 20px;/)
assert.match(globalCss, /html, body, #app \{ margin: 0; width: 320px; min-width: 320px; min-height: 0; \}/)
assert.match(popupHtml, /<title>鲸智 AI<\/title>/)

// Popup uses the established auth/settings contracts instead of the reference extension token model.
assert.match(appSource, /getAuthSession/)
assert.match(appSource, /saveAuthSession/)
assert.match(appSource, /clearAuthSession/)
assert.match(appSource, /settings\.erpBaseUrl/)
assert.match(appSource, /validatedErpBaseUrl\(erpBaseUrl\.value\)/)

// Existing business entrypoints stay reachable from the compact shell.
assert.match(appSource, /<OzonboxPanel v-else-if="isOzonProductPage"/)
assert.match(appSource, /<ScrapePanel v-else \/>/)
assert.match(appSource, /<RecordsPanel v-if="view === 'records'" \/>/)

// Do not regress to copied reference branding, storage keys, or hard-coded service URLs.
assert.doesNotMatch(appSource, /毛子ERP|maozierp-token/)
assert.doesNotMatch(appSource, /https?:\/\//)

console.log('popup source contracts passed')