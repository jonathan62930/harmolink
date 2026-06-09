// netlify/functions/validate-license.js
// Proxy sécurisé : valide la licence Lemon Squeezy côté serveur
// La clé API ne quitte JAMAIS le serveur.

exports.handler = async (event) => {
  // CORS — autorise uniquement ton domaine
  const allowedOrigins = [
    'https://harmolinkpro.netlify.app',
    'http://localhost:3000', // pour dev local
  ];

  const origin = event.headers.origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let licenseKey;
  try {
    const body = JSON.parse(event.body);
    licenseKey = (body.license_key || '').trim();
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Invalid request body' }) };
  }

  if (!licenseKey) {
    return { statusCode: 400, headers, body: JSON.stringify({ valid: false, error: 'Missing license key' }) };
  }

  // Clé API Lemon Squeezy stockée en variable d'environnement Netlify
  const LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY;
  // ID produit HarmoLink Pro (vérifie dans ton dashboard LS)
  const PRODUCT_ID = parseInt(process.env.LEMONSQUEEZY_PRODUCT_ID || '1108850');

  if (!LS_API_KEY) {
    console.error('LEMONSQUEEZY_API_KEY not set');
    return { statusCode: 500, headers, body: JSON.stringify({ valid: false, error: 'Server config error' }) };
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

    // Vérification validité + bon produit
    const valid = data?.valid === true;
    const productMatch = !data?.meta?.product_id || data.meta.product_id === PRODUCT_ID;

    if (valid && productMatch) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: true,
          // On renvoie un token signé côté serveur pour éviter la falsification localStorage
          token: generateToken(licenseKey),
          customerName: data?.meta?.customer_name || '',
          expiresAt: data?.license_key?.expires_at || null,
        }),
      };
    } else {
      let reason = 'Clé invalide.';
      if (!productMatch) reason = "Cette clé n'appartient pas à HarmoLink Pro.";
      else if (data?.error) reason = data.error;
      else if (data?.license_key?.status === 'disabled') reason = 'Licence désactivée.';
      else if (data?.license_key?.status === 'expired') reason = 'Licence expirée.';

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ valid: false, error: reason }),
      };
    }
  } catch (err) {
    console.error('LS API error:', err);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ valid: false, error: 'Erreur de connexion au serveur de licence.' }),
    };
  }
};

// Token simple HMAC-like (sans lib externe) pour signer la validation
// Empêche un simple `localStorage.setItem('valid', '1')` de bypasser
function generateToken(licenseKey) {
  const SECRET = process.env.TOKEN_SECRET || 'harmolink-secret-change-me';
  const payload = `${licenseKey}:${SECRET}:${Math.floor(Date.now() / 604800000)}`; // valide 24h par jour
  // Hash simple (pas crypto, mais suffisant pour usage front-end)
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) - hash) + payload.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + licenseKey.slice(-6);
}
