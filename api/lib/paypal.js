// PayPal Orders API ヘルパー

export function isSandbox() {
  return process.env.PAYPAL_SANDBOX === 'true';
}

export function getPayPalBaseUrl() {
  return isSandbox()
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

export function getPayPalClientId() {
  return isSandbox()
    ? process.env.PAYPAL_SANDBOX_CLIENT_ID
    : process.env.PAYPAL_CLIENT_ID;
}

function getPayPalSecret() {
  return isSandbox()
    ? process.env.PAYPAL_SANDBOX_SECRET
    : process.env.PAYPAL_SECRET;
}

export async function getPayPalAccessToken() {
  const base = getPayPalBaseUrl();
  const clientId = getPayPalClientId();
  const secret = getPayPalSecret();

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}
