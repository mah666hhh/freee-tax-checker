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
      retryStrategy: () => null
    });
  }
  return redis;
}

// --- 無料利用回数 ---

export async function getFreeUsed(token) {
  const r = getRedis();
  const val = await r.get(`ftc:free_used:${token}`);
  return parseInt(val) || 0;
}

export async function incrFreeUsed(token) {
  const r = getRedis();
  return await r.incr(`ftc:free_used:${token}`);
}

export async function resetFreeUsed(token) {
  const r = getRedis();
  await r.set(`ftc:free_used:${token}`, 0);
}

// --- 無料リセット日時 ---

export async function getFreeResetAt(token) {
  const r = getRedis();
  return await r.get(`ftc:free_reset:${token}`);
}

export async function setFreeResetAt(token, isoString) {
  const r = getRedis();
  await r.set(`ftc:free_reset:${token}`, isoString);
}

// --- 有料残回数 ---

export async function getPaidRemaining(token) {
  const r = getRedis();
  const val = await r.get(`ftc:paid_remaining:${token}`);
  return parseInt(val) || 0;
}

export async function addPaidCredits(token, amount) {
  const r = getRedis();
  return await r.incrby(`ftc:paid_remaining:${token}`, amount);
}

export async function decrPaidRemaining(token) {
  const r = getRedis();
  const val = await r.decr(`ftc:paid_remaining:${token}`);
  // 万が一マイナスになったら0に戻す
  if (val < 0) {
    await r.set(`ftc:paid_remaining:${token}`, 0);
    return 0;
  }
  return val;
}

// --- 注文冪等性 ---

export async function setOrderIdempotent(orderId) {
  const r = getRedis();
  // SETNX: キーが存在しなければセット（1を返す）、存在すれば何もしない（0を返す）
  const result = await r.setnx(`ftc:order:${orderId}`, '1');
  if (result === 1) {
    // TTL: 1年
    await r.expire(`ftc:order:${orderId}`, 365 * 24 * 60 * 60);
  }
  return result === 1; // true = 新規, false = 重複
}

// --- 月初リセット ---

export async function resetFreeIfNeeded(token) {
  const freeLimit = parseInt(process.env.FTC_FREE_LIMIT) || 5;
  const now = new Date();
  const resetAtStr = await getFreeResetAt(token);

  if (!resetAtStr || now >= new Date(resetAtStr)) {
    // リセット実行
    await resetFreeUsed(token);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await setFreeResetAt(token, nextMonth.toISOString());
    return { freeUsed: 0, freeRemaining: freeLimit };
  }

  const freeUsed = await getFreeUsed(token);
  return { freeUsed, freeRemaining: Math.max(0, freeLimit - freeUsed) };
}

export { getRedis };
