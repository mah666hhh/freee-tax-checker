import { saveUser, generateLicenseKey, getRedis } from '../lib/redis.js';
import nodemailer from 'nodemailer';

// PayPal Webhook受信エンドポイント
// Events: BILLING.SUBSCRIPTION.ACTIVATED, CANCELLED, EXPIRED

// Gmail SMTP設定
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// ライセンスキー送信メール
async function sendLicenseKeyEmail(email, licenseKey) {
  const mailOptions = {
    from: `freee取引入力 税務チェッカー <${process.env.GMAIL_USER}>`,
    to: email,
    subject: '【freee取引入力 税務チェッカー Pro】ライセンスキーのお届け',
    html: `
      <h2>ご購入ありがとうございます！</h2>
      <p>${email} 様</p>
      <p>freee取引入力 税務チェッカー Pro をご購入いただき、誠にありがとうございます。</p>

      <h3>ライセンスキー</h3>
      <p style="font-size: 18px; background: #f5f5f5; padding: 15px; font-family: monospace;">
        <strong>${licenseKey}</strong>
      </p>

      <h3>使い方</h3>
      <ol>
        <li>Chrome拡張機能を開く</li>
        <li>設定画面でライセンスキーを入力</li>
        <li>「保存」をクリック</li>
      </ol>

      <p>これで無制限にご利用いただけます。</p>

      <hr>
      <p style="color: #666; font-size: 12px;">
        ご不明な点がありましたら、このメールに返信してお問い合わせください。<br>
        ※このメールは自動送信です。
      </p>
    `
  };

  const result = await transporter.sendMail(mailOptions);
  console.log('[Gmail] Email sent:', result.messageId);
  return result;
}

// 更新完了メール
async function sendRenewalEmail(email, licenseKey, expiresAt) {
  const mailOptions = {
    from: `freee取引入力 税務チェッカー <${process.env.GMAIL_USER}>`,
    to: email,
    subject: '【freee取引入力 税務チェッカー Pro】更新完了のお知らせ',
    html: `
      <h2>更新ありがとうございます！</h2>
      <p>${email} 様</p>
      <p>freee取引入力 税務チェッカー Pro の更新が完了しました。</p>

      <h3>ライセンス情報</h3>
      <ul>
        <li>ライセンスキー: <code>${licenseKey}</code></li>
        <li>有効期限: ${new Date(expiresAt).toLocaleDateString('ja-JP')}</li>
      </ul>

      <p>引き続きご利用ください。</p>

      <hr>
      <p style="color: #666; font-size: 12px;">
        ※このメールは自動送信です。
      </p>
    `
  };

  const result = await transporter.sendMail(mailOptions);
  console.log('[Gmail] Renewal email sent:', result.messageId);
  return result;
}

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

    // 更新完了メールを送信
    await sendRenewalEmail(email, existingKey, newExpiry);
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

  // ライセンスキーをメールで送信
  await sendLicenseKeyEmail(email, licenseKey);
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
