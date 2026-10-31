# 專案作業規則（AGENTS.md）

本檔是這個專案的**強制工作規範**，任何人／AI 接手都必須遵守。

## 專案基本資訊

- 名稱：KML/KMZ/GPX + NLSC WMTS 地圖檢視器
- 型態：純前端（原生 ES Modules，無建置流程）
- 部署：GitHub Pages — https://misunwen.github.io/kml_wmts_mobile/
- 版本來源：`js/config.js` 的 `CONFIG.APP_VERSION`（顯示於面板標題列）
- Repo：https://github.com/Misunwen/kml_wmts_mobile
- 資料檔位置：`References/*.kml`（**不上傳**，見 `.gitignore`）

## 每次修改的必做流程

1. **版本遞增**：功能或修正完成後，把 `CONFIG.APP_VERSION` 改為 `YYYY.MM.DD.N`
   - 同一天多個版本就用 `.1`、`.2`、`.3`…
   - 純文件／規則變更可不遞增，但要在 CHANGELOG 的 `Unreleased` 記錄
2. **更新 CHANGELOG.md**（規則見下）
3. **更新 HANDOFF.md**（規則見下，**每次修改都要**）
4. **commit + push**：英文 conventional commit，`git push origin main`
5. **驗證**：手機／瀏覽器用**無痕**開線上網址，確認標題列版本為最新

### commit 身分（本機未設全域）

```
git -c user.name="WMS Dev" -c user.email="wms@localhost" commit -m "..."
```

## CHANGELOG.md 規則

- **最新版本置於最上方**（由新到舊）
- 每個版本至少包含：版本號、日期、分類（新增／變更／修正／移除）、重點條列
- 盡量附上 commit 短 hash
- 不可刪除舊版本記錄
- 尚未遞增版本的變更放在最上方的 `## [Unreleased]`

## HANDOFF.md 規則（每次修改必做）

每次修改後同步更新，至少包含：

1. **目前版本、git 狀態與 HEAD**
   - `APP_VERSION`、`git status`、`git rev-parse --short HEAD`
2. **本次變更內容與進度表**
   - 改了什麼、哪些功能已完成／待驗證
3. **尚未解決的問題／雷區**
   - 已知限制、容易踩的坑
4. **下一步待辦**
   - 下一個 AI 應該先做什麼

## 發布檢查清單（Release checklist）

- [ ] `CONFIG.APP_VERSION` 已遞增
- [ ] `CHANGELOG.md` 最上方已新增版本
- [ ] `HANDOFF.md` 已更新（版本／HEAD／進度／雷區／待辦）
- [ ] `node --check` 所有 `js/*.js`
- [ ] `git status` 確認沒有誤加資料檔（`*.kml`、`.backup/`）
- [ ] commit + push
- [ ] 無痕開線上網址，確認版本字樣正確

## 驗證與環境限制

- 本機測試：雙擊 `start_server.bat`，或
  `python -m http.server 8000 --directory G:\python\WMS`
- GitHub Pages 對所有檔案送 `Cache-Control: max-age=600`（**10 分鐘快取**）
  → 一般模式可能看到舊版；**驗證請用無痕**或清「快取的圖片和檔案」
- `file://` 不能跑 ES Modules，一定要用伺服器
- 資料檔（`*.kml`、`.backup/`、`start_server.bat`）不進版控
- PowerShell 執行原則會擋 `npm.ps1`，需用 `cmd /c "npm ..."`

## 已知雷區（務必避開）

- **`feature.getStyle()` 可能是「樣式函式」**，呼叫後回傳 **Style 陣列**；不能只當 Style 物件。
- **OpenLayers 顏色陣列是 `[r, g, b, a]`**：r/g/b 為 0–255、a 為 0–1（不是 0–1 浮點）。
- **WebGLVector 是實驗性 API**：不支援文字標籤；只有「無點、≥2000 圖徵、樣式一致」才使用，其餘退回 canvas。
- **WebGL 圖層移除時**，`map.removeLayer()` 會先釋放 helper；之後 `layer.dispose()` 可能丟 `deleteBuffer` 錯，必須包在保護裡。
- **多資料夾 KML**：只有 Document 底下 ≥2 個頂層 `<Folder>` 才拆層；單一 Folder 不拆。
- **點半徑可為 0、字體最小 5**；計算時不可用 `x || 預設值`（0 會被吃掉），要用 `!== undefined`。
- 手機面板用 `100dvh`；狀態列固定在標題列下、收合時隱藏；清除鈕並排 sticky 底部。

## 檔案地圖

```
index.html      應用外殼
style.css       全部樣式
js/
  config.js     CONFIG（APP_VERSION、縮放、WebGL 門檻、預設樣式）
  state.js      DOM 參照 + AppState
  utils.js      工具（escape/sanitize/格式/狀態/進度）
  storage.js    IndexedDB、自動記錄（圖層文字分離）
  map.js        createMap + WMTS
  parsers.js    GPX / KMZ 解析 + KML 依資料夾拆分
  layers.js     圖層建立、點/線/面樣式、WebGL 判斷、CRUD
  io.js         檔案載入流程（含多圖層）
  location.js   GPS 定位
  ui.js         圖層清單渲染 + 事件綁定
  app.js        還原、初始化、啟動
OLD/            舊版 V1–V4 與遠端舊 index/README
References/     本機 KML 資料（不上傳）
start_server.bat 本機測試啟動器（不上傳）
```

## 建議的交接做法

- 每次只做**一個明確變更**，完成後立刻更新 CHANGELOG／HANDOFF 再 push，避免累積。
- HANDOFF 一律寫「可執行的下一步」，不要只寫「繼續優化」。
- 遇到 OpenLayers 行為怪異時，先讀 `node_modules/ol/...` 原始碼確認，不要用猜的（本專案已因此修正多個問題）。
- UI 變更後優先用實機（手機）驗證觸控與版面。
