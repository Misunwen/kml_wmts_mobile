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
