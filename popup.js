// popup.js - 設定画面のロジック

// モデル別の料金（per 1M tokens）
const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00, name: 'Haiku 4.5' },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00, name: 'Haiku 3.5' }
};

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const modelSelect = document.getElementById('model');
  const modelPricing = document.getElementById('modelPricing');
  const businessTypeInput = document.getElementById('businessType');
  const industrySelect = document.getElementById('industry');
  const additionalInfoInput = document.getElementById('additionalInfo');
  const enabledToggle = document.getElementById('enabled');
  const autoRegisterToggle = document.getElementById('autoRegister');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');
  const resetUsageBtn = document.getElementById('resetUsage');

  // 家事按分入力要素
  const allocInputs = {
    rent: document.getElementById('alloc_rent'),
    utilities: document.getElementById('alloc_utilities'),
    communication: document.getElementById('alloc_communication'),
    supplies: document.getElementById('alloc_supplies'),
    vehicle: document.getElementById('alloc_vehicle'),
    travel: document.getElementById('alloc_travel')
  };

  // 使用量表示要素
  const checkCountEl = document.getElementById('checkCount');
  const inputTokensEl = document.getElementById('inputTokens');
  const outputTokensEl = document.getElementById('outputTokens');
  const estimatedCostEl = document.getElementById('estimatedCost');

  // 設定を読み込み
  chrome.storage.local.get([
    'apiKey',
    'model',
    'businessType',
    'industry',
    'additionalInfo',
    'enabled',
    'autoRegister',
    'usage',
    'allocations'
  ], (result) => {
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    if (result.model) modelSelect.value = result.model;
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

    // 使用量を表示
    updateUsageDisplay(result.usage, result.model || 'claude-haiku-4-5-20251001');

    // 料金表示を更新
    updatePricingDisplay(result.model || 'claude-haiku-4-5-20251001');
  });

  // モデル変更時に料金表示を更新
  modelSelect.addEventListener('change', () => {
    updatePricingDisplay(modelSelect.value);
    // 使用量の推定コストも再計算
    chrome.storage.local.get(['usage'], (result) => {
      updateUsageDisplay(result.usage, modelSelect.value);
    });
  });

  // 料金表示を更新
  function updatePricingDisplay(model) {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-haiku-4-5-20251001'];
    modelPricing.textContent = `💰 $${pricing.input.toFixed(2)} / $${pricing.output.toFixed(2)} per MTok (入力/出力)`;
  }

  // 使用量表示を更新
  function updateUsageDisplay(usage, model) {
    const u = usage || { checkCount: 0, inputTokens: 0, outputTokens: 0 };
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-haiku-4-5-20251001'];
    
    checkCountEl.textContent = `${u.checkCount || 0} 回`;
    inputTokensEl.textContent = formatNumber(u.inputTokens || 0);
    outputTokensEl.textContent = formatNumber(u.outputTokens || 0);
    
    // コスト計算
    const inputCost = ((u.inputTokens || 0) / 1000000) * pricing.input;
    const outputCost = ((u.outputTokens || 0) / 1000000) * pricing.output;
    const totalCost = inputCost + outputCost;
    
    estimatedCostEl.textContent = `$${totalCost.toFixed(4)}`;
  }

  // 数値をフォーマット
  function formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  // 使用量リセット
  resetUsageBtn.addEventListener('click', () => {
    if (confirm('使用状況をリセットしますか？')) {
      chrome.storage.local.set({ usage: { checkCount: 0, inputTokens: 0, outputTokens: 0 } }, () => {
        updateUsageDisplay({ checkCount: 0, inputTokens: 0, outputTokens: 0 }, modelSelect.value);
        showStatus('使用状況をリセットしました', 'success');
        setTimeout(() => { statusDiv.className = 'status'; }, 2000);
      });
    }
  });

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
      apiKey: apiKeyInput.value.trim(),
      model: modelSelect.value,
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

  // 保存ボタンクリック
  saveBtn.addEventListener('click', () => saveSettings(true));

  // 各入力フィールドの変更時に自動保存
  const autoSaveInputs = [
    apiKeyInput, modelSelect, businessTypeInput, industrySelect,
    additionalInfoInput, enabledToggle, autoRegisterToggle
  ];
  autoSaveInputs.forEach(input => {
    input.addEventListener('change', () => saveSettings(false));
  });

  // 家事按分の入力フィールドも自動保存
  Object.values(allocInputs).forEach(input => {
    input.addEventListener('change', () => saveSettings(false));
  });

  // ステータス表示
  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
  }
});
