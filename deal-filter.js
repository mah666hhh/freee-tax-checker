// deal-filter.js - 取引一覧の勘定科目フィルター機能

(function() {
  'use strict';

  // セレクタを定数化（freeeのDOM変更時はここを修正）
  const SELECTORS = {
    dealRow: 'tr.deal-list-line',
    accountItemCell: 'td.account-item-cell',
    dealTable: 'tbody.deal-lines'
  };

  // 状態管理
  let excludedAccounts = new Set();
  let panelVisible = false;
  let observer = null;

  console.log('[freee税務チェッカー] deal-filter.js 読み込み完了');

  // フローティングパネルを作成
  function createFilterPanel() {
    // 既に存在する場合は作成しない
    if (document.getElementById('ftc-filter-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'ftc-filter-panel';
    panel.innerHTML = `
      <button id="ftc-filter-toggle" title="勘定科目フィルター">
        <span class="ftc-filter-icon">🔍</span>
        <span class="ftc-filter-badge" style="display: none;">0</span>
      </button>
      <div id="ftc-filter-dropdown" style="display: none;">
        <div class="ftc-filter-header">
          <span>勘定科目フィルター</span>
          <button id="ftc-filter-close">&times;</button>
        </div>
        <div class="ftc-filter-actions">
          <button id="ftc-filter-all">全選択</button>
          <button id="ftc-filter-none">全解除</button>
        </div>
        <div id="ftc-filter-list"></div>
        <div class="ftc-filter-hint">
          チェックを外すと非表示になります
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // イベントリスナー
    document.getElementById('ftc-filter-toggle').addEventListener('click', togglePanel);
    document.getElementById('ftc-filter-close').addEventListener('click', () => togglePanel(false));
    document.getElementById('ftc-filter-all').addEventListener('click', () => setAllFilters(true));
    document.getElementById('ftc-filter-none').addEventListener('click', () => setAllFilters(false));

    // パネル外クリックで閉じる
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('ftc-filter-panel');
      if (panelVisible && !panel.contains(e.target)) {
        togglePanel(false);
      }
    });
  }

  // パネルの表示/非表示を切り替え
  function togglePanel(show) {
    const dropdown = document.getElementById('ftc-filter-dropdown');
    if (typeof show === 'boolean') {
      panelVisible = show;
    } else {
      panelVisible = !panelVisible;
    }
    dropdown.style.display = panelVisible ? 'block' : 'none';

    if (panelVisible) {
      updateAccountList();
    }
  }

  // 勘定科目リストを更新
  function updateAccountList() {
    const accounts = scanAccounts();
    const listEl = document.getElementById('ftc-filter-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    accounts.forEach(account => {
      const isExcluded = excludedAccounts.has(account);
      const item = document.createElement('label');
      item.className = 'ftc-filter-item';
      item.innerHTML = `
        <input type="checkbox" value="${account}" ${!isExcluded ? 'checked' : ''}>
        <span>${account}</span>
      `;
      item.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) {
          excludedAccounts.delete(account);
        } else {
          excludedAccounts.add(account);
        }
        applyFilters();
        saveSettings();
        updateBadge();
      });
      listEl.appendChild(item);
    });
  }

  // ページ内の勘定科目をスキャン
  function scanAccounts() {
    const accounts = new Set();
    document.querySelectorAll(SELECTORS.accountItemCell).forEach(cell => {
      const text = cell.textContent.trim();
      if (text) accounts.add(text);
    });
    return Array.from(accounts).sort();
  }

  // フィルターを適用
  function applyFilters() {
    document.querySelectorAll(SELECTORS.dealRow).forEach(row => {
      const accountCell = row.querySelector(SELECTORS.accountItemCell);
      if (!accountCell) return;

      const account = accountCell.textContent.trim();
      if (excludedAccounts.has(account)) {
        row.style.display = 'none';
      } else {
        row.style.display = '';
      }
    });
  }

  // 全選択/全解除
  function setAllFilters(showAll) {
    const accounts = scanAccounts();
    if (showAll) {
      excludedAccounts.clear();
    } else {
      accounts.forEach(a => excludedAccounts.add(a));
    }
    applyFilters();
    saveSettings();
    updateAccountList();
    updateBadge();
  }

  // バッジを更新
  function updateBadge() {
    const badge = document.querySelector('.ftc-filter-badge');
    if (!badge) return;

    const count = excludedAccounts.size;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }

  // 設定を保存
  function saveSettings() {
    chrome.storage.local.set({
      excludedAccounts: Array.from(excludedAccounts)
    });
  }

  // 設定を読み込み
  function loadSettings(callback) {
    chrome.storage.local.get(['excludedAccounts'], (result) => {
      if (result.excludedAccounts) {
        excludedAccounts = new Set(result.excludedAccounts);
      }
      if (callback) callback();
    });
  }

  // MutationObserverでDOM変更を監視
  function observeDOMChanges() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          // テーブル行が追加されたか確認
          for (const node of mutation.addedNodes) {
            if (node.nodeType === 1 && (
              node.matches?.(SELECTORS.dealRow) ||
              node.querySelector?.(SELECTORS.dealRow) ||
              node.matches?.(SELECTORS.dealTable) ||
              node.querySelector?.(SELECTORS.dealTable)
            )) {
              shouldUpdate = true;
              break;
            }
          }
        }
        if (shouldUpdate) break;
      }

      if (shouldUpdate) {
        // 少し待ってからフィルター適用（レンダリング完了を待つ）
        setTimeout(() => {
          applyFilters();
          updateBadge();
        }, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 初期化
  function init() {
    createFilterPanel();
    loadSettings(() => {
      applyFilters();
      updateBadge();
    });
    observeDOMChanges();
  }

  // DOMContentLoaded または既に読み込み済みなら即実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // 少し待ってから初期化（SPAの場合のレンダリング待ち）
    setTimeout(init, 500);
  }

})();
