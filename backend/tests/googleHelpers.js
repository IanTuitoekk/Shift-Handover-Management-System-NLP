// Fake Google for tests: credential strings map to ID-token payloads.
const { OAuth2Client } = require('google-auth-library');

process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

function mockGoogle() {
  const payloads = new Map();
  jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(async ({ idToken, audience }) => {
    if (audience !== process.env.GOOGLE_CLIENT_ID) throw new Error('wrong audience');
    const payload = payloads.get(idToken);
    if (!payload) throw new Error('Invalid token signature');
    return { getPayload: () => payload };
  });
  let n = 0;
  /** Returns a credential that the fake Google accepts for this payload. */
  return (payload) => {
    const credential = `fake-google-id-token-${Date.now()}-${n++}-padding`;
    payloads.set(credential, { email_verified: true, ...payload });
    return credential;
  };
}

module.exports = { mockGoogle };
