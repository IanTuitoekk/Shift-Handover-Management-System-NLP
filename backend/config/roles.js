// The roles the system knows. Public sign-up always creates DEFAULT_ROLE; only a supervisor can
// change someone's role (PATCH /api/users/:userId/role).
const ROLES = ['ground_crew', 'supervisor'];
const DEFAULT_ROLE = 'ground_crew';

module.exports = { ROLES, DEFAULT_ROLE };
