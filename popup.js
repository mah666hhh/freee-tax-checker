// popup.js - 設定画面のロジック（クレジットパック方式）

// デフォルトの按分項目
const DEFAULT_ALLOCATIONS = [
  { id: 'rent', name: '地代家賃', rate: null },
  { id: 'utilities', name: '水道光熱費', rate: null },
  { id: 'communication', name: '通信費', rate: null },
  { id: 'supplies', name: '消耗品費', rate: null },
  { id: 'vehicle', name: '車両費', rate: null },
  { id: 'travel', name: '旅費交通費', rate: null }
];

document.addEventListener('DOMContentLoaded', () => {
  // 現在のタブURLをチェック
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url || '';
    const isDealsPage = url.startsWith('https://secure.freee.co.jp/deals');

    if (!isDealsPage) {
      document.getElementById('not-available').style.display = 'block';
      document.getElementById('main-content').style.display = 'none';
      return;
    }

    // 対象ページならメイン処理を実行
    initPopup();
  });
});

function initPopup() {
  const totalCreditsEl = document.getElementById('totalCredits');
  const freeCountEl = document.getElementById('freeCount');
  const paidCountEl = document.getElementById('paidCount');
  const creditsWarningEl = document.getElementById('creditsWarning');
  const purchaseBtn = document.getElementById('purchaseBtn');
  const businessTypeInput = document.getElementById('businessType');
  const industrySelect = document.getElementById('industry');
  const additionalInfoInput = document.getElementById('additionalInfo');
  const enabledToggle = document.getElementById('enabled');
  const autoRegisterToggle = document.getElementById('autoRegister');
  const statusDiv = document.getElementById('status');
  const allocationSection = document.getElementById('allocation-section');
  const openOptionsBtn = document.getElementById('openOptionsBtn');

  let currentAllocations = [];

  // 変更履歴ページを開く
  const openHistoryBtn = document.getElementById('openHistoryBtn');
  if (openHistoryBtn) {
    openHistoryBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
    });
  }

  // サブスクリプション
  const subscribeBtn = document.getElementById('subscribeBtn');
  const subscriptionSection = document.getElementById('subscriptionSection');
  const subscriptionActive = document.getElementById('subscriptionActive');

  // プラン選択
  let selectedPlan = 'monthly';
  const planToggle = document.getElementById('planToggle');
  if (planToggle) {
    planToggle.addEventListener('click', (e) => {
      const tab = e.target.closest('.plan-tab');
      if (!tab) return;
      selectedPlan = tab.dataset.plan;
      planToggle.querySelectorAll('.plan-tab').forEach(t => {
        if (t.dataset.plan === selectedPlan) {
          t.style.background = '#1976d2';
          t.style.color = '#fff';
          t.classList.add('active');
        } else {
          t.style.background = '#fff';
          t.style.color = '#555';
          t.classList.remove('active');
        }
      });
    });
  }

  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', () => {
      subscribeBtn.disabled = true;
      subscribeBtn.textContent = '処理中...';
      chrome.runtime.sendMessage({ type: 'CREATE_SUBSCRIPTION', planType: selectedPlan }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          subscribeBtn.disabled = false;
          subscribeBtn.textContent = 'Proプランに登録';
          alert(response?.error || 'エラーが発生しました');
          return;
        }
        subscribeBtn.textContent = 'PayPalページを開きました';
      });
    });
  }

  function updateSubscriptionUI(subscription) {
    if (subscription?.status === 'active') {
      if (subscriptionSection) subscriptionSection.style.display = 'none';
      if (subscriptionActive) subscriptionActive.style.display = 'block';
    } else {
      if (subscriptionSection) subscriptionSection.style.display = 'block';
      if (subscriptionActive) subscriptionActive.style.display = 'none';
    }
  }

  // 設定を読み込み
  chrome.storage.local.get([
    'businessType',
    'industry',
    'additionalInfo',
    'enabled',
    'autoRegister',
    'customAllocations',
    'allocations',
    'freeRemaining',
    'paidRemaining',
    'hasSubscription'
  ], (result) => {
    if (result.businessType) businessTypeInput.value = result.businessType;
    if (result.industry) industrySelect.value = result.industry;
    if (result.additionalInfo) additionalInfoInput.value = result.additionalInfo;
    if (result.enabled !== undefined) enabledToggle.checked = result.enabled;
    if (result.autoRegister !== undefined) autoRegisterToggle.checked = result.autoRegister;

    // 家事按分設定を読み込み（新形式優先）
    if (result.customAllocations && result.customAllocations.length > 0) {
      currentAllocations = result.customAllocations;
    } else if (result.allocations && Object.keys(result.allocations).length > 0) {
      currentAllocations = migrateOldAllocations(result.allocations);
    } else {
      currentAllocations = JSON.parse(JSON.stringify(DEFAULT_ALLOCATIONS));
    }
    renderAllocations();

    // ローカルキャッシュから残回数を仮表示
    if (result.freeRemaining !== undefined || result.paidRemaining !== undefined) {
      updateCreditsDisplay(result.freeRemaining || 0, result.paidRemaining || 0);
    }

    // サブスクリプション状態のキャッシュ表示
    if (result.hasSubscription) {
      updateSubscriptionUI({ status: 'active' });
    } else {
      updateSubscriptionUI(null);
    }
  });

  // サーバーから最新の残回数を取得
  chrome.runtime.sendMessage({ type: 'INIT_STATUS' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('INIT_STATUS error:', chrome.runtime.lastError);
      return;
    }
    if (response?.success) {
      updateCreditsDisplay(response.free_remaining, response.paid_remaining);
      updateSubscriptionUI(response.subscription);
    }
  });

  // 残回数表示を更新
  function updateCreditsDisplay(free, paid) {
    const total = free + paid;
    totalCreditsEl.textContent = total;
    freeCountEl.textContent = free;
    paidCountEl.textContent = paid;

    // スタイル
    totalCreditsEl.className = 'credits-number';
    if (total === 0) {
      totalCreditsEl.classList.add('depleted');
      creditsWarningEl.textContent = '残りチェック回数がありません。チェックパックを購入してください。';
      creditsWarningEl.style.display = 'block';
      creditsWarningEl.style.background = '#ffebee';
      creditsWarningEl.style.color = '#c62828';
    } else if (total <= 3) {
      totalCreditsEl.classList.add('warning');
      creditsWarningEl.textContent = `残り${total}回です。チェックパックの購入をおすすめします。`;
      creditsWarningEl.style.display = 'block';
      creditsWarningEl.style.background = '#fff3e0';
      creditsWarningEl.style.color = '#e65100';
    } else {
      creditsWarningEl.style.display = 'none';
    }
  }

  // 購入ボタン
  purchaseBtn.addEventListener('click', () => {
    purchaseBtn.disabled = true;
    purchaseBtn.textContent = '処理中...';
    creditsWarningEl.style.display = 'none';

    chrome.runtime.sendMessage({ type: 'CREATE_ORDER' }, (response) => {
      if (chrome.runtime.lastError) {
        purchaseBtn.disabled = false;
        purchaseBtn.textContent = '購入する';
        creditsWarningEl.textContent = '接続エラーが発生しました';
        creditsWarningEl.style.display = 'block';
        creditsWarningEl.style.background = '#ffebee';
        creditsWarningEl.style.color = '#c62828';
        return;
      }

      if (response?.success) {
        // background側でPayPalページが開かれる
        purchaseBtn.textContent = 'PayPalページを開きました';
      } else {
        purchaseBtn.disabled = false;
        purchaseBtn.textContent = '購入する';
        creditsWarningEl.textContent = response?.error || '注文作成に失敗しました';
        creditsWarningEl.style.display = 'block';
        creditsWarningEl.style.background = '#ffebee';
        creditsWarningEl.style.color = '#c62828';
      }
    });
  });

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

    for (const def of DEFAULT_ALLOCATIONS) {
      if (!migrated.find(m => m.id === def.id)) {
        migrated.push({ ...def });
      }
    }

    return migrated;
  }

  // 按分項目をレンダリング
  function renderAllocations() {
    if (currentAllocations.length === 0) {
      allocationSection.innerHTML = '<p style="color: #999; font-size: 12px;">項目がありません</p>';
      return;
    }

    allocationSection.innerHTML = currentAllocations.map((item, index) => `
      <div class="allocation-row">
        <span class="account-name">${escapeHtml(item.name)}</span>
        <input type="number" data-index="${index}" min="0" max="100" placeholder="-" value="${item.rate !== null ? item.rate : ''}">
        <span class="percent">%</span>
      </div>
    `).join('');

    allocationSection.querySelectorAll('input[type="number"]').forEach(input => {
      input.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.index);
        let value = parseInt(e.target.value, 10);
        if (isNaN(value) || e.target.value === '') {
          currentAllocations[index].rate = null;
          e.target.value = '';
        } else {
          if (value < 0) value = 0;
          if (value > 100) value = 100;
          currentAllocations[index].rate = value;
          e.target.value = value;
        }
        saveAllocations();
      });
    });
  }

  // HTMLエスケープ
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 按分設定を保存
  function saveAllocations() {
    chrome.storage.local.set({ customAllocations: currentAllocations });

    const oldFormat = {};
    currentAllocations.forEach(a => {
      if (a.rate !== null) {
        oldFormat[a.id] = a.rate;
      }
    });
    chrome.storage.local.set({ allocations: oldFormat });
  }

  // オプションページを開く
  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 設定を保存する関数
  function saveSettings(showMessage = true) {
    const settings = {
      businessType: businessTypeInput.value.trim(),
      industry: industrySelect.value,
      additionalInfo: additionalInfoInput.value.trim(),
      enabled: enabledToggle.checked,
      autoRegister: autoRegisterToggle.checked
    };

    chrome.storage.local.set(settings, () => {
      if (showMessage) {
        showStatus('保存しました', 'success');
        setTimeout(() => { statusDiv.className = 'status'; }, 2000);
      }
    });
  }

  // 各入力フィールドの変更時に自動保存
  const autoSaveInputs = [
    businessTypeInput, industrySelect,
    additionalInfoInput, enabledToggle, autoRegisterToggle
  ];
  autoSaveInputs.forEach(input => {
    input.addEventListener('change', () => saveSettings(false));
  });

  // ステータス表示
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
  }
}
