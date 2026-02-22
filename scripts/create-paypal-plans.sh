#!/bin/bash
# PayPal サブスクリプションプラン作成スクリプト
# 使い方: ./scripts/create-paypal-plans.sh [sandbox|production]

set -euo pipefail

MODE="${1:-sandbox}"

if [ "$MODE" = "production" ]; then
  PAYPAL_BASE="https://api-m.paypal.com"
  echo "=== 本番環境 ==="
  read -p "CLIENT_ID: " CLIENT_ID
  read -sp "SECRET: " SECRET
  echo
else
  PAYPAL_BASE="https://api-m.sandbox.paypal.com"
  echo "=== Sandbox環境 ==="
  read -p "SANDBOX CLIENT_ID: " CLIENT_ID
  read -sp "SANDBOX SECRET: " SECRET
  echo
fi

# アクセストークン取得
echo ""
echo "[1/4] アクセストークン取得中..."
ACCESS_TOKEN=$(curl -s -X POST "$PAYPAL_BASE/v1/oauth2/token" \
  -u "$CLIENT_ID:$SECRET" \
  -d "grant_type=client_credentials" | jq -r '.access_token')

if [ "$ACCESS_TOKEN" = "null" ] || [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ 認証失敗。CLIENT_ID/SECRETを確認してください。"
  exit 1
fi
echo "✅ トークン取得成功"

# 既存プロダクト確認
echo ""
echo "[2/4] プロダクト確認中..."
EXISTING=$(curl -s -X GET "$PAYPAL_BASE/v1/catalogs/products?page_size=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

PRODUCT_ID=$(echo "$EXISTING" | jq -r '.products[]? | select(.name | test("freee|税務")) | .id' | head -1)

if [ -n "$PRODUCT_ID" ] && [ "$PRODUCT_ID" != "null" ]; then
  echo "✅ 既存プロダクト使用: $PRODUCT_ID"
else
  echo "   新規プロダクト作成中..."
  PRODUCT_ID=$(curl -s -X POST "$PAYPAL_BASE/v1/catalogs/products" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "freee税務チェッカー Pro",
      "type": "SERVICE",
      "category": "SOFTWARE"
    }' | jq -r '.id')

  if [ "$PRODUCT_ID" = "null" ] || [ -z "$PRODUCT_ID" ]; then
    echo "❌ プロダクト作成失敗"
    exit 1
  fi
  echo "✅ プロダクト作成: $PRODUCT_ID"
fi

# 月額プラン作成（¥480/月）
echo ""
echo "[3/4] 月額プラン作成中（¥480/月）..."
MONTHLY_RESULT=$(curl -s -X POST "$PAYPAL_BASE/v1/billing/plans" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "'"$PRODUCT_ID"'",
    "name": "Pro 月額プラン",
    "description": "freee税務チェッカー Pro（月額）",
    "billing_cycles": [
      {
        "frequency": { "interval_unit": "MONTH", "interval_count": 1 },
        "tenure_type": "REGULAR",
        "sequence": 1,
        "total_cycles": 0,
        "pricing_scheme": {
          "fixed_price": { "value": "480", "currency_code": "JPY" }
        }
      }
    ],
    "payment_preferences": {
      "auto_bill_outstanding": true,
      "payment_failure_threshold": 3
    }
  }')

MONTHLY_PLAN_ID=$(echo "$MONTHLY_RESULT" | jq -r '.id')
if [ "$MONTHLY_PLAN_ID" = "null" ] || [ -z "$MONTHLY_PLAN_ID" ]; then
  echo "❌ 月額プラン作成失敗:"
  echo "$MONTHLY_RESULT" | jq .
  exit 1
fi
echo "✅ 月額プラン: $MONTHLY_PLAN_ID"

# 年額プラン作成（¥3,980/年）
echo ""
echo "[4/4] 年額プラン作成中（¥3,980/年）..."
YEARLY_RESULT=$(curl -s -X POST "$PAYPAL_BASE/v1/billing/plans" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "product_id": "'"$PRODUCT_ID"'",
    "name": "Pro 年額プラン",
    "description": "freee税務チェッカー Pro（年額・約31%お得）",
    "billing_cycles": [
      {
        "frequency": { "interval_unit": "YEAR", "interval_count": 1 },
        "tenure_type": "REGULAR",
        "sequence": 1,
        "total_cycles": 0,
        "pricing_scheme": {
          "fixed_price": { "value": "3980", "currency_code": "JPY" }
        }
      }
    ],
    "payment_preferences": {
      "auto_bill_outstanding": true,
      "payment_failure_threshold": 3
    }
  }')

YEARLY_PLAN_ID=$(echo "$YEARLY_RESULT" | jq -r '.id')
if [ "$YEARLY_PLAN_ID" = "null" ] || [ -z "$YEARLY_PLAN_ID" ]; then
  echo "❌ 年額プラン作成失敗:"
  echo "$YEARLY_RESULT" | jq .
  exit 1
fi
echo "✅ 年額プラン: $YEARLY_PLAN_ID"

# 結果出力
echo ""
echo "========================================"
echo "  Vercel環境変数に設定してください"
echo "========================================"
echo ""
echo "PAYPAL_SUBSCRIPTION_PLAN_ID_MONTHLY=$MONTHLY_PLAN_ID"
echo "PAYPAL_SUBSCRIPTION_PLAN_ID_YEARLY=$YEARLY_PLAN_ID"
echo ""
echo "Vercel CLI:"
echo "  vercel env add PAYPAL_SUBSCRIPTION_PLAN_ID_MONTHLY <<< '$MONTHLY_PLAN_ID'"
echo "  vercel env add PAYPAL_SUBSCRIPTION_PLAN_ID_YEARLY <<< '$YEARLY_PLAN_ID'"
echo ""
echo "完了！デプロイ後に反映されます。"
