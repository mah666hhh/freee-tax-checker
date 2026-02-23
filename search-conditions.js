// search-conditions.js - 検索条件の無制限保存機能

(function() {
  'use strict';

  const STORAGE_KEY = 'ftcSearchConditions';
  const FREE_LIMIT = 3;
  let dropdownVisible = false;

  console.log('[freee税務チェッカー] search-conditions.js 読み込み完了');

  // UUID生成
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ストレージから条件一覧を取得
  function getConditions(callback) {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      callback(result[STORAGE_KEY] || []);
    });
  }

  // ストレージに条件一覧を保存
  function setConditions(conditions, callback) {
    chrome.storage.local.set({ [STORAGE_KEY]: conditions }, callback);
  }

  // 現在の検索条件を保存
  function saveCondition(name) {
    const hash = location.hash;
    if (!hash || hash === '#') {
      alert('保存する検索条件がありません。先に検索を実行してください。');
      return;
    }

    getConditions((conditions) => {
      chrome.storage.local.get(['hasSubscription'], (result) => {
        const isPro = !!result.hasSubscription;
        if (!isPro && conditions.length >= FREE_LIMIT) {
          showUpgradeDialog();
          return;
        }
        conditions.push({
          id: generateId(),
          name: name,
          hash: hash,
          createdAt: Date.now()
        });
        setConditions(conditions, () => {
          renderDropdown();
        });
      });
    });
  }

  // Proアップグレードダイアログ
  function showUpgradeDialog() {
    const overlay = document.createElement('div');
    overlay.id = 'ftc-sc-upgrade-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.5)', zIndex: '100000',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    });

    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      background: '#fff', borderRadius: '12px', padding: '24px',
      maxWidth: '360px', width: '90%', textAlign: 'center',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
    });

    const title = document.createElement('div');
    title.textContent = '検索条件の保存上限に達しました';
    Object.assign(title.style, { fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '12px' });
    dialog.appendChild(title);

    const desc = document.createElement('div');
    desc.textContent = '無料プランでは' + FREE_LIMIT + '件まで保存できます。Proプランにアップグレードすると無制限に保存できます。';
    Object.assign(desc.style, { fontSize: '13px', color: '#666', marginBottom: '20px', lineHeight: '1.6' });
    dialog.appendChild(desc);

    const upgradeBtn = document.createElement('button');
    upgradeBtn.textContent = 'Proプランを見る';
    Object.assign(upgradeBtn.style, {
      width: '100%', padding: '12px', background: 'linear-gradient(135deg, #1976d2, #1565c0)',
      color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14px',
      fontWeight: '700', cursor: 'pointer', marginBottom: '8px'
    });
    upgradeBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_PRO_PAGE' });
      overlay.remove();
    });
    dialog.appendChild(upgradeBtn);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '閉じる';
    Object.assign(closeBtn.style, {
      width: '100%', padding: '10px', background: '#fff', color: '#666',
      border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', cursor: 'pointer'
    });
    closeBtn.addEventListener('click', () => overlay.remove());
    dialog.appendChild(closeBtn);

    overlay.appendChild(dialog);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // 条件を適用
  function loadCondition(id) {
    getConditions((conditions) => {
      const condition = conditions.find(c => c.id === id);
      if (condition) {
        window.location.hash = condition.hash;
        location.reload();
      }
    });
  }

  // 条件を削除
  function deleteCondition(id) {
    if (!confirm('この検索条件を削除しますか？')) return;
    getConditions((conditions) => {
      const updated = conditions.filter(c => c.id !== id);
      setConditions(updated, () => {
        renderDropdown();
      });
    });
  }

  // ドロップダウンを描画（DOM APIで安全に構築）
  function renderDropdown() {
    const dropdown = document.getElementById('ftc-sc-dropdown');
    if (!dropdown) return;

    getConditions((conditions) => {
      // クリア
      dropdown.textContent = '';

      // 保存ボタン
      const saveItem = document.createElement('div');
      saveItem.className = 'ftc-sc-item ftc-sc-save';
      saveItem.id = 'ftc-sc-save-btn';

      const saveIcon = document.createElement('span');
      saveIcon.className = 'ftc-sc-save-icon';
      saveIcon.textContent = '\uD83D\uDCBE';
      saveItem.appendChild(saveIcon);

      const saveLabel = document.createElement('span');
      saveLabel.textContent = '現在の条件を保存';
      saveItem.appendChild(saveLabel);

      saveItem.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = prompt('検索条件の名前を入力してください:');
        if (name && name.trim()) {
          saveCondition(name.trim());
        }
      });
      dropdown.appendChild(saveItem);

      if (conditions.length > 0) {
        const divider1 = document.createElement('div');
        divider1.className = 'ftc-sc-divider';
        dropdown.appendChild(divider1);

        conditions.forEach(c => {
          const item = document.createElement('div');
          item.className = 'ftc-sc-item ftc-sc-condition';
          item.dataset.id = c.id;

          const nameSpan = document.createElement('span');
          nameSpan.className = 'ftc-sc-condition-name';
          nameSpan.textContent = c.name;
          nameSpan.title = c.name;
          item.appendChild(nameSpan);

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'ftc-sc-delete';
          deleteBtn.dataset.id = c.id;
          deleteBtn.title = '削除';
          deleteBtn.textContent = '\u00D7';
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCondition(c.id);
          });
          item.appendChild(deleteBtn);

          item.addEventListener('click', () => {
            loadCondition(c.id);
          });
          dropdown.appendChild(item);
        });

        const divider2 = document.createElement('div');
        divider2.className = 'ftc-sc-divider';
        dropdown.appendChild(divider2);

        const footer = document.createElement('div');
        footer.className = 'ftc-sc-footer';

        chrome.storage.local.get(['hasSubscription'], (result) => {
          const isPro = !!result.hasSubscription;
          if (isPro) {
            footer.textContent = '保存件数: ' + conditions.length + '件';
          } else {
            footer.textContent = conditions.length + ' / ' + FREE_LIMIT + '件' + (conditions.length >= FREE_LIMIT ? '（上限）' : '');
          }
        });
        dropdown.appendChild(footer);
      }
    });
  }

  // ドロップダウンの表示/非表示
  function toggleDropdown(show) {
    const dropdown = document.getElementById('ftc-sc-dropdown');
    if (!dropdown) return;

    if (typeof show === 'boolean') {
      dropdownVisible = show;
    } else {
      dropdownVisible = !dropdownVisible;
    }

    dropdown.style.display = dropdownVisible ? 'block' : 'none';

    if (dropdownVisible) {
      renderDropdown();
    }
  }

  // ボタンとドロップダウンをDOM注入
  function injectButton(anchor) {
    if (anchor.hasAttribute('data-ftc-sc-hooked')) return;
    anchor.setAttribute('data-ftc-sc-hooked', 'true');

    const wrapper = document.createElement('div');
    wrapper.id = 'ftc-sc-wrapper';

    const btn = document.createElement('button');
    btn.id = 'ftc-sc-trigger';
    btn.type = 'button';
    btn.textContent = '保存した条件（拡張）';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });

    const dropdown = document.createElement('div');
    dropdown.id = 'ftc-sc-dropdown';
    dropdown.style.display = 'none';

    wrapper.appendChild(btn);
    wrapper.appendChild(dropdown);

    // .vb-dropdownButton の親の後ろに配置
    anchor.parentElement.insertAdjacentElement('afterend', wrapper);
  }

  // クリック外で閉じる
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('ftc-sc-wrapper');
    if (dropdownVisible && wrapper && !wrapper.contains(e.target)) {
      toggleDropdown(false);
    }
  });

  // MutationObserverで対象ボタンを検知
  function observe() {
    const mo = new MutationObserver(() => {
      const filter = document.querySelector('[data-test="deal-filter"]');
      if (!filter) return;

      const anchor = filter.querySelector('.vb-dropdownButton');
      if (anchor && !anchor.hasAttribute('data-ftc-sc-hooked')) {
        injectButton(anchor);
      }
    });

    mo.observe(document.body, { childList: true, subtree: true });

    // 初回チェック
    const filter = document.querySelector('[data-test="deal-filter"]');
    if (filter) {
      const anchor = filter.querySelector('.vb-dropdownButton');
      if (anchor) injectButton(anchor);
    }
  }

  // 初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe);
  } else {
    setTimeout(observe, 500);
  }

})();
