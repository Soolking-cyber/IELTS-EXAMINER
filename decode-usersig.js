// Decode the UserSig from the error to understand the structure
const userSigFromError = "eyJUTFMudmVyIjoiMi4wIiwiVExTLnNka2FwcGlkIjoyMDAyNjk5MSwiVExTLmlkZW50aWZpZXIiOiJ3ZWItbzNvcXA4IiwiVExTLmV4cGlyZSI6ODY0MDAsIlRMUy50aW1lIjoxNzU2NzkyMDQ0LCJUTFMuc2lnIjoidzRZeUNzenRKYkhWTjZaeC9mU1pGeVUxeTNhWnlYWDJ0b1pDN1FJa1Urcz0ifQ==";

try {
  const decoded = JSON.parse(Buffer.from(userSigFromError, 'base64').toString('utf8'));
  console.log('Decoded UserSig from error:');
  console.log(JSON.stringify(decoded, null, 2));
} catch (e) {
  console.error('Failed to decode:', e.message);
}