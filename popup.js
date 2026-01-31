// popup.js - 設定画面のロジック

const API_BASE_URL = 'https://freee-tax-checker.vercel.app';

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

  // 家事按分入力要素
  const allocInputs = {
    rent: document.getElementById('alloc_rent'),
    utilities: document.getElementById('alloc_utilities'),
    communication: document.getElementById('alloc_communication'),
    supplies: document.getElementById('alloc_supplies'),
    vehicle: document.getElementById('alloc_vehicle'),
    travel: document.getElementById('alloc_travel')
  };

  // 設定を読み込み
  chrome.storage.local.get([
    'licenseKey',
    'licenseInfo',
    'businessType',
    'industry',
    'additionalInfo',
    'enabled',
    'autoRegister',
    'allocations'
  ], (result) => {
    if (result.licenseKey) licenseKeyInput.value = result.licenseKey;
    if (result.businessType) businessTypeInput.value = result.businessType;
    if (result.industry) industrySelect.value = result.industry;
    if (result.additionalInfo) additionalInfoInput.value = result.additionalInfo;
    if (result.enabled !== undefined) enabledToggle.checked = result.enabled;
    if (result.autoRegister !== undefined) autoRegisterToggle.checked = result.autoRegister;

    // 家事按分設定を読み込み
    if (result.allocations) {
      for (const [key, input] of Object.entries(allocInputs)) {
        if (result.allocations[key] !== undefined && result.allocations[key] !== null) {
          input.value = result.allocations[key];
        }
      }
    }

    // ライセンス情報を表示
    if (result.licenseInfo) {
      updateLicenseDisplay(result.licenseInfo);
    }
  });

  // ライセンス検証ボタン
  validateBtn.addEventListener('click', async () => {
    const licenseKey = licenseKeyInput.value.trim();
    if (!licenseKey) {
      showLicenseStatus('ライセンスキーを入力してください', 'error');
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
      }
    } catch (error) {
      showLicenseStatus('接続エラー: ' + error.message, 'error');
    } finally {
      validateBtn.disabled = false;
      validateBtn.textContent = '検証';
    }
  });

  // ライセンス表示を更新
  function updateLicenseDisplay(info) {
    if (info.usage) {
      const limit = info.usage.limit || '∞';
      usageCountEl.textContent = `${info.usage.count} / ${limit}`;
    }
  }

  // ライセンスステータス表示
  function showLicenseStatus(message, type) {
    licenseStatus.textContent = message;
    licenseStatus.style.color = type === 'success' ? '#2e7d32' : '#c62828';
  }

  // 設定を保存する関数
  function saveSettings(showMessage = true) {
    // 家事按分設定を収集
    const allocations = {};
    for (const [key, input] of Object.entries(allocInputs)) {
      const value = input.value.trim();
      if (value !== '') {
        allocations[key] = parseInt(value, 10);
      }
    }

    const settings = {
      licenseKey: licenseKeyInput.value.trim(),
      businessType: businessTypeInput.value.trim(),
      industry: industrySelect.value,
      additionalInfo: additionalInfoInput.value.trim(),
      enabled: enabledToggle.checked,
      autoRegister: autoRegisterToggle.checked,
      allocations: allocations
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

  // 家事按分の入力フィールドも自動保存（0-100に制限）
  Object.values(allocInputs).forEach(input => {
    input.addEventListener('change', () => {
      let value = parseInt(input.value, 10);
      if (!isNaN(value)) {
        if (value < 0) value = 0;
        if (value > 100) value = 100;
        input.value = value;
      }
      saveSettings(false);
    });
  });

  // ステータス表示
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
  }
}
