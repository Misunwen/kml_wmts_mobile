import { CONFIG } from './config.js';
import { AppState, DOM } from './state.js';
import { isValidGisFile, getFileFormat, setStatus, updateProgress } from './utils.js';
import { parseKmz } from './parsers.js';
import { createLayerFromContent, zoomToLayer } from './layers.js';

export function loadSingleFile(file, index, total) {
  return new Promise((resolve) => {
    if (!isValidGisFile(file)) {
      setStatus(`略過不支援的檔案：${file.name}`, 'warn');
      resolve(null);
      return;
    }

    const format = getFileFormat(file);
    updateProgress(index - 1, total, file.name);
    setStatus(`正在讀取：${file.name} (${format.toUpperCase()})`);

    const reader = new FileReader();

    reader.onload = async function(event) {
      try {
        let content = event.target.result;
        let finalFormat = format;

        // KMZ 需要解壓縮
        if (format === 'kmz') {
          try {
            const kmlText = await parseKmz(event.target.result);
            content = kmlText;
            finalFormat = 'kml'; // 解壓縮後轉為 KML 處理
            setStatus(`已解壓縮 KMZ：${file.name}`);
          } catch (zipError) {
            throw new Error(`KMZ 解壓縮失敗：${zipError.message}`);
          }
        }

        // GPX 用文字讀取
        if (format === 'gpx' && typeof content !== 'string') {
          // 如果是 ArrayBuffer，轉為文字
          const decoder = new TextDecoder('UTF-8');
          content = decoder.decode(content);
        }

        // KML 如果是 ArrayBuffer，轉為文字
        if ((format === 'kml' || finalFormat === 'kml') && typeof content !== 'string') {
          const decoder = new TextDecoder('UTF-8');
          content = decoder.decode(content);
        }

        const layerData = createLayerFromContent(
          file.name,
          content,
          finalFormat,
          true,
          false,
          true
        );

        updateProgress(index, total, file.name);

        const featureCount = layerData.source.getFeatures().length;
        const typeLabel = finalFormat.toUpperCase();
        const accel = layerData.isWebGL ? '（WebGL 加速）' : '';
        setStatus(`已載入：${file.name} (${typeLabel})${accel}，共 ${featureCount} 個圖徵。`);

        resolve(layerData);

      } catch (error) {
        console.error(error);
        setStatus(`載入失敗 ${file.name}：${error.message}`, 'error');
        updateProgress(index, total, file.name);
        resolve(null);
      }
    };

    reader.onerror = function() {
      setStatus(`檔案讀取失敗：${file.name}`, 'error');
      updateProgress(index, total, file.name);
      resolve(null);
    };

    // 根據格式決定讀取方式
    if (format === 'kmz') {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  });
}

export async function handleFiles(files) {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) return;

  const remaining = CONFIG.MAX_LAYERS - AppState.kmlLayers.length;
  if (remaining <= 0) {
    alert(`目前最多只能同時載入 ${CONFIG.MAX_LAYERS} 個圖層。`);
    DOM.fileInput.value = '';
    return;
  }

  let loadFiles = fileArray;
  if (fileArray.length > remaining) {
    alert(`目前還可載入 ${remaining} 個檔案，超出的檔案不會載入。`);
    loadFiles = fileArray.slice(0, remaining);
  }

  DOM.progressContainer.classList.add('active');
  DOM.progressBar.style.width = '0%';

  let loadedCount = 0;
  const total = loadFiles.length;

  for (let i = 0; i < total; i++) {
    const result = await loadSingleFile(loadFiles[i], i + 1, total);
    if (result) loadedCount++;
  }

  updateProgress(total, total, '完成！');
  DOM.progressContainer.classList.remove('active');

  if (AppState.kmlLayers.length > 0 && loadedCount > 0) {
    zoomToLayer(AppState.kmlLayers[0]);
  }

    const webglCount = AppState.kmlLayers.filter(layerData => layerData.isWebGL).length;
    const accel = webglCount > 0 ? `（WebGL 加速 ${webglCount} 個）` : '';
    setStatus(`載入完成，成功載入 ${loadedCount} 個檔案${accel}。`);
    DOM.fileInput.value = '';
}
