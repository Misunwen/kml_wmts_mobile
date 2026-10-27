const KML_NS = 'http://www.opengis.net/kml/2.2';

function buildKmlDocument(sharedNodes, contentNodes) {
  const outDoc = document.implementation.createDocument(KML_NS, 'kml', null);
  const container = outDoc.createElementNS(KML_NS, 'Document');
  outDoc.documentElement.appendChild(container);
  sharedNodes.forEach(node => container.appendChild(outDoc.importNode(node, true)));
  contentNodes.forEach(node => container.appendChild(outDoc.importNode(node, true)));
  return new XMLSerializer().serializeToString(outDoc);
}

/**
 * 若 KML 的 Document 底下有多個頂層 <Folder>，把每個 Folder 拆成獨立且可單獨解析的 KML。
 * 只有 1 個 Folder（或沒有 Folder）時回傳原文，維持單一圖層行為。
 * @returns {Array<{name: string, text: string}>}
 */
export function splitKmlByFolders(kmlText, fileName) {
  const fallback = [{ name: fileName, text: kmlText }];

  let doc;
  try {
    doc = new DOMParser().parseFromString(kmlText, 'application/xml');
  } catch (error) {
    return fallback;
  }

  const root = doc.documentElement;
  if (!root || root.localName === 'parsererror' ||
      doc.getElementsByTagName('parsererror').length > 0) {
    return fallback;
  }

  const container = Array.from(root.children).find(el => el.localName === 'Document') || root;
  const children = Array.from(container.children);
  const shared = children.filter(el => ['Style', 'StyleMap', 'Schema'].includes(el.localName));
  const folders = children.filter(el => el.localName === 'Folder');
  const directPlacemarks = children.filter(el => el.localName === 'Placemark');

  if (folders.length < 2 && directPlacemarks.length === 0) {
    return fallback;
  }

  const parts = [];
  folders.forEach((folder, index) => {
    const nameEl = Array.from(folder.children).find(el => el.localName === 'name');
    const name = (nameEl && nameEl.textContent.trim()) || `資料夾 ${index + 1}`;
    parts.push({ name: name, text: buildKmlDocument(shared, [folder]) });
  });

  if (directPlacemarks.length > 0) {
    parts.push({ name: fileName, text: buildKmlDocument(shared, directPlacemarks) });
  }

  return parts;
}

export function parseGpx(gpxText) {
  const gpxFormat = new ol.format.GPX();
  const features = gpxFormat.readFeatures(gpxText, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  });

  if (!features || features.length === 0) {
    throw new Error('GPX 檔案沒有讀到任何航點、航跡或航線。');
  }

  // 為 GPX 的點設定名稱（如果有的話）
  features.forEach(f => {
    const name = f.get('name') || f.get('desc') || '';
    if (name) {
      f.set('name', name);
    }
  });

  return features;
}

export async function parseKmz(arrayBuffer) {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 尋找第一個 .kml 檔案
    let kmlFile = null;
    let kmlFileName = null;

    for (const [name, file] of Object.entries(zip.files)) {
      if (name.toLowerCase().endsWith('.kml') && !file.dir) {
        kmlFile = file;
        kmlFileName = name;
        break;
      }
    }

    if (!kmlFile) {
      throw new Error('KMZ 檔案中找不到 KML 檔案。');
    }

    const kmlText = await kmlFile.async('text');
    return kmlText;

  } catch (error) {
    if (error.message && error.message.includes('JSZip')) {
      throw new Error('KMZ 解壓縮失敗，請確認檔案格式正確。');
    }
    throw error;
  }
}
