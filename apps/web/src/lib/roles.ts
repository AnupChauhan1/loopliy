export type PanelRole = 'admin' | 'manager' | 'employee' | 'hr' | 'client';

export function panelRoleOf(roleNames: string[] | undefined, primaryRole?: string): PanelRole {
  const names = roleNames ?? [];
  const pick = (r: string) => (primaryRole === r || names.includes(r));
  if (pick('Client')) return 'client';
  if (pick('Super Admin') || pick('Admin')) return 'admin';
  if (pick('Project Manager')) return 'manager';
  if (pick('HR Manager')) return 'hr';
  return 'employee';
}

export function homeFor(role: PanelRole): string {
  return { admin: '/admin', manager: '/manager', employee: '/employee', hr: '/hr', client: '/client' }[role];
}

export function isManager(role: PanelRole) {
  return role === 'admin' || role === 'manager';
}

export function isPrivileged(role: PanelRole) {
  return role === 'admin' || role === 'hr';
}
