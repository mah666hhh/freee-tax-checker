// popup.js - 設定画面のロジック

const API_BASE_URL = 'https://freee-tax-checker.vercel.app';

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
  const licenseKeyInput = document.getElementById('licenseKey');
  const licenseStatus = document.getElementById('licenseStatus');
  const validateBtn = document.getElementById('validateLicense');
  const usageCountEl = document.getElementById('usageCount');
  const businessTypeInput = document.getElementById('businessType');
  const industrySelect = document.getElementById('industry');
  const additionalInfoInput = document.getElementById('additionalInfo');
  const enabledToggle = document.getElementById('enabled');
  const autoRegisterToggle = document.getElementById('autoRegister');
  const statusDiv = document.getElementById('status');
  const allocationSection = document.getElementById('allocation-section');
  const openOptionsBtn = document.getElementById('openOptionsBtn');

  let currentAllocations = [];

  // 設定を読み込み
  chrome.storage.local.get([
    'licenseKey',
    'licenseInfo',
    'businessType',
    'industry',
    'additionalInfo',
    'enabled',
    'autoRegister',
    'customAllocations',
    'allocations'
  ], (result) => {
    if (result.licenseKey) licenseKeyInput.value = result.licenseKey;
    if (result.businessType) businessTypeInput.value = result.businessType;
    if (result.industry) industrySelect.value = result.industry;
    if (result.additionalInfo) additionalInfoInput.value = result.additionalInfo;
    if (result.enabled !== undefined) enabledToggle.checked = result.enabled;
    if (result.autoRegister !== undefined) autoRegisterToggle.checked = result.autoRegister;

    // 家事按分設定を読み込み（新形式優先）
    if (result.customAllocations && result.customAllocations.length > 0) {
      currentAllocations = result.customAllocations;
    } else if (result.allocations && Object.keys(result.allocations).length > 0) {
      // 旧形式から変換
      currentAllocations = migrateOldAllocations(result.allocations);
    } else {
      currentAllocations = JSON.parse(JSON.stringify(DEFAULT_ALLOCATIONS));
    }
    renderAllocations();

    // ライセンス情報を表示（キーが設定されている場合のみ）
    if (result.licenseKey && result.licenseInfo) {
      updateLicenseDisplay(result.licenseInfo);
    } else {
      // キーがない場合は初期状態
      usageCountEl.textContent = '- / -';
      const proPromotion = document.getElementById('proPromotion');
      if (proPromotion) proPromotion.style.display = 'block';
    }
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

    // 旧データにない項目も追加
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

    // 入力イベントを設定
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
    // 新形式で保存
    chrome.storage.local.set({ customAllocations: currentAllocations });

    // 旧形式も互換性のために更新（background.jsで使用）
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

  // ライセンス検証ボタン
  validateBtn.addEventListener('click', async () => {
    const licenseKey = licenseKeyInput.value.trim();
    if (!licenseKey) {
      showLicenseStatus('ライセンスキーを入力してください', 'error');
      // キャッシュをクリアして初期状態に
      chrome.storage.local.remove(['licenseKey', 'licenseInfo']);
      usageCountEl.textContent = '- / -';
      const proPromotion = document.getElementById('proPromotion');
      const usageUpgrade = document.getElementById('usageUpgrade');
      if (proPromotion) proPromotion.style.display = 'block';
      if (usageUpgrade) usageUpgrade.style.display = 'none';
      return;
    }

    validateBtn.disabled = true;
    validateBtn.textContent = '検証中...';

    try {
      const response = await fetch(`${API_BASE_URL}/api/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey })
      });

      const data = await response.json();

      if (data.valid) {
        // 成功 - 保存
        chrome.storage.local.set({
          licenseKey,
          licenseInfo: data
        });
        updateLicenseDisplay(data);
        showLicenseStatus('✓ 有効なライセンスです', 'success');
      } else {
        showLicenseStatus(data.error || '無効なライセンスキーです', 'error');
        // 無効な場合はキャッシュをクリア
        chrome.storage.local.remove(['licenseKey', 'licenseInfo']);
        usageCountEl.textContent = '- / -';
        const proPromotion = document.getElementById('proPromotion');
        const usageUpgrade = document.getElementById('usageUpgrade');
        if (proPromotion) proPromotion.style.display = 'block';
        if (usageUpgrade) usageUpgrade.style.display = 'none';
      }
    } catch (error) {
      showLicenseStatus('接続エラー: ' + error.message, 'error');
    } finally {
      validateBtn.disabled = false;
      validateBtn.textContent = 'ライセンスキー検証';
    }
  });

  // ライセンス表示を更新
  function updateLicenseDisplay(info) {
    const proPromotion = document.getElementById('proPromotion');
    const usageUpgrade = document.getElementById('usageUpgrade');
    const usageUpgradeMessage = document.getElementById('usageUpgradeMessage');

    if (info.usage) {
      const limit = info.usage.limit;
      const count = info.usage.count;

      // 無制限プラン（paid）の場合
      if (limit === null || info.plan === 'paid') {
        usageCountEl.textContent = `${count} / ∞`;
        // Proユーザーは課金導線を非表示
        if (proPromotion) proPromotion.style.display = 'none';
        if (usageUpgrade) usageUpgrade.style.display = 'none';
      } else {
        // Freeプランの場合
        usageCountEl.textContent = `${count} / ${limit}`;
        const remaining = limit - count;

        // 残りが少ない or 上限に達した場合
        if (remaining <= 0) {
          // 上限に達した
          if (usageUpgrade) usageUpgrade.style.display = 'block';
          if (usageUpgradeMessage) {
            usageUpgradeMessage.textContent = '🚫 今月の無料枠を使い切りました';
            usageUpgradeMessage.style.color = '#c62828';
          }
        } else if (remaining <= 3) {
          // 残り少ない
          if (usageUpgrade) usageUpgrade.style.display = 'block';
          if (usageUpgradeMessage) {
            usageUpgradeMessage.textContent = `⚠️ 残り${remaining}回です`;
            usageUpgradeMessage.style.color = '#e65100';
          }
        } else {
          if (usageUpgrade) usageUpgrade.style.display = 'none';
        }

        // Freeプランは購入導線を表示
        if (proPromotion) proPromotion.style.display = 'block';
      }
    }
  }

  // ライセンスステータス表示
  function showLicenseStatus(message, type) {
    licenseStatus.textContent = message;
    licenseStatus.style.color = type === 'success' ? '#2e7d32' : '#c62828';
  }

  // 設定を保存する関数
  function saveSettings(showMessage = true) {
    const settings = {
      licenseKey: licenseKeyInput.value.trim(),
      businessType: businessTypeInput.value.trim(),
      industry: industrySelect.value,
      additionalInfo: additionalInfoInput.value.trim(),
      enabled: enabledToggle.checked,
      autoRegister: autoRegisterToggle.checked
    };

    chrome.storage.local.set(settings, () => {
      if (showMessage) {
        showStatus('保存しました ✓', 'success');
        setTimeout(() => { statusDiv.className = 'status'; }, 2000);
      }
    });
  }

  // 各入力フィールドの変更時に自動保存
  const autoSaveInputs = [
    licenseKeyInput, businessTypeInput, industrySelect,
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
