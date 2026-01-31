import Anthropic from '@anthropic-ai/sdk';
import { getUser, incrementUsage, resetUsageIfNeeded } from './lib/redis.js';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

// プランごとの制限
const PLAN_LIMITS = {
  free: 10,
  paid: null
};

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

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { licenseKey, expenseData, businessInfo, allocationRates } = req.body;

    // ライセンスキー検証
    if (!licenseKey) {
      return res.status(400).json({
        success: false,
        error: 'ライセンスキーが必要です'
      });
    }

    const user = await getUser(licenseKey);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: '無効なライセンスキーです'
      });
    }

    // 有効期限チェック
    const expiresAt = user.expiresAt ? new Date(user.expiresAt) : null;
    if (expiresAt && new Date() > expiresAt) {
      return res.status(403).json({
        success: false,
        error: 'ライセンスの有効期限が切れています'
      });
    }

    // 使用回数チェック
    const usageCount = await resetUsageIfNeeded(licenseKey, user);
    const limit = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;

    if (limit && usageCount >= limit) {
      return res.status(429).json({
        success: false,
        error: `今月の利用上限（${limit}回）に達しました`,
        usage: {
          count: usageCount,
          limit: limit,
          remaining: 0
        }
      });
    }

    // Claude API呼び出し
    const allocationsText = formatAllocations(allocationRates);

    const userPrompt = `## 事業情報
- 事業内容: ${businessInfo?.businessType || '未設定'}
- 業種: ${businessInfo?.industry || '未設定'}
- 家事按分設定: ${allocationsText}
- その他: ${businessInfo?.additionalInfo || 'なし'}

## 入力された経費
- 収支: ${expenseData.type === 'expense' ? '支出' : '収入'}
- 勘定科目: ${expenseData.accountItem}
- 金額: ${Number(expenseData.amount).toLocaleString()}円
- 摘要/備考: ${expenseData.description || 'なし'}
- 取引先: ${expenseData.partner || 'なし'}
- 日付: ${expenseData.date}
- 口座: ${expenseData.wallet || '未設定'}

この経費について、税務リスクを判定してください。
※ 家事按分が設定されている勘定科目は、freee側で按分処理されます。`;

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    });

    const content = response.content[0]?.text || '';

    // JSONをパース
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid response format from Claude');
    }

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      // JSONパースエラー時はデフォルト値を返す
      console.error('JSON parse error:', parseError, 'Content:', content);
      result = {
        judgment: '🟡',
        riskLevel: 3,
        reason: 'AIの応答を解析できませんでした。手動で確認してください。',
        improvement: '',
        suggestedDescription: '',
        questions: ''
      };
    }

    // 使用回数をインクリメント
    const newUsageCount = await incrementUsage(licenseKey);

    return res.status(200).json({
      success: true,
      result: result,
      usage: {
        count: newUsageCount,
        limit: limit,
        remaining: limit ? limit - newUsageCount : null
      }
    });

  } catch (error) {
    console.error('Check error:', error);
    return res.status(500).json({
      success: false,
      error: 'サーバーエラーが発生しました',
      details: error.message
    });
  }
}
