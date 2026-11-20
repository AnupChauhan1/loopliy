const API_BASE_URL = (process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
const BASE = `${API_BASE_URL}/api/v1`;
const adminPassword = process.env.ADMIN_PASSWORD;
const staffPassword = process.env.STAFF_PASSWORD;
const clientPassword = process.env.CLIENT_PASSWORD;
const demoAdminPassword = process.env.DEMO_ADMIN_PASSWORD;
const demoManagerPassword = process.env.DEMO_MANAGER_PASSWORD;
const demoHrPassword = process.env.DEMO_HR_PASSWORD;
const demoEmployeePassword = process.env.DEMO_EMPLOYEE_PASSWORD;
const demoClientPassword = process.env.DEMO_CLIENT_PASSWORD;
const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
if (
  !adminPassword ||
  !staffPassword ||
  !clientPassword ||
  !demoAdminPassword ||
  !demoManagerPassword ||
  !demoHrPassword ||
  !demoEmployeePassword ||
  !demoClientPassword
) {
  throw new Error('Set private-workspace and public-sandbox passwords to run the E2E flow.');
}
const login = async (email, password) => {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const d = await r.json();
  return { token: d.token, user: d.user, status: r.status };
};
const api = async (token, method, path, body) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, options);
  let data; try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data };
};

// 1. Logins for all 5 roles
const admin = await login('admin@epatang.com', adminPassword);
const pm = await login('pm@epatang.com', staffPassword);
const hr = await login('hr@epatang.com', staffPassword);
const emp = await login('employee@epatang.com', staffPassword);
const client = await login('client@acme.com', clientPassword);
const demoAdmin = await login('admin@loopli.com', demoAdminPassword);
const demoManager = await login('manager@loopli.com', demoManagerPassword);
const demoHr = await login('hr@loopli.com', demoHrPassword);
const demoEmployee = await login('employee@loopli.com', demoEmployeePassword);
const demoClient = await login('client@loopli.com', demoClientPassword);
check('Admin login', admin.status === 200 && admin.user?.primaryRole === 'Super Admin');
check('PM login', pm.status === 200 && pm.user?.primaryRole === 'Project Manager');
check('HR login', hr.status === 200 && hr.user?.primaryRole === 'HR Manager');
check('Employee login', emp.status === 200 && emp.user?.primaryRole === 'Employee');
check('Client login', client.status === 200 && client.user?.primaryRole === 'Client' && client.user?.clientId);
check(
  'Public demo accounts authenticate only in the isolated sandbox',
  demoAdmin.status === 200 &&
    demoAdmin.user?.primaryRole === 'Super Admin' &&
    demoManager.user?.primaryRole === 'Project Manager' &&
    demoHr.user?.primaryRole === 'HR Manager' &&
    demoEmployee.user?.primaryRole === 'Employee' &&
    demoClient.user?.primaryRole === 'Client' &&
    demoAdmin.user?.organizationId !== admin.user?.organizationId &&
    demoClient.user?.organizationId === demoAdmin.user?.organizationId,
);
const sandboxDashboard = await api(demoClient.token, 'GET', '/client-portal/dashboard');
check(
  'Public client demo is populated and isolated from the private workspace',
  sandboxDashboard.status === 200 &&
    sandboxDashboard.data?.projects?.some((project) => project.name === 'Northstar Website Refresh') &&
    sandboxDashboard.data?.projects?.every((project) => project.name !== 'Website Redesign') &&
    sandboxDashboard.data?.tasks?.some((task) => task.title === 'Review landing page wireframe') &&
    sandboxDashboard.data?.deliverables?.some((item) => item.title === 'Northstar homepage design concept'),
);
const demoClientInternalApi = await api(demoClient.token, 'GET', '/tasks');
check('Public client demo remains blocked from staff APIs', demoClientInternalApi.status === 403);

// 2. Client portal scope and explicit internal-module denial
const clientMe = await api(client.token, 'GET', '/users/me');
check('Client can load own profile', clientMe.status === 200 && clientMe.data.clientId === client.user.clientId);
const clientProjectsDenied = await api(client.token, 'GET', '/projects');
check('Client blocked from staff project API', clientProjectsDenied.status === 403, `got ${clientProjectsDenied.status}`);
const clientUsersDenied = await api(client.token, 'GET', '/users');
check('Client blocked from employee directory', clientUsersDenied.status === 403, `got ${clientUsersDenied.status}`);
const clientDashboard = await api(client.token, 'GET', '/client-portal/dashboard');
check(
  'Client sees only assigned project and visible tasks',
  clientDashboard.status === 200 &&
    clientDashboard.data?.projects?.length > 0 &&
    clientDashboard.data.projects.every((project) => project.id === 'demo-project-id') &&
    clientDashboard.data.tasks.some((task) => task.title === 'Review landing page wireframe') &&
    clientDashboard.data.tasks.every((task) => task.title !== 'Build login page UI'),
);
check(
  'Client can review seeded deliverables',
  clientDashboard.data?.deliverables?.some((item) => item.title === 'Acme homepage design concept') &&
    clientDashboard.data?.deliverables?.some((item) => item.title === 'Acme launch preview'),
);
const clientCreative = clientDashboard.data?.deliverables?.find((item) => item.title === 'Acme homepage design concept');
const clientReview = clientCreative
  ? await api(client.token, 'POST', `/client-portal/deliverables/creative/${clientCreative.id}/versions/${clientCreative.latestVersion.id}/review`, {
      action: 'approve',
      feedback: 'Approved in the client portal E2E flow.',
    })
  : { status: 0 };
check('Client can approve a delivered design', !!clientCreative && (clientReview.status === 201 || clientReview.status === 200));
const clientThread = await api(client.token, 'GET', '/client-portal/messages');
check('Client can read the team conversation', clientThread.status === 200 && clientThread.data?.length > 0);
const clientMessage = await api(client.token, 'POST', '/client-portal/messages', { content: 'Client portal E2E message.' });
check('Client can send feedback to the team', clientMessage.status === 201 || clientMessage.status === 200);
const staffThreads = await api(pm.token, 'GET', '/client-portal/conversations');
check('Managers can access client conversations', staffThreads.status === 200 && staffThreads.data?.length > 0);
const pmCreateClientDenied = await api(pm.token, 'POST', '/client-portal/clients', {
  name: 'Unauthorized E2E client',
  email: 'should-not-be-created@example.test',
  firstName: 'No',
  lastName: 'Access',
  password: `Denied-${Date.now()}-password`,
});
check('Manager cannot provision client accounts', pmCreateClientDenied.status === 403);

const isolationEmail = `portal-isolation-${Date.now()}@example.test`;
const isolationPassword = `Portal-E2E-${Date.now()}-password`;
const isolatedClient = await api(admin.token, 'POST', '/client-portal/clients', {
  name: 'Portal Isolation Test',
  email: isolationEmail,
  firstName: 'Portal',
  lastName: 'Tester',
  password: isolationPassword,
});
check('Admin can provision a client portal account', isolatedClient.status === 201 || isolatedClient.status === 200);
const isolatedLogin = await login(isolationEmail, isolationPassword);
const isolatedDashboard = await api(isolatedLogin.token, 'GET', '/client-portal/dashboard');
const isolatedReview = await api(
  isolatedLogin.token,
  'POST',
  `/client-portal/deliverables/creative/${clientCreative?.id || 'missing'}/versions/${clientCreative?.latestVersion?.id || 'missing'}/review`,
  { action: 'approve' },
);
check(
  'Separate client cannot see another client’s data',
  isolatedLogin.status === 200 &&
    isolatedDashboard.status === 200 &&
    isolatedDashboard.data?.projects?.length === 0 &&
    isolatedDashboard.data?.deliverables?.length === 0 &&
    isolatedReview.status === 404,
);

// 3. Unauthorized access checks
const noAuth = await api(null, 'GET', '/tasks');
check('No-token rejected', noAuth.status === 401, `got ${noAuth.status}`);
const empUsers = await api(emp.token, 'GET', '/users');
check('Employee blocked from /users', empUsers.status === 403, `got ${empUsers.status}`);
const empAudit = await api(emp.token, 'GET', '/audit-logs');
check('Employee blocked from /audit-logs', empAudit.status === 403, `got ${empAudit.status}`);
const empModules = await api(emp.token, 'POST', '/modules', { name: 'hack' });
check('Employee blocked from creating modules', empModules.status === 403, `got ${empModules.status}`);

const hrUsers = await api(hr.token, 'GET', '/users');
check('HR can list users', hrUsers.status === 200 && hrUsers.data.length > 0);

// 4. Full task workflow
const depts = await api(admin.token, 'GET', '/departments');
const itDept = depts.data.find((d) => d.name === 'IT');
const empId = emp.user.id;
const taskRes = await api(admin.token, 'POST', '/tasks', {
  title: 'E2E Test Task', description: 'workflow verification', priority: 'high',
  departmentId: itDept?.id, requiresApproval: true, assigneeIds: [empId],
  deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
});
check('Admin creates task', taskRes.status < 300, JSON.stringify(taskRes.data?.id || taskRes.data));
const taskId = taskRes.data.id;

const myTasks = await api(emp.token, 'GET', '/tasks/my');
check('Employee sees assigned task', myTasks.status === 200 && myTasks.data.tasks.some((t) => t.id === taskId));

const empNotifs = await api(emp.token, 'GET', '/notifications');
check('Employee got assignment notification', empNotifs.data.some((n) => n.title === 'New task assigned'));

const start = await api(emp.token, 'POST', `/tasks/${taskId}/start`);
check('Employee starts task', start.status < 300 && start.data.status === 'in_progress', String(start.data?.status || start.status));

const prog = await api(emp.token, 'POST', `/tasks/${taskId}/progress`, { progress: 60 });
check('Progress update to 60', prog.status < 300 && prog.data.progress === 60);

const sneak = await api(emp.token, 'POST', `/tasks/${taskId}/status`, { status: 'completed' });
check('Employee cannot bypass approval', sneak.status === 403, `got ${sneak.status}`);

const submit = await api(emp.token, 'POST', `/tasks/${taskId}/submit`, { note: 'ready for review' });
check('Submit → in_review', submit.data?.task?.status === 'in_review' && submit.data.completed === false);

const pmNotifs = await api(pm.token, 'GET', '/notifications');
check('PM got submission notification', pmNotifs.data.some((n) => n.title === 'Work submitted for review'));

const changes = await api(pm.token, 'POST', `/tasks/${taskId}/review`, { action: 'changes', feedback: 'needs polish' });
check('PM requests changes', changes.data?.task?.status === 'changes_requested');

await api(emp.token, 'POST', `/tasks/${taskId}/start`);
const resub = await api(emp.token, 'POST', `/tasks/${taskId}/submit`, { note: 'fixed' });
check('Resubmit after changes', resub.data?.task?.status === 'in_review');

const approve = await api(pm.token, 'POST', `/tasks/${taskId}/review`, { action: 'approve', feedback: 'looks good' });
check('Approve → completed', approve.data?.task?.status === 'completed' && approve.data.completed === true);
const final = await api(emp.token, 'GET', `/tasks/${taskId}`);
check('Task persisted completed + completedAt', final.data.status === 'completed' && !!final.data.completedAt);
check('Status history recorded', final.data.statusHistory.length >= 4, `${final.data.statusHistory.length} entries`);

// 5. Non-approval task completes immediately with sound flag
const t2 = await api(admin.token, 'POST', '/tasks', { title: 'Quick task', requiresApproval: false, assigneeIds: [empId] });
await api(emp.token, 'POST', `/tasks/${t2.data.id}/start`);
const sub2 = await api(emp.token, 'POST', `/tasks/${t2.data.id}/submit`, {});
check('No-approval task completes + plays sound', sub2.data?.completed === true && sub2.data?.playCompletionSound === true);

// 6. Creative + video workflow
const designer = await login('designer@epatang.com', staffPassword);
const cr = await api(pm.token, 'POST', '/creatives', { title: 'E2E Banner', brief: 'test banner', dimensions: '1080x1080', assigneeId: designer.user.id });
check('Create creative request', cr.status < 300, JSON.stringify(cr.data?.id || cr.data));
const v = await api(designer.token, 'POST', `/creatives/${cr.data.id}/versions`, { externalUrl: 'https://example.com/v1.png', notes: 'first draft' });
check('Designer uploads version', v.status < 300, JSON.stringify(v.data?.id || v.data));
const crv = await api(admin.token, 'POST', `/creatives/${cr.data.id}/versions/${v.data.id}/review`, { action: 'approve', feedback: 'approved!' });
check('Admin approves creative', crv.data?.status === 'approved');

const vid = await api(admin.token, 'POST', '/videos', { title: 'E2E Video', brief: 'test video', assigneeId: empId });
const vv = await api(emp.token, 'POST', `/videos/${vid.data.id}/versions`, { externalUrl: 'https://example.com/v1.mp4', notes: 'rough cut' });
const vchg = await api(pm.token, 'POST', `/videos/${vid.data.id}/versions/${vv.data.id}/review`, { action: 'changes', feedback: 'fix intro' });
check('Video changes requested', vchg.data?.status === 'changes_requested');

// 7. Leave workflow
const leave = await api(emp.token, 'POST', '/leave', { type: 'sick', startDate: '2026-10-20', endDate: '2026-10-21', reason: 'flu' });
check('Employee applies leave', leave.status < 300);
const decide = await api(hr.token, 'POST', `/leave/${leave.data.id}/decide`, { action: 'approve' });
check('HR approves leave', decide.data?.status === 'approved');
const empLeaveBlock = await api(emp.token, 'POST', `/leave/${leave.data.id}/decide`, { action: 'reject' });
check('Employee cannot decide leave', empLeaveBlock.status === 403, `got ${empLeaveBlock.status}`);

// 8. Preferences + modules
const pref = await api(emp.token, 'PUT', '/preferences', { soundVolume: 40, soundEnabled: true });
check('Save sound prefs', pref.status < 300 && pref.data.soundVolume === 40);
const prefBack = await api(emp.token, 'GET', '/preferences');
check('Prefs persist', prefBack.data.soundVolume === 40);
const mod = await api(admin.token, 'POST', '/modules', { name: 'SEO Audit', key: 'seo-audit-e2e', description: 'test', roles: ['Admin', 'Project Manager'], departmentIds: [] });
check('Admin creates module', mod.status < 300, JSON.stringify(mod.data?.id || mod.data));

// 9. Attendance + announcements + audit
const noPhoto = await api(emp.token, 'POST', '/attendance/check-in');
check('Attendance requires a verification photo', noPhoto.status === 400, `got ${noPhoto.status}`);
const cameraPhoto = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=', 'base64');
const punchInForm = new FormData();
punchInForm.append('photo', new Blob([cameraPhoto], { type: 'image/png' }), 'punch-in.png');
const ciResponse = await fetch(`${BASE}/attendance/check-in`, {
  method: 'POST', headers: { Authorization: `Bearer ${emp.token}` }, body: punchInForm,
});
const ci = { status: ciResponse.status, data: await ciResponse.json().catch(() => null) };
check('Photo-verified check-in works', ci.status < 300 && ci.data?.sessions?.length === 1, JSON.stringify(ci.data?.metrics?.status || ci.data));
const duplicateForm = new FormData();
duplicateForm.append('photo', new Blob([cameraPhoto], { type: 'image/png' }), 'duplicate.png');
const duplicateResponse = await fetch(`${BASE}/attendance/check-in`, {
  method: 'POST', headers: { Authorization: `Bearer ${emp.token}` }, body: duplicateForm,
});
check('Duplicate open-session check-in rejected', duplicateResponse.status === 400, `got ${duplicateResponse.status}`);
const punchOutForm = new FormData();
punchOutForm.append('photo', new Blob([cameraPhoto], { type: 'image/png' }), 'punch-out.png');
const coResponse = await fetch(`${BASE}/attendance/check-out`, {
  method: 'POST', headers: { Authorization: `Bearer ${emp.token}` }, body: punchOutForm,
});
const co = { status: coResponse.status, data: await coResponse.json().catch(() => null) };
check('Photo-verified check-out works', co.status < 300 && !!co.data?.sessions?.[0]?.checkOutPhotoUrl, String(co.status));
const attendanceHistory = await api(emp.token, 'GET', '/attendance?mine=true');
check('Employee history is scoped to own records', attendanceHistory.status === 200 && attendanceHistory.data.every((record) => record.userId === empId));
const ann = await api(admin.token, 'POST', '/announcements', { title: 'E2E Announce', content: 'test' });
check('Create announcement', ann.status < 300);
const audit = await api(admin.token, 'GET', '/audit-logs');
check('Audit logs have entries', audit.status === 200 && audit.data.logs.length > 0, `${audit.data?.pagination?.total} total`);

// 10. File upload (task attachment)
const taskForFile = t2.data.id;
const formData = new FormData();
formData.append('file', new Blob(['hello world'], { type: 'text/plain' }), 'test.txt');
const up = await fetch(`${BASE}/tasks/${taskForFile}/attachments`, {
  method: 'POST', headers: { Authorization: `Bearer ${emp.token}` }, body: formData,
});
const upData = await up.json().catch(() => null);
check('File upload works', up.status < 300 && upData?.url?.startsWith('/uploads/'), upData?.url || String(up.status));

console.log(results.join('\n'));
const fails = results.filter((r) => r.startsWith('FAIL'));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
