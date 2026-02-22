// history.js - 変更履歴ダッシュボード

(function() {
  'use strict';

  let currentPage = 1;
  const PAGE_SIZE = 30;

  // テーブル列に対応するフィールド（順序はtheadに合わせる）
  const TABLE_FIELDS = ['date', 'partner', 'refNo', 'accountItem', 'taxCategory', 'amount', 'tags', 'description'];

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('filterDateFrom').value = new Date().toISOString().slice(0, 10);
    loadStorageStats();
    loadHistory();

    document.getElementById('applyFilter').addEventListener('click', () => {
      currentPage = 1;
      loadHistory();
    });

    document.getElementById('clearFilter').addEventListener('click', () => {
      document.getElementById('filterDealId').value = '';
      document.getElementById('filterDateFrom').value = '';
      document.getElementById('filterDateTo').value = '';
      currentPage = 1;
      loadHistory();
    });

    document.getElementById('exportJson').addEventListener('click', () => exportHistory('json'));
    document.getElementById('exportCsv').addEventListener('click', () => exportHistory('csv'));
    document.getElementById('clearHistory').addEventListener('click', confirmClearHistory);
  });

  function loadStorageStats() {
    chrome.runtime.sendMessage({ type: 'GET_STORAGE_STATS' }, (response) => {
      if (chrome.runtime.lastError || !response?.success) return;

      document.getElementById('recordCount').textContent = `${response.recordCount} 件`;
      document.getElementById('storageUsage').textContent = response.usagePercent;

      const fill = document.getElementById('storageBarFill');
      fill.style.width = Math.min(100, response.usagePercent) + '%';
      fill.className = 'storage-bar-fill';
      if (response.usagePercent >= 90) {
        fill.classList.add('danger');
      } else if (response.usagePercent >= 80) {
        fill.classList.add('warning');
      }
    });
  }

  function getFilterParams() {
    const params = { page: currentPage, pageSize: PAGE_SIZE };

    const dealId = document.getElementById('filterDealId').value.trim();
    if (dealId) params.dealId = dealId;

    const dateFrom = document.getElementById('filterDateFrom').value;
    if (dateFrom) params.dateFrom = new Date(dateFrom).getTime();

    const dateTo = document.getElementById('filterDateTo').value;
    if (dateTo) params.dateTo = new Date(dateTo + 'T23:59:59').getTime();

    return params;
  }

  function loadHistory() {
    const tbody = document.getElementById('historyBody');
    tbody.textContent = '';
    const loadingRow = document.createElement('tr');
    const loadingTd = document.createElement('td');
    loadingTd.colSpan = 12;
    loadingTd.className = 'loading';
    loadingTd.textContent = '読み込み中...';
    loadingRow.appendChild(loadingTd);
    tbody.appendChild(loadingRow);

    const params = Object.assign({ type: 'GET_HISTORY' }, getFilterParams());

    chrome.runtime.sendMessage(params, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        tbody.textContent = '';
        const row = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 12;
        td.className = 'empty-state';
        td.textContent = '読み込みに失敗しました';
        row.appendChild(td);
        tbody.appendChild(row);
        return;
      }

      tbody.textContent = '';

      if (response.records.length === 0) {
        const row = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 12;
        td.className = 'empty-state';
        td.textContent = '変更履歴はありません';
        row.appendChild(td);
        tbody.appendChild(row);
        renderPagination(0, 0);
        return;
      }

      response.records.forEach(record => {
        tbody.appendChild(buildTableRow(record));
      });

      renderPagination(response.total, response.totalPages);
    });
  }

  function buildTableRow(record) {
    const tr = document.createElement('tr');
    const changedSet = new Set(record.changes || []);
    const data = record.after || {};

    // 日時
    const tdDate = document.createElement('td');
    tdDate.className = 'col-date';
    tdDate.textContent = formatDate(record.timestamp);
    tr.appendChild(tdDate);

    // 操作
    const tdAction = document.createElement('td');
    tdAction.className = 'col-action';
    const actionSpan = document.createElement('span');
    actionSpan.className = record.action === 'create' ? 'badge-create' : 'badge-edit';
    actionSpan.textContent = record.action === 'create' ? '新規' : '編集';
    tdAction.appendChild(actionSpan);
    tr.appendChild(tdAction);

    // 取引ID
    const tdDealId = document.createElement('td');
    tdDealId.className = 'col-deal-id';
    tdDealId.textContent = record.dealId || '';
    tr.appendChild(tdDealId);

    // 各フィールド列
    TABLE_FIELDS.forEach(field => {
      const td = document.createElement('td');
      const val = String(data[field] ?? '');
      const isChanged = changedSet.has(field);

      if (isChanged && record.before) {
        td.className = 'cell-changed';
        const beforeSpan = document.createElement('span');
        beforeSpan.className = 'val-before';
        beforeSpan.textContent = String(record.before[field] || '') || '(なし)';
        td.appendChild(beforeSpan);

        td.appendChild(document.createTextNode(' → '));

        const afterSpan = document.createElement('span');
        afterSpan.className = 'val-after';
        afterSpan.textContent = val || '(なし)';
        td.appendChild(afterSpan);
      } else {
        td.textContent = val || '-';
      }

      tr.appendChild(td);
    });

    // メモ列
    const tdMemo = document.createElement('td');
    tdMemo.className = 'col-memo';
    tdMemo.textContent = record.memo || '-';
    tr.appendChild(tdMemo);

    return tr;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function renderPagination(total, totalPages) {
    const paginationEl = document.getElementById('pagination');
    paginationEl.textContent = '';

    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '←';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', () => { currentPage--; loadHistory(); });
    paginationEl.appendChild(prevBtn);

    const info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = `${currentPage} / ${totalPages}（全${total}件）`;
    paginationEl.appendChild(info);

    const nextBtn = document.createElement('button');
    nextBtn.textContent = '→';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener('click', () => { currentPage++; loadHistory(); });
    paginationEl.appendChild(nextBtn);
  }

  function exportHistory(format) {
    chrome.storage.local.get(['hasSubscription'], (result) => {
      if (!result.hasSubscription) {
        showProUpgradeDialog();
        return;
      }
      doExport(format);
    });
  }

  function showProUpgradeDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';

    const icon = document.createElement('div');
    icon.style.cssText = 'font-size: 32px; margin-bottom: 8px;';
    icon.textContent = '🔒';

    const h3 = document.createElement('h3');
    h3.textContent = 'エクスポートはPro限定機能です';

    const p = document.createElement('p');
    p.textContent = 'Proプランに登録すると、履歴の無制限保持・エクスポート・変更理由メモが利用できます。';

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-confirm-cancel';
    cancelBtn.textContent = '閉じる';
    cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));

    const upgradeBtn = document.createElement('button');
    upgradeBtn.className = 'btn btn-pro-upgrade';
    upgradeBtn.textContent = 'Proプランに登録する';
    upgradeBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      chrome.runtime.openOptionsPage();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(upgradeBtn);
    dialog.appendChild(icon);
    dialog.appendChild(h3);
    dialog.appendChild(p);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  function doExport(format) {
    chrome.runtime.sendMessage({ type: 'EXPORT_HISTORY', format }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        alert('エクスポートに失敗しました');
        return;
      }

      const mimeType = format === 'json' ? 'application/json' : 'text/csv';
      const ext = format === 'json' ? 'json' : 'csv';
      const filename = `freee-history-${new Date().toISOString().slice(0,19).replace(/[T:]/g, '-')}.${ext}`;

      const blob = new Blob([response.data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  function confirmClearHistory() {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';

    const h3 = document.createElement('h3');
    h3.textContent = '履歴をクリアしますか？';

    const p = document.createElement('p');
    p.textContent = 'すべての変更履歴が削除されます。この操作は元に戻せません。';

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-confirm-cancel';
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));

    const okBtn = document.createElement('button');
    okBtn.className = 'btn btn-confirm-ok';
    okBtn.textContent = '削除する';
    okBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, (response) => {
        if (response?.success) {
          currentPage = 1;
          loadHistory();
          loadStorageStats();
        }
      });
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    dialog.appendChild(h3);
    dialog.appendChild(p);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }
})();
