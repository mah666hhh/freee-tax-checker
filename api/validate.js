import { getUser, resetUsageIfNeeded } from './lib/redis.js';

// プランごとの制限
const PLAN_LIMITS = {
  free: 10,    // 10回/月
  paid: null   // 無制限
};

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
    const { licenseKey } = req.body;

    if (!licenseKey) {
      return res.status(400).json({
        valid: false,
        error: 'ライセンスキーが必要です'
      });
    }

    const user = await getUser(licenseKey);

    if (!user) {
      return res.status(404).json({
        valid: false,
        error: '無効なライセンスキーです'
      });
    }

    // 有効期限チェック
    const expiresAt = user.expiresAt ? new Date(user.expiresAt) : null;
    if (expiresAt && new Date() > expiresAt) {
      return res.status(403).json({
        valid: false,
        error: 'ライセンスの有効期限が切れています',
        expiresAt: user.expiresAt
      });
    }

    // 使用回数のリセット確認
    const usageCount = await resetUsageIfNeeded(licenseKey, user);
    const limit = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;

    return res.status(200).json({
      valid: true,
      plan: user.plan || 'free',
      expiresAt: user.expiresAt || null,
      usage: {
        count: usageCount,
        limit: limit,
        remaining: limit ? limit - usageCount : null
      }
    });

  } catch (error) {
    console.error('Validate error:', error);
    return res.status(500).json({
      valid: false,
      error: 'サーバーエラーが発生しました',
      debug: error.message
    });
  }
}
