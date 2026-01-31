import { generateFreeLicenseKey, saveUser, getFreeKeyByIP, saveIPMapping, getUser } from './lib/redis.js';

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
    // IPアドレスを取得（Vercelの場合はx-forwarded-forヘッダー）
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || req.connection?.remoteAddress
      || 'unknown';

    console.log('[register-free] IP:', ip);

    // このIPから既にFreeキーが発行されているかチェック
    const existingKey = await getFreeKeyByIP(ip);
    if (existingKey) {
      // 既存のキーがまだ有効か確認
      const existingUser = await getUser(existingKey);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          error: 'このIPアドレスからは既にFreeキーが発行されています',
          existingKey: existingKey
        });
      }
      // ユーザーデータが消えている場合は新規発行を許可
    }

    // 新しいFreeライセンスキーを生成
    const licenseKey = generateFreeLicenseKey();
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // ユーザーデータを保存
    await saveUser(licenseKey, {
      plan: 'free',
      email: '',
      createdAt: now.toISOString(),
      expiresAt: '', // Freeは無期限（使用回数制限のみ）
      usageCount: '0',
      usageResetAt: nextMonth.toISOString()
    });

    // IP → ライセンスキーの紐付けを保存
    await saveIPMapping(ip, licenseKey);

    console.log('[register-free] Created:', licenseKey, 'for IP:', ip);

    return res.status(201).json({
      success: true,
      licenseKey: licenseKey,
      plan: 'free',
      usage: {
        count: 0,
        limit: 5,
        remaining: 5
      }
    });

  } catch (error) {
    console.error('Register-free error:', error);
    return res.status(500).json({
      success: false,
      error: 'サーバーエラーが発生しました'
    });
  }
}
