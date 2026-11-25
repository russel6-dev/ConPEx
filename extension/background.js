// ConPEx service worker: buka halaman konverter dari ikon toolbar atau menu klik-kanan.
const PDF_RE = /\.pdf($|[?#])/i;

function openApp(src) {
  const q = src ? '?src=' + encodeURIComponent(src) : '';
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html' + q) });
}

chrome.action.onClicked.addListener((tab) => {
  const url = (tab && tab.url) || '';
  openApp(PDF_RE.test(url) ? url : '');
});

chrome.runtime.onInstalled.addListener(() => {
  const patterns = ['*://*/*.pdf', '*://*/*.pdf?*', '*://*/*.PDF', '*://*/*.PDF?*', 'file:///*.pdf', 'file:///*.PDF'];
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'conpex-link', title: 'Ubah PDF ini ke Excel (ConPEx)', contexts: ['link'], targetUrlPatterns: patterns });
    chrome.contextMenus.create({ id: 'conpex-page', title: 'Ubah PDF ini ke Excel (ConPEx)', contexts: ['page'], documentUrlPatterns: patterns });
  });
});

chrome.contextMenus.onClicked.addListener((info) => openApp(info.linkUrl || info.pageUrl || ''));
