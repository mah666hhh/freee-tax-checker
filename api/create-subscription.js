import { getPayPalAccessToken, getPayPalBaseUrl } from './lib/paypal.js';

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

    const planId = process.env.PAYPAL_SUBSCRIPTION_PLAN_ID;
    if (!planId) {
      return res.status(500).json({ error: 'Subscription plan not configured' });
    }

    const accessToken = await getPayPalAccessToken();
    const base = getPayPalBaseUrl();

    const response = await fetch(`${base}/v1/billing/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: token,
        application_context: {
          brand_name: 'freee税務チェッカー',
          locale: 'ja-JP',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW',
          return_url: `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://freee-tax-checker.vercel.app'}/subscription-success.html`,
          cancel_url: `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'https://freee-tax-checker.vercel.app'}/subscription-cancelled.html`
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('PayPal subscription error:', errorData);
      return res.status(500).json({ error: 'サブスクリプションの作成に失敗しました' });
    }

    const data = await response.json();
    const approvalLink = data.links?.find(l => l.rel === 'approve');

    if (!approvalLink) {
      return res.status(500).json({ error: '承認URLが取得できませんでした' });
    }

    return res.status(200).json({
      subscription_id: data.id,
      approval_url: approvalLink.href
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    return res.status(500).json({ error: 'サーバーエラーが発生しました' });
  }
}
