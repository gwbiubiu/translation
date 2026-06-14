var LANG_NAMES = { zh: '中文', en: '英语' };

var inputEl = document.getElementById('inputText');
var outputEl = document.getElementById('outputText');
var spinnerEl = document.getElementById('spinner');
var srcLabel = document.getElementById('srcLabel');
var tgtLabel = document.getElementById('tgtLabel');
var charCount = document.getElementById('charCount');
var copyBtn = document.getElementById('copyBtn');

var debounceTimer = null;
var lastText = '';

document.getElementById('settingsBtn').addEventListener('click', function () {
  chrome.runtime.openOptionsPage();
});
document.getElementById('clearBtn').addEventListener('click', clearInput);
document.getElementById('copyBtn').addEventListener('click', copyResult);
document.getElementById('clearAllBtn').addEventListener('click', clearAllVocab);
document.getElementById('exportBtn').addEventListener('click', exportVocab);

// ── Tab switching ──────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(function (tab) {
  tab.addEventListener('click', function () {
    var target = this.dataset.tab;
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
    this.classList.add('active');
    document.getElementById('panel-' + target).classList.add('active');
    if (target === 'vocab') loadVocab();
  });
});

// ── Translation ────────────────────────────────────────────────────

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

  var result = await new Promise(function (resolve) {
    chrome.runtime.sendMessage({ type: 'translate', text: text }, resolve);
  });

  spinnerEl.style.display = 'none';
  outputEl.style.display = 'block';

  if (result && result.translated) {
    outputEl.textContent = result.translated;
    outputEl.classList.remove('placeholder');
    updateLangBar(result.from, result.to);
    copyBtn.style.display = 'inline-block';
  } else {
    showError(result && result.error ? result.error : '翻译结果为空');
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

// ── Vocab tab ──────────────────────────────────────────────────────

function loadVocab() {
  chrome.storage.local.get('savedVocab', function (data) {
    renderVocabList(data.savedVocab || []);
  });
}

function renderVocabList(items) {
  var list = document.getElementById('vocabList');
  var empty = document.getElementById('vocabEmpty');
  var countEl = document.getElementById('vocabCount');
  var exportBtn = document.getElementById('exportBtn');
  var clearAllBtn = document.getElementById('clearAllBtn');

  countEl.textContent = items.length + ' 个词汇';
  exportBtn.disabled = items.length === 0;
  clearAllBtn.style.display = items.length > 0 ? '' : 'none';

  list.innerHTML = '';

  if (!items.length) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  items.forEach(function (item) {
    var isWord = item.type === 'word';
    var sourceText = isWord ? (item.word || '') : (item.text || '');
    var transText = isWord ? (item.translation || '') : (item.translated || '');
    var langText = (LANG_NAMES[item.from] || item.from || '') + ' → ' + (LANG_NAMES[item.to] || item.to || '');
    var dateText = new Date(item.savedAt).toLocaleDateString('zh-CN');

    var el = document.createElement('div');
    el.className = 'vocab-item';
    el.innerHTML =
      '<div class="vocab-item-header">' +
        '<span class="vocab-type-badge ' + (isWord ? 'word' : 'phrase') + '">' + (isWord ? '词汇' : '短语') + '</span>' +
        '<span class="vocab-lang">' + esc(langText) + '</span>' +
        '<span class="vocab-date">' + esc(dateText) + '</span>' +
        '<button class="vocab-delete" title="删除">×</button>' +
      '</div>' +
      '<div class="vocab-item-body">' +
        '<div class="vocab-source" title="' + esc(sourceText) + '">' + esc(sourceText) + '</div>' +
        '<div class="vocab-translation">' + esc(transText) + '</div>' +
      '</div>';

    el.querySelector('.vocab-delete').addEventListener('click', function () {
      deleteVocabItem(item.id);
    });

    list.appendChild(el);
  });
}

function deleteVocabItem(id) {
  chrome.storage.local.get('savedVocab', function (data) {
    var items = (data.savedVocab || []).filter(function (i) { return i.id !== id; });
    chrome.storage.local.set({ savedVocab: items }, function () {
      renderVocabList(items);
    });
  });
}

function clearAllVocab() {
  if (!confirm('确定要清空所有收藏词汇吗？')) return;
  chrome.storage.local.set({ savedVocab: [] }, function () {
    renderVocabList([]);
  });
}

// ── Excel export ───────────────────────────────────────────────────

function exportVocab() {
  chrome.storage.local.get('savedVocab', function (data) {
    var items = data.savedVocab || [];
    if (!items.length) return;

    var wb = XLSX.utils.book_new();

    var ws = XLSX.utils.json_to_sheet(items.map(function (i) {
      return {
        '词汇': i.type === 'word' ? (i.word || '') : (i.text || ''),
        '翻译': i.type === 'word' ? (i.translation || '') : (i.translated || '')
      };
    }));
    ws['!cols'] = [{ wch: 32 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws, '我的词汇');

    var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    var blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '我的词汇_' + new Date().toLocaleDateString('zh-CN').replace(/\//g, '-') + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// ── Utils ──────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
