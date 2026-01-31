# サブスクリプション機能 実装メモ

## 実装日: 2026-01-31

---

## 全体フロー

```
┌─────────────────────────────────────────────────────────────────┐
│                        購入フロー                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. ユーザーが支払いリンクをクリック                              │
│     └→ PayPal決済ページへ                                       │
│                                                                 │
│  2. PayPalで決済完了（500円+税10%=550円/月）                      │
│                                                                 │
│  3. PayPal → Webhook送信                                        │
│     └→ POST /api/webhook/paypal                                 │
│     └→ Event: BILLING.SUBSCRIPTION.ACTIVATED                    │
│                                                                 │
│  4. Webhook受信 → ライセンスキー発行                             │
│     └→ ftc_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx                 │
│     └→ Redisに保存                                              │
│                                                                 │
│  5. Gmail自動送信                                                │
│     └→ ユーザーにライセンスキーが届く                            │
│                                                                 │
│  6. Chrome拡張でライセンスキー入力                               │
│     └→ 無制限で利用可能                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技術スタック

| 項目 | 技術 |
|------|------|
| API | Vercel Serverless Functions |
| DB | Redis Cloud (Upstash) |
| 決済 | PayPal Subscriptions |
| メール | Gmail (nodemailer) |
| AI | Claude Haiku 3.5 |

---

## 料金プラン

| プラン | 料金 | 制限 |
|--------|------|------|
| Free | 無料 | 10回/月 |
| Pro | 500円/月（税別） | 無制限 |

### コスト計算
- Claude Haiku 3.5: 約0.4円/回
- 損益分岐: 月1,250回（普通のユーザーは50〜100回程度）

---

## PayPal設定

### 管理画面URL
- サブスクリプション管理: https://www.paypal.com/billing/plans
- Developer Dashboard: https://developer.paypal.com/dashboard/applications
- Webhook Simulator: https://developer.paypal.com/dashboard/webhooksSimulator

### プラン情報
- 製品名: `freee税務チェッカー Pro（月額）`
- 製品ID: `ftc-pro-monthly`
- プランID: `P-84V60575XD453294JNF662HQ`
- 料金: ¥500（税別）+ 消費税10%

### 支払いリンク
```
https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-84V60575XD453294JNF662HQ
```

### Webhook設定
- Webhook ID: `8TP56721AT189724K`
- URL: `https://freee-tax-checker.vercel.app/api/webhook/paypal`
- Events:
  - BILLING.SUBSCRIPTION.ACTIVATED（新規登録）
  - BILLING.SUBSCRIPTION.CANCELLED（解約）
  - BILLING.SUBSCRIPTION.EXPIRED（期限切れ）

---

## 環境変数（Vercel）

```
ANTHROPIC_API_KEY=sk-ant-...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
GMAIL_USER=xxx@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

---

## 管理者用ライセンスキー

開発・テスト用のキー（本番ユーザーとは別管理）

```
ftc_9439e6f1-59a8-4ae2-9de4-9456d5b3d363
```

| 項目 | 値 |
|------|-----|
| email | test@example.com |
| plan | paid |
| 有効期限 | 2027-01-31 |
| 用途 | 開発・デバッグ用 |

---

## 詰まったところ・工夫したところ

### 1. Resendのチーム問題
**問題**: GitHubアカウントが既存の組織（aitravel）に紐づいていて、Resendサインアップ時に自動でチームに参加してしまった。

**解決**:
- チームを削除
- Googleアカウントで新規登録
- → 最終的にGmail(nodemailer)に変更

### 2. Resendの送信制限
**問題**: `onboarding@resend.dev` からは自分のメールにしか送れない（独自ドメイン必要）

**解決**: Gmail + nodemailer に切り替え
- 無料
- 独自ドメイン不要
- 500通/日まで送信可能

### 3. curlコマンドの改行
**問題**: ターミナルで複数行のcurlコマンドがうまく動かない

**解決**: 1行で書く
```bash
curl -X POST URL -H "Content-Type: application/json" -d '{"key":"value"}'
```

### 4. PayPal Webhook Simulatorのダミーデータ
**問題**: Simulatorの送信先メールが `customer@example.com` 固定

**解決**: curlで直接テスト用のWebhookを送信
```bash
curl -X POST https://freee-tax-checker.vercel.app/api/webhook/paypal -H "Content-Type: application/json" -d '{"event_type":"BILLING.SUBSCRIPTION.ACTIVATED","resource":{"id":"I-TEST-001","subscriber":{"email_address":"your-email@gmail.com"},"start_time":"2026-01-31T12:00:00Z"}}'
```

---

## テスト手順

### 1. Webhook受信テスト（PayPal Simulator）

1. https://developer.paypal.com/dashboard/webhooksSimulator にアクセス
2. Webhook URL: `https://freee-tax-checker.vercel.app/api/webhook/paypal`
3. Event Type: `BILLING.SUBSCRIPTION.ACTIVATED`
4. 「Send Test」をクリック
5. Vercelログで確認

### 2. メール送信テスト（curl）

```bash
curl -X POST https://freee-tax-checker.vercel.app/api/webhook/paypal -H "Content-Type: application/json" -d '{"event_type":"BILLING.SUBSCRIPTION.ACTIVATED","resource":{"id":"I-TEST-001","subscriber":{"email_address":"YOUR_EMAIL@gmail.com"},"start_time":"2026-01-31T12:00:00Z"}}'
```

### 3. ライセンスキー検証テスト

```bash
curl -X POST https://freee-tax-checker.vercel.app/api/validate -H "Content-Type: application/json" -d '{"licenseKey":"ftc_xxxxx"}'
```

### 4. 経費チェックテスト

```bash
curl -X POST https://freee-tax-checker.vercel.app/api/check -H "Content-Type: application/json" -d '{"licenseKey":"ftc_xxxxx","expenseData":{"description":"テスト","amount":1000},"businessInfo":{"type":"IT"}}'
```

---

## ファイル構成

```
api/
├── check.js          # 経費チェックAPI
├── validate.js       # ライセンス検証API
├── usage.js          # 使用状況API
├── test-setup.js     # テスト用ライセンス発行
├── lib/
│   └── redis.js      # Redis操作
└── webhook/
    └── paypal.js     # PayPal Webhook受信

docs/
├── subscription-plan.md           # プラン情報
└── subscription-implementation.md # この文書
```

---

## 今後の課題

- [ ] フリーティア実装（ライセンスなしで月10回）
- [ ] 解約・期限切れ時のメール通知
- [ ] LP（ランディングページ）作成
- [ ] 独自ドメイン取得（メール信頼性向上）

---

## 参考リンク

- [PayPal Subscriptions API](https://developer.paypal.com/docs/subscriptions/)
- [Nodemailer](https://nodemailer.com/)
- [Upstash Redis](https://upstash.com/)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
