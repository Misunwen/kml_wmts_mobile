import { CONFIG } from './config.js';
import { AppState } from './state.js';
import { sanitizeKmlText, setStatus } from './utils.js';
import { scheduleSaveMapState, deleteLayerText } from './storage.js';
import { parseGpx } from './parsers.js';
import { renderLayerList } from './ui.js';

function createTextKey() {
  return 't' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function colorToCss(color) {
  if (!color) return null;
  if (typeof color === 'string') return color;
  if (Array.isArray(color)) {
    const a = color[3] !== undefined ? color[3] : 1;
    return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)}, ${a})`;
  }
  return null;
}

// 若圖層中所有圖徵共用同一組填色/邊框，回傳等價的 WebGL 平面樣式；否則回傳 null。
// 保證不改顏色：只要樣式不一致，就退回 canvas 繪製。
function getUniformFlatStyle(features) {
  let flat = null;
  let signature = null;

  for (const feature of features) {
    const style = feature.getStyle();
    if (!style || Array.isArray(style)) return null;

    const fill = style.getFill ? style.getFill() : null;
    const stroke = style.getStroke ? style.getStroke() : null;
    const fillColor = fill ? colorToCss(fill.getColor()) : null;
    const strokeColor = stroke ? colorToCss(stroke.getColor()) : null;
    const strokeWidth = stroke && stroke.getWidth() ? stroke.getWidth() : 0;

    const hasFill = !!fillColor;
    const hasStroke = !!strokeColor && strokeWidth > 0;
    if (!hasFill && !hasStroke) return null;

    const sig = `${fillColor}|${strokeColor}|${strokeWidth}`;
    if (signature === null) {
      signature = sig;
      flat = {};
      if (hasFill) flat['fill-color'] = fillColor;
      if (hasStroke) {
        flat['stroke-color'] = strokeColor;
        flat['stroke-width'] = strokeWidth;
      }
    } else if (signature !== sig) {
      return null;
    }
  }

  return flat;
}

export function createPointStyleFunction(fieldOrFn, radius, fontSize) {
  const r = Math.min(Math.max(radius || CONFIG.DEFAULT_POINT_RADIUS, CONFIG.MIN_POINT_RADIUS), CONFIG.MAX_POINT_RADIUS);
  const size = Math.min(Math.max(fontSize || CONFIG.DEFAULT_POINT_LABEL_SIZE, CONFIG.MIN_POINT_LABEL_SIZE),
  CONFIG.MAX_POINT_LABEL_SIZE);

  // 共用不變的樣式物件，並依標籤文字快取 Style，避免每個圖徵、每一幀都重新建立物件。
  const image = new ol.style.Circle({
    radius: r,
    fill: new ol.style.Fill({ color: 'rgba(235, 40, 40, 0.95)' }),
    stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }),
  });
  const textFill = new ol.style.Fill({ color: '#202020' });
  const textStroke = new ol.style.Stroke({ color: '#ffffff', width: 3 });
  const font = `bold ${size}px Arial, Microsoft JhengHei, sans-serif`;
  const styleCache = new Map();

  return function(feature) {
    const geometry = feature.getGeometry();
    if (!geometry) return null;

    const type = geometry.getType();
    if (type !== 'Point' && type !== 'MultiPoint') return null;

    let labelText = '';
    if (typeof fieldOrFn === 'function') {
      labelText = String(fieldOrFn(feature) || '');
    } else if (typeof fieldOrFn === 'string') {
      const value = feature.get(fieldOrFn);
      labelText = value !== undefined && value !== null ? String(value) : '';
    } else {
      labelText = String(feature.get('name') || '');
    }

    if (labelText.length > 50) {
      labelText = labelText.substring(0, 47) + '...';
    }

    let style = styleCache.get(labelText);
    if (!style) {
      style = new ol.style.Style({
        image: image,
        text: new ol.style.Text({
          text: labelText,
          offsetY: -(r + 8),
          font: font,
          fill: textFill,
          stroke: textStroke,
          overflow: true,
        }),
      });
      styleCache.set(labelText, style);
    }
    return style;
  };
}

export function updatePointStyles(layerData) {
  const field = layerData.pointLabelField || 'name';
  const radius = layerData.pointRadius || CONFIG.DEFAULT_POINT_RADIUS;
  const size = layerData.pointLabelSize || CONFIG.DEFAULT_POINT_LABEL_SIZE;

  const styleFn = createPointStyleFunction(field, radius, size);

  const features = layerData.source.getFeatures();
  features.forEach(feature => {
    const geometry = feature.getGeometry();
    if (!geometry) return;
    const type = geometry.getType();
    if (type === 'Point' || type === 'MultiPoint') {
      feature.setStyle(styleFn);
    }
  });

  layerData.layer.changed();
}

export function updateLayerOpacity(layerData) {
  const opacity = layerData.opacity !== undefined ? layerData.opacity : CONFIG.DEFAULT_OPACITY;
  layerData.layer.setOpacity(opacity);
}

export function createLayerFromContent(fileName, content, format, visible = true, autoZoom = false, shouldSave = true) {
  let features = [];
  let sourceText = content;
  let isKmlFormat = false;

  // 根據格式解析
  if (format === 'gpx') {
    // GPX 解析
    features = parseGpx(content);
    isKmlFormat = false;

  } else if (format === 'kml' || format === 'kmz') {
    // KML 解析（KMZ 已經解壓縮成 KML 文字）
    const sanitizedText = sanitizeKmlText(content);
    sourceText = sanitizedText;

    const kmlFormat = new ol.format.KML({
      extractStyles: true,
      showPointNames: false,
    });

    features = kmlFormat.readFeatures(sanitizedText, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    });

    isKmlFormat = true;
  }

  if (!features || features.length === 0) {
    throw new Error('沒有讀到可用的圖徵資料。');
  }

  // 收集所有欄位名稱
  const fieldSet = new Set();
  features.forEach(f => {
    const keys = f.getKeys();
    keys.forEach(k => fieldSet.add(k));
  });
  fieldSet.delete('geometry');

  const defaultField = fieldSet.has('name') ? 'name' :
    fieldSet.has('description') ? 'description' :
    fieldSet.has('title') ? 'title' :
    fieldSet.has('標題') ? '標題' :
    Array.from(fieldSet)[0] || '';

  // 檢查是否有點圖徵
  const hasPoints = features.some(f => {
    const g = f.getGeometry();
    return g && (g.getType() === 'Point' || g.getType() === 'MultiPoint');
  });

  // 只有 KML 或 KMZ 的點才套用自訂樣式（GPX 點保留原始樣式）
  if (isKmlFormat && hasPoints) {
    const styleFn = createPointStyleFunction(
      defaultField,
      CONFIG.DEFAULT_POINT_RADIUS,
      CONFIG.DEFAULT_POINT_LABEL_SIZE
    );

    features.forEach(feature => {
      const geometry = feature.getGeometry();
      if (!geometry) return;
      const type = geometry.getType();
      if (type === 'Point' || type === 'MultiPoint') {
        feature.setStyle(styleFn);
      }
    });
  }

  // 大型、樣式一致的多邊形/線圖層改用 WebGL 繪製，提升縮放/平移效能。
  // 樣式由圖徵實際解析結果推導，顏色與線寬與 canvas 完全相同。
  let webglStyle = null;
  if (!hasPoints &&
      features.length >= CONFIG.WEBGL_MIN_FEATURES &&
      typeof ol.layer.WebGLVector === 'function') {
    webglStyle = getUniformFlatStyle(features);
  }

  const source = new ol.source.Vector({
    features: features,
    declutter: hasPoints,
  });

  const layerOptions = {
    source: source,
    visible: visible,
    opacity: CONFIG.DEFAULT_OPACITY,
    zIndex: 10 + AppState.kmlLayers.length,
  };

  const vectorLayer = webglStyle
    ? new ol.layer.WebGLVector(Object.assign({
        style: webglStyle,
        disableHitDetection: true,
      }, layerOptions))
    : new ol.layer.Vector(layerOptions);

  const layerData = {
    id: AppState.nextLayerId++,
    name: fileName,
    format: format,
    text: sourceText,
    textKey: createTextKey(),
    textStored: false,
    layer: vectorLayer,
    source: source,
    opacity: CONFIG.DEFAULT_OPACITY,
    pointRadius: CONFIG.DEFAULT_POINT_RADIUS,
    pointLabelSize: CONFIG.DEFAULT_POINT_LABEL_SIZE,
    pointLabelField: defaultField,
    availableFields: Array.from(fieldSet),
    hasPoints: hasPoints,
    isKmlFormat: isKmlFormat,
    isWebGL: !!webglStyle,
    settingsExpanded: false,
  };

  AppState.map.addLayer(vectorLayer);
  AppState.kmlLayers.push(layerData);

  updateKmlLayerZIndex();
  renderLayerList();

  if (autoZoom) zoomToLayer(layerData);
  if (shouldSave) scheduleSaveMapState();

  return layerData;
}

export function updateKmlLayerZIndex() {
  AppState.kmlLayers.forEach((layerData, index) => {
    layerData.layer.setZIndex(10 + index);
  });
}

export function zoomToLayer(layerData) {
  const extent = layerData.source.getExtent();
  if (ol.extent.isEmpty(extent)) {
    alert('此圖層沒有可定位的範圍。');
    return;
  }
  AppState.view.fit(extent, {
    padding: CONFIG.ZOOM_PADDING,
    maxZoom: CONFIG.MAX_ZOOM_FIT,
    duration: CONFIG.ANIMATION_DURATION_MS,
  });
}

export function removeKmlLayer(id) {
  const index = AppState.kmlLayers.findIndex(item => item.id === id);
  if (index === -1) return;

  const layerData = AppState.kmlLayers[index];
  AppState.map.removeLayer(layerData.layer);
  if (layerData.isWebGL && typeof layerData.layer.dispose === 'function') {
    layerData.layer.dispose();
  }
  AppState.kmlLayers.splice(index, 1);
  deleteLayerText(layerData).catch(error => console.warn('圖層文字刪除失敗：', error));

  updateKmlLayerZIndex();
  renderLayerList();
  scheduleSaveMapState();
  setStatus(`已移除圖層：${layerData.name}`);
}

export function moveKmlLayer(id, direction) {
  const currentIndex = AppState.kmlLayers.findIndex(item => item.id === id);
  if (currentIndex === -1) return;

  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= AppState.kmlLayers.length) return;

  const temp = AppState.kmlLayers[currentIndex];
  AppState.kmlLayers[currentIndex] = AppState.kmlLayers[targetIndex];
  AppState.kmlLayers[targetIndex] = temp;

  updateKmlLayerZIndex();
  renderLayerList();
  scheduleSaveMapState();
  setStatus(`已調整圖層順序：${temp.name}`);
}

export function clearCurrentLayers() {
  AppState.kmlLayers.forEach(layerData => {
    AppState.map.removeLayer(layerData.layer);
    if (layerData.isWebGL && typeof layerData.layer.dispose === 'function') {
      layerData.layer.dispose();
    }
    deleteLayerText(layerData).catch(error => console.warn('圖層文字刪除失敗：', error));
  });
  AppState.kmlLayers = [];
  updateKmlLayerZIndex();
  renderLayerList();
}
