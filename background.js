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
    await setStorageData(storageUpdate);

    sendResponse({
      success: true,
      free_remaining: data.free_remaining,
      paid_remaining: data.paid_remaining,
      paypal_client_id: data.paypal_client_id
    });
  } catch (error) {
    console.error('[background] INIT_STATUS エラー:', error);
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
