import { CONFIG } from './config.js';
import { AppState, DOM } from './state.js';
import { setStatus } from './utils.js';
import { openDatabase, dbGet, getAutoSaveEnabled, loadLayerText } from './storage.js';
import { createMap, loadWmtsCapabilities } from './map.js';
import { createLayerFromContent, updatePointStyles, zoomToLayer, applyLayerStyle } from './layers.js';
import { bindEvents } from './ui.js';

DOM.appVersion.textContent = 'v' + CONFIG.APP_VERSION;

async function restoreSavedMapState(savedState) {
  if (!savedState) return;
  if (!DOM.autoSaveCheckbox.checked) return;

  AppState.isRestoring = true;

  try {
    if (Array.isArray(savedState.kmlLayers)) {
      const restoreList = savedState.kmlLayers.slice(0, CONFIG.MAX_LAYERS);

      for (const savedLayer of restoreList) {
        if (!savedLayer.name) continue;
        try {
          const format = savedLayer.format || 'kml';
          let text = savedLayer.text;
          if (!text && savedLayer.textKey) {
            text = await loadLayerText(savedLayer.textKey);
          }
          if (!text) continue;

          const layerData = createLayerFromContent(
            savedLayer.name,
            text,
            format,
            savedLayer.visible !== false,
            false,
            false
          );

          if (savedLayer.textKey) {
            // 新格式：文字已存在獨立的 blob，不需再寫入
            layerData.textKey = savedLayer.textKey;
            layerData.textStored = true;
          }
          // 舊格式（文字內嵌於 state）：保持 textStored=false，
          // 下次存檔時會自動改存成分離的 blob，完成遷移。

          if (savedLayer.opacity !== undefined) {
            layerData.opacity = savedLayer.opacity;
            layerData.layer.setOpacity(savedLayer.opacity);
          }

          if (savedLayer.pointRadius !== undefined) {
            layerData.pointRadius = savedLayer.pointRadius;
          }
          if (savedLayer.pointLabelSize !== undefined) {
            layerData.pointLabelSize = savedLayer.pointLabelSize;
          }
          if (savedLayer.pointLabelField !== undefined) {
            layerData.pointLabelField = savedLayer.pointLabelField;
          }
          if (savedLayer.strokeColor) {
            layerData.strokeColor = savedLayer.strokeColor;
          }
          if (savedLayer.strokeWidth) {
            layerData.strokeWidth = savedLayer.strokeWidth;
          }
          if (savedLayer.fillEnabled !== undefined) {
            layerData.fillEnabled = savedLayer.fillEnabled;
          }
          if (savedLayer.styleOverridden) {
            layerData.styleOverridden = true;
            applyLayerStyle(layerData);
          }

          if (layerData.isKmlFormat && layerData.hasPoints) {
            updatePointStyles(layerData);
          }

        } catch (error) {
          console.warn(`無法還原：${savedLayer.name}`, error);
        }
      }
    }

    if (savedState.view && Array.isArray(savedState.view.center) && savedState.view.center.length === 2) {
      AppState.view.setCenter(savedState.view.center);
      AppState.view.setZoom(savedState.view.zoom || CONFIG.DEFAULT_ZOOM);
      if (typeof savedState.view.rotation === 'number') {
        AppState.view.setRotation(savedState.view.rotation);
      }
    } else if (AppState.kmlLayers.length > 0) {
      zoomToLayer(AppState.kmlLayers[0]);
    }

    if (AppState.kmlLayers.length > 0) {
      setStatus(`已還原 ${AppState.kmlLayers.length} 個圖層。`);
    }

  } catch (error) {
    console.warn('還原資料失敗：', error);
  } finally {
    AppState.isRestoring = false;
  }
}

async function initApp() {
  try {
    AppState.isRestoring = true;

    createMap();
    await openDatabase();

    DOM.autoSaveCheckbox.checked = getAutoSaveEnabled();

    let savedState = null;
    if (DOM.autoSaveCheckbox.checked) {
      savedState = await dbGet(CONFIG.STATE_KEY);
    }

    const preferredLayer = savedState?.wmtsLayer || null;
    await loadWmtsCapabilities(preferredLayer);

    await restoreSavedMapState(savedState);

    bindEvents();

    if (AppState.kmlLayers.length === 0) {
      setStatus('地圖已就緒，可載入 KML / KMZ / GPX 檔案。');
    }

  } catch (error) {
    console.error(error);
    setStatus(`初始化失敗：${error.message}`, 'error');
  } finally {
    AppState.isRestoring = false;
  }
}

if (typeof ol !== 'undefined') {
  // 檢查 JSZip 是否載入
  if (typeof JSZip === 'undefined') {
    console.warn('JSZip 未載入，KMZ 檔案將無法讀取。');
    setStatus('⚠️ JSZip 未載入，KMZ 檔案無法讀取。請檢查網路連線。', 'warn');
  }
  initApp();
} else {
  console.error('OpenLayers 未正確載入。');
  DOM.status.textContent = '❌ OpenLayers 載入失敗，請重新整理頁面。';
}
