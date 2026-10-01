import { CONFIG } from './config.js';
import { AppState, DOM } from './state.js';
import { setStatus } from './utils.js';

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
    request.onupgradeneeded = function(event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
        db.createObjectStore(CONFIG.STORE_NAME);
      }
    };
    request.onsuccess = function(event) {
      AppState.database = event.target.result;
      resolve(AppState.database);
    };
    request.onerror = function() { reject(request.error); };
  });
}

export function dbGet(key) {
  return new Promise((resolve, reject) => {
    const db = AppState.database;
    if (!db) { reject(new Error('IndexedDB 尚未初始化。'));
      return; }
    const transaction = db.transaction(CONFIG.STORE_NAME, 'readonly');
    const store = transaction.objectStore(CONFIG.STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function dbSet(key, value) {
  return new Promise((resolve, reject) => {
    const db = AppState.database;
    if (!db) { reject(new Error('IndexedDB 尚未初始化。'));
      return; }
    const transaction = db.transaction(CONFIG.STORE_NAME, 'readwrite');
    const store = transaction.objectStore(CONFIG.STORE_NAME);
    store.put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function dbDelete(key) {
  return new Promise((resolve, reject) => {
    const db = AppState.database;
    if (!db) { reject(new Error('IndexedDB 尚未初始化。'));
      return; }
    const transaction = db.transaction(CONFIG.STORE_NAME, 'readwrite');
    const store = transaction.objectStore(CONFIG.STORE_NAME);
    store.delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function loadLayerText(textKey) {
  return dbGet(CONFIG.TEXT_KEY_PREFIX + textKey);
}

export function deleteLayerText(layerData) {
  if (!layerData || !layerData.textKey) return Promise.resolve();
  return dbDelete(CONFIG.TEXT_KEY_PREFIX + layerData.textKey);
}

export function deleteAllLayerTexts() {
  return new Promise((resolve, reject) => {
    const db = AppState.database;
    if (!db) { resolve();
      return; }
    const transaction = db.transaction(CONFIG.STORE_NAME, 'readwrite');
    const store = transaction.objectStore(CONFIG.STORE_NAME);
    const request = store.getAllKeys();
    request.onsuccess = () => {
      (request.result || []).forEach(key => {
        if (typeof key === 'string' && key.startsWith(CONFIG.TEXT_KEY_PREFIX)) {
          store.delete(key);
        }
      });
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function getAutoSaveEnabled() {
  const value = localStorage.getItem(CONFIG.AUTO_SAVE_KEY);
  return value === null ? true : value === 'true';
}

export function setAutoSaveEnabled(enabled) {
  localStorage.setItem(CONFIG.AUTO_SAVE_KEY, enabled ? 'true' : 'false');
}

function getCurrentMapState() {
  const view = AppState.view;
  return {
    savedAt: new Date().toISOString(),
    wmtsLayer: DOM.wmtsLayerSelect.value || null,
    view: {
      center: view.getCenter() || null,
      zoom: view.getZoom() || CONFIG.DEFAULT_ZOOM,
      rotation: view.getRotation() || 0,
    },
    kmlLayers: AppState.kmlLayers.map(layerData => ({
      name: layerData.name,
      format: layerData.format || 'kml',
      textKey: layerData.textKey,
      visible: layerData.layer.getVisible(),
      opacity: layerData.opacity !== undefined ? layerData.opacity : CONFIG.DEFAULT_OPACITY,
      pointRadius: layerData.pointRadius || CONFIG.DEFAULT_POINT_RADIUS,
      pointLabelSize: layerData.pointLabelSize || CONFIG.DEFAULT_POINT_LABEL_SIZE,
      pointLabelField: layerData.pointLabelField || 'name',
    })),
  };
}

export async function saveCurrentMapState() {
  const db = AppState.database;
  if (!db) return;
  if (!DOM.autoSaveCheckbox.checked) return;
  if (AppState.isRestoring) return;

  try {
    // 每個圖層的原始文字只在第一次儲存時寫入獨立的 key。
    // 之後的存檔（平移、縮放、調整透明度等）只更新小筆 metadata，不再複製整份大檔文字。
    for (const layerData of AppState.kmlLayers) {
      if (!layerData.textStored) {
        await dbSet(CONFIG.TEXT_KEY_PREFIX + layerData.textKey, layerData.text);
        layerData.textStored = true;
      }
    }
    const state = getCurrentMapState();
    await dbSet(CONFIG.STATE_KEY, state);
  } catch (error) {
    console.warn('儲存資料失敗：', error);
    if (error.name === 'QuotaExceededError') {
      setStatus('檔案太大，瀏覽器儲存空間不足，無法自動記錄。', 'warn');
    }
  }
}

export function scheduleSaveMapState() {
  if (!DOM.autoSaveCheckbox.checked) return;
  if (AppState.isRestoring) return;
  clearTimeout(AppState.saveTimer);
  AppState.saveTimer = setTimeout(saveCurrentMapState, CONFIG.SAVE_DEBOUNCE_MS);
}
