import { CONFIG } from './config.js';
import { AppState } from './state.js';
import { sanitizeKmlText, setStatus } from './utils.js';
import { scheduleSaveMapState, deleteLayerText } from './storage.js';
import { parseGpx } from './parsers.js';
import { renderLayerList } from './ui.js';

function createTextKey() {
  return 't' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function rgbToHex(r, g, b) {
  const h = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}

function colorToHex(color) {
  if (!color) return null;
  if (typeof color === 'string') {
    if (color[0] === '#') return color.length >= 7 ? color.slice(0, 7) : color;
    const m = color.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      const p = m[1].split(',').map(parseFloat);
      return rgbToHex(p[0], p[1], p[2]);
    }
    return null;
  }
  // OpenLayers 顏色陣列：[r, g, b, a]，r/g/b 為 0-255、a 為 0-1。
  if (Array.isArray(color)) return rgbToHex(color[0], color[1], color[2]);
  return null;
}

function hexToRgba(hex, alpha) {
  const h = String(hex).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// KML 圖徵的樣式可能是 Style、Style 陣列或樣式函式，統一取出一個含填色/邊框的 Style。
function resolveFeatureStyle(feature, resolution) {
  let style = feature.getStyle();
  if (typeof style === 'function') style = style(feature, resolution);
  if (Array.isArray(style)) {
    style = style.find(s => s &&
      ((s.getFill && s.getFill()) || (s.getStroke && s.getStroke()))) || style[0];
  }
  return style || null;
}

// 分析圖層樣式：是否所有圖徵一致，以及取一組代表值（供預設值與 WebGL 判斷）。
function analyzeStyles(features, resolution) {
  const result = { uniform: true, strokeColor: null, strokeWidth: 0, fillColor: null, hasFill: false };
  let signature = null;

  for (const feature of features) {
    const style = resolveFeatureStyle(feature, resolution);
    if (!style) { result.uniform = false; return result; }

    const fill = style.getFill ? style.getFill() : null;
    const stroke = style.getStroke ? style.getStroke() : null;
    const fillColor = fill ? colorToHex(fill.getColor()) : null;
    const strokeColor = stroke ? colorToHex(stroke.getColor()) : null;
    const strokeWidth = stroke && stroke.getWidth() ? stroke.getWidth() : 0;

    const sig = `${fillColor}|${strokeColor}|${strokeWidth}`;
    if (signature === null) {
      signature = sig;
      result.fillColor = fillColor;
      result.hasFill = !!fillColor;
      result.strokeColor = strokeColor;
      result.strokeWidth = strokeWidth;
    } else if (sig !== signature) {
      result.uniform = false;
      return result;
    }
  }
  return result;
}

function flatStyleFor(layerData) {
  const flat = {
    'stroke-color': layerData.strokeColor,
    'stroke-width': layerData.strokeWidth,
  };
  if (layerData.fillEnabled) {
    flat['fill-color'] = hexToRgba(layerData.strokeColor, CONFIG.DEFAULT_FILL_OPACITY);
  }
  return flat;
}

function vectorStyleFor(layerData) {
  const options = {
    stroke: new ol.style.Stroke({ color: layerData.strokeColor, width: layerData.strokeWidth }),
  };
  if (layerData.fillEnabled) {
    options.fill = new ol.style.Fill({ color: hexToRgba(layerData.strokeColor, CONFIG.DEFAULT_FILL_OPACITY) });
  }
  return new ol.style.Style(options);
}

// 套用使用者調整後的樣式（線粗／顏色／是否填滿）。
export function applyLayerStyle(layerData) {
  if (layerData.isWebGL) {
    layerData.layer.setStyle(flatStyleFor(layerData));
    return;
  }
  // canvas：需先清除圖徵自帶樣式，圖層樣式才會生效（會統一成單一顏色）。
  if (!layerData.featureStylesCleared) {
    layerData.source.getFeatures().forEach(f => f.setStyle(null));
    layerData.featureStylesCleared = true;
  }
  layerData.layer.setStyle(vectorStyleFor(layerData));
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

  // 非點圖層：分析樣式，取統一樣式作為預設線色/線粗/填滿，並判斷是否可用 WebGL。
  const resolution = AppState.view ? AppState.view.getResolution() : 1;
  const styleInfo = hasPoints ? null : analyzeStyles(features, resolution);
  const strokeColor = (styleInfo && styleInfo.strokeColor) || CONFIG.DEFAULT_STROKE_COLOR;
  const strokeWidth = (styleInfo && styleInfo.strokeWidth) || CONFIG.DEFAULT_STROKE_WIDTH;
  const fillEnabled = !!(styleInfo && styleInfo.hasFill);

  // 大型、樣式一致的多邊形/線圖層改用 WebGL，提升縮放/平移效能。
  const useWebGL = !hasPoints &&
    features.length >= CONFIG.WEBGL_MIN_FEATURES &&
    !!styleInfo && styleInfo.uniform &&
    typeof ol.layer.WebGLVector === 'function';

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

  const styleSeed = { strokeColor: strokeColor, strokeWidth: strokeWidth, fillEnabled: fillEnabled };
  const vectorLayer = useWebGL
    ? new ol.layer.WebGLVector(Object.assign({
        style: flatStyleFor(styleSeed),
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
    isWebGL: useWebGL,
    strokeColor: strokeColor,
    strokeWidth: strokeWidth,
    fillEnabled: fillEnabled,
    styleOverridden: false,
    featureStylesCleared: false,
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
