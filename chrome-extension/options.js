var currentTier = 'free';

var tierFreeEl  = document.getElementById('tierFree');
var tierPaidEl  = document.getElementById('tierPaid');
var apiSectionEl = document.getElementById('apiSection');
var apiBaseEl   = document.getElementById('apiBase');
var statusEl    = document.getElementById('status');

// Load saved settings
chrome.storage.sync.get(['userTier', 'apiBase'], function (s) {
  setTier(s.userTier || 'free');
  apiBaseEl.value = s.apiBase || 'http://localhost:5000';
});

// Tier card click
tierFreeEl.addEventListener('click', function () { setTier('free'); });
tierPaidEl.addEventListener('click', function () { setTier('paid'); });

function setTier(tier) {
  currentTier = tier;
  tierFreeEl.classList.toggle('active', tier === 'free');
  tierPaidEl.classList.toggle('active', tier === 'paid');
  apiSectionEl.style.display = tier === 'paid' ? 'block' : 'none';
}

// Save
document.getElementById('saveBtn').addEventListener('click', function () {
  var apiBase = (apiBaseEl.value.trim().replace(/\/$/, '')) || 'http://localhost:5000';
  chrome.storage.sync.set({ userTier: currentTier, apiBase: apiBase }, function () {
    statusEl.textContent = '已保存 ✓';
    setTimeout(function () { statusEl.textContent = ''; }, 2000);
  });
});
