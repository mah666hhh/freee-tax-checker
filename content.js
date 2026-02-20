// content.js - freee取引画面のDOM監視

(function() {
  'use strict';

  console.log('[freee税務チェッカー] content.js 読み込み完了');

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

  // 取引データを取得
  function getDealData() {
    const isExpense = document.querySelector('.deal-codes button[data-code="expense"]')?.classList.contains('active');
    const accountItem = document.querySelector('.input-account-item')?.value || '';
    const amountStr = document.querySelector('.sw-number-input')?.value || '0';
    const amount = parseInt(amountStr.replace(/,/g, ''), 10) || 0;
    const description = document.querySelector('input[name="description"]')?.value || '';
    const date = document.querySelector('#settlement-date-input')?.value || '';
    const partner = document.querySelector('.tags-combobox__tag-input[data-test="tags-combobox-history-partner"]')?.value || '';
    const wallet = document.querySelector('select[name="walletable_name"]')?.value || '';

    return {
      type: isExpense ? 'expense' : 'income',
      accountItem,
      amount,
      description,
      date,
      partner,
      wallet
    };
  }

  // 編集フォームから取引データを取得
  function getEditDealData(editorEl) {
    const isExpense = !!editorEl.querySelector('.expense-box');
    const accountItem = editorEl.querySelector('.input-account-item')?.value || '';
    const amountStr = editorEl.querySelector('.input-line-amount')?.value || '0';
    const amount = parseInt(amountStr.replace(/,/g, ''), 10) || 0;
    const description = editorEl.querySelector('input[name="description"]')?.value || '';
    const date = editorEl.querySelector('.issue-date input[type="text"]')?.value || '';
    const partner = editorEl.querySelector('.tags-combobox__tag-input[data-test="tags-combobox-history-partner"]')?.value || '';

    return {
      type: isExpense ? 'expense' : 'income',
      accountItem,
      amount,
      description,
      date,
      partner,
      wallet: ''
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
        proceedWithRegistration(registerBtn);
        return;
      }

      // 金額0または勘定科目なしの場合もスキップ
      if (!dealData.accountItem || dealData.amount === 0) {
        proceedWithRegistration(registerBtn);
        return;
      }

      // チェックが無効の場合はスキップ
      chrome.storage.local.get(['enabled'], (settings) => {
        if (settings.enabled === false) {
          console.log('[freee税務チェッカー] チェック無効のためスキップ');
          proceedWithRegistration(registerBtn);
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
                showModal(response.data, () => proceedWithRegistration(registerBtn), autoRegister, isEdit);
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

  // 編集フォームの保存ボタンをフック（有料ユーザーのみ）
  function hookSaveButton() {
    const editors = document.querySelectorAll('.deal-editor[data-testid="deal-editor-INLINE"]');
    editors.forEach((editorEl) => {
      const saveBtn = editorEl.querySelector('.vb-withSideContent__content .btn.btn-primary');
      if (!saveBtn || saveBtn.dataset.ftcHooked) return;

      console.log('[freee税務チェッカー] 保存ボタンをフック');
      saveBtn.dataset.ftcHooked = 'true';

      // フォームの値が読み込まれるのを待ってから初期値をキャプチャ
      let initialData = null;
      setTimeout(() => {
        initialData = getEditDealData(editorEl);
        console.log('[freee税務チェッカー] 編集フォーム初期値:', initialData);
      }, 500);

      saveBtn.addEventListener('click', async (e) => {
        if (skipNextCheck) {
          console.log('[freee税務チェッカー] チェックスキップ、元の保存処理を実行');
          skipNextCheck = false;
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
        if (dealData.accountItem === initialData.accountItem &&
            dealData.amount === initialData.amount &&
            dealData.description === initialData.description &&
            dealData.date === initialData.date &&
            dealData.partner === initialData.partner &&
            dealData.type === initialData.type) {
          console.log('[freee税務チェッカー] 編集フォームに変更なし、チェックスキップ');
          return;
        }

        // 有料ユーザーのみチェックを実行
        const storage = await new Promise(resolve =>
          chrome.storage.local.get(['hasPurchased', 'paidRemaining', 'enabled'], resolve)
        );

        // チェックが無効の場合はスキップ
        if (storage.enabled === false) {
          return;
        }

        // 未購入または残回数0の場合はチェックせずそのまま保存
        if (!storage.hasPurchased && (!storage.paidRemaining || storage.paidRemaining <= 0)) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        console.log('[freee税務チェッカー] 編集取引データ:', dealData);

        // 収入の場合はチェックせずそのまま保存
        if (dealData.type === 'income') {
          proceedWithRegistration(saveBtn);
          return;
        }

        // 金額0または勘定科目なしの場合もスキップ
        if (!dealData.accountItem || dealData.amount === 0) {
          proceedWithRegistration(saveBtn);
          return;
        }

        performCheck(saveBtn, dealData, true);
      }, true);
    });
  }

  // DOM監視でフォームの出現を検知
  function observeDOM() {
    const observer = new MutationObserver(() => {
      hookRegisterButton();
      hookSaveButton();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 初回チェック
    hookRegisterButton();
    hookSaveButton();
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
