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

// --- 利用ログ (Sorted Set) ---
// キー: ftc:usage_log:{token}
// score: Unix timestamp (ms)
// member: "JST日時-{random}" (可読性 + 一意性)

function toJSTString(date) {
  return date.toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).replace(' ', 'T') + '+09:00';
}

export async function logUsage(token) {
  const r = getRedis();
  const now = Date.now();
  const jst = toJSTString(new Date(now));
  const member = `${jst}-${Math.random().toString(36).slice(2, 8)}`;
  await r.zadd(`ftc:usage_log:${token}`, now, member);
  return now;
}

export async function getMonthlyUsageCount(token) {
  const r = getRedis();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return await r.zcount(`ftc:usage_log:${token}`, monthStart, '+inf');
}

export function getFreeRemaining(monthlyUsage) {
  const freeLimit = parseInt(process.env.FTC_FREE_LIMIT) || 5;
  return Math.max(0, freeLimit - monthlyUsage);
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
  if (val < 0) {
    await r.set(`ftc:paid_remaining:${token}`, 0);
    return 0;
  }
  return val;
}

// --- 注文冪等性 ---

export async function setOrderIdempotent(orderId) {
  const r = getRedis();
  const result = await r.setnx(`ftc:order:${orderId}`, '1');
  if (result === 1) {
    await r.expire(`ftc:order:${orderId}`, 365 * 24 * 60 * 60);
  }
  return result === 1;
}

export { getRedis };
