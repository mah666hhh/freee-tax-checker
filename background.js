// background.js - Service Worker
// Vercel API経由でClaude APIを呼び出し

const API_BASE_URL = 'https://freee-tax-checker.vercel.app';

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_DEAL') {
    console.log('[background] 取引チェックリクエスト受信:', request.dealData);

    // 設定を取得してAPI呼び出し
    chrome.storage.local.get(['licenseKey', 'businessType', 'industry', 'additionalInfo', 'allocations'], async (settings) => {
      // ライセンスキーがない場合
      if (!settings.licenseKey) {
        sendResponse({
          success: false,
          error: '【freee税務チェッカー】ライセンスキーが設定されていません。拡張機能の設定画面からライセンスキーを入力してください。'
        });
        return;
      }

      try {
        console.log('[background] Vercel API呼び出し開始');

        const response = await fetch(`${API_BASE_URL}/api/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licenseKey: settings.licenseKey,
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

        const data = await response.json();
        console.log('[background] Vercel API応答:', data);

        if (data.success) {
          // 使用量をローカルにも保存（表示用）
          chrome.storage.local.set({
            licenseInfo: {
              usage: data.usage
            }
          });

          sendResponse({ success: true, data: data.result });
        } else {
          // エラー
          sendResponse({
            success: false,
            error: data.error || 'APIエラーが発生しました'
          });
        }
      } catch (error) {
        console.error('[background] APIエラー:', error);
        sendResponse({
          success: false,
          error: '接続エラー: ' + error.message
        });
      }
    });

    return true; // 非同期レスポンスを示す
  }

  if (request.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['licenseKey', 'businessInfo'], (result) => {
      sendResponse(result);
    });
    return true;
  }
});

console.log('[background] freee税務チェッカー Service Worker 起動');
