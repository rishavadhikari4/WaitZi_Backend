// tests/api/auth-users.test.ts
// End-to-end over HTTP: login, org selection, staff management, roles, and
// the guards around shared accounts, self-lockout and the last admin.
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { asPlatform, disconnectDB } from '../../src/config/prisma.js';
import { ROLE_TEMPLATES } from '../../src/constants/permissions.js';
import { hashPassword } from '../../src/utils/Helpers.js';
import { startServer } from '../helpers/http.js';

const PASSWORD = 'Passw0rd!x';
let api: Awaited<ReturnType<typeof startServer>>;
let phoneSeq = 9700000000;
const nextPhone = () => String(++phoneSeq);

async function makeOrg(slug: string) {
  return asPlatform('test: org with roles', async (db) => {
    const org = await db.organization.create({ data: { name: slug, slug, status: 'active' } });
    const roles: Record<string, string> = {};
    for (const t of ROLE_TEMPLATES) {
      roles[t.name] = (await db.role.create({ data: { orgId: org.id, ...t, isSystem: true } })).id;
    }
    return { org, roles };
  });
}

async function makeUser(email: string, memberships: { orgId: string; roleId: string }[]) {
  return asPlatform('test: user', async (db) => {
    const user = await db.user.create({
      data: { firstName: 'Test', lastName: 'User', email, phone: nextPhone(), passwordHash: await hashPassword(PASSWORD) },
    });
    for (const m of memberships) await db.membership.create({ data: { ...m, userId: user.id } });
    return user;
  });
}

async function login(email: string, organizationId?: string) {
  const res = await api.post('/auth/login', { email, password: PASSWORD, ...(organizationId && { organizationId }) });
  return res;
}

let A: Awaited<ReturnType<typeof makeOrg>>;
let B: Awaited<ReturnType<typeof makeOrg>>;
let adminA: string;
let waiterA: string;
let adminB: string;
let shared: { id: string };

beforeAll(async () => {
  api = await startServer();
  A = await makeOrg('api-alpha');
  B = await makeOrg('api-bravo');
  await makeUser('admin@alpha.test', [{ orgId: A.org.id, roleId: A.roles['admin']! }]);
  await makeUser('waiter@alpha.test', [{ orgId: A.org.id, roleId: A.roles['waiter']! }]);
  await makeUser('admin@bravo.test', [{ orgId: B.org.id, roleId: B.roles['admin']! }]);
  shared = await makeUser('shared@both.test', [
    { orgId: A.org.id, roleId: A.roles['cashier']! },
    { orgId: B.org.id, roleId: B.roles['manager']! },
  ]);
  adminA = (await login('admin@alpha.test')).body.data.accessToken;
  waiterA = (await login('waiter@alpha.test')).body.data.accessToken;
  adminB = (await login('admin@bravo.test')).body.data.accessToken;
});

afterAll(async () => {
  await api.close();
  await disconnectDB();
});

describe('auth', () => {
  it('rejects a wrong password and an unknown email the same way', async () => {
    const wrong = await api.post('/auth/login', { email: 'admin@alpha.test', password: 'nope' });
    const unknown = await api.post('/auth/login', { email: 'ghost@alpha.test', password: 'nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.message).toBe('Invalid email or password');
  });

  it('logs in with an org-scoped token and the legacy user shape', async () => {
    const res = await login('admin@alpha.test');
    expect(res.status).toBe(200);
    const { user, accessToken } = res.body.data;
    expect(user.role.name).toBe('admin');
    expect(user._id).toBe(user.id);
    expect(user.organization.id).toBe(A.org.id);
    expect((jwt.decode(accessToken) as { orgId: string }).orgId).toBe(A.org.id);
  });

  it('asks a multi-org user to choose, then honours the choice', async () => {
    const choose = await login('shared@both.test');
    expect(choose.body.data.requiresOrganization).toBe(true);
    expect(choose.body.data.organizations.map((o: { id: string }) => o.id).sort()).toEqual([A.org.id, B.org.id].sort());

    const inB = await login('shared@both.test', B.org.id);
    expect(inB.body.data.user.role.name).toBe('manager');
    expect((jwt.decode(inB.body.data.accessToken) as { orgId: string }).orgId).toBe(B.org.id);
  });

  it('refuses an organization the user does not belong to', async () => {
    const res = await login('admin@alpha.test', B.org.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_A_MEMBER');
  });

  it('verifies a token and refreshes it', async () => {
    const res = await login('admin@alpha.test');
    const verify = await api.get('/auth/verify', res.body.data.accessToken);
    expect(verify.status).toBe(200);
    expect(verify.body.data.user.email).toBe('admin@alpha.test');

    const refreshed = await api.post('/auth/refresh-token', { refreshToken: res.body.data.refreshToken });
    expect(refreshed.status).toBe(200);
    expect((jwt.decode(refreshed.body.data.accessToken) as { orgId: string }).orgId).toBe(A.org.id);
  });

  it('rejects pre-migration (Mongo-era) tokens with a clear message', async () => {
    const legacy = jwt.sign({ userId: '64b7f0c2e4b0a1a2b3c4d5e6', email: 'x@y.z', role: { name: 'admin' } }, 'test-access-secret', {
      issuer: 'waitzi-backend',
      audience: 'waitzi-app',
    });
    const res = await api.get('/client/users', legacy);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_OUTDATED');
  });

  it('lets a migrated Gmail account log in with the dotted address', async () => {
    await makeUser('firstlast@gmail.com', [{ orgId: A.org.id, roleId: A.roles['waiter']! }]);
    const res = await login('First.Last@gmail.com');
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('firstlast@gmail.com');
  });
});

describe('client users: isolation and permissions', () => {
  it('lists only the current org\'s staff, with stats', async () => {
    const res = await api.get('/client/users?limit=100', adminA);
    expect(res.status).toBe(200);
    const emails = res.body.data.map((u: { email: string }) => u.email);
    expect(emails).toContain('admin@alpha.test');
    expect(emails).toContain('shared@both.test');
    expect(emails).not.toContain('admin@bravo.test');
    expect(res.body.stats.byRole.admin.total).toBeGreaterThanOrEqual(1);
    expect(res.body.pagination.currentPage).toBe(1);
  });

  it('returns 404 for another org\'s staff member', async () => {
    const bAdmin = (await login('admin@bravo.test')).body.data.user.id;
    const res = await api.get(`/client/users/${bAdmin}`, adminA);
    expect(res.status).toBe(404);
  });

  it('needs staff.view to list staff', async () => {
    const res = await api.get('/client/users', waiterA);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/staff\.view/);
  });

  it('still lets any member read their own profile', async () => {
    const res = await api.get('/client/users/profile', waiterA);
    expect(res.status).toBe(200);
    expect(res.body.data.role.name).toBe('waiter');
  });

  it('rejects malformed ids before touching the database', async () => {
    const res = await api.get('/client/users/64b7f0c2e4b0a1a2b3c4d5e6', adminA);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});

describe('client users: lifecycle and guards', () => {
  const newStaff = (email: string) => ({
    firstName: 'Sita',
    lastName: 'Rai',
    email,
    number: nextPhone(),
    address: 'Thamel, Kathmandu',
    password: 'Str0ngPass',
    role: 'waiter',
  });

  it('creates staff by role name and enforces global email uniqueness', async () => {
    const created = await api.post('/client/users', newStaff('sita@alpha.test'), adminA);
    expect(created.status).toBe(201);
    expect(created.body.data.role.name).toBe('waiter');

    // Taken in another org still counts: emails are global logins.
    const dup = await api.post('/client/users', newStaff('admin@bravo.test'), adminA);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');
  });

  it('cannot assign another org\'s role', async () => {
    const created = await api.post('/client/users', newStaff('ram@alpha.test'), adminA);
    const res = await api.put(`/client/users/${created.body.data.id}`, { role: B.roles['admin'] }, adminA);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REFERENCE');
  });

  it('cannot edit the profile of someone who also works elsewhere', async () => {
    const res = await api.put(`/client/users/${shared.id}`, { firstName: 'Hijacked' }, adminA);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SHARED_ACCOUNT');
    // Role/status changes for this org are still fine.
    const ok = await api.patch(`/client/users/${shared.id}/status`, { status: 'Inactive' }, adminA);
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('Inactive');
    // ...and only in this org: they can still sign in to B.
    expect((await login('shared@both.test', B.org.id)).status).toBe(200);
    await api.patch(`/client/users/${shared.id}/status`, { status: 'Active' }, adminA);
  });

  it('refuses a temporary password for a shared account', async () => {
    const res = await api.post(`/client/users/${shared.id}/reset-password`, undefined, adminA);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SHARED_ACCOUNT');
  });

  it('protects against self-lockout and losing the last admin', async () => {
    const me = (await api.get('/client/users/profile', adminA)).body.data.id;
    const self = await api.patch(`/client/users/${me}/status`, { status: 'Inactive' }, adminA);
    expect(self.body.code).toBe('SELF_LOCKOUT');

    const bAdminId = (await api.get('/client/users/profile', adminB)).body.data.id;
    const cashier = await api.post('/client/users', { ...newStaff('hari@bravo.test'), role: 'manager' }, adminB);
    const managerToken = (await api.post('/auth/login', { email: 'hari@bravo.test', password: 'Str0ngPass' })).body.data.accessToken;
    // A manager with staff.manage cannot demote B's only admin.
    const demote = await api.put(`/client/users/${bAdminId}`, { role: B.roles['waiter'] }, managerToken);
    expect(demote.status).toBe(400);
    expect(demote.body.code).toBe('LAST_ADMIN');
    expect(cashier.status).toBe(201);
  });

  it('removing staff deletes the membership, and the account once unused', async () => {
    const created = await api.post('/client/users', newStaff('temp@alpha.test'), adminA);
    const id = created.body.data.id;
    const res = await api.del(`/client/users/${id}`, adminA);
    expect(res.status).toBe(200);
    expect(res.body.data.accountDeleted).toBe(true);
    expect((await login('temp@alpha.test')).status).toBe(401);
  });

  it('removing a shared person only removes them from this org', async () => {
    const res = await api.del(`/client/users/${shared.id}`, adminA);
    expect(res.body.data.accountDeleted).toBe(false);
    const stillInB = await login('shared@both.test');
    expect(stillInB.status).toBe(200);
    expect(stillInB.body.data.user.organization.id).toBe(B.org.id);
  });
});

describe('client roles', () => {
  it('lists this org\'s six built-in roles', async () => {
    const res = await api.get('/client/roles', waiterA);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r: { name: string }) => r.name).sort()).toEqual(
      ['admin', 'cashier', 'kitchen_staff', 'manager', 'stock_manager', 'waiter'],
    );
  });

  it('creates, updates and deletes a custom role', async () => {
    const created = await api.post('/client/roles', { name: 'head_waiter', permissions: ['order.view', 'table.transfer'] }, adminA);
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const bogus = await api.patch(`/client/roles/${id}`, { permissions: ['launch.missiles'] }, adminA);
    expect(bogus.status).toBe(400);

    const updated = await api.patch(`/client/roles/${id}`, { permissions: ['order.view'] }, adminA);
    expect(updated.body.data.permissions).toEqual(['order.view']);

    expect((await api.del(`/client/roles/${id}`, adminA)).status).toBe(200);
  });

  it('guards built-in roles', async () => {
    expect((await api.del(`/client/roles/${A.roles['waiter']}`, adminA)).body.code).toBe('SYSTEM_ROLE');
    expect((await api.patch(`/client/roles/${A.roles['admin']}`, { permissions: ['menu.view'] }, adminA)).body.code).toBe('SYSTEM_ROLE');
    expect((await api.patch(`/client/roles/${A.roles['waiter']}`, { name: 'server' }, adminA)).body.code).toBe('SYSTEM_ROLE');
  });

  it('needs role.manage to change roles', async () => {
    const res = await api.post('/client/roles', { name: 'sneaky' }, waiterA);
    expect(res.status).toBe(403);
  });

  it('cannot see another org\'s role', async () => {
    expect((await api.get(`/client/roles/${B.roles['admin']}`, adminA)).status).toBe(404);
  });
});

describe('platform accounts', () => {
  it('cannot use the restaurant API', async () => {
    await asPlatform('test: platform user', async (db) =>
      db.user.create({
        data: {
          firstName: 'Plat', lastName: 'Form', email: 'ops@waitzi.test', phone: nextPhone(),
          passwordHash: await hashPassword(PASSWORD), scope: 'platform', platformRole: 'platform_admin',
        },
      }),
    );
    const res = await login('ops@waitzi.test');
    expect(res.body.data.scope).toBe('platform');
    const denied = await api.get('/client/users', res.body.data.accessToken);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('PLATFORM_SCOPE');
  });
});
