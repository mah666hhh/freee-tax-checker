// background.js - Service Worker
// Claude API呼び出し

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'; // Haiku 4.5 - 高速・高性能・低コスト

// システムプロンプト
const SYSTEM_PROMPT = `あなたは元国税調査官として20年の経験を持つ、経費チェックの専門家です。

## あなたの役割
納税者が入力した経費について、税務調査で否認されるリスクを判定し、
事前に問題を防ぐためのアドバイスを提供します。

## 判定の姿勢
- 調査官の目線で「ここを突かれたら説明できるか？」を考える
- グレーなものは「ダメ」ではなく「こう記録すれば通る」を提案
- 白黒つけられないものは正直に「判断が分かれる」と伝える
- 否認された実際の事例・判例を知っている場合は根拠として言及する

## 判定基準
🟢 白（問題なし）
- 事業との関連が明確
- 金額・頻度が常識的
- 証拠書類があれば説明可能

🟡 グレー（要注意）
- 事業との関連が曖昧
- 按分が必要な可能性
- 摘要の記載が不十分

🔴 黒（高リスク）
- 私的利用の可能性が高い
- 事業との関連を説明困難
- 調査で否認される可能性大

## 重要な原則
1. 「経費にできない」とは言わない（税務判断は税理士の領域）
2. 「調査で聞かれたら説明しにくい」という情報提供をする
3. 最終判断は納税者自身に委ねる
4. 口座が「プライベート資金」の場合、それは「事業主借」として処理される正常な経理処理。個人のお金で事業経費を支払うことは問題ではないので、口座選択自体を問題視しないこと

## 出力形式
必ず以下のJSON形式のみで回答してください。他の文章は不要です。
{
  "judgment": "🟢" または "🟡" または "🔴",
  "riskLevel": 1から5の数値,
  "reason": "調査官視点での懸念点",
  "improvement": "こう記録すれば通りやすい（なければ空文字）",
  "suggestedDescription": "改善された摘要文の例（なければ空文字）",
  "questions": "調査で聞かれそうな質問（なければ空文字）"
}`;

// 按分設定を日本語で整形
function formatAllocations(allocations) {
  if (!allocations || Object.keys(allocations).length === 0) {
    return '按分設定なし（全て100%事業用）';
  }

  const nameMap = {
    rent: '地代家賃',
    utilities: '水道光熱費',
    communication: '通信費',
    supplies: '消耗品費',
    vehicle: '車両費',
    travel: '旅費交通費'
  };

  const items = [];
  for (const [key, value] of Object.entries(allocations)) {
    if (value !== undefined && value !== null) {
      items.push(`${nameMap[key] || key}: ${value}%`);
    }
  }

  return items.length > 0 ? items.join('、') : '按分設定なし（全て100%事業用）';
}

// Claude APIを呼び出し
async function callClaudeAPI(apiKey, dealData, businessInfo, model = DEFAULT_MODEL) {
  const allocationsText = formatAllocations(businessInfo.allocations);

  const userPrompt = `## 事業情報
- 事業内容: ${businessInfo.businessType || '未設定'}
- 業種: ${businessInfo.industry || '未設定'}
- 家事按分設定: ${allocationsText}
- その他: ${businessInfo.additionalInfo || 'なし'}

## 入力された経費
- 収支: ${dealData.type === 'expense' ? '支出' : '収入'}
- 勘定科目: ${dealData.accountItem}
- 金額: ${dealData.amount.toLocaleString()}円
- 摘要/備考: ${dealData.description || 'なし'}
- 取引先: ${dealData.partner || 'なし'}
- 日付: ${dealData.date}
- 口座: ${dealData.wallet || '未設定'}

この経費について、税務リスクを判定してください。
※ 家事按分が設定されている勘定科目は、freee側で按分処理されます。`;

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || `API Error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content[0]?.text || '';
  
  // トークン使用量を取得
  const usage = data.usage || {};
  
  // JSONをパース
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Invalid response format');
  }
  
  const result = JSON.parse(jsonMatch[0]);
  
  // 使用量も返す
  return {
    ...result,
    _usage: {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0
    }
  };
}

// ダミーレスポンス生成（APIキーがない場合のフォールバック）
function generateDummyResponse(dealData) {
  const { accountItem, amount, description } = dealData;
  
  let judgment = '🟢';
  let riskLevel = 1;
  let reason = '問題なし';
  let improvement = '';
  let suggestedDescription = description;
  let questions = '';

  // 会議費で1人っぽい場合
  if (accountItem === '会議費' && (!description || description.length < 10)) {
    judgment = '🟡';
    riskLevel = 3;
    reason = '摘要が短すぎます。1人での利用と見られる可能性があります。会議費は原則2名以上での打ち合わせが前提です。';
    improvement = '摘要に「〇〇氏と△△案件の打ち合わせ」など、相手と目的を記載してください。';
    suggestedDescription = `〇〇氏と△△プロジェクト打ち合わせ（${description || '場所'}）`;
    questions = '誰と会いましたか？何の打ち合わせですか？領収書はありますか？';
  }
  
  // 交際費で高額
  if (accountItem === '交際費' && amount > 10000) {
    judgment = '🟡';
    riskLevel = 3;
    reason = `交際費${amount.toLocaleString()}円は高額です。1人あたり5,000円を超える飲食は交際費として厳しく見られます。`;
    improvement = '参加人数を記載し、1人あたりの金額を明確にしてください。';
    suggestedDescription = `${description || '会食'} / 参加○名`;
    questions = '何名で利用しましたか？取引先との関係は？';
  }

  // 消耗品費で高額（10万円以上）
  if (accountItem === '消耗品費' && amount >= 100000) {
    judgment = '🟡';
    riskLevel = 4;
    reason = '10万円以上は固定資産として計上が必要な可能性があります。';
    improvement = '消耗品費ではなく、工具器具備品などの勘定科目を検討してください。';
    questions = '耐用年数は1年未満ですか？';
  }

  // 旅費交通費
  if (accountItem === '旅費交通費' && (!description || description.length < 5)) {
    judgment = '🟡';
    riskLevel = 2;
    reason = '摘要に目的地や目的が記載されていません。';
    improvement = '「〇〇駅→△△駅 □□案件打ち合わせ」のように記載してください。';
    suggestedDescription = '〇〇→△△ □□案件';
    questions = 'どこへ何のために行きましたか？';
  }

  return {
    judgment,
    riskLevel,
    reason,
    improvement,
    suggestedDescription,
    questions
  };
}

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_DEAL') {
    console.log('[background] 取引チェックリクエスト受信:', request.dealData);
    
    // 設定を取得してAPI呼び出し
    chrome.storage.local.get(['apiKey', 'model', 'businessType', 'industry', 'additionalInfo', 'allocations', 'enabled', 'usage'], async (settings) => {
      // チェックが無効の場合はスキップ
      if (settings.enabled === false) {
        sendResponse({ success: true, data: { judgment: '🟢', riskLevel: 1, reason: 'チェック無効', improvement: '', suggestedDescription: '', questions: '' } });
        return;
      }

      const businessInfo = {
        businessType: settings.businessType || '',
        industry: settings.industry || '',
        additionalInfo: settings.additionalInfo || '',
        allocations: settings.allocations || {}
      };
      
      const model = settings.model || DEFAULT_MODEL;

      // APIキーがある場合はClaude APIを呼び出し
      if (settings.apiKey) {
        try {
          console.log('[background] Claude API呼び出し開始 (model:', model, ')');
          const result = await callClaudeAPI(settings.apiKey, request.dealData, businessInfo, model);
          console.log('[background] Claude API応答:', result);
          
          // 使用量を更新
          const currentUsage = settings.usage || { checkCount: 0, inputTokens: 0, outputTokens: 0 };
          const newUsage = {
            checkCount: (currentUsage.checkCount || 0) + 1,
            inputTokens: (currentUsage.inputTokens || 0) + (result._usage?.inputTokens || 0),
            outputTokens: (currentUsage.outputTokens || 0) + (result._usage?.outputTokens || 0)
          };
          chrome.storage.local.set({ usage: newUsage });
          console.log('[background] 使用量更新:', newUsage);
          
          // _usageを除いて返す
          const { _usage, ...responseData } = result;
          sendResponse({ success: true, data: responseData });
        } catch (error) {
          console.error('[background] Claude APIエラー:', error);
          // エラー時はダミーレスポンスにフォールバック
          const fallback = generateDummyResponse(request.dealData);
          fallback.reason = `[API Error: ${error.message}] ` + fallback.reason;
          sendResponse({ success: true, data: fallback });
        }
      } else {
        // APIキーがない場合はダミーレスポンス
        console.log('[background] APIキーなし、ダミーレスポンスを使用');
        const response = generateDummyResponse(request.dealData);
        sendResponse({ success: true, data: response });
      }
    });
    
    return true; // 非同期レスポンスを示す
  }
  
  if (request.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['apiKey', 'businessInfo'], (result) => {
      sendResponse(result);
    });
    return true;
  }
});

console.log('[background] freee税務チェッカー Service Worker 起動');
