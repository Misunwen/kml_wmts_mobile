# HANDOFF — 交接文件

- 專案：KML/KMZ/GPX + NLSC WMTS 地圖檢視器（純前端 ES Modules）
- 本機：`G:\python\WMS`
- Repo：https://github.com/Misunwen/kml_wmts_mobile
- 線上：https://misunwen.github.io/kml_wmts_mobile/
- 相關文件：`AGENTS.md`（工作規則）、`CHANGELOG.md`（版本記錄）

---

## 1. 目前版本、git 狀態與 HEAD

- `CONFIG.APP_VERSION`：**2026.10.02.8**（顯示於面板標題列 `v2026.10.02.8`）
- 基準 HEAD（本次文件變更前）：`1ef92ed docs: add AGENTS rules, CHANGELOG, and refresh HANDOFF`
- 應用程式版本 commit：`d7298c6 feat: 0px markers, 5px labels, and +/- steppers for mobile`
- 本次文件／決策變更會再形成一個 commit。
  **接手時請執行 `git rev-parse --short HEAD` 與 `git status` 確認實際狀態。**
- 預期 `git status`：文件 commit 後應為 clean（資料檔已被 `.gitignore` 忽略）。

---

## 2. 本次變更內容與進度表

### 本次（文件／流程）
- 新增 `AGENTS.md`：版本遞增、CHANGELOG／HANDOFF 規則、發布檢查清單、雷區。
- 建立 `CHANGELOG.md`，回填 `.1`–`.8` 與前置重構／效能記錄。
- 重寫 `HANDOFF.md`（本檔）。

### 功能進度

| 項目 | 狀態 |
|------|------|
| ES Modules 重構（index.html + style.css + js/*） | ✅ |
| 效能：樣式快取、sanitize 短路、IndexedDB 文字分離、rAF、preconnect | ✅ |
| 面板左／右切換（⇄，localStorage） | ✅ |
| 大型單色圖層 WebGL 加速 + `WebGL` 標籤 | ✅ |
| 狀態列固定標題下（收合隱藏）、手機 `100dvh`、清除鈕 sticky | ✅ |
| 版本標記（APP_VERSION） | ✅ |
| 多資料夾 KML/KMZ → 一資料夾一圖層 | ✅ |
| 點欄位下拉只列真實屬性（名稱／說明…） | ✅ |
| 多邊形屬性標籤（欄位＋字體，內部點） | ✅ |
| 點欄位「（不顯示）」 | ✅ |
| 清除快取 WebGL `deleteBuffer` 錯誤修正 | ✅ |
| 縮放上限：手動 22、定位 20 | ✅ |
| 標記最小 0px、字體最小 5px、`−`/`+` 按鈕 | ✅（待手機驗證） |
| 距離／面積測量 | ⛔ 不做（使用者決定取消） |
| 屬性搜尋並定位 | ⏸ 使用者暫緩 |

---

## 3. 尚未解決的問題／雷區

- **GitHub Pages 快取 10 分鐘**（`Cache-Control: max-age=600`）：一般模式常看到舊版，
  驗證請用**無痕**，或清「快取的圖片和檔案」。
- **大檔解析仍同步在主執行緒**：載入／重新整理還原 29MB KML 會短暫凍結（Web Worker 尚未實作）。
- **WebGL 限制**：`ol.layer.WebGLVector` 為實驗性；**不支援文字標籤**；多色大檔會退回 canvas（縮放仍可能消失）。
- **WebGL 釋放順序**：`map.removeLayer()` 已釋放 helper，之後 `layer.dispose()` 可能丟 `deleteBuffer`；
  目前以 try/catch 保護，勿移除。
- **KML 樣式**：`feature.getStyle()` 可能是函式，呼叫後回傳 Style 陣列；
  OL 顏色是 `[r,g,b 0–255, a 0–1]`。
- **0 值陷阱**：半徑／字體等設定不可用 `x || 預設值`，要用 `!== undefined`。
- **資料檔不上傳**：`*.kml`、`.backup/`、`start_server.bat` 已在 `.gitignore`；資料在 `References/`。
- **本機 git 無全域身分**：commit 要帶 `-c user.name="WMS Dev" -c user.email="wms@localhost"`。
- **NLSC 底圖只到 19 級**：縮放 20–22 時底圖空白，向量仍會畫。

---

## 4. 下一步待辦

> **距離／面積測量：使用者已決定「不做」**，不需再提議或實作。

1. **等使用者手機驗證 v2026.10.02.8**（標記 0px、字體 5px、`−`/`+` 按鈕）。
2. 屬性搜尋（使用者暫緩；若要做：跨圖層、全部欄位、包含比對、列出結果並定位）。
3. 之後每次改版依 `AGENTS.md` 的流程：bump 版本 → CHANGELOG → HANDOFF → commit/push → 無痕驗證。
4. 若使用者提出新功能，先給簡短設計並取得同意（bounded 流程）再實作。

---

## 5. 交接建議（給下一個 AI）

- **先讀三份文件**：`AGENTS.md` → `CHANGELOG.md` → `HANDOFF.md`，再看 `js/config.js`。
- **一次只做一個明確變更**，完成就更新 CHANGELOG／HANDOFF 並 push，避免大量未記錄的差異累積。
- **HANDOFF 的待辦要可執行**：寫「做 X、動哪些檔、如何驗證」，不要只寫「繼續優化」。
- **OpenLayers 行為先用原始碼確認**（`node_modules/ol/...`），不要用猜的；本專案多個 bug 都是這樣定位的。
- **UI 改動以實機（手機）驗證**觸控與版面；桌機 Chrome 只是輔助。
- **保留既有保護**：WebGL 降級、`dispose()` 保護、`100dvh`、狀態列收合、`sticky` 清除鈕。
- **版本與快取**：每次 push 後用無痕開線上網址，確認標題列版本字樣是最新，再回報使用者。
