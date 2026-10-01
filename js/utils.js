import { DOM } from './state.js';

export function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value);
  return div.innerHTML;
}

export function sanitizeKmlText(kmlText) {
  const text = String(kmlText);
  // 若文字中完全沒有需要清理的模式，逐項 replace 都會是 no-op，直接回傳原字串。
  // 這讓大檔（數十 MB）免於跑四次全域掃描與可能的正則回溯。
  if (!/<script|\son\w+\s*=|javascript\s*:/i.test(text)) return text;
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript\s*:/gi, '');
}

export function isValidGisFile(file) {
  const name = file.name.toLowerCase();
  const validExts = ['.kml', '.kmz', '.gpx'];
  return validExts.some(ext => name.endsWith(ext));
}

export function getFileFormat(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.kml')) return 'kml';
  if (name.endsWith('.kmz')) return 'kmz';
  if (name.endsWith('.gpx')) return 'gpx';
  return null;
}

export function getFileIcon(format) {
  switch (format) {
    case 'kml':
      return '📄';
    case 'kmz':
      return '📦';
    case 'gpx':
      return '📍';
    default:
      return '🗺️';
  }
}

export function getFileBadge(format) {
  switch (format) {
    case 'kml':
      return '<span class="formatBadge kml">KML</span>';
    case 'kmz':
      return '<span class="formatBadge kmz">KMZ</span>';
    case 'gpx':
      return '<span class="formatBadge gpx">GPX</span>';
    default:
      return '';
  }
}

export function setStatus(message, level = 'info') {
  const el = DOM.status;
  const prefix = level === 'error' ? '❌ ' :
    level === 'warn' ? '⚠️ ' : '';
  el.textContent = prefix + message;
}

export function updateProgress(current, total, fileName) {
  const container = DOM.progressContainer;
  const bar = DOM.progressBar;
  const text = DOM.progressText;

  if (total === 0) {
    container.classList.remove('active');
    return;
  }

  container.classList.add('active');
  const percent = Math.round((current / total) * 100);
  bar.style.width = percent + '%';
  text.textContent = `載入中 (${current}/${total})：${fileName || ''}`;

  if (current >= total) {
    setTimeout(() => container.classList.remove('active'), 800);
  }
}
