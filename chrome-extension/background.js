var DEFAULT_API = 'http://127.0.0.1:5000';

// ── Paid: AI translation via Flask backend ──────────────────────────

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
    if (e.name === 'AbortError') {
      return { error: '请求超时，请检查翻译服务是否已启动', translated: '', from: '', to: '' };
    }
    console.error('[translate] error:', e.name, e.message);
    return { error: e.name + ': ' + e.message, translated: '', from: '', to: '' };
  }
}

// ── Free: Youdao translation + vocab ───────────────────────────────


var STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'shall','can','this','that','these','those','i','you','he','she','it',
  'we','they','what','which','who','when','where','why','how','all','each',
  'every','both','few','more','most','other','some','such','no','nor','not',
  'only','own','same','so','than','too','very','just','and','or','but','if',
  'in','on','at','to','for','of','with','by','from','up','about','into',
  'through','during','before','after','above','below','between','out','off',
  'over','under','again','further','then','once','here','there','while','as',
  'its','our','their','my','your','his','her','also','am','use','used',
  'using','new','one','two','get','got','make','made','like','well','back',
  'even','much','many','way','see','come','go','think','know','take','give',
]);

async function extractVocabFree(text) {
  var words = text.toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/\s+/)
    .map(function (w) { return w.replace(/^['-]+|['-]+$/g, ''); })
    .filter(function (w) { return w.length > 3 && !STOP_WORDS.has(w); });

  var seen = new Set();
  var unique = [];
  words.forEach(function (w) {
    if (!seen.has(w)) { seen.add(w); unique.push(w); }
  });

  var candidates = unique.slice(0, 8);

  var results = await Promise.all(candidates.map(async function (word) {
    try {
      var url = 'https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(word) +
                '&le=eng&client=web&jsonversion=2';
      var res = await fetch(url);
      var data = await res.json();
      var parsed = parseYoudaoDict(data);
      var translation = parsed.meanings.length > 0 ? parsed.meanings[0].def : '';
      return translation ? { word: word, translation: translation } : null;
    } catch (e) { return null; }
  }));

  return results.filter(function (r) { return r !== null; });
}

function detectLang(text) {
  return /[一-鿿]/.test(text) ? 'zh' : 'en';
}

async function callFreeTranslate(text) {
  var from = detectLang(text);
  var tl   = from === 'zh' ? 'en' : 'zh-CN';
  var url  = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
             encodeURIComponent(tl) + '&dt=t&q=' + encodeURIComponent(text);
  try {
    var res = await fetch(url);
    if (!res.ok) {
      return { error: 'HTTP ' + res.status, translated: '', from: from, to: '', vocab: [] };
    }
    var data = await res.json();
    var translated = (data[0] || []).map(function (p) { return p[0] || ''; }).join('');
    var detectedFrom = (data[2] || from);
    var normFrom = detectedFrom.indexOf('zh') === 0 ? 'zh' : detectedFrom;
    var normTo   = tl.indexOf('zh') === 0 ? 'zh' : tl;
    var vocab = (normFrom === 'en') ? await extractVocabFree(text) : [];

    return { translated: translated, from: normFrom, to: normTo, vocab: vocab };
  } catch (e) {
    return { error: e.name + ': ' + e.message, translated: '', from: '', to: '', vocab: [] };
  }
}

// ── Shared: Youdao dict parser ──────────────────────────────────────

function parseYoudaoDict(data) {
  var result = { phonetic: '', meanings: [] };
  try {
    var ec = data && data.ec;
    if (!ec) return result;
    var word = ec.word && ec.word[0];
    if (!word) return result;
    result.phonetic = (word.usphone || word.ukphone || '').trim();
    var trs = word.trs || [];
    trs.slice(0, 4).forEach(function (tr) {
      var pos = (tr.pos || '').trim();
      var defs = [];
      if (tr.tr) {
        tr.tr.forEach(function (t) {
          if (t.l && t.l.i) {
            var items = Array.isArray(t.l.i) ? t.l.i : [t.l.i];
            items.forEach(function (item) {
              var s = typeof item === 'string' ? item : (item && item.w ? item.w : '');
              if (s.trim()) defs.push(s.trim());
            });
          }
        });
      }
      if (pos || defs.length) {
        result.meanings.push({ pos: pos, def: defs.slice(0, 3).join('；') });
      }
    });
  } catch (e) {}
  return result;
}

function getTranslateFn(cb) {
  chrome.storage.sync.get('userTier', function (s) {
    cb(s.userTier === 'paid' ? callTranslate : callFreeTranslate);
  });
}

chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
  if (msg.type === 'translate') {
    getTranslateFn(function (fn) {
      fn(msg.text).then(function (result) { sendResponse(result); });
    });
    return true;
  }
  if (msg.type === 'dictlookup') {
    var url = 'https://dict.youdao.com/jsonapi?q=' + encodeURIComponent(msg.word) +
              '&le=eng&client=web&jsonversion=2';
    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) { sendResponse(parseYoudaoDict(data)); })
      .catch(function () { sendResponse({ phonetic: '', meanings: [] }); });
    return true;
  }
  if (msg.type === 'fetchaudio') {
    fetch(msg.url)
      .then(function (res) { return res.arrayBuffer(); })
      .then(function (buf) {
        sendResponse({ ok: true, data: Array.from(new Uint8Array(buf)) });
      })
      .catch(function () { sendResponse({ ok: false }); });
    return true;
  }
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

  getTranslateFn(function (fn) {
    fn(text).then(function (result) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: showTooltip,
        args: [result.translated || '翻译失败', result.from || '', result.to || ''],
      });
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
