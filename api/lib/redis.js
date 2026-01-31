import Redis from 'ioredis';

// Redis接続（遅延初期化）
let redis = null;

function getRedis() {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL environment variable is not set');
    }
    redis = new Redis(url, {
      connectTimeout: 5000,
      commandTimeout: 5000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null // リトライしない
    });
  }
  return redis;
}

// ユーザーデータの取得
export async function getUser(licenseKey) {
  if (!licenseKey || !licenseKey.startsWith('ftc_')) {
    return null;
  }

  const r = getRedis();
  const data = await r.hgetall(`user:${licenseKey}`);
  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  return data;
}

// ユーザーデータの保存
export async function saveUser(licenseKey, userData) {
  const r = getRedis();
  await r.hset(`user:${licenseKey}`, userData);
}

// 使用回数のインクリメント
export async function incrementUsage(licenseKey) {
  const r = getRedis();
  const key = `user:${licenseKey}`;
  const newCount = await r.hincrby(key, 'usageCount', 1);
  return newCount;
}

// 使用回数のリセット（月初に実行）
export async function resetUsageIfNeeded(licenseKey, user) {
  const now = new Date();
  const resetAt = user.usageResetAt ? new Date(user.usageResetAt) : null;

  // リセット日が過去、または未設定の場合はリセット
  if (!resetAt || now >= resetAt) {
    const r = getRedis();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await r.hset(`user:${licenseKey}`, {
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

export { getRedis };
