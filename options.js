// options.js - 家事按分設定ページのロジック

// デフォルトの按分項目
const DEFAULT_ALLOCATIONS = [
  { id: 'rent', name: '地代家賃', rate: null },
  { id: 'utilities', name: '水道光熱費', rate: null },
  { id: 'communication', name: '通信費', rate: null },
  { id: 'supplies', name: '消耗品費', rate: null },
  { id: 'vehicle', name: '車両費', rate: null },
  { id: 'travel', name: '旅費交通費', rate: null }
];

let allocations = [];

document.addEventListener('DOMContentLoaded', () => {
  loadAllocations();

  document.getElementById('add-btn').addEventListener('click', addNewItem);
  document.getElementById('save-btn').addEventListener('click', saveAllocations);
  document.getElementById('reset-btn').addEventListener('click', resetToDefault);
  document.getElementById('close-tab-btn').addEventListener('click', () => {
    window.close();
  });
});

// 設定を読み込み
function loadAllocations() {
  chrome.storage.local.get(['customAllocations'], (result) => {
    if (result.customAllocations && result.customAllocations.length > 0) {
      allocations = result.customAllocations;
    } else {
      // 旧形式のデータがあれば移行
      chrome.storage.local.get(['allocations'], (oldResult) => {
        if (oldResult.allocations && Object.keys(oldResult.allocations).length > 0) {
          allocations = migrateOldAllocations(oldResult.allocations);
        } else {
          allocations = JSON.parse(JSON.stringify(DEFAULT_ALLOCATIONS));
        }
        renderList();
      });
      return;
    }
    renderList();
  });
}

// 旧形式から新形式へ移行
function migrateOldAllocations(oldData) {
  const keyToName = {
    rent: '地代家賃',
    utilities: '水道光熱費',
    communication: '通信費',
    supplies: '消耗品費',
    vehicle: '車両費',
    travel: '旅費交通費'
  };

  const migrated = [];
  for (const [key, rate] of Object.entries(oldData)) {
    migrated.push({
      id: key,
      name: keyToName[key] || key,
      rate: rate
    });
  }

  // 旧データにない項目も追加
  for (const def of DEFAULT_ALLOCATIONS) {
    if (!migrated.find(m => m.id === def.id)) {
      migrated.push({ ...def });
    }
  }

  return migrated;
}

// リストをレンダリング
function renderList() {
  const listEl = document.getElementById('allocation-list');

  if (allocations.length === 0) {
    listEl.innerHTML = '<div class="empty-state">項目がありません。追加してください。</div>';
    return;
  }

  listEl.innerHTML = allocations.map((item, index) => `
    <div class="allocation-item" data-index="${index}">
      <input type="text" class="name-input" value="${escapeHtml(item.name)}" placeholder="勘定科目名">
      <input type="number" class="rate-input" value="${item.rate !== null ? item.rate : ''}" placeholder="-" min="0" max="100">
      <span class="percent">%</span>
      <button class="delete-btn" title="削除">&times;</button>
    </div>
  `).join('');

  // イベントリスナーを設定
  listEl.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.closest('.allocation-item').dataset.index);
      deleteItem(index);
    });
  });

  listEl.querySelectorAll('.name-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const index = parseInt(e.target.closest('.allocation-item').dataset.index);
      allocations[index].name = e.target.value.trim();
    });
  });

  listEl.querySelectorAll('.rate-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const index = parseInt(e.target.closest('.allocation-item').dataset.index);
      let value = parseInt(e.target.value, 10);
      if (isNaN(value) || e.target.value === '') {
        allocations[index].rate = null;
        e.target.value = '';
      } else {
        if (value < 0) value = 0;
        if (value > 100) value = 100;
        allocations[index].rate = value;
        e.target.value = value;
      }
    });
  });
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 項目を追加
function addNewItem() {
  const newId = 'custom_' + Date.now();
  allocations.push({
    id: newId,
    name: '',
    rate: null
  });
  renderList();

  // 新しい項目にフォーカス
  const inputs = document.querySelectorAll('.name-input');
  if (inputs.length > 0) {
    inputs[inputs.length - 1].focus();
  }
}

// 項目を削除
function deleteItem(index) {
  allocations.splice(index, 1);
  renderList();
}

// 保存
function saveAllocations() {
  // 空の名前の項目を除外
  const validAllocations = allocations.filter(a => a.name.trim() !== '');

  // 新形式で保存
  chrome.storage.local.set({ customAllocations: validAllocations }, () => {
    // 旧形式も互換性のために更新（popup.jsで使用）
    const oldFormat = {};
    validAllocations.forEach(a => {
      if (a.rate !== null) {
        oldFormat[a.id] = a.rate;
      }
    });
    chrome.storage.local.set({ allocations: oldFormat });

    showStatus('保存しました', 'success');
    allocations = validAllocations;
    renderList();
  });
}

// 初期値に戻す
function resetToDefault() {
  if (confirm('設定を初期値に戻しますか？')) {
    allocations = JSON.parse(JSON.stringify(DEFAULT_ALLOCATIONS));
    renderList();
    showStatus('初期値に戻しました（保存を押して確定）', 'success');
  }
}

// ステータス表示
function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  setTimeout(() => {
    statusEl.className = 'status';
  }, 3000);
}
