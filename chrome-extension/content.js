(function () {
  var apiBase = 'http://127.0.0.1:5000';
  var dot = null;
  var card = null;
  var pendingText = '';

  chrome.storage.sync.get('apiBase', function (s) {
    if (s.apiBase) apiBase = s.apiBase;
  });

  // ── Event listeners ────────────────────────────────────────────────

  document.addEventListener('mouseup', function (e) {
    if (dot && dot.contains(e.target)) return;
    if (card && card.contains(e.target)) return;

    var mouseX = e.clientX;
    var mouseY = e.clientY;

    setTimeout(function () {
      var sel = window.getSelection();
      var text = sel ? sel.toString().trim() : '';
      if (text.length < 2) { removeDot(); return; }
      pendingText = text;
      showDot(mouseX, mouseY);
    }, 10);
  });

  document.addEventListener('mousedown', function (e) {
    if (dot && dot.contains(e.target)) return;
    if (card && card.contains(e.target)) return;
    removeDot();
    removeCard();
  });

  // ── Dot ────────────────────────────────────────────────────────────

  function showDot(x, y) {
    removeDot();
    dot = document.createElement('div');
    dot.style.cssText =
      'all:initial;position:fixed !important;z-index:2147483647 !important;' +
      'left:' + (x + 6) + 'px;top:' + (y - 32) + 'px;' +
      'width:26px;height:26px;border-radius:50%;background:#1a73e8;cursor:pointer;' +
      'box-shadow:0 2px 8px rgba(26,115,232,0.5);' +
      'display:flex !important;align-items:center;justify-content:center;' +
      'transition:transform 0.12s,box-shadow 0.12s;user-select:none;pointer-events:auto;';

    var icon = document.createElement('span');
    icon.textContent = 'T';
    icon.style.cssText =
      'all:initial;color:#fff;font-size:13px;font-weight:700;' +
      'font-family:Arial,sans-serif;pointer-events:none;line-height:1;';
    dot.appendChild(icon);

    dot.addEventListener('mouseenter', function () {
      dot.style.transform = 'scale(1.15)';
      dot.style.boxShadow = '0 4px 14px rgba(26,115,232,0.65)';
    });
    dot.addEventListener('mouseleave', function () {
      dot.style.transform = 'scale(1)';
      dot.style.boxShadow = '0 2px 8px rgba(26,115,232,0.5)';
    });
    dot.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      doTranslate(pendingText, x, y);
    });

    document.documentElement.appendChild(dot);
  }

  function removeDot() {
    if (dot) { dot.remove(); dot = null; }
  }

  function removeCard() {
    if (card) { card.remove(); card = null; }
  }

  // ── Translation ────────────────────────────────────────────────────

  function doTranslate(text, x, y) {
    removeDot();
    showCard('翻译中…', '', '', x, y, true);

    fetch(apiBase + '/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ text: text }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.translated) {
          showCard(data.translated, data.from, data.to, x, y, false);
          var thisCard = card;
          if (thisCard && thisCard._vocabDiv) {
            appendVocab(thisCard, data.vocab || []);
          }
        } else {
          showCard(data.error || '翻译失败', '', '', x, y, false);
        }
      })
      .catch(function (e) {
        showCard('请求失败：' + e.message, '', '', x, y, false);
      });
  }

  // ── Card ────────────────────────────────────────────────────────────

  function showCard(text, from, to, x, y, loading) {
    removeCard();

    var LANG = { zh: '中文', en: '英文' };
    var W = 360;

    // Position: prefer below-right of cursor; flip up if near bottom
    var left = x + 10;
    var top = y > window.innerHeight * 0.6 ? y - 300 : y + 10;
    if (left + W + 8 > window.innerWidth) left = window.innerWidth - W - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;

    card = document.createElement('div');
    card.style.cssText =
      'all:initial;position:fixed !important;z-index:2147483647 !important;' +
      'left:' + left + 'px;top:' + top + 'px;width:' + W + 'px;' +
      'background:#fff;border-radius:12px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.14),0 2px 8px rgba(0,0,0,0.08);' +
      'overflow:hidden;pointer-events:auto;display:block !important;';

    // ── Header ──
    var hdr = document.createElement('div');
    hdr.style.cssText =
      'all:initial;display:flex !important;justify-content:space-between;align-items:center;' +
      'padding:8px 12px 8px 14px;background:#f8f9fa;border-bottom:1px solid #ebebeb;';

    var hdrLeft = document.createElement('div');
    hdrLeft.style.cssText = 'all:initial;display:flex !important;align-items:center;';

    var langLabel = document.createElement('span');
    langLabel.style.cssText = 'all:initial;font-size:11px;color:#777;font-family:Arial,sans-serif;';
    langLabel.textContent = (from && to)
      ? ((LANG[from] || from) + ' → ' + (LANG[to] || to))
      : '正在翻译…';

    var brand = document.createElement('span');
    brand.style.cssText =
      'all:initial;font-size:10px;color:#1a73e8;font-weight:700;' +
      'font-family:Arial,sans-serif;margin-left:8px;';
    brand.textContent = '智能翻译';

    hdrLeft.appendChild(langLabel);
    hdrLeft.appendChild(brand);

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText =
      'all:initial;background:none;border:none;cursor:pointer;color:#bbb;' +
      'font-size:20px;line-height:1;padding:0 2px;font-family:Arial,sans-serif;';
    closeBtn.addEventListener('mouseenter', function () { closeBtn.style.color = '#555'; });
    closeBtn.addEventListener('mouseleave', function () { closeBtn.style.color = '#bbb'; });
    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); removeCard(); });

    hdr.appendChild(hdrLeft);
    hdr.appendChild(closeBtn);
    card.appendChild(hdr);

    // ── Translation body ──
    var bodyDiv = document.createElement('div');
    bodyDiv.style.cssText =
      'all:initial;display:block !important;padding:12px 14px 8px;' +
      'font-size:14px;line-height:1.75;word-break:break-word;' +
      'font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;' +
      'color:' + (loading ? '#bbb' : '#1a1a1a') + ';';
    bodyDiv.textContent = text;
    card.appendChild(bodyDiv);

    if (!loading && from) {
      // Copy button
      var copyRow = document.createElement('div');
      copyRow.style.cssText =
        'all:initial;display:flex !important;justify-content:flex-end;padding:2px 12px 10px;';

      var cpBtn = document.createElement('button');
      cpBtn.textContent = '复制';
      cpBtn.style.cssText =
        'all:initial;border:1px solid #e0e0e0;background:#fff;cursor:pointer;' +
        'color:#1a73e8;font-size:11px;padding:2px 8px;border-radius:4px;' +
        'font-family:Arial,sans-serif;';
      cpBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(function () {
          cpBtn.textContent = '已复制 ✓';
          setTimeout(function () { cpBtn.textContent = '复制'; }, 1500);
        });
      });
      copyRow.appendChild(cpBtn);
      card.appendChild(copyRow);

      // ── Vocab container (filled by appendVocab after AI responds) ──
      var vocabDiv = document.createElement('div');
      vocabDiv.style.cssText =
        'all:initial;display:block !important;border-top:1px solid #f0f0f0;' +
        'max-height:280px;overflow-y:auto;';
      card.appendChild(vocabDiv);
      card._vocabDiv = vocabDiv;
    }

    document.documentElement.appendChild(card);
  }

  // ── Vocab section ──────────────────────────────────────────────────

  function appendVocab(cardEl, vocabList) {
    var vocabDiv = cardEl._vocabDiv;
    if (!vocabDiv) return;

    while (vocabDiv.firstChild) vocabDiv.removeChild(vocabDiv.firstChild);

    if (!vocabList || vocabList.length === 0) {
      vocabDiv.style.display = 'none';
      return;
    }

    // Section title
    var titleRow = document.createElement('div');
    titleRow.style.cssText =
      'all:initial;display:flex !important;align-items:center;padding:10px 14px 4px;';

    var bar = document.createElement('span');
    bar.style.cssText =
      'all:initial;display:inline-block !important;width:3px;height:13px;' +
      'background:#1a73e8;border-radius:2px;margin-right:7px;flex-shrink:0;';

    var titleText = document.createElement('span');
    titleText.style.cssText =
      'all:initial;font-size:12px;font-weight:700;color:#333;font-family:Arial,sans-serif;';
    titleText.textContent = '重点词汇';

    titleRow.appendChild(bar);
    titleRow.appendChild(titleText);
    vocabDiv.appendChild(titleRow);

    vocabList.forEach(function (item, i) {
      var row = document.createElement('div');
      row.style.cssText =
        'all:initial;display:flex !important;align-items:flex-start;padding:5px 14px;' +
        (i > 0 ? 'border-top:1px solid #f5f5f5;' : '');

      var wordEl = document.createElement('span');
      wordEl.style.cssText =
        'all:initial;color:#1a73e8;font-size:13px;font-weight:600;' +
        'font-family:Arial,sans-serif;min-width:90px;flex-shrink:0;line-height:1.6;';
      wordEl.textContent = item.word;

      var transEl = document.createElement('span');
      transEl.style.cssText =
        'all:initial;color:#555;font-size:12px;font-family:Arial,sans-serif;' +
        'flex:1;line-height:1.6;word-break:break-word;';
      transEl.textContent = item.translation;

      row.appendChild(wordEl);
      row.appendChild(transEl);
      vocabDiv.appendChild(row);
    });
  }
})();
