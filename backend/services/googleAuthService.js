/*
 * Sign in with Google. The browser gets an ID token from Google Identity Services and sends it
 * here; we verify it with Google's library (signature, issuer, our client id as audience, expiry)
 * and only trust verified emails. Then:
 *   - a Google account seen before            -> signed in
 *   - an email new to us                       -> a ground crew account is created
 *   - an email that already has an account     -> the person must confirm that account's password
 *                                                 once (link ticket, 5 minutes) before Google is linked
 * Deactivated and deleted (anonymised) accounts can't sign in this way either.
 */
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const userModel = require('../models/userModel');
const { verifyPassword } = require('../utils/password');
const { DEFAULT_ROLE } = require('../config/roles');

const LINK_TICKET_MINUTES = 5;
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });

let client = null;
const googleClient = () => (client ??= new OAuth2Client());

// Link tickets are signed with a key derived from (not equal to) JWT_SECRET, so a ticket can never
// be accepted as a session token by requireAuth.
const ticketSecret = () => `${process.env.JWT_SECRET}:google-link-ticket`;

/** Verifies a Google ID token and returns { sub, email, name }. */
async function verifyCredential(credential) {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw fail(503, 'Sign in with Google is not set up on this server');
  let payload;
  try {
    const ticket = await googleClient().verifyIdToken({ idToken: credential, audience });
    payload = ticket.getPayload();
  } catch {
    throw fail(401, 'Google sign-in could not be verified. Try again.');
  }
  if (!payload?.sub || !payload.email) throw fail(401, 'Google did not share an email address');
  if (payload.email_verified !== true) throw fail(401, 'Your Google email address is not verified');
  return { sub: payload.sub, email: payload.email.toLowerCase(), name: payload.name || payload.email.split('@')[0] };
}

function assertCanSignIn(user) {
  if (user.anonymised_at || !user.is_active) {
    throw fail(403, 'This account is deactivated. Ask a supervisor to reactivate it.');
  }
}

/**
 * Returns { user } to sign in, or { linkRequired: true, ticket, email } when the email belongs to
 * an existing account that must confirm its password first.
 */
async function signInWithGoogle(credential) {
  const google = await verifyCredential(credential);

  const linked = await userModel.getUserByGoogleSub(google.sub);
  if (linked) {
    assertCanSignIn(linked);
    const { google_sub, ...user } = linked;
    return { user };
  }

  const existing = await userModel.getUserByEmailInsensitive(google.email);
  if (existing) {
    assertCanSignIn(existing);
    if (existing.google_sub) throw fail(409, 'This email is already linked to a different Google account');
    if (!existing.has_password) throw fail(409, 'This account cannot be linked automatically. Ask a supervisor.');
    const ticket = jwt.sign({ purpose: 'google-link', userId: existing.user_id, sub: google.sub }, ticketSecret(), {
      expiresIn: `${LINK_TICKET_MINUTES}m`,
    });
    return { linkRequired: true, ticket, email: existing.email };
  }

  try {
    const user = await userModel.createUser({
      fullName: google.name,
      email: google.email,
      passwordHash: null,
      role: DEFAULT_ROLE,
      googleSub: google.sub,
    });
    return { user, created: true };
  } catch (err) {
    // Two first sign-ins at once: the other one won.
    if (err.code === '23505') return signInWithGoogle(credential);
    throw err;
  }
}

/** Second step for an existing account: checks its password, links Google, returns { user }. */
async function linkWithPassword(ticket, password) {
  let claims;
  try {
    claims = jwt.verify(ticket, ticketSecret());
  } catch {
    throw fail(401, 'This step has expired. Sign in with Google again.');
  }
  if (claims.purpose !== 'google-link') throw fail(401, 'This step has expired. Sign in with Google again.');

  const user = await userModel.getUserById(claims.userId);
  if (!user) throw fail(401, 'This step has expired. Sign in with Google again.');
  assertCanSignIn(user);
  const hash = await userModel.getPasswordHash(claims.userId);
  if (!hash || !(await verifyPassword(password, hash))) throw fail(401, 'That password is not correct for this account');

  try {
    const updated = await userModel.linkGoogleAccount(claims.userId, claims.sub);
    if (!updated) throw fail(409, 'This account is already linked to a Google account');
    return { user: updated };
  } catch (err) {
    if (err.code === '23505') throw fail(409, 'That Google account is already linked to another account');
    throw err;
  }
}

module.exports = { signInWithGoogle, linkWithPassword, LINK_TICKET_MINUTES };
