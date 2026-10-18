import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from '../api/client';
import { AuthContext } from './AuthContext';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // 'loading' while an existing token is being checked, then 'authenticated' or 'anonymous'.
  const [status, setStatus] = useState(() => (tokenStore.get() ? 'loading' : 'anonymous'));
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      setUser(null);
      setStatus('anonymous');
      // Explain unexpected sign-outs (password reset, deactivation) on the login page.
      if (reason && !/missing|invalid or expired/i.test(reason)) setNotice(reason);
    });

    if (!tokenStore.get()) return;
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (cancelled) return;
        tokenStore.clear();
        setStatus('anonymous');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    setNotice('');
    const { user: loggedIn, token } = await api.login(email, password);
    tokenStore.set(token);
    setUser(loggedIn);
    setStatus('authenticated');
    return loggedIn;
  }, []);

  function startSession({ user: signedIn, token }) {
    tokenStore.set(token);
    setUser(signedIn);
    setStatus('authenticated');
    return signedIn;
  }

  /**
   * Signs in with a Google ID token. Returns { linkRequired: true, ticket, email } when the email
   * already has an account that must confirm its password first; otherwise signs in.
   */
  const googleSignIn = useCallback(async (credential) => {
    setNotice('');
    const result = await api.googleSignIn(credential);
    if (result.link_required) return { linkRequired: true, ticket: result.link_ticket, email: result.email };
    startSession(result);
    return { linkRequired: false };
  }, []);

  /** Second step of linking: the existing account's password. */
  const linkGoogle = useCallback(async (ticket, password) => {
    startSession(await api.googleLink(ticket, password));
  }, []);

  const register = useCallback(
    async ({ fullName, email, password }) => {
      await api.register({ full_name: fullName, email, password });
      return login(email, password);
    },
    [login],
  );

  // Re-reads the profile, e.g. after a supervisor changes this user's role.
  const refreshUser = useCallback(async () => {
    const me = await api.me();
    setUser(me);
    return me;
  }, []);

  /** Changes the password; the server ends other sessions and returns a fresh token for this one. */
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const { user: updated, token } = await api.changePassword(currentPassword, newPassword);
    tokenStore.set(token);
    setUser((u) => ({ ...u, ...updated }));
    return updated;
  }, []);

  /** Ends the local session without calling the API (it has already been ended server-side). */
  const signOut = useCallback((reason) => {
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
    if (reason) setNotice(reason);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Token may already be invalid; clear locally regardless.
    }
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(
    () => ({ user, status, notice, login, register, logout, refreshUser, changePassword, signOut, googleSignIn, linkGoogle }),
    [user, status, notice, login, register, logout, refreshUser, changePassword, signOut, googleSignIn, linkGoogle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
