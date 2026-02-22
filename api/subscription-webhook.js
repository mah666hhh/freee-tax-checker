import { getRedis } from './lib/redis.js';
import { getPayPalAccessToken, getPayPalBaseUrl } from './lib/paypal.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Webhook署名の検証
    const isValid = await verifyWebhookSignature(req);
    if (!isValid) {
      console.error('Webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body;
    const eventType = event.event_type;
    const resource = event.resource;

    console.log(`[webhook] Event: ${eventType}, Subscription: ${resource?.id}`);

    const subscriptionId = resource?.id;
    if (!subscriptionId) {
      return res.status(200).json({ received: true });
    }

    const r = getRedis();

    if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
      const customId = resource.custom_id; // user token
      if (!customId) {
        console.error('No custom_id in subscription');
        return res.status(200).json({ received: true });
      }

      await r.set(`ftc:subscription:${customId}`, JSON.stringify({
        status: 'active',
        subscriptionId,
        activatedAt: new Date().toISOString()
      }));
      console.log(`[webhook] Subscription activated for ${customId}`);

    } else if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
      // サブスクキャンセル — custom_idで検索
      const token = await findTokenBySubscriptionId(r, subscriptionId);
      if (token) {
        const existing = await r.get(`ftc:subscription:${token}`);
        if (existing) {
          const data = JSON.parse(existing);
          data.status = 'cancelled';
          data.cancelledAt = new Date().toISOString();
          await r.set(`ftc:subscription:${token}`, JSON.stringify(data));
        }
        console.log(`[webhook] Subscription cancelled for ${token}`);
      }

    } else if (eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') {
      const token = await findTokenBySubscriptionId(r, subscriptionId);
      if (token) {
        const existing = await r.get(`ftc:subscription:${token}`);
        if (existing) {
          const data = JSON.parse(existing);
          data.status = 'suspended';
          data.suspendedAt = new Date().toISOString();
          await r.set(`ftc:subscription:${token}`, JSON.stringify(data));
        }
        console.log(`[webhook] Subscription suspended for ${token}`);
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function verifyWebhookSignature(req) {
  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
      console.warn('PAYPAL_WEBHOOK_ID not set, skipping verification');
      return true;
    }

    const accessToken = await getPayPalAccessToken();
    const base = getPayPalBaseUrl();

    const response = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_algo: req.headers['paypal-auth-algo'],
        cert_url: req.headers['paypal-cert-url'],
        transmission_id: req.headers['paypal-transmission-id'],
        transmission_sig: req.headers['paypal-transmission-sig'],
        transmission_time: req.headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: req.body
      })
    });

    const data = await response.json();
    return data.verification_status === 'SUCCESS';
  } catch (error) {
    console.error('Webhook verification error:', error);
    return false;
  }
}

// subscriptionIdからtokenを逆引き（全キーをスキャン）
async function findTokenBySubscriptionId(r, subscriptionId) {
  let cursor = '0';
  do {
    const [nextCursor, keys] = await r.scan(cursor, 'MATCH', 'ftc:subscription:*', 'COUNT', 100);
    cursor = nextCursor;
    for (const key of keys) {
      const val = await r.get(key);
      if (val) {
        try {
          const data = JSON.parse(val);
          if (data.subscriptionId === subscriptionId) {
            return key.replace('ftc:subscription:', '');
          }
        } catch (e) { /* skip */ }
      }
    }
  } while (cursor !== '0');
  return null;
}
