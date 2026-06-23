(function () {
  var dot = null;
  var card = null;
  var pendingText = '';
  var pendingNodes = [];
  var highlights = [];

  function ensureKeyframes() {
    if (document.getElementById('__strans_kf')) return;
    var s = document.createElement('style');
    s.id = '__strans_kf';
    s.textContent =
      '@keyframes __strans_in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
      '@keyframes __strans_spin{to{transform:rotate(360deg)}}';
    document.documentElement.appendChild(s);
  }

  var DEFAULT_API = 'https://translation.gwbiubiu.com';

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _explainError(msg) {
    return '<span style="all:initial;font-size:11px;color:#ef4444;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;">' + escHtml(msg) + '</span>';
  }

  function _explainUpgrade() {
    return '<div style="all:initial;display:flex !important;flex-direction:column;gap:4px;">' +
      '<span style="all:initial;font-size:11px;color:#6b7280;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">此功能仅限 Pro 会员使用</span>' +
      '<button class="explain-upgrade-link" style="all:initial;cursor:pointer;font-size:11px;color:#6366f1;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-weight:600;' +
      'background:none;border:none;padding:0;text-align:left;">→ 开通 Pro 会员</button>' +
    '</div>';
  }

  // ── Storage helper ─────────────────────────────────────────────────

  function saveItem(item, onSaved, onDuplicate) {
    chrome.storage.local.get('savedVocab', function (data) {
      var list = data.savedVocab || [];
      if (item.type === 'word') {
        var dup = list.some(function (i) {
          return i.type === 'word' && i.word.toLowerCase() === item.word.toLowerCase();
        });
        if (dup) { if (onDuplicate) onDuplicate(); return; }
      }
      item.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      item.savedAt = Date.now();
      list.unshift(item);
      chrome.storage.local.set({ savedVocab: list }, function () {
        if (onSaved) onSaved();
      });
    });
  }

  function removeItem(word, onRemoved) {
    chrome.storage.local.get('savedVocab', function (data) {
      var list = (data.savedVocab || []).filter(function (i) {
        return !(i.type === 'word' && i.word.toLowerCase() === word.toLowerCase());
      });
      chrome.storage.local.set({ savedVocab: list }, function () {
        if (onRemoved) onRemoved();
      });
    });
  }

  function setStar(btn, saved) {
    btn._saved = saved;
    btn.title = saved ? '取消收藏' : '收藏词汇';
    var svg = btn.querySelector('svg');
    svg.setAttribute('fill', saved ? '#f59e0b' : 'none');
    svg.setAttribute('stroke', saved ? '#f59e0b' : '#d1d5db');
  }

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
      pendingNodes = (sel && sel.rangeCount > 0) ? collectTextNodes(sel.getRangeAt(0)) : [];
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
      'left:' + (x + 6) + 'px;top:' + (y - 34) + 'px;' +
      'width:28px;height:28px;border-radius:50%;' +
      'background:linear-gradient(135deg,#4f8ef7 0%,#1a56db 100%);' +
      'cursor:pointer;' +
      'box-shadow:0 2px 8px rgba(26,86,219,0.45),0 0 0 2px rgba(79,142,247,0.15);' +
      'display:flex !important;align-items:center;justify-content:center;' +
      'transition:transform 0.15s ease,box-shadow 0.15s ease;user-select:none;pointer-events:auto;';

    var icon = document.createElement('span');
    icon.textContent = 'T';
    icon.style.cssText =
      'all:initial;color:#fff;font-size:13px;font-weight:700;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;pointer-events:none;line-height:1;';
    dot.appendChild(icon);

    dot.addEventListener('mouseenter', function () {
      dot.style.transform = 'scale(1.15)';
      dot.style.boxShadow = '0 4px 14px rgba(26,86,219,0.6),0 0 0 3px rgba(79,142,247,0.2)';
    });
    dot.addEventListener('mouseleave', function () {
      dot.style.transform = 'scale(1)';
      dot.style.boxShadow = '0 2px 8px rgba(26,86,219,0.45),0 0 0 2px rgba(79,142,247,0.15)';
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
    if (card) {
      if (card._cleanupDrag) card._cleanupDrag();
      card.remove();
      card = null;
    }
    removeHighlights();
  }

  // ── Translation ────────────────────────────────────────────────────

  function doTranslate(text, x, y) {
    removeDot();
    showCard('', '', '', x, y, true);

    try {
      chrome.runtime.sendMessage({ type: 'translate', text: text }, function (data) {
        if (chrome.runtime.lastError) {
          showCard('请求失败：' + chrome.runtime.lastError.message, '', '', x, y, false);
          return;
        }
        if (data && data.translated) {
          showCard(data.translated, data.from, data.to, x, y, false);
          var thisCard = card;
          if (thisCard && thisCard._vocabDiv) {
            appendVocab(thisCard, data.vocab || []);
          }
          if (pendingNodes.length > 0 && data.vocab && data.vocab.length > 0) {
            highlightVocab(pendingNodes, data.vocab);
          }
        } else {
          showCard((data && data.error) || '翻译失败', '', '', x, y, false);
        }
      });
    } catch (e) {
      showCard('扩展已更新，请刷新页面后重试', '', '', x, y, false);
    }
  }

  // ── Highlight vocab in page ─────────────────────────────────────────

  function collectTextNodes(range) {
    var root = range.commonAncestorContainer;
    if (root.nodeType === Node.TEXT_NODE) return [root];

    var nodes = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      try {
        if (range.intersectsNode(node)) nodes.push(node);
      } catch (e) {}
    }
    return nodes;
  }

  function highlightVocab(textNodes, vocabList) {
    removeHighlights();

    var words = vocabList
      .map(function (v) { return v.word; })
      .filter(function (w) { return w && w.length > 1; })
      .sort(function (a, b) { return b.length - a.length; });

    if (!words.length) return;

    var pattern = words
      .map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); })
      .join('|');
    var regex = new RegExp('(' + pattern + ')', 'gi');
    var lowerWords = words.map(function (w) { return w.toLowerCase(); });

    textNodes.forEach(function (tn) {
      if (!tn.parentNode || tn.parentNode._sthl) return;
      var parts = tn.textContent.split(regex);
      if (parts.length <= 1) return;

      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (!part) return;
        if (lowerWords.indexOf(part.toLowerCase()) !== -1) {
          var mark = document.createElement('mark');
          mark._sthl = true;
          mark.style.cssText =
            'background:rgba(99,102,241,0.12);' +
            'border-bottom:2px solid rgba(99,102,241,0.7);' +
            'border-radius:2px;padding:0 1px;color:inherit;';
          mark.textContent = part;
          highlights.push(mark);
          frag.appendChild(mark);
        } else {
          frag.appendChild(document.createTextNode(part));
        }
      });
      tn.parentNode.replaceChild(frag, tn);
    });
  }

  function removeHighlights() {
    highlights.forEach(function (mark) {
      if (!mark.parentNode) return;
      var parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      try { parent.normalize(); } catch (e) {}
    });
    highlights = [];
  }

  // ── Card ────────────────────────────────────────────────────────────

  function showCard(text, from, to, x, y, loading) {
    ensureKeyframes();
    removeCard();

    var LANG = { zh: '中文', en: '英语' };
    var W = 380;

    var left = x + 12;
    var top = y > window.innerHeight * 0.62 ? y - 330 : y + 12;
    if (left + W + 8 > window.innerWidth) left = window.innerWidth - W - 8;
    if (left < 8) left = 8;
    if (top < 8) top = 8;

    card = document.createElement('div');
    card.style.cssText =
      'all:initial;position:fixed !important;z-index:2147483647 !important;' +
      'left:' + left + 'px;top:' + top + 'px;width:' + W + 'px;' +
      'background:#ffffff;border-radius:16px;' +
      'box-shadow:0 1px 3px rgba(0,0,0,0.06),0 8px 24px rgba(0,0,0,0.1),0 24px 56px rgba(0,0,0,0.08);' +
      'border:1px solid rgba(0,0,0,0.07);' +
      'overflow:hidden;pointer-events:auto;display:block !important;' +
      'animation:__strans_in 0.2s cubic-bezier(0.16,1,0.3,1) both;';

    // ── Header ──
    var hdr = document.createElement('div');
    hdr.style.cssText =
      'all:initial;display:flex !important;justify-content:space-between;align-items:center;' +
      'padding:10px 10px 10px 14px;' +
      'background:linear-gradient(135deg,#eff6ff 0%,#f5f3ff 100%);' +
      'border-bottom:1px solid rgba(99,102,241,0.1);' +
      'cursor:grab;user-select:none;';

    var hdrLeft = document.createElement('div');
    hdrLeft.style.cssText = 'all:initial;display:flex !important;align-items:center;gap:8px;';

    var iconBox = document.createElement('div');
    iconBox.style.cssText =
      'all:initial;width:22px;height:22px;border-radius:6px;flex-shrink:0;' +
      'background:linear-gradient(135deg,#6366f1 0%,#4f46e5 100%);' +
      'display:flex !important;align-items:center;justify-content:center;' +
      'box-shadow:0 1px 4px rgba(99,102,241,0.35);';
    iconBox.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
      'stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ' +
      'style="display:block">' +
      '<path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/>' +
      '<path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>';

    var langLabel = document.createElement('span');
    langLabel.style.cssText =
      'all:initial;font-size:12px;font-weight:500;color:#4338ca;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0.01em;';
    langLabel.textContent = (from && to)
      ? ((LANG[from] || from) + ' → ' + (LANG[to] || to))
      : '智能翻译';

    hdrLeft.appendChild(iconBox);
    hdrLeft.appendChild(langLabel);

    var closeBtn = document.createElement('button');
    closeBtn.style.cssText =
      'all:initial;width:26px;height:26px;border-radius:7px;' +
      'background:transparent;border:none;cursor:pointer;' +
      'display:flex !important;align-items:center;justify-content:center;flex-shrink:0;' +
      'transition:background 0.15s ease;';
    closeBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
      'stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round" ' +
      'style="display:block;pointer-events:none">' +
      '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    closeBtn.addEventListener('mouseenter', function () {
      closeBtn.style.background = 'rgba(0,0,0,0.07)';
    });
    closeBtn.addEventListener('mouseleave', function () {
      closeBtn.style.background = 'transparent';
    });
    closeBtn.addEventListener('click', function (e) { e.stopPropagation(); removeCard(); });

    hdr.appendChild(hdrLeft);
    hdr.appendChild(closeBtn);
    card.appendChild(hdr);

    // ── Drag to move ──
    var isDragging = false;
    var dragStartX = 0, dragStartY = 0, cardStartLeft = 0, cardStartTop = 0;

    function onDragMove(e) {
      if (!isDragging) return;
      var newLeft = Math.max(4, Math.min(cardStartLeft + e.clientX - dragStartX, window.innerWidth - W - 4));
      var newTop  = Math.max(4, Math.min(cardStartTop  + e.clientY - dragStartY, window.innerHeight - 60));
      card.style.left = newLeft + 'px';
      card.style.top  = newTop  + 'px';
    }

    function onDragEnd() {
      if (!isDragging) return;
      isDragging = false;
      hdr.style.cursor = 'grab';
      document.body.style.userSelect = '';
    }

    hdr.addEventListener('mousedown', function (e) {
      if (closeBtn.contains(e.target)) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      cardStartLeft = parseFloat(card.style.left) || left;
      cardStartTop  = parseFloat(card.style.top)  || top;
      hdr.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup',   onDragEnd);

    card._cleanupDrag = function () {
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup',   onDragEnd);
      document.body.style.userSelect = '';
    };

    // ── Body ──
    var bodyDiv = document.createElement('div');
    bodyDiv.style.cssText =
      'all:initial;display:block !important;padding:14px 16px 12px;' +
      'font-size:15px;line-height:1.75;word-break:break-word;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;' +
      'color:#111827;min-height:48px;';

    if (loading) {
      var spinWrap = document.createElement('div');
      spinWrap.style.cssText =
        'all:initial;display:flex !important;align-items:center;gap:10px;padding:4px 0;';
      var spinner = document.createElement('div');
      spinner.style.cssText =
        'all:initial;width:16px;height:16px;flex-shrink:0;' +
        'border:2px solid #e5e7eb;border-top-color:#6366f1;border-radius:50%;' +
        'animation:__strans_spin 0.7s linear infinite;';
      var loadText = document.createElement('span');
      loadText.style.cssText =
        'all:initial;font-size:13px;color:#9ca3af;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      loadText.textContent = '正在翻译…';
      spinWrap.appendChild(spinner);
      spinWrap.appendChild(loadText);
      bodyDiv.appendChild(spinWrap);
    } else {
      bodyDiv.textContent = text;
    }

    card.appendChild(bodyDiv);

    if (!loading && from) {
      // Store language info for appendVocab
      card._langFrom = from;
      card._langTo = to;
      card._origText = pendingText;
      card._bodyText = text;

      // ── Footer: copy button ──
      var footer = document.createElement('div');
      footer.style.cssText =
        'all:initial;display:flex !important;justify-content:flex-end;' +
        'padding:2px 14px 12px;';

      var cpBtn = document.createElement('button');
      cpBtn.style.cssText =
        'all:initial;display:inline-flex !important;align-items:center;gap:5px;' +
        'border:1px solid #e5e7eb;background:#f9fafb;cursor:pointer;' +
        'color:#6b7280;font-size:11px;padding:4px 10px;border-radius:6px;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-weight:500;' +
        'transition:background 0.15s ease,border-color 0.15s ease;';
      cpBtn.innerHTML =
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" ' +
        'stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
        'style="display:block;pointer-events:none;flex-shrink:0">' +
        '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
        '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
        '<span style="pointer-events:none">复制</span>';
      cpBtn.addEventListener('mouseenter', function () {
        cpBtn.style.background = '#f3f4f6';
        cpBtn.style.borderColor = '#d1d5db';
      });
      cpBtn.addEventListener('mouseleave', function () {
        cpBtn.style.background = '#f9fafb';
        cpBtn.style.borderColor = '#e5e7eb';
      });
      cpBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(function () {
          cpBtn.innerHTML =
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" ' +
            'stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ' +
            'style="display:block;pointer-events:none;flex-shrink:0">' +
            '<polyline points="20 6 9 17 4 12"/></svg>' +
            '<span style="pointer-events:none;color:#10b981">已复制</span>';
          setTimeout(function () {
            cpBtn.innerHTML =
              '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" ' +
              'stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
              'style="display:block;pointer-events:none;flex-shrink:0">' +
              '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
              '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
              '<span style="pointer-events:none">复制</span>';
          }, 1500);
        });
      });

      footer.appendChild(cpBtn);
      card.appendChild(footer);

      // ── Vocab container ──
      var vocabDiv = document.createElement('div');
      vocabDiv.style.cssText =
        'all:initial;display:block !important;' +
        'border-top:1px solid #f0f2f5;' +
        'max-height:260px;overflow-y:auto;background:#fafbfd;';
      card.appendChild(vocabDiv);
      card._vocabDiv = vocabDiv;

      // ── Deep Learn button ──────────────────────────────────────────
      var deepLearnBtn = document.createElement('button');
      deepLearnBtn.style.cssText =
        'all:initial;display:block !important;width:100%;' +
        'padding:9px 16px;background:#f5f3ff;border:none;' +
        'border-top:1px solid #ede9fe;cursor:pointer;' +
        'font-size:11.5px;font-weight:600;color:#6366f1;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
        'text-align:center;letter-spacing:0.02em;' +
        'transition:background 0.15s ease;';
      deepLearnBtn.textContent = '✨ 深度学习';
      deepLearnBtn.addEventListener('mouseenter', function () {
        deepLearnBtn.style.background = '#ede9fe';
      });
      deepLearnBtn.addEventListener('mouseleave', function () {
        deepLearnBtn.style.background = '#f5f3ff';
      });
      card.appendChild(deepLearnBtn);

      // ── Deep Learn Panel ───────────────────────────────────────────
      var deepLearnPanel = document.createElement('div');
      deepLearnPanel.style.cssText = 'all:initial;display:none !important;';
      card.appendChild(deepLearnPanel);
      card._deepLearnPanel = deepLearnPanel;
      card._deepLearnOpen = false;
      card._deepLearnLoaded = false;

      deepLearnBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!card._deepLearnOpen) {
          card._deepLearnOpen = true;
          deepLearnPanel.style.cssText =
            'all:initial;display:block !important;border-top:1px solid #ede9fe;';
          if (!card._deepLearnLoaded) {
            card._deepLearnLoaded = true;
            _renderDeepLearnLoading(deepLearnPanel, card);
            _loadDeepLearn(deepLearnPanel, card);
          }
        } else {
          card._deepLearnOpen = false;
          deepLearnPanel.style.cssText = 'all:initial;display:none !important;';
        }
      });
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

    // Load saved state first so stars can reflect current storage
    chrome.storage.local.get('savedVocab', function (data) {
      var savedWords = new Set(
        (data.savedVocab || [])
          .filter(function (i) { return i.type === 'word'; })
          .map(function (i) { return i.word.toLowerCase(); })
      );
      _renderVocabRows(cardEl, vocabDiv, vocabList, savedWords);
    });
  }

  function _renderVocabRows(cardEl, vocabDiv, vocabList, savedWords) {

    var titleRow = document.createElement('div');
    titleRow.style.cssText =
      'all:initial;display:flex !important;align-items:center;' +
      'padding:10px 14px 6px;gap:7px;';

    var bar = document.createElement('span');
    bar.style.cssText =
      'all:initial;display:inline-block !important;width:3px;height:12px;' +
      'background:linear-gradient(to bottom,#818cf8,#4f46e5);' +
      'border-radius:2px;flex-shrink:0;';

    var titleText = document.createElement('span');
    titleText.style.cssText =
      'all:initial;font-size:10px;font-weight:700;color:#6b7280;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
      'text-transform:uppercase;letter-spacing:0.06em;flex:1;';
    titleText.textContent = '词汇';

    titleRow.appendChild(bar);
    titleRow.appendChild(titleText);
    vocabDiv.appendChild(titleRow);

    var isEnSrc = cardEl._langFrom === 'en';

    vocabList.forEach(function (item, i) {
      // Outer row: block container
      var row = document.createElement('div');
      row.style.cssText =
        'all:initial;display:block !important;' +
        'padding:8px 14px;' +
        (i % 2 === 0 ? 'background:#ffffff;' : 'background:#f8fafd;') +
        (i > 0 ? 'border-top:1px solid #f0f2f5;' : '');

      // Main line: chip + translation + star
      var mainLine = document.createElement('div');
      mainLine.style.cssText =
        'all:initial;display:flex !important;align-items:flex-start;gap:10px;';

      var wordChip = document.createElement('span');
      wordChip.style.cssText =
        'all:initial;display:inline-block !important;' +
        'background:#eff6ff;color:#3730a3;' +
        'font-size:11.5px;font-weight:600;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
        'padding:2px 9px;border-radius:20px;flex-shrink:0;' +
        'min-width:56px;text-align:center;line-height:1.6;' +
        'border:1px solid #c7d2fe;white-space:nowrap;';
      wordChip.textContent = item.word;

      var transEl = document.createElement('span');
      transEl.style.cssText =
        'all:initial;color:#374151;font-size:12px;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
        'flex:1;line-height:1.65;word-break:break-word;padding-top:2px;';
      transEl.textContent = item.translation;

      // Star save / unsave button
      var starBtn = document.createElement('button');
      starBtn.style.cssText =
        'all:initial;background:none;border:none;cursor:pointer;' +
        'flex-shrink:0;padding:2px;line-height:1;margin-top:2px;';
      starBtn.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
        'stroke="#d1d5db" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
        'style="display:block;pointer-events:none">' +
        '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

      // Set initial state from storage
      setStar(starBtn, savedWords.has(item.word.toLowerCase()));

      starBtn.addEventListener('mouseenter', function () {
        var svg = starBtn.querySelector('svg');
        svg.setAttribute('stroke', starBtn._saved ? '#e08000' : '#f59e0b');
      });
      starBtn.addEventListener('mouseleave', function () {
        setStar(starBtn, starBtn._saved);
      });
      starBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (starBtn._saved) {
          removeItem(item.word, function () { setStar(starBtn, false); });
        } else {
          saveItem(
            { type: 'word', word: item.word, translation: item.translation,
              from: cardEl._langFrom || '', to: cardEl._langTo || '' },
            function () { setStar(starBtn, true); },
            function () { setStar(starBtn, true); }
          );
        }
      });

      // AI explain button
      var explainBtn = document.createElement('button');
      explainBtn.style.cssText =
        'all:initial;background:none;border:none;cursor:pointer;' +
        'flex-shrink:0;padding:2px 4px;line-height:1;margin-top:1px;' +
        'font-size:10px;font-weight:600;color:#6366f1;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
        'display:inline-flex !important;align-items:center;gap:2px;' +
        'border-radius:4px;transition:background 0.12s;white-space:nowrap;';
      explainBtn.innerHTML =
        '<svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style="display:block;pointer-events:none;flex-shrink:0">' +
        '<path d="M12 2l1.09 3.26L16 6.27l-2.5 2.44.59 3.44L12 10.27l-2.09 1.88.59-3.44L8 6.27l2.91-.01L12 2z"/>' +
        '<circle cx="12" cy="19" r="3"/></svg>' +
        '解释';

      explainBtn.addEventListener('mouseenter', function () {
        explainBtn.style.background = 'rgba(99,102,241,0.08)';
      });
      explainBtn.addEventListener('mouseleave', function () {
        explainBtn.style.background = 'none';
      });

      // Explanation panel
      var explainPanel = document.createElement('div');
      var PANEL_CSS =
        'all:initial;display:block !important;' +
        'margin-top:6px;padding:8px 10px;' +
        'background:#f5f3ff;border-radius:6px;' +
        'border-left:3px solid #818cf8;';
      explainPanel.style.cssText = 'all:initial;display:none !important;';

      function showPanel() { explainPanel.style.cssText = PANEL_CSS; }
      function hidePanel() { explainPanel.style.cssText = 'all:initial;display:none !important;'; }

      explainBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (explainPanel._visible) {
          explainPanel._visible = false;
          hidePanel();
          return;
        }
        explainPanel._visible = true;
        // Already has content — just show
        if (explainPanel._loaded) {
          showPanel();
          return;
        }
        // Show loading state
        showPanel();
        explainPanel.innerHTML =
          '<span style="all:initial;font-size:11px;color:#6b7280;' +
          'font-family:-apple-system,BlinkMacSystemFont,sans-serif;">正在解释…</span>';

        chrome.runtime.sendMessage({
          type: 'wordexplain',
          word: item.word,
          translation: item.translation,
          sentence: cardEl._origText || '',
          from_lang: cardEl._langFrom || '',
        }, function (resp) {
          if (chrome.runtime.lastError || !resp) {
            explainPanel.innerHTML = _explainError('网络错误');
            return;
          }
          if (!resp.ok) {
            if (resp.data && resp.data.error === 'pro_required') {
              explainPanel.innerHTML = _explainUpgrade();
              explainPanel.querySelector('.explain-upgrade-link').addEventListener('click', function () {
                chrome.storage.sync.get('apiBase', function (s) {
                  var base = (s.apiBase || DEFAULT_API).replace(/\/$/, '');
                  window.open(base + '/dashboard', '_blank');
                });
              });
            } else {
              explainPanel.innerHTML = _explainError((resp.data && resp.data.error) || '请求失败');
            }
            return;
          }
          explainPanel._loaded = true;
          var text = resp.data && resp.data.explanation ? resp.data.explanation : '无法获取解释';
          explainPanel.innerHTML =
            '<div style="all:initial;display:flex !important;gap:5px;align-items:flex-start;">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="#818cf8" style="display:block;flex-shrink:0;margin-top:1px;pointer-events:none">' +
              '<path d="M12 2l1.09 3.26L16 6.27l-2.5 2.44.59 3.44L12 10.27l-2.09 1.88.59-3.44L8 6.27l2.91-.01L12 2z"/>' +
              '<circle cx="12" cy="19" r="3"/></svg>' +
              '<span style="all:initial;font-size:11.5px;color:#374151;line-height:1.65;' +
              'font-family:-apple-system,BlinkMacSystemFont,sans-serif;">' + escHtml(text) + '</span>' +
            '</div>';
        });
      });

      mainLine.appendChild(wordChip);
      mainLine.appendChild(transEl);
      mainLine.appendChild(explainBtn);
      mainLine.appendChild(starBtn);
      row.appendChild(mainLine);
      row.appendChild(explainPanel);

      // Dict info area (phonetic + POS definitions) — English source only
      if (isEnSrc && /^[a-zA-Z\s'\-]+$/.test(item.word.trim())) {
        var dictInfo = document.createElement('div');
        dictInfo.style.cssText =
          'all:initial;display:none;' +
          'margin-top:6px;padding-top:6px;' +
          'border-top:1px solid #eef2ff;';
        row.appendChild(dictInfo);

        fetchDictData(item.word, function (entry) {
          if (!entry) return;
          populateDictInfo(dictInfo, entry);
        });
      }

      vocabDiv.appendChild(row);
    });
  }

  // ── Youdao Dictionary helpers ──────────────────────────────────────

  function fetchDictData(word, cb) {
    var w = word.trim().toLowerCase();
    chrome.runtime.sendMessage({ type: 'dictlookup', word: w }, function (result) {
      if (!result || (!result.phonetic && (!result.meanings || !result.meanings.length))) {
        cb(null);
        return;
      }
      result.word = w;
      cb(result);
    });
  }

  function populateDictInfo(el, data) {
    var audioUrl = 'https://dict.youdao.com/dictvoice?audio=' +
                   encodeURIComponent(data.word || '') + '&type=2';

    var phonRow = document.createElement('div');
    phonRow.style.cssText =
      'all:initial;display:flex !important;align-items:center;gap:6px;margin-bottom:4px;';

    if (data.phonetic) {
      var pEl = document.createElement('span');
      pEl.style.cssText =
        'all:initial;font-size:11px;color:#6366f1;font-style:italic;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:0.02em;';
      pEl.textContent = data.phonetic.charAt(0) === '/' ? data.phonetic : '/' + data.phonetic + '/';
      phonRow.appendChild(pEl);
    }

    var speakerBtn = document.createElement('button');
    speakerBtn.title = '播放发音';
    speakerBtn.style.cssText =
      'all:initial;background:none;border:none;cursor:pointer;' +
      'display:flex !important;align-items:center;justify-content:center;' +
      'width:18px;height:18px;border-radius:4px;flex-shrink:0;' +
      'transition:background 0.15s ease;';
    speakerBtn.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" ' +
      'stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'style="display:block;pointer-events:none">' +
      '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>' +
      '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>' +
      '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
    speakerBtn.addEventListener('mouseenter', function () {
      speakerBtn.style.background = '#eff6ff';
    });
    speakerBtn.addEventListener('mouseleave', function () {
      speakerBtn.style.background = 'none';
    });
    speakerBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'fetchaudio', url: audioUrl }, function (resp) {
        if (!resp || !resp.ok) return;
        try {
          var buf = new Uint8Array(resp.data).buffer;
          var ctx = new (window.AudioContext || window.webkitAudioContext)();
          ctx.decodeAudioData(buf).then(function (decoded) {
            var src = ctx.createBufferSource();
            src.buffer = decoded;
            src.connect(ctx.destination);
            src.start(0);
          });
        } catch (ex) {}
      });
    });
    phonRow.appendChild(speakerBtn);
    el.appendChild(phonRow);

    var meanings = (data.meanings || []).slice(0, 3);
    meanings.forEach(function (meaning) {
      if (!meaning.def) return;

      var defRow = document.createElement('div');
      defRow.style.cssText =
        'all:initial;display:flex !important;gap:5px;align-items:baseline;margin-top:3px;';

      var posEl = document.createElement('span');
      posEl.style.cssText =
        'all:initial;font-size:10px;color:#818cf8;font-style:italic;font-weight:700;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;flex-shrink:0;';
      posEl.textContent = meaning.pos || '';

      var defEl = document.createElement('span');
      defEl.style.cssText =
        'all:initial;font-size:11px;color:#6b7280;line-height:1.5;flex:1;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      var text = meaning.def;
      defEl.textContent = text.length > 100 ? text.slice(0, 97) + '…' : text;

      defRow.appendChild(posEl);
      defRow.appendChild(defEl);
      el.appendChild(defRow);
    });

    el.style.display = 'block';
  }

  // ── Deep Learn helpers ─────────────────────────────────────────────

  function _playTTS(text, lang, btn, originalLabel) {
    btn.disabled = true;
    btn.textContent = '▶ 加载中…';
    chrome.runtime.sendMessage({ type: 'tts', text: text, lang: lang }, function (resp) {
      btn.disabled = false;
      btn.textContent = originalLabel;
      if (!resp || !resp.ok) return;
      try {
        var buf = new Uint8Array(resp.data).buffer;
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctx.decodeAudioData(buf).then(function (decoded) {
          var src = ctx.createBufferSource();
          src.buffer = decoded;
          src.connect(ctx.destination);
          src.start(0);
        });
      } catch (ex) {}
    });
  }

  function _makeSection(title) {
    var sec = document.createElement('div');
    sec.style.cssText =
      'all:initial;display:block !important;padding:12px 14px;' +
      'border-bottom:1px solid #f0f2f5;';

    var hdr = document.createElement('div');
    hdr.style.cssText =
      'all:initial;display:flex !important;align-items:center;gap:6px;margin-bottom:8px;';

    var bar = document.createElement('span');
    bar.style.cssText =
      'all:initial;display:inline-block !important;width:3px;height:11px;' +
      'background:linear-gradient(to bottom,#818cf8,#4f46e5);border-radius:2px;flex-shrink:0;';

    var titleEl = document.createElement('span');
    titleEl.style.cssText =
      'all:initial;font-size:10px;font-weight:700;color:#6b7280;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
      'text-transform:uppercase;letter-spacing:0.06em;';
    titleEl.textContent = title;

    hdr.appendChild(bar);
    hdr.appendChild(titleEl);
    sec.appendChild(hdr);
    return sec;
  }

  function _renderDeepLearnLoading(panel, card) {
    while (panel.firstChild) panel.removeChild(panel.firstChild);

    // TTS section — renders immediately, no loading needed
    var ttsSection = _makeSection('🔊 朗读');
    var ttsRow = document.createElement('div');
    ttsRow.style.cssText = 'all:initial;display:flex !important;gap:8px;flex-wrap:wrap;';

    function _makePlayBtn(label) {
      var btn = document.createElement('button');
      btn.style.cssText =
        'all:initial;display:inline-flex !important;align-items:center;gap:5px;' +
        'border:1px solid #e5e7eb;background:#f9fafb;cursor:pointer;color:#6366f1;' +
        'font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
        'transition:background 0.15s ease;';
      btn.textContent = label;
      btn.addEventListener('mouseenter', function () { btn.style.background = '#ede9fe'; });
      btn.addEventListener('mouseleave', function () { btn.style.background = '#f9fafb'; });
      return btn;
    }

    var origBtn = _makePlayBtn('▶ 播放原文');
    var transBtn = _makePlayBtn('▶ 播放译文');

    origBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      _playTTS(card._origText || '', card._langFrom || 'en', origBtn, '▶ 播放原文');
    });
    transBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      _playTTS(card._bodyText || '', card._langTo || 'zh', transBtn, '▶ 播放译文');
    });

    ttsRow.appendChild(origBtn);
    ttsRow.appendChild(transBtn);
    ttsSection.appendChild(ttsRow);
    panel.appendChild(ttsSection);

    // Vocab enhance section — loading state
    var vocabSection = _makeSection('💡 词汇强化');
    var vocabLoading = document.createElement('span');
    vocabLoading.style.cssText =
      'all:initial;font-size:11px;color:#9ca3af;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    vocabLoading.textContent = '分析中…';
    vocabSection.appendChild(vocabLoading);
    panel.appendChild(vocabSection);
    panel._vocabSection = vocabSection;

    // Grammar section — loading state
    var gramSection = _makeSection('📖 语法解析');
    var gramLoading = document.createElement('span');
    gramLoading.style.cssText =
      'all:initial;font-size:11px;color:#9ca3af;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    gramLoading.textContent = '分析中…';
    gramSection.appendChild(gramLoading);
    panel.appendChild(gramSection);
    panel._gramSection = gramSection;
  }

  function _loadDeepLearn(panel, card) {
    chrome.storage.sync.get('apiBase', function (s) {
      var apiBase = (s.apiBase || DEFAULT_API).replace(/\/$/, '');
      fetch(apiBase + '/api/deep-learn', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: card._origText || '',
          translated: card._bodyText || '',
          from: card._langFrom || '',
          to: card._langTo || '',
        }),
      })
        .then(function (res) {
          return res.json().then(function (d) { return { ok: res.ok, data: d }; });
        })
        .then(function (r) {
          if (!r.ok) {
            if (r.data && r.data.error === 'pro_required') {
              _renderDeepLearnUpgrade(panel);
            } else {
              _renderDeepLearnError(panel, (r.data && r.data.error) || '请求失败');
            }
            return;
          }
          _fillVocabEnhance(panel._vocabSection, r.data.vocab_enhancement || []);
          _fillGrammar(panel._gramSection, r.data.grammar || {});
        })
        .catch(function () {
          _renderDeepLearnError(panel, '网络错误，请稍后重试');
        });
    });
  }

  function _fillVocabEnhance(section, items) {
    var hdr = section.firstChild;
    while (section.lastChild !== hdr) section.removeChild(section.lastChild);

    if (!items.length) {
      var empty = document.createElement('span');
      empty.style.cssText =
        'all:initial;font-size:11px;color:#9ca3af;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      empty.textContent = '未提取到关键词汇';
      section.appendChild(empty);
      return;
    }

    items.forEach(function (item) {
      var block = document.createElement('div');
      block.style.cssText = 'all:initial;display:block !important;margin-bottom:10px;';

      var wordLine = document.createElement('div');
      wordLine.style.cssText =
        'all:initial;display:flex !important;align-items:baseline;gap:8px;margin-bottom:4px;';

      var chip = document.createElement('span');
      chip.style.cssText =
        'all:initial;display:inline-block !important;background:#eff6ff;color:#3730a3;' +
        'font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:20px;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;border:1px solid #c7d2fe;';
      chip.textContent = item.word || '';

      var synonyms = document.createElement('span');
      synonyms.style.cssText =
        'all:initial;font-size:10.5px;color:#818cf8;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      synonyms.textContent = (item.synonyms || []).join(' · ');

      wordLine.appendChild(chip);
      wordLine.appendChild(synonyms);
      block.appendChild(wordLine);

      if (item.root) {
        var root = document.createElement('div');
        root.style.cssText =
          'all:initial;font-size:10.5px;color:#6b7280;margin-bottom:3px;' +
          'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
        root.textContent = '📌 ' + item.root;
        block.appendChild(root);
      }

      (item.examples || []).forEach(function (ex) {
        var exEl = document.createElement('div');
        exEl.style.cssText =
          'all:initial;font-size:10.5px;color:#374151;line-height:1.6;' +
          'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
          'padding-left:8px;border-left:2px solid #c7d2fe;margin-top:2px;';
        exEl.textContent = ex;
        block.appendChild(exEl);
      });

      section.appendChild(block);
    });
  }

  function _fillGrammar(section, grammar) {
    var hdr = section.firstChild;
    while (section.lastChild !== hdr) section.removeChild(section.lastChild);

    if (!grammar.structure) {
      var empty = document.createElement('span');
      empty.style.cssText =
        'all:initial;font-size:11px;color:#9ca3af;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      empty.textContent = '未获取到语法信息';
      section.appendChild(empty);
      return;
    }

    var structEl = document.createElement('div');
    structEl.style.cssText =
      'all:initial;font-size:11px;font-weight:600;color:#4338ca;margin-bottom:8px;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    structEl.textContent = grammar.structure;
    section.appendChild(structEl);

    if (grammar.breakdown && grammar.breakdown.length) {
      var bdRow = document.createElement('div');
      bdRow.style.cssText =
        'all:initial;display:flex !important;flex-wrap:wrap;gap:6px;margin-bottom:8px;';

      grammar.breakdown.forEach(function (part) {
        var chunk = document.createElement('div');
        chunk.style.cssText =
          'all:initial;display:inline-flex !important;flex-direction:column;' +
          'align-items:center;gap:2px;';

        var textEl = document.createElement('span');
        textEl.style.cssText =
          'all:initial;font-size:11px;color:#111827;font-weight:500;' +
          'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
          'background:#f0f9ff;padding:2px 6px;border-radius:4px;white-space:nowrap;';
        textEl.textContent = part.text || '';

        var roleEl = document.createElement('span');
        roleEl.style.cssText =
          'all:initial;font-size:9.5px;color:#818cf8;font-weight:600;' +
          'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
        roleEl.textContent = part.role || '';

        chunk.appendChild(textEl);
        chunk.appendChild(roleEl);
        bdRow.appendChild(chunk);
      });
      section.appendChild(bdRow);
    }

    if (grammar.note) {
      var noteEl = document.createElement('div');
      noteEl.style.cssText =
        'all:initial;font-size:10.5px;color:#6b7280;line-height:1.6;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      noteEl.textContent = '💬 ' + grammar.note;
      section.appendChild(noteEl);
    }
  }

  function _renderDeepLearnUpgrade(panel) {
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    var wrap = document.createElement('div');
    wrap.style.cssText =
      'all:initial;display:flex !important;flex-direction:column;gap:6px;' +
      'padding:14px 16px;align-items:flex-start;';

    var msg = document.createElement('span');
    msg.style.cssText =
      'all:initial;font-size:12px;color:#6b7280;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
    msg.textContent = '深度学习功能仅限 Pro 会员使用';

    var link = document.createElement('button');
    link.style.cssText =
      'all:initial;cursor:pointer;font-size:12px;color:#6366f1;font-weight:600;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
      'background:none;border:none;padding:0;';
    link.textContent = '→ 开通 Pro 会员';
    link.addEventListener('click', function () {
      chrome.storage.sync.get('apiBase', function (s) {
        var base = (s.apiBase || DEFAULT_API).replace(/\/$/, '');
        window.open(base + '/dashboard', '_blank');
      });
    });

    wrap.appendChild(msg);
    wrap.appendChild(link);
    panel.appendChild(wrap);
  }

  function _renderDeepLearnError(panel, message) {
    if (panel._vocabSection) {
      var hdrV = panel._vocabSection.firstChild;
      while (panel._vocabSection.lastChild !== hdrV) {
        panel._vocabSection.removeChild(panel._vocabSection.lastChild);
      }
      var errV = document.createElement('span');
      errV.style.cssText =
        'all:initial;font-size:11px;color:#ef4444;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      errV.textContent = message;
      panel._vocabSection.appendChild(errV);
    }
    if (panel._gramSection) {
      var hdrG = panel._gramSection.firstChild;
      while (panel._gramSection.lastChild !== hdrG) {
        panel._gramSection.removeChild(panel._gramSection.lastChild);
      }
      var errG = document.createElement('span');
      errG.style.cssText =
        'all:initial;font-size:11px;color:#ef4444;' +
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif;';
      errG.textContent = message;
      panel._gramSection.appendChild(errG);
    }
  }
})();
