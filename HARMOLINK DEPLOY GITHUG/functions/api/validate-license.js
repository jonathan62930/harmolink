export async function onRequestPost(context) {
  const { request, env } = context;

  const allowedOrigins = [
    'https://harmolink.pages.dev',
    'http://localhost:3000',
  ];

  const origin = request.headers.get('origin') || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  let licenseKey;
  try {
    const body = await request.json();
    licenseKey = (body.license_key || '').trim();
  } catch {
    return new Response(JSON.stringify({ valid: false, error: 'Invalid request body' }), { status: 400, headers });
  }

  if (!licenseKey) {
    return new Response(JSON.stringify({ valid: false, error: 'Missing license key' }), { status: 400, headers });
  }

  const LS_API_KEY = env.LEMONSQUEEZY_API_KEY;
  const PRODUCT_ID = parseInt(env.LEMONSQUEEZY_PRODUCT_ID || '1108850');

  if (!LS_API_KEY) {
    return new Response(JSON.stringify({ valid: false, error: 'Server config error' }), { status: 500, headers });
  }

  try {
    const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LS_API_KEY}`,
      },
      body: JSON.stringify({ license_key: licenseKey }),
    });

    const data = await response.json();
    const valid = data?.valid === true;
    const productMatch = !data?.meta?.product_id || data.meta.product_id === PRODUCT_ID;

    if (valid && productMatch) {
      return new Response(JSON.stringify({
        valid: true,
        token: generateToken(licenseKey, env.TOKEN_SECRET),
        customerName: data?.meta?.customer_name || '',
        expiresAt: data?.license_key?.expires_at || null,
      }), { status: 200, headers });
    } else {
      let reason = 'Clé invalide.';
      if (!productMatch) reason = "Cette clé n'appartient pas à HarmoLink Pro.";
      else if (data?.error) reason = data.error;
      else if (data?.license_key?.status === 'disabled') reason = 'Licence désactivée.';
      else if (data?.license_key?.status === 'expired') reason = 'Licence expirée.';
      return new Response(JSON.stringify({ valid: false, error: reason }), { status: 200, headers });
    }
  } catch (err) {
    return new Response(JSON.stringify({ valid: false, error: 'Erreur de connexion au serveur de licence.' }), { status: 502, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }});
}

function generateToken(licenseKey, secret) {
  const SECRET = secret || 'harmolink-secret-change-me';
  const payload = `${licenseKey}:${SECRET}:${Math.floor(Date.now() / 604800000)}`;
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) - hash) + payload.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + licenseKey.slice(-6);
}
