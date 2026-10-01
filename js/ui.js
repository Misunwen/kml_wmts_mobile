import { CONFIG } from './config.js';
import { AppState, DOM } from './state.js';
import { getFileIcon, getFileBadge, setStatus } from './utils.js';
import {
  updatePointStyles,
  updateLayerOpacity,
  zoomToLayer,
  removeKmlLayer,
  moveKmlLayer,
  clearCurrentLayers,
} from './layers.js';
import {
  scheduleSaveMapState,
  saveCurrentMapState,
  dbDelete,
  deleteAllLayerTexts,
  setAutoSaveEnabled,
} from './storage.js';
import { setWmtsLayer } from './map.js';
import { handleFiles } from './io.js';
import { performLocation } from './location.js';

let pointStyleRaf = null;
const pendingPointStyleLayers = new Set();

function schedulePointStyleUpdate(layerData) {
  pendingPointStyleLayers.add(layerData);
  if (pointStyleRaf !== null) return;
  pointStyleRaf = requestAnimationFrame(() => {
    pointStyleRaf = null;
    const layers = Array.from(pendingPointStyleLayers);
    pendingPointStyleLayers.clear();
    layers.forEach(updatePointStyles);
  });
}

export function renderLayerList() {
  const el = DOM.layerList;
  el.innerHTML = '';

  if (AppState.kmlLayers.length === 0) {
    el.innerHTML = '<div style="color:#666; font-size:14px;">尚未載入任何檔案。</div>';
    return;
  }

  AppState.kmlLayers.forEach((layerData, index) => {
    const container = document.createElement('div');
    container.className = 'layerItem';

    // ---- 第一行 ----
    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex; align-items:center; gap:4px; width:100%; flex-wrap:wrap;';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = layerData.layer.getVisible();
    checkbox.title = '顯示或隱藏圖層';
    checkbox.addEventListener('change', function() {
      layerData.layer.setVisible(this.checked);
      scheduleSaveMapState();
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'layerName';
    const icon = getFileIcon(layerData.format);
    const badge = getFileBadge(layerData.format);
    const hasPointIcon = layerData.hasPoints ? '📍' : '🗺️';
    nameSpan.innerHTML =
      `[${index + 1}] ${icon} ${hasPointIcon} ${layerData.name} ${badge}`;
    nameSpan.title = '點擊展開/收合圖層設定';

    nameSpan.addEventListener('click', function(e) {
      e.stopPropagation();
      const settings = container.querySelector('.layerSettings');
      if (settings) {
        const isVisible = settings.classList.toggle('visible');
        layerData.settingsExpanded = isVisible;
        scheduleSaveMapState();
      }
    });

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.textContent = '↑';
    upBtn.className = 'layerMoveBtn';
    upBtn.title = '圖層往上移';
    upBtn.disabled = index === AppState.kmlLayers.length - 1;
    upBtn.addEventListener('click', () => moveKmlLayer(layerData.id, +1));

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.textContent = '↓';
    downBtn.className = 'layerMoveBtn';
    downBtn.title = '圖層往下移';
    downBtn.disabled = index === 0;
    downBtn.addEventListener('click', () => moveKmlLayer(layerData.id, -1));

    const zoomBtn = document.createElement('button');
    zoomBtn.type = 'button';
    zoomBtn.textContent = '定位';
    zoomBtn.title = '縮放至此圖層範圍';
    zoomBtn.addEventListener('click', () => zoomToLayer(layerData));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.title = '移除此圖層';
    removeBtn.style.color = '#b33';
    removeBtn.addEventListener('click', () => removeKmlLayer(layerData.id));

    row1.appendChild(checkbox);
    row1.appendChild(nameSpan);
    row1.appendChild(upBtn);
    row1.appendChild(downBtn);
    row1.appendChild(zoomBtn);
    row1.appendChild(removeBtn);
    container.appendChild(row1);

    // ---- 第二行：設定區 ----
    const settings = document.createElement('div');
    settings.className = 'layerSettings';
    if (layerData.settingsExpanded) {
      settings.classList.add('visible');
    }

    // 透明度
    const opacityLabel = document.createElement('label');
    opacityLabel.innerHTML = '<span class="settingLabel">透明度</span>';
    const opacityRange = document.createElement('input');
    opacityRange.type = 'range';
    opacityRange.min = '0';
    opacityRange.max = '100';
    opacityRange.value = String(Math.round((layerData.opacity || CONFIG.DEFAULT_OPACITY) * 100));
    opacityRange.step = '1';
    const opacityValue = document.createElement('span');
    opacityValue.className = 'opacityValue';
    opacityValue.textContent = opacityRange.value + '%';

    opacityRange.addEventListener('input', function() {
      const val = parseInt(this.value) / 100;
      opacityValue.textContent = this.value + '%';
      layerData.opacity = val;
      updateLayerOpacity(layerData);
      scheduleSaveMapState();
    });

    opacityLabel.appendChild(opacityRange);
    opacityLabel.appendChild(opacityValue);
    settings.appendChild(opacityLabel);

    // 點設定（僅 KML/KMZ 且有點圖徵時顯示）
    if (layerData.isKmlFormat && layerData.hasPoints) {
      const sep1 = document.createElement('span');
      sep1.className = 'sep';
      sep1.textContent = '｜';
      settings.appendChild(sep1);

      // 點標記大小
      const radiusLabel = document.createElement('label');
      radiusLabel.innerHTML = '<span class="settingLabel">標記</span>';
      const radiusRange = document.createElement('input');
      radiusRange.type = 'range';
      radiusRange.min = String(CONFIG.MIN_POINT_RADIUS);
      radiusRange.max = String(CONFIG.MAX_POINT_RADIUS);
      radiusRange.value = String(layerData.pointRadius || CONFIG.DEFAULT_POINT_RADIUS);
      radiusRange.step = '1';
      const radiusValue = document.createElement('span');
      radiusValue.className = 'sizeValue';
      radiusValue.textContent = radiusRange.value + 'px';

      radiusRange.addEventListener('input', function() {
        const val = parseInt(this.value);
        radiusValue.textContent = val + 'px';
        layerData.pointRadius = val;
        schedulePointStyleUpdate(layerData);
        scheduleSaveMapState();
      });

      radiusLabel.appendChild(radiusRange);
      radiusLabel.appendChild(radiusValue);
      settings.appendChild(radiusLabel);

      const sep2 = document.createElement('span');
      sep2.className = 'sep';
      sep2.textContent = '｜';
      settings.appendChild(sep2);

      // 標籤欄位
      const fieldLabel = document.createElement('label');
      fieldLabel.innerHTML = '<span class="settingLabel">欄位</span>';
      const fieldSelect = document.createElement('select');
      fieldSelect.title = '選擇要顯示的欄位';

      const fieldOptions = ['name', 'description', 'title', '標題'];
      const available = layerData.availableFields || [];
      const allFields = [...new Set([...fieldOptions, ...available])].filter(f => f);

      allFields.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        if (f === layerData.pointLabelField) opt.selected = true;
        fieldSelect.appendChild(opt);
      });

      if (layerData.pointLabelField && !allFields.includes(layerData.pointLabelField)) {
        const opt = document.createElement('option');
        opt.value = layerData.pointLabelField;
        opt.textContent = layerData.pointLabelField + ' (自訂)';
        opt.selected = true;
        fieldSelect.appendChild(opt);
      }

      fieldSelect.addEventListener('change', function() {
        layerData.pointLabelField = this.value;
        updatePointStyles(layerData);
        scheduleSaveMapState();
      });

      fieldLabel.appendChild(fieldSelect);
      settings.appendChild(fieldLabel);

      const sep3 = document.createElement('span');
      sep3.className = 'sep';
      sep3.textContent = '｜';
      settings.appendChild(sep3);

      // 標籤文字大小
      const sizeLabel = document.createElement('label');
      sizeLabel.innerHTML = '<span class="settingLabel">字體</span>';
      const sizeInput = document.createElement('input');
      sizeInput.type = 'number';
      sizeInput.min = CONFIG.MIN_POINT_LABEL_SIZE;
      sizeInput.max = CONFIG.MAX_POINT_LABEL_SIZE;
      sizeInput.value = layerData.pointLabelSize || CONFIG.DEFAULT_POINT_LABEL_SIZE;
      sizeInput.step = '1';
      sizeInput.title = '標籤文字大小 (8~28)';

      sizeInput.addEventListener('change', function() {
        let val = parseInt(this.value) || CONFIG.DEFAULT_POINT_LABEL_SIZE;
        val = Math.min(Math.max(val, CONFIG.MIN_POINT_LABEL_SIZE), CONFIG.MAX_POINT_LABEL_SIZE);
        this.value = val;
        layerData.pointLabelSize = val;
        updatePointStyles(layerData);
        scheduleSaveMapState();
      });

      sizeLabel.appendChild(sizeInput);
      settings.appendChild(sizeLabel);
    }

    container.appendChild(settings);
    el.appendChild(container);
  });
}

export function bindEvents() {
  DOM.togglePanelBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    togglePanel();
  });
  DOM.panelHeader.addEventListener('click', togglePanel);

  function togglePanel() {
    const collapsed = DOM.controlPanel.classList.contains('collapsed');
    DOM.controlPanel.classList.toggle('collapsed', !collapsed);
    DOM.togglePanelBtn.textContent = collapsed ? '−' : '+';
    DOM.togglePanelBtn.title = collapsed ? '收合控制欄' : '展開控制欄';
  }

  if (window.matchMedia('(max-width: 700px)').matches) {
    DOM.controlPanel.classList.add('collapsed');
    DOM.togglePanelBtn.textContent = '+';
  }

  function applyPanelSide(side) {
    const isRight = side === 'right';
    DOM.controlPanel.classList.toggle('panel-right', isRight);
    DOM.toggleSideBtn.title = isRight ? '切換面板至左側' : '切換面板至右側';
  }

  let panelSide = localStorage.getItem(CONFIG.PANEL_SIDE_KEY) === 'right' ? 'right' : 'left';
  applyPanelSide(panelSide);

  DOM.toggleSideBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    panelSide = panelSide === 'right' ? 'left' : 'right';
    localStorage.setItem(CONFIG.PANEL_SIDE_KEY, panelSide);
    applyPanelSide(panelSide);
  });

  DOM.wmtsLayerSelect.addEventListener('change', function() {
    setWmtsLayer(this.value);
  });

  DOM.locationBtn.addEventListener('click', performLocation);

  DOM.fileInput.addEventListener('change', function(event) {
    if (event.target.files.length > 0) {
      handleFiles(event.target.files);
    }
  });

  DOM.autoSaveCheckbox.addEventListener('change', async function() {
    setAutoSaveEnabled(this.checked);
    if (this.checked) {
      await saveCurrentMapState();
      setStatus('已啟用自動記錄。');
    } else {
      try {
        await dbDelete(CONFIG.STATE_KEY);
        await deleteAllLayerTexts();
        setStatus('已關閉自動記錄並清除之前保存的資料。');
      } catch (error) {
        console.warn(error);
      }
    }
  });

  DOM.clearAllBtn.addEventListener('click', async function() {
    if (AppState.kmlLayers.length === 0) {
      alert('目前沒有已載入的圖層。');
      return;
    }
    if (!confirm('確定要清除目前所有圖層嗎？\n\n下次開啟網頁時，這些圖層不會再自動還原。')) return;

    clearCurrentLayers();
    if (DOM.autoSaveCheckbox.checked) {
      await saveCurrentMapState();
    } else {
      await dbDelete(CONFIG.STATE_KEY);
    }
    setStatus('已清除所有圖層。');
  });

  DOM.clearSavedDataBtn.addEventListener('click', async function() {
    if (!confirm(
        '確定要清除快取資料嗎？\n\n將清除：\n' +
        '• 上次選擇的 WMTS 底圖\n' +
        '• 上次載入的圖層\n' +
        '• 圖層顯示狀態與順序\n' +
        '• 地圖中心位置與縮放設定\n\n' +
        '不會刪除手機或電腦中的原始檔案。'
      )) return;

    try {
      AppState.isRestoring = true;
      clearTimeout(AppState.saveTimer);
      clearCurrentLayers();
      await dbDelete(CONFIG.STATE_KEY);
      await deleteAllLayerTexts();
      localStorage.removeItem(CONFIG.AUTO_SAVE_KEY);
      DOM.autoSaveCheckbox.checked = true;
      setStatus('已清除快取資料與之前載入的圖層。');
    } catch (error) {
      console.error(error);
      setStatus(`清除快取資料失敗：${error.message}`, 'error');
    } finally {
      AppState.isRestoring = false;
    }
  });
}
