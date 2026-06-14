var DEFAULT_API = 'http://localhost:5000';

async function callTranslate(text) {
  var storage = await chrome.storage.sync.get('apiBase');
  var apiBase = storage.apiBase || DEFAULT_API;
  var url = apiBase + '/translate';

  console.log('[translate] fetch ->', url);

  var controller = new AbortController();
  var tid = setTimeout(function () { controller.abort(); }, 8000);

  try {
    // 用 text/plain 触发简单请求，避免 OPTIONS 预检被 Chrome PNA 拦截
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ text: text }),
      signal: controller.signal,
    });
    clearTimeout(tid);
    console.log('[translate] HTTP', res.status);

    var raw = await res.text();
    console.log('[translate] body:', raw.slice(0, 200));

    if (!raw) {
      return { error: 'HTTP ' + res.status + ' empty response', translated: '', from: '', to: '' };
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return { error: 'HTTP ' + res.status + ': ' + raw.slice(0, 200), translated: '', from: '', to: '' };
    }
  } catch (e) {
    clearTimeout(tid);
    console.error('[translate] error:', e.name, e.message);
    return { error: e.name + ': ' + e.message, translated: '', from: '', to: '' };
  }
}

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (msg.type !== 'translate') return;
  callTranslate(msg.text).then(function (result) {
    sendResponse(result);
  });
  return true;
});

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      id: 'translate-selection',
      title: '翻译选中文字',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId !== 'translate-selection') return;
  var text = (info.selectionText || '').trim();
  if (!text) return;

  callTranslate(text).then(function (result) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: showTooltip,
      args: [result.translated || '翻译失败', result.from || '', result.to || ''],
    });
  });
});

// 注入到页面的函数，不能引用外部变量，不能用 innerHTML + onclick（CSP 限制）
function showTooltip(translated, from, to) {
  var LANG = { zh: '中文', en: '英文' };
  var old = document.getElementById('__st_tip__');
  if (old) old.remove();

  var box = document.createElement('div');
  box.id = '__st_tip__';
  box.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;' +
    'max-width:360px;background:#fff;border-radius:12px;' +
    'box-shadow:0 4px 24px rgba(0,0,0,0.15);padding:14px 16px;' +
    'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;' +
    'font-size:14px;line-height:1.65;color:#1a1a1a;';

  var header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';

  var langSpan = document.createElement('span');
  langSpan.style.cssText = 'font-size:12px;color:#888;';
  langSpan.textContent = (LANG[from] || from) + ' -> ' + (LANG[to] || to);

  var closeBtn = document.createElement('button');
  closeBtn.textContent = 'x';
  closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:#bbb;font-size:18px;line-height:1;padding:0;';
  closeBtn.addEventListener('click', function () { box.remove(); });

  var body = document.createElement('div');
  body.textContent = translated;

  header.appendChild(langSpan);
  header.appendChild(closeBtn);
  box.appendChild(header);
  box.appendChild(body);
  document.body.appendChild(box);

  setTimeout(function () { if (box.parentNode) box.remove(); }, 10000);
}
