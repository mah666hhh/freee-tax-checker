import { resetFreeIfNeeded, incrFreeUsed, getPaidRemaining, decrPaidRemaining } from './lib/redis.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'token is required' });
    }

    const freeLimit = parseInt(process.env.FTC_FREE_LIMIT) || 5;

    // 月初リセット処理を含む無料回数取得
    const { freeRemaining } = await resetFreeIfNeeded(token);
    const paidRemaining = await getPaidRemaining(token);

    // 消費順: 無料 → 有料
    if (freeRemaining > 0) {
      await incrFreeUsed(token);
      return res.status(200).json({
        allowed: true,
        free_remaining: freeRemaining - 1,
        paid_remaining: paidRemaining
      });
    }

    if (paidRemaining > 0) {
      const newPaid = await decrPaidRemaining(token);
      return res.status(200).json({
        allowed: true,
        free_remaining: 0,
        paid_remaining: newPaid
      });
    }

    // 両方とも残りなし
    return res.status(200).json({
      allowed: false,
      free_remaining: 0,
      paid_remaining: 0,
      error: `今月の利用上限（${freeLimit}回）に達しました。チェックパックを購入してください。`
    });
  } catch (error) {
    console.error('Use error:', error);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
}
