import { getPayPalAccessToken, getPayPalBaseUrl } from './lib/paypal.js';

const APP_BASE_URL = 'https://freee-tax-checker.vercel.app';

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

    const price = process.env.FTC_PRODUCT_PRICE || '980';
    const credits = process.env.FTC_PAID_CREDITS || '50';

    const accessToken = await getPayPalAccessToken();
    const base = getPayPalBaseUrl();

    const orderRes = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'JPY',
            value: price
          },
          description: `freee税務チェッカー ${credits}回チェックパック`
        }],
        application_context: {
          return_url: `${APP_BASE_URL}/api/capture-order?user_token=${encodeURIComponent(token)}`,
          cancel_url: `${APP_BASE_URL}/payment-cancel.html`,
          brand_name: 'freee税務チェッカー',
          user_action: 'PAY_NOW'
        }
      })
    });

    if (!orderRes.ok) {
      const errBody = await orderRes.text();
      console.error('PayPal create order error:', errBody);
      throw new Error(`PayPal order creation failed: ${orderRes.status}`);
    }

    const order = await orderRes.json();
    const approvalUrl = order.links.find(l => l.rel === 'approve')?.href;

    if (!approvalUrl) {
      throw new Error('No approval URL in PayPal response');
    }

    return res.status(200).json({ approval_url: approvalUrl });
  } catch (error) {
    console.error('Create order error:', error);
    return res.status(500).json({ error: '注文の作成に失敗しました' });
  }
}
