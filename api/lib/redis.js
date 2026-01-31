import Redis from 'ioredis';

// Redis Cloud接続
// 環境変数: REDIS_URL=redis://:password@host:port
const redis = new Redis(process.env.REDIS_URL);

// ユーザーデータの取得
export async function getUser(licenseKey) {
  if (!licenseKey || !licenseKey.startsWith('ftc_')) {
    return null;
  }

  const data = await redis.hgetall(`user:${licenseKey}`);
  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  return data;
}

// ユーザーデータの保存
export async function saveUser(licenseKey, userData) {
  await redis.hset(`user:${licenseKey}`, userData);
}

// 使用回数のインクリメント
export async function incrementUsage(licenseKey) {
  const key = `user:${licenseKey}`;
  const newCount = await redis.hincrby(key, 'usageCount', 1);
  return newCount;
}

// 使用回数のリセット（月初に実行）
export async function resetUsageIfNeeded(licenseKey, user) {
  const now = new Date();
  const resetAt = user.usageResetAt ? new Date(user.usageResetAt) : null;

  // リセット日が過去、または未設定の場合はリセット
  if (!resetAt || now >= resetAt) {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await redis.hset(`user:${licenseKey}`, {
      usageCount: '0',
      usageResetAt: nextMonth.toISOString()
    });
    return 0;
  }

  return parseInt(user.usageCount) || 0;
}

// ライセンスキー生成
export function generateLicenseKey() {
  const uuid = crypto.randomUUID();
  return `ftc_${uuid}`;
}

export { redis };
