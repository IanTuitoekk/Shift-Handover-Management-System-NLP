import { createContext, useContext } from 'react';

/**
 * Data shared by every signed-in page:
 *   me, role, now, tasks, notifications, users (supervisor only, else null),
 *   usersById, markRead(ids), refreshAll(), openComposer() (supervisor), recordSubmission()
 */
export const ShellContext = createContext(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside <AppShell>');
  return ctx;
}
