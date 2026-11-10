// Lightweight obfuscation for BankiBites payment-link params so order id,
// amount, expiry, and discount don't sit in cleartext in the URL. Not a
// security boundary — the key ships to the client — just enough to make
// casual URL inspection unreadable and to collapse 4 query params into
// one short opaque blob.
//
// Payload shape: { o: orderId, a: amount, e: expUnixSec, d?: discount, f?: offerApplied }
// Single-letter keys keep the ciphertext short.

const SECRET = 'bb-pay-2026';

function xorCipher(str, key) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return out;
}

function toB64Url(bytes) {
  return btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(token) {
  let b64 = token.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return atob(b64);
}

export function encodePayToken(data) {
  const json = JSON.stringify(data);
  // Round-trip through URI encoding first so non-ASCII in order ids (unlikely
  // but possible) survives XOR + btoa, both of which assume Latin-1 bytes.
  const safe = unescape(encodeURIComponent(json));
  const xored = xorCipher(safe, SECRET);
  return toB64Url(xored);
}

export function decodePayToken(token) {
  try {
    const xored = fromB64Url(token);
    const safe = xorCipher(xored, SECRET);
    const json = decodeURIComponent(escape(safe));
    const data = JSON.parse(json);
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    return null;
  }
}
