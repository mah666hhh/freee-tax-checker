import { saveUser, generateLicenseKey, getRedis } from './lib/redis.js';

// テストユーザー作成エンドポイント（開発用）
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
    const { secret } = req.body;

    // 簡易的なセキュリティ（本番では削除）
    if (secret !== 'ftc-setup-2026') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // テスト用ライセンスキー生成
    const licenseKey = generateLicenseKey();

    // 1年後の有効期限
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // ユーザー作成
    await saveUser(licenseKey, {
      email: 'test@example.com',
      plan: 'paid',
      expiresAt: expiresAt.toISOString(),
      usageCount: '0',
      usageResetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      createdAt: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      licenseKey: licenseKey,
      expiresAt: expiresAt.toISOString(),
      message: 'テストユーザーを作成しました'
    });

  } catch (error) {
    console.error('Test setup error:', error);
    return res.status(500).json({
      error: 'サーバーエラー',
      debug: error.message
    });
  }
}
