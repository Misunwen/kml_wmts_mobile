```markdown
# NLSC WMTS + KML 地圖

本專案為可部署於 GitHub Pages 的網頁地圖工具，使用：

- （NLSC）WMTS 底圖服務
- OpenLayers 地圖函式庫
- 本機 KML 圖層載入
- 瀏覽器 IndexedDB 本機快取

可在電腦、手機與平板瀏覽器使用。

---

## 功能

### WMTS 底圖

- 自動讀取NLSC WMTS 圖層清單。
- 可從下拉選單切換不同底圖。
- 預設優先載入 `EMAP` 電子地圖。
- 可記住上次選擇的 WMTS 底圖。

WMTS 服務網址：

```text
https://wmts.nlsc.gov.tw/wmts
```

---

### KML 圖層

- 支援載入本機 `.kml` 檔案。
- 最多同時載入 4 個 KML 圖層。
- 可顯示／隱藏個別 KML 圖層。
- 可縮放定位至指定 KML 圖層範圍。
- 可移除單一 KML 圖層。
- 可清除全部目前載入的 KML。
- 可調整 KML 圖層上下順序。
- KML 載入後可自動縮放至第一個載入的圖層。

圖層順序規則：

```text
[1]：最下層
[2]：在 [1] 上方
[3]：在 [2] 上方
[4]：最上層
```

按鈕功能：

| 按鈕 | 功能 |
|---|---|
| `↑` | 圖層往上移，顯示在其他 KML 圖層上方 |
| `↓` | 圖層往下移，顯示在其他 KML 圖層下方 |
| `定位` | 縮放至該 KML 圖層範圍 |
| `移除` | 移除該 KML 圖層 |
| 勾選框 | 顯示或隱藏圖層 |

---

### 點位 KML 顯示

系統會針對 KML 的點位圖徵使用明顯的紅色圓點樣式：

- 紅色圓點
- 白色外框
- 顯示 KML `<name>` 名稱
- 避免 Google My Maps 外部白色圖示無法顯示的問題

例如：

```xml
<Placemark>
  <name>100</name>
  <Point>
    <coordinates>121.202782,24.916530,0</coordinates>
  </Point>
</Placemark>
```

會顯示紅色點位與文字：

```text
100
 ●
```

---

### 線與面 KML 樣式

點位會套用系統紅點樣式。

線與面則保留 KML 原本樣式，例如：

- 線的顏色
- 線寬
- 面框線顏色
- 面填滿顏色
- 面透明度
- 面是否填滿

若 KML 原本的面設定為「不填滿」，系統不會強制填滿。

---

### GPS 定位

支援手機或電腦瀏覽器定位功能。

功能包括：

- 定位到目前位置。
- 顯示藍色位置點。
- 顯示 GPS 誤差範圍。
- 自動縮放至目前位置。

> 使用 GPS 定位時，瀏覽器會要求位置權限。  
> GitHub Pages 使用 HTTPS，可支援定位功能。

---

### 自動記錄與快取

系統預設開啟「自動記錄」。

會記住：

- 上次選擇的 WMTS 底圖。
- 已載入的 KML。
- KML 顯示／隱藏狀態。
- KML 圖層上下順序。
- 地圖中心位置。
- 地圖縮放層級。

資料儲存在使用者瀏覽器的：

```text
IndexedDB
```

資料不會上傳到：

```text
GitHub
GitHub Pages
NLSC
其他伺服器
```

---

## 清除功能

### 清除目前 KML 圖層

按下：

```text
清除目前 KML 圖層
```

會：

- 移除目前地圖上的所有 KML。
- 若自動記錄已啟用，會更新保存資料。
- 下次重新開啟網頁時，不會重新載入已清除的 KML。

不會：

- 刪除手機或電腦中的原始 KML 檔案。

---

### 清除快取資料與之前載入的 KML

按下：

```text
清除快取資料與之前載入的 KML
```

會清除：

- IndexedDB 儲存的 KML 內容。
- 上次選擇的 WMTS 底圖。
- KML 顯示／隱藏狀態。
- KML 圖層順序。
- 上次地圖位置。
- 上次地圖縮放層級。
- 目前畫面已載入的 KML。

不會清除：

- 手機檔案 App 中的 KML。
- 電腦硬碟中的 KML。
- GitHub Repository 中的檔案。
- GitHub Pages 網站檔案。

---

## KML 格式要求

KML 必須使用標準 WGS84 經緯度座標：

```text
經度,緯度,高度
longitude,latitude,altitude
```

臺灣常見正確格式：

```xml
<coordinates>121.202782,24.916530,0</coordinates>
```

---

### 正確 KML 點位範例

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>測試點位</name>

    <Placemark>
      <name>點位 100</name>
      <description>測試點位資料</description>

      <Point>
        <coordinates>121.202782,24.916530,0</coordinates>
      </Point>
    </Placemark>

  </Document>
</kml>
```

---

### 常見錯誤：使用 TWD97 座標

以下不是標準 KML 經緯度格式：

```xml
<coordinates>250000,2650000,0</coordinates>
```

這類座標通常是：

```text
TWD97 / TM2
EPSG:3826
```

KML 必須使用：

```text
WGS84
EPSG:4326
```

若原始資料是 TWD97，請先使用 QGIS、ArcGIS 或其他 GIS 軟體轉換為 EPSG:4326 再匯出 KML。

---

### 常見錯誤：經緯度順序顛倒

KML 的順序必須是：

```text
經度,緯度
```

正確：

```xml
<coordinates>121.202782,24.916530,0</coordinates>
```

錯誤：

```xml
<coordinates>24.916530,121.202782,0</coordinates>
```

---

### 不支援 KMZ

目前系統支援：

```text
.kml
```

目前不支援：

```text
.kmz
```

KMZ 是壓縮格式，請先解壓縮或從 Google Earth、QGIS 匯出為一般 `.kml` 檔案。

---

## 專案檔案結構

基本結構如下：

```text
your-repository/
├── index.html
└── README.md
```

其中：

```text
index.html
```

為主程式。

---

## GitHub Pages 部署方式

### 1. 建立 GitHub Repository

建立一個新的 GitHub Repository，例如：

```text
nlsc-kml-map
```

---

### 2. 上傳檔案

上傳：

```text
index.html
README.md
```

確認首頁檔案名稱必須是：

```text
index.html
```

---

### 3. 啟用 GitHub Pages

進入 GitHub Repository：

```text
Settings
→ Pages
```

設定：

```text
Build and deployment
→ Source：Deploy from a branch
→ Branch：main
→ Folder：/(root)
→ Save
```

---

### 4. 開啟網站

GitHub Pages 通常會產生網址：

```text
https://你的GitHub帳號.github.io/Repository名稱/
```

例如：

```text
https://example.github.io/nlsc-kml-map/
```

---

## 使用方式

### 載入 KML

1. 開啟網頁。
2. 從 WMTS 下拉選單選擇底圖。
3. 按「選擇檔案」。
4. 選擇一個或多個 `.kml` 檔案。
5. 系統會將 KML 顯示在地圖上。
6. 第一個載入的 KML 會自動定位。

---

### 調整 KML 圖層順序

假設載入：

```text
行政區界.kml
道路.kml
施工範圍.kml
設施點位.kml
```

若施工範圍被道路遮住，可在「施工範圍.kml」旁按：

```text
↑
```

圖層會往上移，顯示在道路上方。

順序調整後會自動保存，重新開啟網頁時仍會保留。

---

### 手機定位

1. 按下：

   ```text
   📍 定位到我的位置
   ```

2. 瀏覽器出現權限詢問時，選擇：

   ```text
   允許
   ```

3. 地圖會移動至目前位置。

---

## 隱私與資料保存說明

| 項目 | 說明 |
|---|---|
| KML 是否上傳 GitHub | 不會 |
| KML 是否上傳伺服器 | 不會 |
| KML 儲存位置 | 使用者瀏覽器 IndexedDB |
| 換手機後是否保留 | 不會 |
| 換瀏覽器後是否保留 | 不會 |
| 清除網站資料後是否保留 | 不會 |
| 無痕模式是否保留 | 通常不會 |
| 是否可清除保存資料 | 可以，按「清除快取資料與之前載入的 KML」 |

---

## 使用技術

- [OpenLayers](https://openlayers.org/)
- NLSC WMTS
- JavaScript
- HTML / CSS
- IndexedDB
- Geolocation API
- GitHub Pages

---

## 注意事項

1. NLSC WMTS 服務是否可使用，取決於其服務狀態與網路連線。
2. 大型 KML 可能造成手機瀏覽器載入速度慢或記憶體不足。
3. 建議單一 KML 儘量控制在數 MB 至十幾 MB 內。
4. KML 中若使用外部 Icon 圖示，可能受到 CORS、HTTPS 或外部網址失效影響。
5. 本系統已對點位套用內建紅點樣式，可避免部分外部圖示看不到的問題。
6. 若 GitHub Pages 網址不是 HTTPS，手機 GPS 定位通常無法使用；GitHub Pages 預設提供 HTTPS。

---

## 授權

本專案可依實際需求自行修改與使用。

NLSC WMTS 圖資之使用，請依NLSC相關服務條款與圖資授權規範辦理。
```
