import { CONFIG } from './config.js';
import { AppState, DOM } from './state.js';
import { setStatus } from './utils.js';
import { scheduleSaveMapState } from './storage.js';

export function createMap() {
  const view = new ol.View({
    projection: 'EPSG:3857',
    center: ol.proj.fromLonLat([120.9, 23.7]),
    zoom: CONFIG.DEFAULT_ZOOM,
    minZoom: CONFIG.MIN_ZOOM,
    maxZoom: CONFIG.MAX_ZOOM,
  });

  AppState.view = view;

  const map = new ol.Map({
    target: DOM.mapContainer,
    layers: [],
    view: view,
  });

  map.on('moveend', scheduleSaveMapState);

  AppState.map = map;
  return map;
}

export async function loadWmtsCapabilities(preferredLayerName = null) {
  try {
    setStatus('正在讀取 WMTS 圖層清單...');
    const url = `${CONFIG.WMTS_URL}?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`WMTS 回應錯誤，HTTP ${response.status}`);

    const xmlText = await response.text();
    const parser = new ol.format.WMTSCapabilities();
    AppState.wmtsCapabilities = parser.read(xmlText);

    const layers = AppState.wmtsCapabilities?.Contents?.Layer;
    if (!layers || layers.length === 0) throw new Error('WMTS 沒有回傳可用圖層。');

    DOM.wmtsLayerSelect.innerHTML = '';
    layers.forEach(layerInfo => {
      const option = document.createElement('option');
      option.value = layerInfo.Identifier;
      option.textContent = layerInfo.Title || layerInfo.Identifier;
      DOM.wmtsLayerSelect.appendChild(option);
    });
    DOM.wmtsLayerSelect.disabled = false;

    const availableNames = Array.from(DOM.wmtsLayerSelect.options).map(o => o.value);
    let selectedName = null;
    if (preferredLayerName && availableNames.includes(preferredLayerName)) {
      selectedName = preferredLayerName;
    } else if (availableNames.includes('EMAP')) {
      selectedName = 'EMAP';
    } else {
      selectedName = layers[0].Identifier;
    }

    DOM.wmtsLayerSelect.value = selectedName;
    setWmtsLayer(selectedName);
    setStatus(`WMTS 圖層清單讀取完成，共 ${layers.length} 個圖層。`);
  } catch (error) {
    console.error(error);
    setStatus(`WMTS 讀取失敗：${error.message}`, 'error');
    DOM.wmtsLayerSelect.innerHTML = '<option>讀取失敗，請重新整理</option>';
  }
}

export function setWmtsLayer(layerName) {
  try {
    const caps = AppState.wmtsCapabilities;
    if (!caps) return;

    const options = ol.source.WMTS.optionsFromCapabilities(caps, {
      layer: layerName,
      projection: 'EPSG:3857',
    });

    if (!options) throw new Error(`找不到 EPSG:3857 設定：${layerName}`);

    const newLayer = new ol.layer.Tile({
      source: new ol.source.WMTS(options),
      zIndex: 0,
    });

    const map = AppState.map;
    if (AppState.wmtsLayer) map.removeLayer(AppState.wmtsLayer);

    AppState.wmtsLayer = newLayer;
    map.getLayers().insertAt(0, newLayer);

    setStatus(`已切換底圖：${layerName}`);
    scheduleSaveMapState();
  } catch (error) {
    console.error(error);
    setStatus(`WMTS 底圖載入失敗：${error.message}`, 'error');
  }
}
