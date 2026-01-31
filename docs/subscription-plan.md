# サブスクリプション機能 実装計画

## 概要

Chrome拡張からClaude APIを直接呼び出す方式から、Vercel経由で呼び出す方式に変更。
ユーザー管理とサブスクリプション課金を実装する。

## アーキテクチャ

```
Chrome拡張 → Vercel API → Claude API
              ↓
         Google Spreadsheet（ユーザーDB）
              ↑
         PayPal Webhook
```

## ユーザー管理

### スプレッドシート構造

| カラム | 説明 |
|--------|------|
| email | PayPal決済時のメール |
| licenseKey | `ftc_` + UUID形式 |
| plan | `free` / `paid` |
| expiresAt | 有効期限（ISO 8601） |
| usageCount | 今月の使用回数 |
| usageResetAt | 使用回数リセット日 |
| createdAt | 登録日時 |

### プラン

| プラン | 料金 | 制限 |
|--------|------|------|
| free | 無料 | 10回/月 |
| paid | 月額500円（予定） | 無制限 or 500回/月 |

## Vercel APIエンドポイント

### POST /api/check
経費チェック実行

**リクエスト:**
```json
{
  "licenseKey": "ftc_xxxxx",
  "expenseData": {
    "date": "2026-01-15",
    "accountItem": "接待交際費",
    "amount": 15000,
    "description": "取引先との会食",
    "paymentMethod": "プライベート資金"
  },
  "businessInfo": {
    "businessType": "フリーランスエンジニア",
    "industry": "情報通信業",
    "additionalInfo": "自宅兼事務所"
  },
  "allocationRates": {
    "rent": 40,
    "utilities": 30
  }
}
```

**レスポンス:**
```json
{
  "success": true,
  "result": {
    "judgment": "green",
    "reason": "...",
    "suggestion": "...",
    "questions": ["...", "..."]
  },
  "usage": {
    "count": 5,
    "limit": 10,
    "remaining": 5
  }
}
```

### POST /api/validate
ライセンスキー検証

**リクエスト:**
```json
{
  "licenseKey": "ftc_xxxxx"
}
```

**レスポンス:**
```json
{
  "valid": true,
  "plan": "paid",
  "expiresAt": "2027-01-31T00:00:00Z",
  "usage": {
    "count": 5,
    "limit": null,
    "remaining": null
  }
}
```

### GET /api/usage
使用状況取得

**クエリパラメータ:** `?licenseKey=ftc_xxxxx`

### POST /api/webhook/paypal
PayPal Webhook受信（決済完了時）

## 認証フロー

```
1. PayPal決済完了
   ↓
2. PayPal Webhook → /api/webhook/paypal
   ↓
3. スプレッドシートにユーザー登録
   - licenseKey: crypto.randomUUID() で生成
   - plan: "paid"
   - expiresAt: 1年後
   ↓
4. ユーザーにメールでライセンスキー送信
   ↓
5. Chrome拡張でライセンスキー入力
   ↓
6. /api/validate でキー検証
   ↓
7. 経費チェック時に /api/check を呼び出し
```

## Chrome拡張の変更点

### popup.html
- APIキー入力欄 → ライセンスキー入力欄に変更
- モデル選択は削除（サーバー側で固定）
- 使用状況表示はそのまま（API経由で取得）

### background.js
- Claude API直接呼び出し → Vercel API呼び出しに変更
- エンドポイント: `https://xxx.vercel.app/api/check`

### content.js
- 変更なし（background.jsに処理を委譲）

## 実装順序

### Phase 1: Vercel API基盤
1. [ ] Vercelプロジェクト作成
2. [ ] Google Spreadsheet API連携
3. [ ] /api/validate エンドポイント実装
4. [ ] /api/check エンドポイント実装
5. [ ] /api/usage エンドポイント実装

### Phase 2: Chrome拡張改修
6. [ ] popup.html のUI変更（APIキー→ライセンスキー）
7. [ ] popup.js のAPI呼び出し変更
8. [ ] background.js のClaude API呼び出しをVercel経由に変更

### Phase 3: 決済連携
9. [ ] PayPalサブスクリプション設定
10. [ ] /api/webhook/paypal 実装
11. [ ] メール送信機能（Resend等）

### Phase 4: フリーティア
12. [ ] ライセンスキーなしでも10回/月使える仕組み
13. [ ] デバイスID or ブラウザフィンガープリントでの識別

## 技術スタック

- **API**: Vercel Serverless Functions (Node.js)
- **DB**: Redis Cloud (redis.io)
- **決済**: PayPal Subscriptions API
- **メール**: Resend or SendGrid
- **認証**: ライセンスキー（UUIDベース）

## 環境変数（Vercel）

```
ANTHROPIC_API_KEY=sk-ant-xxxxx
REDIS_URL=redis://:PASSWORD@redis-18802.c294.ap-northeast-1-2.ec2.cloud.redislabs.com:18802
PAYPAL_WEBHOOK_ID=xxxxx
PAYPAL_CLIENT_ID=xxxxx
PAYPAL_CLIENT_SECRET=xxxxx
RESEND_API_KEY=xxxxx
```

## Redis Cloud セットアップ（済）

- Database: `database-ML2580AE`
- Host: `redis-18802.c294.ap-northeast-1-2.ec2.cloud.redislabs.com`
- Port: `18802`
- Region: `ap-northeast-1` (東京)
- Dashboard: https://cloud.redis.io/#/databases/13956515/subscription/3098929/view-bdb/configuration

### 接続URL形式
```
redis://:PASSWORD@redis-18802.c294.ap-northeast-1-2.ec2.cloud.redislabs.com:18802
```
※ PASSWORDはダッシュボードの Default user password から取得

## Vercel デプロイ手順

1. Vercel CLIインストール: `npm i -g vercel`
2. プロジェクトディレクトリで: `vercel`
3. 環境変数を設定: `vercel env add`
4. 本番デプロイ: `vercel --prod`

## Redis データ構造

```
user:{licenseKey} = {
  email: "user@example.com",
  plan: "paid",
  expiresAt: "2027-01-31T00:00:00Z",
  usageCount: 5,
  usageResetAt: "2026-02-01T00:00:00Z",
  createdAt: "2026-01-15T10:00:00Z"
}
```

## 注意事項

- ライセンスキーは `ftc_` プレフィックス + UUID v4 形式
- 使用回数は毎月1日にリセット（usageResetAtで管理）
- 有効期限切れのキーは使用不可（決済継続で自動延長）
- Upstash無料枠: 10,000コマンド/日（十分）

## 現在の実装状況

### 完了
- [x] Vercel API基盤ファイル作成
  - `api/lib/redis.js` - Redis操作ユーティリティ（ioredis使用）
  - `api/validate.js` - ライセンスキー検証
  - `api/check.js` - 経費チェック（Claude API呼び出し）
  - `api/usage.js` - 使用状況取得
  - `api/test-setup.js` - テストユーザー作成（開発用）
  - `package.json` - 依存パッケージ
  - `vercel.json` - Vercel設定
- [x] Redis Cloud データベース作成（東京リージョン）
- [x] Vercelプロジェクト作成・デプロイ
  - URL: https://freee-tax-checker.vercel.app
- [x] 環境変数設定（ANTHROPIC_API_KEY, REDIS_URL）
- [x] 全API疎通確認完了（2026-01-31）
  - `/api/validate` - ライセンスキー検証 ✅
  - `/api/check` - 経費チェック（Claude API） ✅
  - `/api/usage` - 使用状況取得 ✅

### テスト用ライセンスキー
```
ftc_9439e6f1-59a8-4ae2-9de4-9456d5b3d363
```
- プラン: paid
- 有効期限: 2027-01-31
- 作成方法: POST /api/test-setup に `{"secret":"ftc-setup-2026"}` を送信

### 未完了
- [ ] Chrome拡張のUI変更（APIキー→ライセンスキー）
- [ ] Chrome拡張のAPI呼び出し変更（直接→Vercel経由）
- [ ] PayPal Webhook連携
- [ ] メール送信機能（ライセンスキー自動送信）
