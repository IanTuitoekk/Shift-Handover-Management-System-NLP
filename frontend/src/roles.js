import {
  Bell,
  ClipboardText,
  House,
  Kanban,
  ListChecks,
  SquaresFour,
  UsersThree,
} from '@phosphor-icons/react';

/*
 * Role configuration: navigation, density and which routes each role may open.
 * This is UX only; the backend enforces access control.
 */
export const ROLE_CONFIG = {
  ground_crew: {
    label: 'Ground crew',
    shellClass: 'shell--ground',
    nav: [
      { to: '/', label: 'Home', icon: House, end: true },
      { to: '/my-tasks', label: 'My tasks', icon: ListChecks, badge: 'myTasks' },
      { to: '/reports', label: 'Reports', icon: ClipboardText },
      { to: '/alerts', label: 'Alerts', icon: Bell, badge: 'unread' },
    ],
  },
  supervisor: {
    label: 'Supervisor',
    shellClass: 'shell--supervisor',
    nav: [
      { to: '/', label: 'Overview', icon: SquaresFour, end: true },
      { to: '/triage', label: 'Triage', icon: Kanban, badge: 'needsAction' },
      { to: '/reports', label: 'Reports', icon: ClipboardText },
      { to: '/team', label: 'Team', icon: UsersThree },
    ],
  },
};

export const FALLBACK_ROLE = 'ground_crew';

export function roleConfig(role) {
  return ROLE_CONFIG[role] ?? ROLE_CONFIG[FALLBACK_ROLE];
}

export const isSupervisor = (user) => user?.role === 'supervisor';
