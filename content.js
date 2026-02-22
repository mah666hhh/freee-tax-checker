// content.js - freee取引画面のDOM監視

(function() {
  'use strict';

  console.log('[freee税務チェッカー] content.js 読み込み完了');

  // Deal IDをURLから取得
  function getDealIdFromUrl() {
    const match = window.location.pathname.match(/\/deals\/(\d+)/);
    return match ? match[1] : null;
  }

  // 成功通知を待ってから履歴を記録
  function saveHistoryOnSuccess(beforeData, afterData, dealId, action, onSuccess) {
    const changes = [];
    if (beforeData && afterData) {
      for (const key of Object.keys(afterData)) {
        if (String(beforeData[key] || '') !== String(afterData[key] || '')) {
          changes.push(key);
        }
      }
    }
    // 編集で変更が0件なら記録しない
    if (action === 'edit' && beforeData && changes.length === 0) {
      console.log('[freee税務チェッカー] 変更なし、履歴記録スキップ');
      return;
    }

    // 通知の出現を監視
    const container = document.querySelector('#global-notification');
    if (!container) {
      console.log('[freee税務チェッカー] 通知コンテナが見つからない、履歴記録スキップ');
      return;
    }

    let resolved = false;

    function handleNotification(notif) {
      if (resolved) return;
      if (notif.classList.contains('error')) {
        resolved = true;
        observer.disconnect();
        console.log('[freee税務チェッカー] エラー通知検出、履歴記録スキップ');
        return;
      }
      if (notif.classList.contains('success')) {
        resolved = true;
        observer.disconnect();
        console.log('[freee税務チェッカー] 成功通知検出、履歴記録:', action, dealId, changes);
        chrome.runtime.sendMessage({
          type: 'SAVE_HISTORY',
          dealId: dealId || null,
          action: action || (beforeData ? 'edit' : 'create'),
          before: beforeData || null,
          after: afterData,
          changes,
          timestamp: Date.now()
        }, (saveResponse) => {
          const effectiveAction = action || (beforeData ? 'edit' : 'create');
          if (saveResponse?.success && saveResponse.recordId && effectiveAction !== 'create') {
            showMemoInput(saveResponse.recordId);
          }
        });
        if (onSuccess) onSuccess();
      }
    }

    const observer = new MutationObserver((mutations) => {
      if (resolved) return;
      for (const mutation of mutations) {
        // Case 1: style/classが変わった → 通知要素自体か確認
        if (mutation.type === 'attributes') {
          const target = mutation.target;
          if (target.classList && target.classList.contains('notification') && target.style.display === 'block') {
            handleNotification(target);
            return;
          }
        }
        // Case 2: 新しいノードが追加された → 通知要素を探す
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            const notif = node.classList?.contains('notification') ? node : node.querySelector?.('.notification');
            if (notif && notif.style.display !== 'none') {
              handleNotification(notif);
              return;
            }
          }
        }
      }
    });

    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    // 10秒タイムアウト
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        observer.disconnect();
        console.log('[freee税務チェッカー] 通知タイムアウト、履歴記録スキップ');
      }
    }, 10000);
  }

  // モーダル要素を作成
  function createModal() {
    const modal = document.createElement('div');
    modal.id = 'ftc-modal';
    modal.className = 'ftc-modal';
    modal.innerHTML = `
      <div class="ftc-modal-content">
        <div class="ftc-modal-header">
          <span class="ftc-modal-icon"></span>
          <h3 class="ftc-modal-title">税務チェック結果</h3>
          <button class="ftc-modal-close">&times;</button>
        </div>
        <div class="ftc-modal-body">
          <div class="ftc-judgment"></div>
          <div class="ftc-risk-level"></div>
          <div class="ftc-section ftc-reason">
            <h4>📋 懸念点</h4>
            <p></p>
          </div>
          <div class="ftc-section ftc-improvement">
            <h4>💡 改善案</h4>
            <p></p>
          </div>
          <div class="ftc-section ftc-suggested">
            <h4>✏️ 摘要サジェスト</h4>
            <p class="ftc-suggested-text"></p>
            <button class="ftc-copy-btn">コピー</button>
          </div>
          <div class="ftc-section ftc-questions">
            <h4>❓ 調査で聞かれそうなこと</h4>
            <p></p>
          </div>
        </div>
        <div class="ftc-modal-footer">
          <button class="ftc-btn ftc-btn-cancel">キャンセル</button>
          <button class="ftc-btn ftc-btn-proceed">このまま登録</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // イベントリスナー
    modal.querySelector('.ftc-modal-close').addEventListener('click', () => hideModal());
    modal.querySelector('.ftc-btn-cancel').addEventListener('click', () => hideModal());
    modal.querySelector('.ftc-copy-btn').addEventListener('click', copySuggestedText);
    
    return modal;
  }

  // モーダル表示
  function showModal(result, onProceed, autoRegister = true, isEdit = false) {
    let modal = document.getElementById('ftc-modal');
    if (!modal) {
      modal = createModal();
    }

    const { judgment, riskLevel, reason, improvement, suggestedDescription, questions } = result;

    // 判定に応じたスタイル
    const iconEl = modal.querySelector('.ftc-modal-icon');
    const headerEl = modal.querySelector('.ftc-modal-header');
    
    if (judgment === '🟢') {
      iconEl.textContent = '✅';
      headerEl.className = 'ftc-modal-header ftc-header-green';
    } else if (judgment === '🟡') {
      iconEl.textContent = '⚠️';
      headerEl.className = 'ftc-modal-header ftc-header-yellow';
    } else {
      iconEl.textContent = '🚫';
      headerEl.className = 'ftc-modal-header ftc-header-red';
    }

    modal.querySelector('.ftc-judgment').textContent = `判定: ${judgment}`;
    modal.querySelector('.ftc-risk-level').innerHTML = `リスクレベル: ${'●'.repeat(riskLevel)}${'○'.repeat(5 - riskLevel)}`;
    
    // セクション表示
    const reasonSection = modal.querySelector('.ftc-reason');
    const improvementSection = modal.querySelector('.ftc-improvement');
    const suggestedSection = modal.querySelector('.ftc-suggested');
    const questionsSection = modal.querySelector('.ftc-questions');

    if (reason) {
      reasonSection.style.display = 'block';
      reasonSection.querySelector('p').textContent = reason;
    } else {
      reasonSection.style.display = 'none';
    }

    if (improvement) {
      improvementSection.style.display = 'block';
      improvementSection.querySelector('p').textContent = improvement;
    } else {
      improvementSection.style.display = 'none';
    }

    if (suggestedDescription) {
      suggestedSection.style.display = 'block';
      suggestedSection.querySelector('.ftc-suggested-text').textContent = suggestedDescription;
    } else {
      suggestedSection.style.display = 'none';
    }

    if (questions) {
      questionsSection.style.display = 'block';
      questionsSection.querySelector('p').textContent = questions;
    } else {
      questionsSection.style.display = 'none';
    }

    // 「このまま登録/保存」ボタン
    const proceedBtn = modal.querySelector('.ftc-btn-proceed');
    proceedBtn.textContent = isEdit ? 'このまま保存' : 'このまま登録';
    proceedBtn.onclick = () => {
      hideModal();
      if (onProceed) onProceed();
    };

    // 判定に応じたタイトルとセクション表示
    if (judgment === '🟢') {
      modal.querySelector('.ftc-modal-title').textContent = '問題なし！';
      modal.querySelector('.ftc-reason p').textContent = '特に問題は見つかりませんでした。';
      reasonSection.style.display = 'block';
      improvementSection.style.display = 'none';
      suggestedSection.style.display = 'none';
      questionsSection.style.display = 'none';

      // autoRegisterがONの場合のみ自動登録
      if (autoRegister) {
        setTimeout(() => {
          hideModal();
          if (onProceed) onProceed();
        }, 1500);
      }
    } else if (judgment === '🟡') {
      modal.querySelector('.ftc-modal-title').textContent = '税務チェック結果';
    } else {
      modal.querySelector('.ftc-modal-title').textContent = '要確認！';
    }

    modal.classList.add('ftc-modal-show');
  }

  // モーダル非表示
  function hideModal() {
    const modal = document.getElementById('ftc-modal');
    if (modal) {
      modal.classList.remove('ftc-modal-show');
    }
  }

  // サジェストテキストをコピー
  function copySuggestedText() {
    const text = document.querySelector('.ftc-suggested-text')?.textContent;
    if (text) {
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.ftc-copy-btn');
        btn.textContent = 'コピーしました！';
        setTimeout(() => { btn.textContent = 'コピー'; }, 2000);
      });
    }
  }

  // 取引データを取得（新規登録フォーム）
  function getDealData() {
    const isExpense = document.querySelector('.deal-codes button[data-code="expense"]')?.classList.contains('active');
    const date = document.querySelector('#settlement-date-input')?.value || '';
    const partnerEl = document.querySelector('.tags-combobox__tag-input[data-test="tags-combobox-history-partner"]');
    const partner = partnerEl?.value || '';
    const accountItem = document.querySelector('.input-account-item')?.value || '';
    const amountStr = document.querySelector('.sw-number-input')?.value || '0';
    const amount = parseInt(amountStr.replace(/,/g, ''), 10) || 0;
    const description = document.querySelector('input[name="description"]')?.value || '';
    const wallet = document.querySelector('select[name="walletable_name"]')?.value || '';

    return {
      type: isExpense ? 'expense' : 'income',
      date,
      partner,
      refNo: '',
      accountItem,
      taxCategory: '',
      amount,
      tags: '',
      description,
      wallet
    };
  }

  // 編集フォームから取引データを取得
  function getEditDealData(editorEl) {
    const isExpense = !!editorEl.querySelector('.expense-box');

    // ヘッダー部分
    const date = editorEl.querySelector('.issue-date input[type="text"]')?.value || '';
    const partnerEl = editorEl.querySelector('.partner .tags-combobox__tagify-tag--partner .tags-combobox__tag-value');
    const partner = partnerEl?.textContent?.trim() || '';
    const refNo = editorEl.querySelector('input[name="ref"]')?.value || '';

    // 収入/支出行
    const accountItem = editorEl.querySelector('.input-account-item')?.value || '';
    const taxSelect = editorEl.querySelector('.taxes-select');
    const taxCategory = taxSelect?.options?.[taxSelect.selectedIndex]?.value || taxSelect?.value || '';
    const amountStr = editorEl.querySelector('.input-line-amount')?.value || '0';
    const amount = parseInt(amountStr.replace(/,/g, ''), 10) || 0;

    // 品目・部門・メモタグ（タグ一覧を取得）
    const tagEls = editorEl.querySelectorAll('.line-tagbox .tags-combobox__tagify-tag--default .tags-combobox__tag-value');
    const tags = Array.from(tagEls).map(el => el.textContent?.trim()).filter(Boolean).join(', ');

    const description = editorEl.querySelector('input[name="description"]')?.value || '';

    return {
      type: isExpense ? 'expense' : 'income',
      date,
      partner,
      refNo,
      accountItem,
      taxCategory,
      amount,
      tags,
      description
    };
  }

  // チェックをスキップするフラグ
  let skipNextCheck = false;

  // 登録ボタンをフック
  function hookRegisterButton() {
    const registerBtn = document.querySelector('.action-buttons .btn.btn-primary');
    if (!registerBtn || registerBtn.dataset.ftcHooked) return;

    console.log('[freee税務チェッカー] 登録ボタンをフック');
    registerBtn.dataset.ftcHooked = 'true';

    registerBtn.addEventListener('click', async (e) => {
      // スキップフラグが立っている場合は何もしない（元の処理を実行させる）
      if (skipNextCheck) {
        console.log('[freee税務チェッカー] チェックスキップ、元の処理を実行');
        skipNextCheck = false;
        return; // イベントをそのまま通す
      }

      e.preventDefault();
      e.stopPropagation();

      const dealData = getDealData();
      console.log('[freee税務チェッカー] 取引データ:', dealData);

      // 収入の場合はチェックせずそのまま登録
      if (dealData.type === 'income') {
        proceedWithRegistrationAndCapture(registerBtn, dealData);
        return;
      }

      // 金額0または勘定科目なしの場合もスキップ
      if (!dealData.accountItem || dealData.amount === 0) {
        proceedWithRegistrationAndCapture(registerBtn, dealData);
        return;
      }

      // チェックが無効の場合はスキップ
      chrome.storage.local.get(['enabled'], (settings) => {
        if (settings.enabled === false) {
          console.log('[freee税務チェッカー] チェック無効のためスキップ');
          proceedWithRegistrationAndCapture(registerBtn, dealData);
          return;
        }
        // チェック有効の場合はAPI呼び出しへ
        performCheck(registerBtn, dealData);
      });
    }, true);
  }

  // AIチェックを実行
  function performCheck(registerBtn, dealData, isEdit = false) {
      // ローディング表示（テキストは変更せず、スタイルのみ変更してfreeeの状態管理を壊さない）
      const originalBg = registerBtn.style.background;
      registerBtn.disabled = true;
      registerBtn.style.background = '#4CAF50';
      registerBtn.style.opacity = '0.7';

      // chrome.runtimeが利用可能かチェック
      if (!chrome?.runtime?.sendMessage) {
        console.error('[freee税務チェッカー] chrome.runtime が利用できません。ページをリロードしてください。');
        registerBtn.disabled = false;
        registerBtn.style.background = originalBg;
        registerBtn.style.opacity = '';
        alert('拡張機能の接続が切れました。ページをリロードしてください。');
        return;
      }

      try {
        // background.jsに判定リクエスト
        chrome.runtime.sendMessage(
          { type: 'CHECK_DEAL', dealData },
          (response) => {
            // chrome.runtime.lastError をチェック
            if (chrome.runtime.lastError) {
              console.error('[freee税務チェッカー] メッセージ送信エラー:', chrome.runtime.lastError);
              registerBtn.disabled = false;
              registerBtn.style.background = originalBg;
              registerBtn.style.opacity = '';
              proceedWithRegistration(registerBtn);
              return;
            }

            registerBtn.disabled = false;
            registerBtn.style.background = originalBg;
            registerBtn.style.opacity = '';

            if (response?.success) {
              // autoRegister設定を取得してモーダル表示
              chrome.storage.local.get(['autoRegister'], (settings) => {
                const autoRegister = settings.autoRegister !== false; // デフォルトtrue
                const onProceed = isEdit
                  ? () => proceedWithRegistration(registerBtn)
                  : () => proceedWithRegistrationAndCapture(registerBtn, dealData);
                showModal(response.data, onProceed, autoRegister, isEdit);
              });
            } else {
              const errorMsg = response?.error || JSON.stringify(response);
              console.error('[freee税務チェッカー] エラー:', errorMsg);
              // ライセンスエラーの場合はアラート表示
              if (response?.error?.includes('利用上限') || response?.error?.includes('上限')) {
                alert(response.error);
              }
              proceedWithRegistration(registerBtn);
            }
          }
        );
      } catch (err) {
        console.error('[freee税務チェッカー] エラー:', err);
        registerBtn.disabled = false;
        registerBtn.style.background = originalBg;
        registerBtn.style.opacity = '';
        proceedWithRegistration(registerBtn);
      }
  }

  // 元の登録処理を実行
  function proceedWithRegistration(btn) {
    console.log('[freee税務チェッカー] 元の登録処理を実行');
    skipNextCheck = true;
    btn.click();
  }

  // 登録後に履歴キャプチャ（新規登録用）
  function proceedWithRegistrationAndCapture(btn, dealData) {
    saveHistoryOnSuccess(null, dealData, getDealIdFromUrl(), 'create');
    proceedWithRegistration(btn);
  }

  // 編集フォームの保存ボタンをフック
  function hookSaveButton() {
    const editors = document.querySelectorAll('.deal-editor[data-testid="deal-editor-INLINE"]');
    editors.forEach((editorEl) => {
      const saveBtn = editorEl.querySelector('.vb-withSideContent__content .btn.btn-primary');
      if (!saveBtn || saveBtn.dataset.ftcHooked) return;

      console.log('[freee税務チェッカー] 保存ボタンをフック');
      saveBtn.dataset.ftcHooked = 'true';

      // フォームの値が安定するまでポーリングして初期値をキャプチャ
      let initialData = null;
      let prevSnapshot = '';
      let stableCount = 0;
      const captureInterval = setInterval(() => {
        const current = getEditDealData(editorEl);
        const snapshot = JSON.stringify(current);
        if (snapshot === prevSnapshot) {
          stableCount++;
          if (stableCount >= 2) { // 400ms安定したら確定
            clearInterval(captureInterval);
            initialData = current;
            console.log('[freee税務チェッカー] 編集フォーム初期値:', initialData);
          }
        } else {
          stableCount = 0;
          prevSnapshot = snapshot;
        }
      }, 200);
      // 最大3秒で打ち切り
      setTimeout(() => {
        if (!initialData) {
          clearInterval(captureInterval);
          initialData = getEditDealData(editorEl);
          console.log('[freee税務チェッカー] 編集フォーム初期値(タイムアウト):', initialData);
        }
      }, 3000);

      saveBtn.addEventListener('click', async (e) => {
        if (skipNextCheck) {
          console.log('[freee税務チェッカー] チェックスキップ、元の保存処理を実行');
          skipNextCheck = false;
          // 履歴キャプチャ（税務チェック経由の保存）
          if (initialData) {
            const afterData = getEditDealData(editorEl);
            saveHistoryOnSuccess(initialData, afterData, getDealIdFromUrl(), 'edit', () => { initialData = afterData; });
          }
          return;
        }

        const dealData = getEditDealData(editorEl);

        // 初期値が取れていない場合はここでキャプチャ（初回クリックはスキップ）
        if (!initialData) {
          initialData = dealData;
          console.log('[freee税務チェッカー] 初期値未取得のためスキップ');
          return;
        }

        // フォームに変更がない場合はチェックせずそのまま保存
        const hasChanges = Object.keys(dealData).some(key =>
          String(dealData[key] || '') !== String(initialData[key] || '')
        );
        if (!hasChanges) {
          console.log('[freee税務チェッカー] 編集フォームに変更なし、チェックスキップ');
          return;
        }

        // 有料ユーザーのみ税務チェックを実行（履歴キャプチャは全ユーザー対象）
        const storage = await new Promise(resolve =>
          chrome.storage.local.get(['hasPurchased', 'paidRemaining', 'enabled'], resolve)
        );

        // チェックが無効の場合 or 未購入の場合は税務チェックスキップ、でも履歴はキャプチャ
        if (storage.enabled === false ||
            (!storage.hasPurchased && (!storage.paidRemaining || storage.paidRemaining <= 0))) {
          saveHistoryOnSuccess(initialData, dealData, getDealIdFromUrl(), 'edit', () => { initialData = dealData; });
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        console.log('[freee税務チェッカー] 編集取引データ:', dealData);

        // 収入の場合はチェックせずそのまま保存
        if (dealData.type === 'income') {
          saveHistoryOnSuccess(initialData, dealData, getDealIdFromUrl(), 'edit', () => { initialData = dealData; });
          proceedWithRegistration(saveBtn);
          return;
        }

        // 金額0または勘定科目なしの場合もスキップ
        if (!dealData.accountItem || dealData.amount === 0) {
          saveHistoryOnSuccess(initialData, dealData, getDealIdFromUrl(), 'edit', () => { initialData = dealData; });
          proceedWithRegistration(saveBtn);
          return;
        }

        // 税務チェック実行（履歴はskipNextCheck=true時にキャプチャされる）
        performCheck(saveBtn, dealData, true);
      }, true);
    });
  }

  // メモ入力UI表示
  function showMemoInput(recordId) {
    // 既存のメモUIを除去
    const existing = document.getElementById('ftc-memo-container');
    if (existing) existing.remove();

    chrome.storage.local.get(['hasSubscription'], (result) => {
      const isPro = !!result.hasSubscription;

      const container = document.createElement('div');
      container.id = 'ftc-memo-container';
      container.className = 'ftc-memo-container';

      if (isPro) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ftc-memo-input';
        input.placeholder = '変更理由メモ（任意）';
        input.maxLength = 200;

        const saveBtn = document.createElement('button');
        saveBtn.className = 'ftc-memo-save';
        saveBtn.textContent = '保存';
        saveBtn.addEventListener('click', () => {
          const memo = input.value.trim();
          if (!memo) { container.remove(); return; }
          chrome.runtime.sendMessage({
            type: 'UPDATE_HISTORY_MEMO',
            recordId,
            memo
          }, () => {
            container.textContent = '';
            const done = document.createElement('span');
            done.className = 'ftc-memo-done';
            done.textContent = 'メモを保存しました';
            container.appendChild(done);
            setTimeout(() => container.remove(), 2000);
          });
        });

        const closeBtn = document.createElement('button');
        closeBtn.className = 'ftc-memo-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', () => container.remove());

        container.appendChild(input);
        container.appendChild(saveBtn);
        container.appendChild(closeBtn);
      } else {
        const link = document.createElement('span');
        link.className = 'ftc-history-upgrade';
        link.textContent = 'Proで変更理由メモを追加 →';
        link.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'OPEN_PRO_PAGE' });
        });
        container.appendChild(link);
      }

      // 保存ボタンの隣に挿入
      const saveBtn = document.querySelector('.deal-editor[data-testid="deal-editor-INLINE"] .vb-withSideContent__content .btn.btn-primary');
      const btnRow = saveBtn?.closest('.vb-withSideContent__content') || saveBtn?.parentElement;
      if (btnRow) {
        container.style.display = 'inline-flex';
        container.style.marginLeft = '8px';
        container.style.verticalAlign = 'middle';
        btnRow.appendChild(container);
      } else {
        // フォールバック: 保存ボタンが見つからない場合は通知バー下
        container.style.position = 'fixed';
        container.style.bottom = '20px';
        container.style.right = '20px';
        container.style.zIndex = '99998';
        container.style.boxShadow = '0 2px 12px rgba(0,0,0,0.2)';
        document.body.appendChild(container);
      }

      // 30秒後に自動非表示（入力中は延長）
      let autoHideTimer = setTimeout(tryAutoHide, 30000);
      function tryAutoHide() {
        const input = container.querySelector('.ftc-memo-input');
        if (input && (document.activeElement === input || input.value.trim())) {
          autoHideTimer = setTimeout(tryAutoHide, 10000);
          return;
        }
        if (container.parentNode) container.remove();
      }
    });
  }

  // 削除ボタンをフック
  function hookDeleteButton() {
    const editors = document.querySelectorAll('.deal-editor[data-testid="deal-editor-INLINE"]');
    editors.forEach((editorEl) => {
      const deleteBtn = editorEl.querySelector('.btn-deal-remove');
      if (!deleteBtn || deleteBtn.dataset.ftcDeleteHooked) return;

      console.log('[freee税務チェッカー] 削除ボタンをフック');
      deleteBtn.dataset.ftcDeleteHooked = 'true';

      // フック時点でデータを事前キャプチャ（click時のDOM読み取りを避ける）
      const capturedData = getEditDealData(editorEl);
      const dealId = getDealIdFromUrl();
      console.log('[freee税務チェッカー] 削除用データ事前キャプチャ:', capturedData);

      deleteBtn.addEventListener('click', () => {
        // 「取引を削除しました」通知を待って記録
        const container = document.querySelector('#global-notification');
        if (!container) return;

        let resolved = false;
        const observer = new MutationObserver((mutations) => {
          if (resolved) return;
          for (const mutation of mutations) {
            const nodes = mutation.type === 'childList' ? mutation.addedNodes : [mutation.target];
            for (const node of nodes) {
              if (node.nodeType !== 1) continue;
              const msg = node.querySelector?.('.notification-message') || (node.classList?.contains('notification-message') ? node : null);
              if (msg && msg.textContent?.includes('削除しました')) {
                resolved = true;
                observer.disconnect();
                console.log('[freee税務チェッカー] 削除成功通知検出、履歴記録');
                chrome.runtime.sendMessage({
                  type: 'SAVE_HISTORY',
                  dealId: dealId || null,
                  action: 'delete',
                  before: capturedData,
                  after: null,
                  changes: Object.keys(capturedData),
                  timestamp: Date.now()
                });
                return;
              }
            }
          }
        });

        observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            observer.disconnect();
          }
        }, 10000);
      });
    });
  }

  // DOM監視でフォームの出現を検知
  function observeDOM() {
    const observer = new MutationObserver(() => {
      hookRegisterButton();
      hookSaveButton();
      hookDeleteButton();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 初回チェック
    hookRegisterButton();
    hookSaveButton();
    hookDeleteButton();
  }

  // 初期化
  function init() {
    console.log('[freee税務チェッカー] 初期化開始');
    
    // DOMが準備できたら監視開始
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observeDOM);
    } else {
      observeDOM();
    }
  }

  init();
})();
