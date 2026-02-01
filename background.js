// background.js - Service Worker
// Vercel API経由でClaude APIを呼び出し

const API_BASE_URL = 'https://freee-tax-checker.vercel.app';

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_DEAL') {
    console.log('[background] 取引チェックリクエスト受信:', request.dealData);

    // 設定を取得してAPI呼び出し
    chrome.storage.local.get(['licenseKey', 'businessType', 'industry', 'additionalInfo', 'allocations'], async (settings) => {
      let licenseKey = settings.licenseKey;

      // ライセンスキーがない場合は自動でFreeキーを取得
      if (!licenseKey) {
        console.log('[background] ライセンスキーなし、Freeキーを自動取得');
        try {
          const regResponse = await fetch(`${API_BASE_URL}/api/register-free`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const regData = await regResponse.json();

          if (regData.success) {
            licenseKey = regData.licenseKey;
            // 取得したキーを保存
            chrome.storage.local.set({
              licenseKey: licenseKey,
              licenseInfo: {
                plan: 'free',
                usage: regData.usage
              }
            });
            console.log('[background] Freeキー取得成功:', licenseKey);
          } else if (regData.existingKey) {
            // 既にこのIPでFreeキーが発行済み
            licenseKey = regData.existingKey;
            chrome.storage.local.set({ licenseKey: licenseKey });
            console.log('[background] 既存Freeキーを復元:', licenseKey);
          } else {
            sendResponse({
              success: false,
              error: '【freee税務チェッカー】' + (regData.error || 'Freeキーの取得に失敗しました')
            });
            return;
          }
        } catch (regError) {
          console.error('[background] Freeキー取得エラー:', regError);
          sendResponse({
            success: false,
            error: '【freee税務チェッカー】Freeキーの取得に失敗しました: ' + regError.message
          });
          return;
        }
      }

      try {
        console.log('[background] Vercel API呼び出し開始');

        const response = await fetch(`${API_BASE_URL}/api/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            licenseKey: licenseKey,
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
          // 使用量をローカルにも保存（表示用）- 既存のplanを保持
          chrome.storage.local.get(['licenseInfo'], (existing) => {
            chrome.storage.local.set({
              licenseInfo: {
                ...existing.licenseInfo,
                usage: data.usage
              }
            });
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
