import { CONFIG } from './config.js';
import { AppState, DOM } from './state.js';
import { setStatus } from './utils.js';

export function showUserLocation(coordinate, accuracy) {
  const map = AppState.map;
  if (AppState.userLocationLayer) map.removeLayer(AppState.userLocationLayer);

  const locationFeature = new ol.Feature({
    geometry: new ol.geom.Point(coordinate),
  });
  const accuracyFeature = new ol.Feature({
    geometry: new ol.geom.Circle(coordinate, accuracy),
  });

  const layer = new ol.layer.Vector({
    source: new ol.source.Vector({ features: [accuracyFeature, locationFeature] }),
    zIndex: 999,
    style: function(feature) {
      const geomType = feature.getGeometry().getType();
      if (geomType === 'Circle') {
        return new ol.style.Style({
          fill: new ol.style.Fill({ color: 'rgba(30, 120, 255, 0.13)' }),
          stroke: new ol.style.Stroke({ color: 'rgba(30, 120, 255, 0.75)', width: 2 }),
        });
      }
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 8,
          fill: new ol.style.Fill({ color: '#1677ff' }),
          stroke: new ol.style.Stroke({ color: '#ffffff', width: 3 }),
        }),
      });
    },
  });

  AppState.userLocationLayer = layer;
  map.addLayer(layer);
}

export function performLocation() {
  if (!navigator.geolocation) {
    alert('此瀏覽器不支援定位功能。');
    return;
  }

  const btn = DOM.locationBtn;
  btn.disabled = true;
  btn.textContent = '正在定位...';
  setStatus('正在要求定位權限與取得目前位置...');

  if (AppState.locationWatchId !== null) {
    navigator.geolocation.clearWatch(AppState.locationWatchId);
    AppState.locationWatchId = null;
  }

  navigator.geolocation.getCurrentPosition(
    function(position) {
      const lon = position.coords.longitude;
      const lat = position.coords.latitude;
      const accuracy = position.coords.accuracy;
      const coord = ol.proj.fromLonLat([lon, lat]);

      showUserLocation(coord, accuracy);
      AppState.view.animate({ center: coord, zoom: 17, duration: 600 });

      btn.disabled = false;
      btn.textContent = '📍 定位到我的位置';
      setStatus(
        `定位完成。經度：${lon.toFixed(6)}，緯度：${lat.toFixed(6)}，誤差約 ±${Math.round(accuracy)} 公尺。`);
    },
    function(error) {
      btn.disabled = false;
      btn.textContent = '📍 定位到我的位置';

      let message = '定位失敗。';
      switch (error.code) {
        case error.PERMISSION_DENIED:
          message = '定位被拒絕。請在瀏覽器網站權限中允許位置資訊。';
          break;
        case error.POSITION_UNAVAILABLE:
          message = '目前無法取得位置，請確認 GPS、行動網路或 Wi-Fi 已啟用。';
          break;
        case error.TIMEOUT:
          message = '定位逾時，請到戶外或訊號較佳的位置後再試一次。';
          break;
      }
      setStatus(message, 'error');
      alert(message);
    }, {
      enableHighAccuracy: true,
      timeout: CONFIG.LOCATION_TIMEOUT_MS,
      maximumAge: CONFIG.LOCATION_MAX_AGE_MS,
    }
  );
}
