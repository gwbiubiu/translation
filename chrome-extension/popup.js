var LANG_NAMES = { zh: '中文', en: '英文' };
var DEFAULT_API = 'http://127.0.0.1:5000';

var inputEl = document.getElementById('inputText');
var outputEl = document.getElementById('outputText');
var spinnerEl = document.getElementById('spinner');
var srcLabel = document.getElementById('srcLabel');
var tgtLabel = document.getElementById('tgtLabel');
var charCount = document.getElementById('charCount');
var copyBtn = document.getElementById('copyBtn');

var debounceTimer = null;
var lastText = '';
var apiBase = DEFAULT_API;

chrome.storage.sync.get('apiBase', function (s) {
  if (s.apiBase) apiBase = s.apiBase;
});

document.getElementById('settingsBtn').onclick = function () {
  chrome.runtime.openOptionsPage();
};

function detectLang(text) {
  return /[一-鿿]/.test(text) ? 'zh' : 'en';
}

function updateLangBar(from, to) {
  srcLabel.textContent = LANG_NAMES[from] || from;
  tgtLabel.textContent = LANG_NAMES[to] || to;
}

function showError(msg) {
  spinnerEl.style.display = 'none';
  outputEl.style.display = 'block';
  outputEl.textContent = msg;
  outputEl.classList.add('placeholder');
}

inputEl.addEventListener('input', function () {
  var text = inputEl.value;
  charCount.textContent = text.length + ' 字符';

  if (!text.trim()) {
    resetOutput();
    return;
  }

  var lang = detectLang(text);
  updateLangBar(lang, lang === 'zh' ? 'en' : 'zh');

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(function () { doTranslate(text); }, 600);
});

async function doTranslate(text) {
  if (text === lastText) return;
  lastText = text;

  spinnerEl.style.display = 'block';
  outputEl.style.display = 'none';
  copyBtn.style.display = 'none';

  var url = apiBase + '/translate';
  console.log('[popup] fetch ->', url);

  try {
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ text: text }),
    });

    console.log('[popup] HTTP', res.status);
    var raw = await res.text();
    console.log('[popup] body:', raw.slice(0, 200));

    spinnerEl.style.display = 'none';
    outputEl.style.display = 'block';

    if (!raw) {
      showError('HTTP ' + res.status + ' 空响应');
      return;
    }

    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      showError('HTTP ' + res.status + ': ' + raw.slice(0, 200));
      return;
    }

    if (data.translated) {
      outputEl.textContent = data.translated;
      outputEl.classList.remove('placeholder');
      updateLangBar(data.from, data.to);
      copyBtn.style.display = 'inline-block';
    } else {
      showError(data.error ? data.error : '翻译结果为空');
    }
  } catch (e) {
    console.error('[popup] error:', e.name, e.message);
    showError(e.name + ': ' + e.message + ' (' + url + ')');
  }
}

function resetOutput() {
  lastText = '';
  outputEl.textContent = '翻译结果';
  outputEl.classList.add('placeholder');
  outputEl.style.display = 'block';
  spinnerEl.style.display = 'none';
  copyBtn.style.display = 'none';
  srcLabel.textContent = '自动检测';
  tgtLabel.textContent = '目标语言';
  charCount.textContent = '0 字符';
}

function clearInput() {
  inputEl.value = '';
  clearTimeout(debounceTimer);
  resetOutput();
}

function copyResult() {
  navigator.clipboard.writeText(outputEl.textContent).then(function () {
    copyBtn.textContent = '已复制 ✓';
    setTimeout(function () { copyBtn.textContent = '复制'; }, 1500);
  });
}
