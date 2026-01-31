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
│  2. PayPalで決済完了（980円+税10%=1,078円/月）                    │
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

| プラン | 料金 | 制限 | ライセンスキー形式 |
|--------|------|------|-------------------|
| Free | 無料 | 5回/月、フィルター不可 | `ftc_free_xxxxxxxx-xxxx-...` |
| Pro | 980円/月（税別） | 無制限＋フィルター機能 | `ftc_xxxxxxxx-xxxx-...` |

### Free枠の自動発行
- ライセンスキーなしで使用開始すると自動でFreeキーが発行される
- 同じIPアドレスからは1回のみ発行（悪用防止）
- IP → ライセンスキーのマッピングをRedisに保存

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
- 製品名: `freee取引入力 税務チェッカー Pro（月額）`
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
├── register-free.js  # Free枠自動発行API（IP制限付き）
├── test-setup.js     # テスト用ライセンス発行
├── lib/
│   └── redis.js      # Redis操作（IP→キーのマッピング含む）
└── webhook/
    └── paypal.js     # PayPal Webhook受信

Chrome拡張/
├── manifest.json     # 拡張機能設定
├── background.js     # Service Worker（API呼び出し、Free枠自動取得）
├── content.js        # freee画面のDOM操作
├── popup.html/js     # 設定画面
├── options.html/js   # 家事按分設定ページ
├── styles.css        # モーダルスタイル
├── deal-filter.js/css # 勘定科目フィルター機能

docs/
├── subscription-plan.md           # プラン情報
└── subscription-implementation.md # この文書
```

---

## 今後の課題

- [x] ~~フリーティア実装（ライセンスなしで月10回）~~ → 5回/月で実装済み
- [ ] 解約・期限切れ時のメール通知
- [ ] LP（ランディングページ）作成
- [ ] 独自ドメイン取得（メール信頼性向上）

---

## 変更履歴

### 2026-01-31（追加実装）

#### Free枠自動発行
- `POST /api/register-free` 新規API
- ライセンスキーなしでも自動でFreeキー発行
- IPアドレスベースで1回のみ発行（悪用防止）
- Freeキー形式: `ftc_free_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Free枠: 5回/月

#### 家事按分オプションページ
- `options.html` / `options.js` 新規作成
- 按分項目を自由に追加・編集・削除可能
- Chrome拡張のオプションページとして登録

#### チェック設定の修正
- `enabled=false` の場合はAPI呼び出し前にスキップして即登録
- `autoRegister=false` の場合は🟢判定でも手動確認が必要に
- チェック中のボタン色を緑（#4CAF50）に変更

#### バグ修正
- **Paidプランのlimit判定バグ**: `null || PLAN_LIMITS.free` が10に評価される問題
  - 修正: `user.plan in PLAN_LIMITS ? PLAN_LIMITS[user.plan] : PLAN_LIMITS.free`
  - 対象: validate.js, check.js, usage.js

#### UI改善
- カラースキームを紫から緑に統一（アイコンと一致）
- 勘定科目フィルターのヒントテキスト簡略化

#### デプロイ
- `feature/subscription-system` ブランチを `main` にマージ
- mainブランチへのpushで自動的にProductionデプロイ

#### 勘定科目フィルターのPro限定化
- deal-filter.js でプランチェックを追加
- Free/未登録ユーザーがフィルターボタンを押すとアップグレードモーダル表示
- Proユーザーのみフィルター機能を利用可能

#### 価格改定
- 旧: 500円/月（税込550円）
- 新: 980円/月（税込1,078円）
- 理由: 勘定科目フィルター機能の追加

---

## APIエンドポイントとClaude呼び出し

| API | Claude | 用途 |
|-----|--------|------|
| `/api/validate` | ❌ なし | ライセンスキー検証（Redisのみ） |
| `/api/check` | ✅ あり | 経費チェック（Claude使う） |
| `/api/usage` | ❌ なし | 使用状況確認（Redisのみ） |
| `/api/register-free` | ❌ なし | Free枠自動発行（IP制限付き） |
| `/api/webhook/paypal` | ❌ なし | PayPal Webhook受信 |
| `/api/test-setup` | ❌ なし | テスト用ライセンス発行 |

※ Claudeコストは `/api/check` 実行時のみ発生

---

## 管理用URL一覧

### Claude
- コスト確認: https://console.anthropic.com/settings/cost
- 使用量制限: https://console.anthropic.com/settings/limits

#### 使用量アラート設定
1. Monthly limit: 月の上限を設定（超えるとAPI停止）
2. Email notification: 指定金額でメール通知

例: $1 = 約150円 = 約250回チェック（Haiku 3.5）

### Google
- アプリパスワード作成: https://myaccount.google.com/apppasswords

### PayPal
- サブスクリプション管理: https://www.paypal.com/billing/plans
- Webhook Simulator: https://developer.paypal.com/dashboard/webhooksSimulator
- Developer Dashboard: https://developer.paypal.com/dashboard/applications

### Redis
- Upstash Console: https://console.upstash.com/

### Vercel
- Dashboard: https://vercel.com/dashboard
- Logs: https://vercel.com/mahs-projects-de92087f/freee-tax-checker

---

## 参考リンク

- [PayPal Subscriptions API](https://developer.paypal.com/docs/subscriptions/)
- [Nodemailer](https://nodemailer.com/)
- [Upstash Redis](https://upstash.com/)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
