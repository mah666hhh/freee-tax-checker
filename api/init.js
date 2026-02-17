import { getMonthlyUsageCount, getFreeRemaining, getPaidRemaining } from './lib/redis.js';
import { getPayPalClientId } from './lib/paypal.js';

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

    const monthlyUsage = await getMonthlyUsageCount(token);
    const freeRemaining = getFreeRemaining(monthlyUsage);
    const paidRemaining = await getPaidRemaining(token);

    return res.status(200).json({
      free_remaining: freeRemaining,
      paid_remaining: paidRemaining,
      paypal_client_id: getPayPalClientId()
    });
  } catch (error) {
    console.error('Init error:', error);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
}
