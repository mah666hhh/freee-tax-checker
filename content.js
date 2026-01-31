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
  function showModal(result, onProceed) {
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

    // 「このまま登録」ボタン
    const proceedBtn = modal.querySelector('.ftc-btn-proceed');
    proceedBtn.onclick = () => {
      hideModal();
      if (onProceed) onProceed();
    };

    // 🟢の場合は自動で登録を進める
    if (judgment === '🟢') {
      modal.querySelector('.ftc-modal-title').textContent = '問題なし！';
      modal.querySelector('.ftc-reason p').textContent = '特に問題は見つかりませんでした。';
      reasonSection.style.display = 'block';
      improvementSection.style.display = 'none';
      suggestedSection.style.display = 'none';
      questionsSection.style.display = 'none';
      
      // 2秒後に自動登録
      setTimeout(() => {
        hideModal();
        if (onProceed) onProceed();
      }, 1500);
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

      // ローディング表示
      registerBtn.disabled = true;
      registerBtn.textContent = 'AIチェック中...（数秒お待ちください）';

      // chrome.runtimeが利用可能かチェック
      if (!chrome?.runtime?.sendMessage) {
        console.error('[freee税務チェッカー] chrome.runtime が利用できません。ページをリロードしてください。');
        registerBtn.disabled = false;
        registerBtn.textContent = dealData.type === 'expense' ? '支出を登録' : '収入を登録';
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
              registerBtn.textContent = dealData.type === 'expense' ? '支出を登録' : '収入を登録';
              proceedWithRegistration(registerBtn);
              return;
            }

            registerBtn.disabled = false;
            registerBtn.textContent = dealData.type === 'expense' ? '支出を登録' : '収入を登録';

            if (response?.success) {
              showModal(response.data, () => proceedWithRegistration(registerBtn));
            } else {
              const errorMsg = response?.error || JSON.stringify(response);
              console.error('[freee税務チェッカー] エラー:', errorMsg);
              // ライセンスエラーの場合はアラート表示
              if (response?.error?.includes('ライセンス') || response?.error?.includes('上限')) {
                alert(response.error);
              }
              proceedWithRegistration(registerBtn);
            }
          }
        );
      } catch (err) {
        console.error('[freee税務チェッカー] エラー:', err);
        registerBtn.disabled = false;
        registerBtn.textContent = dealData.type === 'expense' ? '支出を登録' : '収入を登録';
        proceedWithRegistration(registerBtn);
      }
    }, true);
  }

  // 元の登録処理を実行
  function proceedWithRegistration(btn) {
    console.log('[freee税務チェッカー] 元の登録処理を実行');
    skipNextCheck = true;
    btn.click();
  }

  // DOM監視でフォームの出現を検知
  function observeDOM() {
    const observer = new MutationObserver(() => {
      hookRegisterButton();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // 初回チェック
    hookRegisterButton();
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
