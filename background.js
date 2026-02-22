// background.js - Service Worker
// UUID自動生成 + クレジットパック方式

const API_BASE_URL = 'https://freee-tax-checker.vercel.app';

// インストール・アップデート時の処理
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // 新規インストール: UUID生成
    const token = crypto.randomUUID();
    chrome.storage.local.set({ userToken: token });
    console.log('[background] UUID生成:', token);
  } else if (details.reason === 'update') {
    // アップデート: UUIDがなければ生成、旧ストレージキーを削除
    chrome.storage.local.get(['userToken'], (result) => {
      if (!result.userToken) {
        const token = crypto.randomUUID();
        chrome.storage.local.set({ userToken: token });
        console.log('[background] アップデート時UUID生成:', token);
      }
    });
    // 旧方式のストレージキーを削除
    chrome.storage.local.remove(['licenseKey', 'licenseInfo']);
  }
});

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_DEAL') {
    handleCheckDeal(request, sendResponse);
    return true;
  }

  if (request.type === 'INIT_STATUS') {
    handleInitStatus(sendResponse);
    return true;
  }

  if (request.type === 'CREATE_ORDER') {
    handleCreateOrder(sendResponse);
    return true;
  }

  if (request.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['userToken', 'businessInfo'], (result) => {
      sendResponse(result);
    });
    return true;
  }

  if (request.type === 'SAVE_HISTORY') {
    handleSaveHistory(request, sendResponse);
    return true;
  }

  if (request.type === 'GET_HISTORY') {
    handleGetHistory(request, sendResponse);
    return true;
  }

  if (request.type === 'GET_STORAGE_STATS') {
    handleGetStorageStats(sendResponse);
    return true;
  }

  if (request.type === 'EXPORT_HISTORY') {
    handleExportHistory(request, sendResponse);
    return true;
  }

  if (request.type === 'CLEAR_HISTORY') {
    handleClearHistory(sendResponse);
    return true;
  }

  if (request.type === 'UPDATE_HISTORY_MEMO') {
    handleUpdateHistoryMemo(request, sendResponse);
    return true;
  }

  if (request.type === 'OPEN_PRO_PAGE') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    sendResponse({ success: true });
    return true;
  }

  if (request.type === 'CREATE_SUBSCRIPTION') {
    handleCreateSubscription(request, sendResponse);
    return true;
  }
});

// /api/use → /api/check の2ステップ
async function handleCheckDeal(request, sendResponse) {
  try {
    const settings = await getStorageData(['userToken', 'businessType', 'industry', 'additionalInfo', 'allocations']);
    let token = settings.userToken;

    // トークンがない場合は生成
    if (!token) {
      token = crypto.randomUUID();
      await setStorageData({ userToken: token });
    }

    // Step 1: /api/use で利用可否チェック＆消費
    const useResponse = await fetch(`${API_BASE_URL}/api/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const useData = await useResponse.json();

    // 残回数をローカルに保存
    const useStorageUpdate = {
      freeRemaining: useData.free_remaining,
      paidRemaining: useData.paid_remaining
    };
    if (useData.paid_remaining > 0) {
      useStorageUpdate.hasPurchased = true;
    }
    chrome.storage.local.set(useStorageUpdate);

    if (!useData.allowed) {
      sendResponse({
        success: false,
        error: useData.error || '利用上限に達しました。チェックパックを購入してください。'
      });
      return;
    }

    // Step 2: /api/check でAIチェック
    const checkResponse = await fetch(`${API_BASE_URL}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expenseData: {
          type: request.dealData.type,
          accountItem: request.dealData.accountItem,
          amount: request.dealData.amount,
          description: request.dealData.description,
          partner: request.dealData.partner,
          date: request.dealData.date,
          wallet: request.dealData.wallet
        },
        businessInfo: {
          businessType: settings.businessType || '',
          industry: settings.industry || '',
          additionalInfo: settings.additionalInfo || ''
        },
        allocationRates: settings.allocations || {}
      })
    });

    const checkData = await checkResponse.json();

    if (checkData.success) {
      sendResponse({ success: true, data: checkData.result });
    } else {
      sendResponse({
        success: false,
        error: checkData.error || 'AIチェックエラーが発生しました'
      });
    }
  } catch (error) {
    console.error('[background] CHECK_DEAL エラー:', error);
    sendResponse({
      success: false,
      error: '接続エラー: ' + error.message
    });
  }
}

// 初期化: 残回数を取得
async function handleInitStatus(sendResponse) {
  try {
    const { userToken } = await getStorageData(['userToken']);
    let token = userToken;

    if (!token) {
      token = crypto.randomUUID();
      await setStorageData({ userToken: token });
    }

    const response = await fetch(`${API_BASE_URL}/api/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await response.json();

    // ローカルに保存（paidRemainingが1以上なら購入済みフラグも立てる）
    const storageUpdate = {
      freeRemaining: data.free_remaining,
      paidRemaining: data.paid_remaining
    };
    if (data.paid_remaining > 0) {
      storageUpdate.hasPurchased = true;
    }
    // サブスクリプション状態を保存
    if (data.subscription?.status === 'active') {
      storageUpdate.hasSubscription = true;
    } else {
      storageUpdate.hasSubscription = false;
    }
    await setStorageData(storageUpdate);

    sendResponse({
      success: true,
      free_remaining: data.free_remaining,
      paid_remaining: data.paid_remaining,
      paypal_client_id: data.paypal_client_id,
      subscription: data.subscription
    });
  } catch (error) {
    console.error('[background] INIT_STATUS エラー:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// メモ更新
async function handleUpdateHistoryMemo(request, sendResponse) {
  try {
    const { recordId, memo } = request;
    if (!recordId) {
      sendResponse({ success: false, error: 'recordId is required' });
      return;
    }

    const data = await getStorageData([HISTORY_STORAGE_KEY]);
    const history = data[HISTORY_STORAGE_KEY] || { records: [], version: HISTORY_VERSION };

    const record = history.records.find(r => r.id === recordId);
    if (!record) {
      sendResponse({ success: false, error: 'レコードが見つかりません' });
      return;
    }

    record.memo = memo || '';
    await setStorageData({ [HISTORY_STORAGE_KEY]: history });
    sendResponse({ success: true });
  } catch (error) {
    console.error('[background] UPDATE_HISTORY_MEMO エラー:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// サブスクリプション作成
async function handleCreateSubscription(request, sendResponse) {
  try {
    const { userToken } = await getStorageData(['userToken']);
    if (!userToken) {
      sendResponse({ success: false, error: 'トークンがありません' });
      return;
    }

    const planType = request.planType || 'monthly';

    const response = await fetch(`${API_BASE_URL}/api/create-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: userToken, planType })
    });

    const data = await response.json();

    if (data.approval_url) {
      chrome.tabs.create({ url: data.approval_url });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: data.error || 'サブスクリプション作成に失敗しました' });
    }
  } catch (error) {
    console.error('[background] CREATE_SUBSCRIPTION エラー:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 注文作成
async function handleCreateOrder(sendResponse) {
  try {
    const { userToken } = await getStorageData(['userToken']);
    if (!userToken) {
      sendResponse({ success: false, error: 'トークンがありません' });
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: userToken })
    });

    const data = await response.json();

    if (data.approval_url) {
      // background側でタブを開く（ポップアップが閉じても確実に動作する）
      chrome.tabs.create({ url: data.approval_url });
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: data.error || '注文作成に失敗しました' });
    }
  } catch (error) {
    console.error('[background] CREATE_ORDER エラー:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// --- 変更履歴機能 ---

const HISTORY_STORAGE_KEY = 'ftcHistory';
const HISTORY_BUDGET_BYTES = 8 * 1024 * 1024; // 8MB
const HISTORY_VERSION = 1;
const FREE_RETENTION_DAYS = 7;

async function handleSaveHistory(request, sendResponse) {
  try {
    const { dealId, action, before, after, changes, timestamp } = request;

    const data = await getStorageData([HISTORY_STORAGE_KEY, 'userToken']);
    const history = data[HISTORY_STORAGE_KEY] || { records: [], version: HISTORY_VERSION };

    const record = {
      id: crypto.randomUUID(),
      dealId: dealId || null,
      action: action || 'edit',
      timestamp: timestamp || Date.now(),
      before: before || null,
      after: after,
      changes: changes || [],
      memo: ''
    };

    history.records.unshift(record);

    // サーバーでサブスク状態を確認して保持期間を適用
    let isProVerified = false;
    try {
      if (data.userToken) {
        const res = await fetch(`${API_BASE_URL}/api/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: data.userToken })
        });
        const initData = await res.json();
        isProVerified = initData.subscription?.status === 'active';
        // ローカルキャッシュも更新
        await setStorageData({ hasSubscription: isProVerified });
      }
    } catch (e) {
      // ネットワークエラー時はローカルキャッシュにフォールバック
      const cached = await getStorageData(['hasSubscription']);
      isProVerified = !!cached.hasSubscription;
    }

    if (!isProVerified) {
      const cutoff = Date.now() - (FREE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      history.records = history.records.filter(r => r.timestamp > cutoff);
    }

    // 容量チェック
    const jsonSize = new Blob([JSON.stringify(history)]).size;
    const usagePercent = (jsonSize / HISTORY_BUDGET_BYTES) * 100;

    if (usagePercent >= 90) {
      // 古いレコードを10%削除
      const removeCount = Math.max(1, Math.floor(history.records.length * 0.1));
      history.records.splice(history.records.length - removeCount, removeCount);
    }

    await setStorageData({ [HISTORY_STORAGE_KEY]: history });

    sendResponse({
      success: true,
      recordId: record.id,
      storageWarning: usagePercent >= 80 ? Math.round(usagePercent) : null
    });
  } catch (error) {
    console.error('[background] SAVE_HISTORY エラー:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetHistory(request, sendResponse) {
  try {
    const data = await getStorageData([HISTORY_STORAGE_KEY]);
    const history = data[HISTORY_STORAGE_KEY] || { records: [], version: HISTORY_VERSION };

    let records = history.records;

    // dealIdでフィルタ
    if (request.dealId) {
      records = records.filter(r => r.dealId === request.dealId);
    }

    // 日付範囲フィルタ
    if (request.dateFrom) {
      records = records.filter(r => r.timestamp >= request.dateFrom);
    }
    if (request.dateTo) {
      records = records.filter(r => r.timestamp <= request.dateTo);
    }

    // ページネーション
    const page = request.page || 1;
    const pageSize = request.pageSize || 20;
    const total = records.length;
    const start = (page - 1) * pageSize;
    const paged = records.slice(start, start + pageSize);

    sendResponse({
      success: true,
      records: paged,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    });
  } catch (error) {
    console.error('[background] GET_HISTORY エラー:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetStorageStats(sendResponse) {
  try {
    const data = await getStorageData([HISTORY_STORAGE_KEY]);
    const history = data[HISTORY_STORAGE_KEY] || { records: [], version: HISTORY_VERSION };

    const jsonStr = JSON.stringify(history);
    const sizeBytes = new Blob([jsonStr]).size;
    const usagePercent = (sizeBytes / HISTORY_BUDGET_BYTES) * 100;

    sendResponse({
      success: true,
      recordCount: history.records.length,
      sizeBytes,
      budgetBytes: HISTORY_BUDGET_BYTES,
      usagePercent: Math.round(usagePercent * 10) / 10
    });
  } catch (error) {
    console.error('[background] GET_STORAGE_STATS エラー:', error);
    sendResponse({ success: false, error: error.message });
  }
}

const HISTORY_DISCLAIMER = '本データはChrome拡張機能がブラウザ上でローカルにキャプチャしたものであり、freee公式の取引履歴ではありません。データの正確性・完全性を保証するものではなく、参考情報としてご利用ください。';

async function handleExportHistory(request, sendResponse) {
  try {
    const data = await getStorageData([HISTORY_STORAGE_KEY]);
    const history = data[HISTORY_STORAGE_KEY] || { records: [], version: HISTORY_VERSION };
    const format = request.format || 'json';

    if (format === 'json') {
      const exportData = {
        disclaimer: HISTORY_DISCLAIMER,
        exportDate: new Date().toISOString(),
        recordCount: history.records.length,
        records: history.records
      };
      sendResponse({ success: true, data: JSON.stringify(exportData, null, 2), format: 'json' });
    } else if (format === 'csv') {
      const lines = [];
      lines.push(`# ${HISTORY_DISCLAIMER}`);
      lines.push(`# エクスポート日時: ${new Date().toISOString()}`);
      lines.push('');
      lines.push('ID,取引ID,操作,日時,変更前_種別,変更前_勘定科目,変更前_金額,変更前_摘要,変更前_日付,変更前_取引先,変更後_種別,変更後_勘定科目,変更後_金額,変更後_摘要,変更後_日付,変更後_取引先,変更フィールド,メモ');

      for (const r of history.records) {
        const b = r.before || {};
        const a = r.after || {};
        const row = [
          r.id,
          r.dealId || '',
          r.action,
          new Date(r.timestamp).toISOString(),
          b.type || '', b.accountItem || '', b.amount || '', csvEscape(b.description || ''), b.date || '', csvEscape(b.partner || ''),
          a.type || '', a.accountItem || '', a.amount || '', csvEscape(a.description || ''), a.date || '', csvEscape(a.partner || ''),
          (r.changes || []).join(';'),
          csvEscape(r.memo || '')
        ];
        lines.push(row.join(','));
      }
      sendResponse({ success: true, data: lines.join('\n'), format: 'csv' });
    } else {
      sendResponse({ success: false, error: '不正な形式: ' + format });
    }
  } catch (error) {
    console.error('[background] EXPORT_HISTORY エラー:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function csvEscape(str) {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function handleClearHistory(sendResponse) {
  try {
    await setStorageData({ [HISTORY_STORAGE_KEY]: { records: [], version: HISTORY_VERSION } });
    sendResponse({ success: true });
  } catch (error) {
    console.error('[background] CLEAR_HISTORY エラー:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// chrome.storage.local のPromiseラッパー
function getStorageData(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result));
  });
}

function setStorageData(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => resolve());
  });
}

console.log('[background] freee税務チェッカー Service Worker 起動');
