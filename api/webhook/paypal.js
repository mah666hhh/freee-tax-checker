import { saveUser, generateLicenseKey, getRedis } from '../lib/redis.js';

// PayPal Webhook受信エンドポイント
// Events: BILLING.SUBSCRIPTION.ACTIVATED, CANCELLED, EXPIRED

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    const eventType = event.event_type;
    const resource = event.resource;

    console.log('[PayPal Webhook] Event received:', eventType);
    console.log('[PayPal Webhook] Resource:', JSON.stringify(resource, null, 2));

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handleSubscriptionActivated(resource);
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await handleSubscriptionCancelled(resource);
        break;

      case 'BILLING.SUBSCRIPTION.EXPIRED':
        await handleSubscriptionExpired(resource);
        break;

      default:
        console.log('[PayPal Webhook] Unhandled event type:', eventType);
    }

    // PayPalには常に200を返す
    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('[PayPal Webhook] Error:', error);
    // エラーでも200を返す（PayPalのリトライを防ぐ）
    return res.status(200).json({ received: true, error: error.message });
  }
}

// 新規サブスクリプション登録
async function handleSubscriptionActivated(resource) {
  const subscriptionId = resource.id;
  const email = resource.subscriber?.email_address;
  const startTime = resource.start_time;

  if (!email) {
    console.error('[PayPal Webhook] No email in subscription:', subscriptionId);
    return;
  }

  // 既存ユーザーチェック（メールで検索）
  const redis = getRedis();
  const existingKey = await redis.get(`email:${email}`);

  if (existingKey) {
    // 既存ユーザー → 有効期限を延長
    console.log('[PayPal Webhook] Existing user, extending:', email);
    const newExpiry = new Date();
    newExpiry.setFullYear(newExpiry.getFullYear() + 1);

    await redis.hset(`user:${existingKey}`, {
      plan: 'paid',
      expiresAt: newExpiry.toISOString(),
      subscriptionId: subscriptionId
    });

    // TODO: 更新完了メールを送信
    return;
  }

  // 新規ユーザー → ライセンスキー発行
  const licenseKey = generateLicenseKey();
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await saveUser(licenseKey, {
    email: email,
    plan: 'paid',
    expiresAt: expiresAt.toISOString(),
    subscriptionId: subscriptionId,
    usageCount: '0',
    usageResetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
    createdAt: new Date().toISOString()
  });

  // メールアドレスとライセンスキーの紐付け
  await redis.set(`email:${email}`, licenseKey);

  console.log('[PayPal Webhook] New user created:', email, licenseKey);

  // TODO: ライセンスキーをメールで送信
  // await sendLicenseKeyEmail(email, licenseKey);
}

// サブスクリプション解約
async function handleSubscriptionCancelled(resource) {
  const subscriptionId = resource.id;

  // subscriptionIdからユーザーを検索
  const redis = getRedis();
  const keys = await redis.keys('user:ftc_*');

  for (const key of keys) {
    const user = await redis.hgetall(key);
    if (user.subscriptionId === subscriptionId) {
      // 解約フラグを立てる（有効期限までは使用可能）
      await redis.hset(key, { cancelled: 'true' });
      console.log('[PayPal Webhook] Subscription cancelled:', key);
      break;
    }
  }
}

// サブスクリプション期限切れ
async function handleSubscriptionExpired(resource) {
  const subscriptionId = resource.id;

  // subscriptionIdからユーザーを検索
  const redis = getRedis();
  const keys = await redis.keys('user:ftc_*');

  for (const key of keys) {
    const user = await redis.hgetall(key);
    if (user.subscriptionId === subscriptionId) {
      // プランをfreeに変更
      await redis.hset(key, { plan: 'free' });
      console.log('[PayPal Webhook] Subscription expired:', key);
      break;
    }
  }
}
