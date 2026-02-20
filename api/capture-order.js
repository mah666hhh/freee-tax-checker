import { getPayPalAccessToken, getPayPalBaseUrl } from './lib/paypal.js';
import { setOrderIdempotent, addPaidCredits } from './lib/redis.js';

const APP_BASE_URL = 'https://freee-tax-checker.vercel.app';

export default async function handler(req, res) {
  // GET: PayPalリダイレクト先
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const orderId = req.query.token;       // PayPalが付与するorder ID
    const userToken = req.query.user_token; // UUID

    if (!orderId || !userToken) {
      return res.redirect(302, `${APP_BASE_URL}/payment-error.html?reason=missing_params`);
    }

    // キャプチャ実行
    const accessToken = await getPayPalAccessToken();
    const base = getPayPalBaseUrl();

    const captureRes = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!captureRes.ok) {
      const errBody = await captureRes.text();
      console.error('PayPal capture error:', errBody);
      return res.redirect(302, `${APP_BASE_URL}/payment-error.html?reason=capture_failed`);
    }

    const capture = await captureRes.json();

    // ステータス確認
    if (capture.status !== 'COMPLETED') {
      console.error('PayPal capture status:', capture.status);
      return res.redirect(302, `${APP_BASE_URL}/payment-error.html?reason=not_completed`);
    }

    // 金額検証
    const expectedPrice = process.env.FTC_PRODUCT_PRICE || '1480';
    const capturedAmount = capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
    if (!capturedAmount || capturedAmount.value !== expectedPrice || capturedAmount.currency_code !== 'JPY') {
      console.error('Amount mismatch:', capturedAmount);
      return res.redirect(302, `${APP_BASE_URL}/payment-error.html?reason=amount_mismatch`);
    }

    // SETNX重複防止
    const isNew = await setOrderIdempotent(orderId);
    if (!isNew) {
      // 重複キャプチャ - 既に処理済みなのでsuccessにリダイレクト
      return res.redirect(302, `${APP_BASE_URL}/payment-success.html`);
    }

    // クレジット加算
    const credits = parseInt(process.env.FTC_PAID_CREDITS) || 100;
    await addPaidCredits(userToken, credits);

    return res.redirect(302, `${APP_BASE_URL}/payment-success.html`);
  } catch (error) {
    console.error('Capture order error:', error);
    return res.redirect(302, `${APP_BASE_URL}/payment-error.html?reason=server_error`);
  }
}
