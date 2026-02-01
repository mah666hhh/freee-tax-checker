# アカウント・設定一覧

最終更新: 2026年2月1日

## アカウント情報

### メール
| 用途 | アドレス |
|------|----------|
| 問い合わせ・サポート | freeetaxchecker@gmail.com |
| ライセンスキー送信元 | freeetaxchecker@gmail.com |

### SNS
| サービス | アカウント | URL |
|----------|------------|-----|
| X (Twitter) | @freeetaxchecker | https://x.com/freeetaxchecker |

## サービス設定

### Upstash (Redis)
- Redisはクラウド（Upstash）で動作
- Redis Insightはローカルの閲覧ツール（閉じてもOK）
- アプリ（Vercel）は直接Upstashに接続

### Vercel
- プロジェクトURL: https://freee-tax-checker.vercel.app
- 環境変数:
  - `ANTHROPIC_API_KEY` - Claude API キー
  - `UPSTASH_REDIS_REST_URL` - Redis URL
  - `UPSTASH_REDIS_REST_TOKEN` - Redis トークン
  - `GMAIL_USER` - freeetaxchecker@gmail.com
  - `GMAIL_APP_PASSWORD` - Gmailアプリパスワード
  - `PAYPAL_CLIENT_ID` - PayPal クライアントID
  - `PAYPAL_CLIENT_SECRET` - PayPal シークレット

### PayPal
- 本番プランID: `P-84V60575XD453294JNF662HQ`
- 決済リンク: https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-84V60575XD453294JNF662HQ
- Webhook/IPN URL: https://freee-tax-checker.vercel.app/api/webhook/paypal

### 料金
| プラン | 価格 |
|--------|------|
| Free | 無料（月5回まで） |
| Pro | 980円/月（税込1,078円） |

## 公開URL

| ページ | URL |
|--------|-----|
| サポート | https://freee-tax-checker.vercel.app/support.html |
| プライバシーポリシー | https://freee-tax-checker.vercel.app/privacy.html |
| 利用規約 | https://freee-tax-checker.vercel.app/terms.html |
| 特定商取引法 | https://freee-tax-checker.vercel.app/legal.html |

## Chrome拡張機能

- 名前: freee取引入力 税務チェッカー
- バージョン: 0.1.0
- 対象ドメイン: secure.freee.co.jp/deals*
- zipファイル: freee-tax-checker-extension.zip
- Chrome Web Store ID: pmjfjifpadhnkddieedbnbpeiilgecpp
- デベロッパーコンソール: https://chrome.google.com/webstore/devconsole/e1d4c653-66f5-4014-89a1-6e491048f2a8/pmjfjifpadhnkddieedbnbpeiilgecpp/edit

## 連絡先表記

販売業者名: freee取引入力 税務チェッカー
