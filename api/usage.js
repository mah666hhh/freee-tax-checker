import { getUser, resetUsageIfNeeded } from './lib/redis.js';

// プランごとの制限
const PLAN_LIMITS = {
  free: 10,
  paid: null
};

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const licenseKey = req.query.licenseKey;

    if (!licenseKey) {
      return res.status(400).json({
        error: 'ライセンスキーが必要です'
      });
    }

    const user = await getUser(licenseKey);
    if (!user) {
      return res.status(404).json({
        error: '無効なライセンスキーです'
      });
    }

    // 使用回数のリセット確認
    const usageCount = await resetUsageIfNeeded(licenseKey, user);
    const limit = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;

    return res.status(200).json({
      plan: user.plan || 'free',
      expiresAt: user.expiresAt || null,
      usage: {
        count: usageCount,
        limit: limit,
        remaining: limit ? limit - usageCount : null
      }
    });

  } catch (error) {
    console.error('Usage error:', error);
    return res.status(500).json({
      error: 'サーバーエラーが発生しました'
    });
  }
}
