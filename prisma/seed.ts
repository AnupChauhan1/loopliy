import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');
  // Production mode (default): seeds only the workspace structure — org,
  // roles, departments, the admin account, org settings and the module
  // registry. All sample/demo data (fake staff, clients, projects, tasks,
  // approvals, the public demo org, etc.) is skipped unless
  // SEED_DEMO_DATA=true is set explicitly.
  const seedDemo = process.env.SEED_DEMO_DATA === 'true';
  const adminPassword = process.env.ADMIN_PASSWORD;
  const staffPassword = process.env.STAFF_PASSWORD;
  const clientPassword = process.env.CLIENT_PASSWORD;
  const demoAdminPassword = process.env.DEMO_ADMIN_PASSWORD;
  const demoManagerPassword = process.env.DEMO_MANAGER_PASSWORD;
  const demoHrPassword = process.env.DEMO_HR_PASSWORD;
  const demoEmployeePassword = process.env.DEMO_EMPLOYEE_PASSWORD;
  const demoClientPassword = process.env.DEMO_CLIENT_PASSWORD;

  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD must be set before seeding the admin account.');
  }
  if (adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters long.');
  }
  if (
    seedDemo &&
    (!staffPassword ||
      !clientPassword ||
      !demoAdminPassword ||
      !demoManagerPassword ||
      !demoHrPassword ||
      !demoEmployeePassword ||
      !demoClientPassword)
  ) {
    throw new Error('Set the private and public-sandbox demo passwords before seeding demo data (SEED_DEMO_DATA=true).');
  }
  if (seedDemo && [adminPassword, staffPassword, clientPassword].some((password) => password!.length < 12)) {
    throw new Error('Private workspace passwords must be at least 12 characters long.');
  }

  // Organization
  const organization = await prisma.organization.upsert({
    where: { slug: 'epatang-agency' },
    update: { name: 'Epatang' },
    create: {
      name: 'Epatang',
      slug: 'epatang-agency',
    },
  });
  console.log('Organization:', organization.name);

  // Roles
  const roles = [
    { name: 'Super Admin', description: 'Full system access' },
    { name: 'Admin', description: 'Company administration' },
    { name: 'Project Manager', description: 'Project management' },
    { name: 'Strategy Approver', description: 'Creative strategy approvals' },
    { name: 'HR Manager', description: 'HR management' },
    { name: 'Employee', description: 'Standard employee' },
    { name: 'Graphic Designer', description: 'Design tasks' },
    { name: 'Video Editor', description: 'Video editing tasks' },
    { name: 'Sales Manager', description: 'Sales management' },
    { name: 'Developer', description: 'Development tasks' },
    { name: 'Client', description: 'Client portal access' },
  ];

  const createdRoles: Record<string, { id: string }> = {};
  for (const role of roles) {
    const created = await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
    createdRoles[role.name] = created;
  }
  console.log('Roles seeded');

  // Departments
  const departmentsData = [
    { name: 'IT', code: 'IT', description: 'Developers, website developers, API developers, technical support and bug fixing', color: '#0ea5e9' },
    { name: 'Sales', code: 'SALES', description: 'Leads, follow-ups, sales tasks, client onboarding', color: '#f59e0b' },
    { name: 'SMM', code: 'SMM', description: 'Social media managers, content creators, graphic designers, video editors', color: '#8b5cf6' },
    { name: 'Operations', code: 'OPS', description: 'Internal operations, coordination, quality checks, delivery management', color: '#10b981' },
  ];

  const departments: Record<string, { id: string }> = {};
  for (const dept of departmentsData) {
    const created = await prisma.department.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: dept.name } },
      update: { description: dept.description, color: dept.color },
      create: { ...dept, organizationId: organization.id },
    });
    departments[dept.name] = created;
  }
  console.log('Departments seeded');

  // Users
  const defaultPassword = await bcrypt.hash(adminPassword, 10);
  const staffPasswordHash = seedDemo ? await bcrypt.hash(staffPassword!, 10) : '';
  const clientPasswordHash = seedDemo ? await bcrypt.hash(clientPassword!, 12) : '';
  const demoAdminPasswordHash = seedDemo ? await bcrypt.hash(demoAdminPassword!, 12) : '';
  const demoManagerPasswordHash = seedDemo ? await bcrypt.hash(demoManagerPassword!, 12) : '';
  const demoHrPasswordHash = seedDemo ? await bcrypt.hash(demoHrPassword!, 12) : '';
  const demoEmployeePasswordHash = seedDemo ? await bcrypt.hash(demoEmployeePassword!, 12) : '';
  const demoClientPasswordHash = seedDemo ? await bcrypt.hash(demoClientPassword!, 12) : '';

  const usersData = [
    { email: 'admin@epatang.com', passwordHash: defaultPassword, firstName: 'Admin', lastName: 'User', roles: ['Super Admin'], dept: 'Operations', designation: 'System Administrator', empId: 'DD-001' },
    { email: 'pm@epatang.com', passwordHash: staffPasswordHash, firstName: 'Priya', lastName: 'Sharma', roles: ['Project Manager'], dept: 'Operations', designation: 'Project Manager', empId: 'DD-002' },
    { email: 'hr@epatang.com', passwordHash: staffPasswordHash, firstName: 'Rachel', lastName: 'HR', roles: ['HR Manager'], dept: 'Operations', designation: 'HR Manager', empId: 'DD-003' },
    { email: 'employee@epatang.com', passwordHash: staffPasswordHash, firstName: 'John', lastName: 'Doe', roles: ['Employee', 'Developer'], dept: 'IT', designation: 'Software Developer', empId: 'DD-004' },
    { email: 'designer@epatang.com', passwordHash: staffPasswordHash, firstName: 'Sarah', lastName: 'Design', roles: ['Employee', 'Graphic Designer'], dept: 'SMM', designation: 'Graphic Designer', empId: 'DD-005' },
    { email: 'editor@epatang.com', passwordHash: staffPasswordHash, firstName: 'Mike', lastName: 'Video', roles: ['Employee', 'Video Editor'], dept: 'SMM', designation: 'Video Editor', empId: 'DD-006' },
    { email: 'sales@epatang.com', passwordHash: staffPasswordHash, firstName: 'Sam', lastName: 'Sales', roles: ['Sales Manager'], dept: 'Sales', designation: 'Sales Manager', empId: 'DD-007' },
  ];

  const users: Record<string, { id: string }> = {};
  const usersToSeed = seedDemo ? usersData : usersData.filter((u) => u.email === 'admin@epatang.com');
  for (const u of usersToSeed) {
    const { roles: roleNames, dept, designation, empId, ...fields } = u;
    const user = await prisma.user.upsert({
      where: { email: fields.email },
      update: { departmentId: departments[dept].id, passwordHash: fields.passwordHash, isActive: true },
      create: { ...fields, organizationId: organization.id, departmentId: departments[dept].id },
    });
    users[fields.email] = user;

    for (const roleName of roleNames) {
      const role = createdRoles[roleName];
      if (role) {
        const existing = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
        if (!existing) {
          await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
        }
      }
    }

    await prisma.employeeProfile.upsert({
      where: { userId: user.id },
      update: { designation, employeeId: empId, reportingManager: 'Priya Sharma' },
      create: {
        userId: user.id,
        employeeId: empId,
        designation,
        reportingManager: 'Priya Sharma',
        dateOfJoining: new Date('2025-01-15'),
        employmentStatus: 'active',
        leaveBalance: 20,
      },
    });
    console.log('User:', user.email);
  }

  // Department heads (demo staff only exist when SEED_DEMO_DATA=true)
  if (seedDemo) {
    await prisma.department.update({ where: { id: departments['IT'].id }, data: { headId: users['pm@epatang.com'].id } });
    await prisma.department.update({ where: { id: departments['SMM'].id }, data: { headId: users['pm@epatang.com'].id } });
    await prisma.department.update({ where: { id: departments['Sales'].id }, data: { headId: users['sales@epatang.com'].id } });
    await prisma.department.update({ where: { id: departments['Operations'].id }, data: { headId: users['admin@epatang.com'].id } });
  }

  // Organization settings
  await prisma.organizationSettings.upsert({
    where: { organizationId: organization.id },
    update: { brandName: 'LOOPLY', soundEnabled: true },
    create: { organizationId: organization.id, brandName: 'LOOPLY', soundEnabled: true, primaryColor: '#10b981' },
  });

  // Default module registry
  const defaultModules = [
    { key: 'tasks', name: 'Tasks', icon: 'CheckSquare', roles: ['Super Admin', 'Admin', 'Project Manager', 'HR Manager', 'Employee'], menuPosition: 10 },
    { key: 'projects', name: 'Projects', icon: 'FolderKanban', roles: ['Super Admin', 'Admin', 'Project Manager'], menuPosition: 20 },
    { key: 'creative', name: 'Creative Approvals', icon: 'Palette', roles: ['Super Admin', 'Admin', 'Project Manager', 'Strategy Approver', 'Graphic Designer', 'Employee'], menuPosition: 30, departmentIds: [departments['SMM'].id] },
    { key: 'video', name: 'Video Approvals', icon: 'Clapperboard', roles: ['Super Admin', 'Admin', 'Project Manager', 'Video Editor', 'Employee'], menuPosition: 40, departmentIds: [departments['SMM'].id] },
    { key: 'departments', name: 'Departments', icon: 'Network', roles: ['Super Admin', 'Admin'], menuPosition: 50 },
    { key: 'employees', name: 'Employees', icon: 'Users', roles: ['Super Admin', 'Admin', 'HR Manager'], menuPosition: 60 },
    { key: 'leave', name: 'Leave', icon: 'CalendarOff', roles: ['Super Admin', 'Admin', 'HR Manager', 'Project Manager', 'Employee'], menuPosition: 70 },
    { key: 'announcements', name: 'Announcements', icon: 'Megaphone', roles: ['Super Admin', 'Admin', 'HR Manager', 'Project Manager', 'Employee'], menuPosition: 80 },
    { key: 'modules', name: 'Modules', icon: 'LayoutGrid', roles: ['Super Admin', 'Admin'], menuPosition: 90 },
    { key: 'audit', name: 'Audit Logs', icon: 'ScrollText', roles: ['Super Admin', 'Admin'], menuPosition: 95 },
  ];
  for (const m of defaultModules) {
    await prisma.moduleConfig.upsert({
      where: { organizationId_key: { organizationId: organization.id, key: m.key } },
      update: { name: m.name, icon: m.icon, roles: m.roles, menuPosition: m.menuPosition, departmentIds: (m as any).departmentIds ?? [] },
      create: { ...m, organizationId: organization.id },
    });
  }
  console.log('Modules seeded');

  if (!seedDemo) {
    console.log('SEED_DEMO_DATA is not "true" — skipping all sample/demo data.');
    console.log('Core workspace ready: organization, roles, departments, admin account, settings, modules.');
    return;
  }

  // Demo client + project
  const client = await prisma.client.upsert({
    where: { id: 'demo-client-id' },
    update: { name: 'Acme Corp', email: 'client@acme.com', status: 'active' },
    create: { id: 'demo-client-id', name: 'Acme Corp', email: 'client@acme.com', status: 'active', organizationId: organization.id },
  });
  const clientUser = await prisma.user.upsert({
    where: { email: 'client@acme.com' },
    update: {
      passwordHash: clientPasswordHash,
      firstName: 'Alex',
      lastName: 'Morgan',
      organizationId: organization.id,
      isActive: true,
    },
    create: {
      email: 'client@acme.com',
      passwordHash: clientPasswordHash,
      firstName: 'Alex',
      lastName: 'Morgan',
      organizationId: organization.id,
    },
  });
  const clientRole = createdRoles.Client;
  const clientUserRole = await prisma.userRole.findFirst({ where: { userId: clientUser.id, roleId: clientRole.id } });
  if (!clientUserRole) {
    await prisma.userRole.create({ data: { userId: clientUser.id, roleId: clientRole.id } });
  }
  await prisma.client.update({ where: { id: client.id }, data: { portalUserId: clientUser.id } });

  const pmUser = users['pm@epatang.com'];
  const project = await prisma.project.upsert({
    where: { id: 'demo-project-id' },
    update: { status: 'active', departmentId: departments['IT'].id, ownerId: pmUser.id },
    create: {
      id: 'demo-project-id',
      name: 'Website Redesign',
      description: 'Complete website redesign for Acme Corp',
      status: 'active',
      priority: 'high',
      startDate: new Date(),
      deadline: new Date(Date.now() + 30 * 86400000),
      budget: 10000,
      progress: 25,
      organizationId: organization.id,
      clientId: client.id,
      ownerId: pmUser.id,
      departmentId: departments['IT'].id,
    },
  });

  // Normalize legacy statuses
  await prisma.task.updateMany({ where: { status: 'ongoing' }, data: { status: 'in_progress' } });
  await prisma.task.updateMany({ where: { status: 'blocked' }, data: { status: 'on_hold' } });
  await prisma.task.updateMany({ where: { status: 'revision_required' }, data: { status: 'changes_requested' } });

  // Demo tasks assigned to employees across departments
  const demoTasks = [
    { title: 'Build login page UI', dept: 'IT', assignee: 'employee@epatang.com', status: 'in_progress', priority: 'high', requiresApproval: true, progress: 40, daysOut: 3, category: 'development' },
    { title: 'Fix API pagination bug', dept: 'IT', assignee: 'employee@epatang.com', status: 'todo', priority: 'urgent', requiresApproval: false, daysOut: 1, category: 'bugfix' },
    { title: 'Design Instagram carousel', dept: 'SMM', assignee: 'designer@epatang.com', status: 'in_review', priority: 'medium', requiresApproval: true, progress: 90, daysOut: 2, category: 'design' },
    { title: 'Edit product promo video', dept: 'SMM', assignee: 'editor@epatang.com', status: 'todo', priority: 'high', requiresApproval: true, daysOut: 5, category: 'video' },
    { title: 'Follow up with Acme Corp', dept: 'Sales', assignee: 'sales@epatang.com', status: 'todo', priority: 'medium', requiresApproval: false, daysOut: 4, category: 'sales' },
    { title: 'Weekly ops sync notes', dept: 'Operations', assignee: 'pm@epatang.com', status: 'completed', priority: 'low', requiresApproval: false, daysOut: -1, category: 'operations' },
  ];

  let seq = 1;
  for (const t of demoTasks) {
    const existing = await prisma.task.findFirst({ where: { title: t.title, project: { organizationId: organization.id } } });
    if (existing) continue;
    const task = await prisma.task.create({
      data: {
        taskNumber: `DD-${String(seq++).padStart(3, '0')}`,
        title: t.title,
        description: `${t.title} — seeded demo task`,
        status: t.status,
        priority: t.priority,
        category: t.category,
        progress: t.progress ?? (t.status === 'completed' ? 100 : 0),
        requiresApproval: t.requiresApproval,
        deadline: new Date(Date.now() + t.daysOut * 86400000),
        completedAt: t.status === 'completed' ? new Date() : null,
        projectId: project.id,
        departmentId: departments[t.dept].id,
        createdById: pmUser.id,
      },
    });
    await prisma.taskAssignee.create({ data: { taskId: task.id, userId: users[t.assignee].id } });
    await prisma.taskStatusHistory.create({ data: { taskId: task.id, fromStatus: 'todo', toStatus: t.status, changedBy: pmUser.id } });
  }
  const clientVisibleTask = await prisma.task.findFirst({
    where: { title: 'Review landing page wireframe', projectId: project.id },
  });
  if (clientVisibleTask) {
    await prisma.task.update({
      where: { id: clientVisibleTask.id },
      data: { clientVisible: true, status: 'in_progress', progress: 55 },
    });
  } else {
    const task = await prisma.task.create({
      data: {
        title: 'Review landing page wireframe',
        description: 'Review the proposed homepage layout and share feedback.',
        status: 'in_progress',
        priority: 'medium',
        category: 'design',
        progress: 55,
        clientVisible: true,
        deadline: new Date(Date.now() + 5 * 86400000),
        projectId: project.id,
        departmentId: departments['IT'].id,
        createdById: pmUser.id,
      },
    });
    await prisma.taskAssignee.create({ data: { taskId: task.id, userId: users['designer@epatang.com'].id } });
    await prisma.taskStatusHistory.create({
      data: { taskId: task.id, fromStatus: 'todo', toStatus: 'in_progress', changedBy: pmUser.id },
    });
  }
  console.log('Tasks seeded');

  // Demo creative + video requests
  const existingCreative = await prisma.creativeRequest.findFirst({ where: { title: 'Instagram banner set', organizationId: organization.id } });
  if (!existingCreative) {
    const cr = await prisma.creativeRequest.create({
      data: {
        title: 'Instagram banner set',
        brief: '3 carousel banners for product launch, brand colors',
        dimensions: '1080x1080',
        format: 'PNG',
        requirements: 'Follow brand guide v2',
        status: 'in_progress',
        priority: 'high',
        deadline: new Date(Date.now() + 4 * 86400000),
        organizationId: organization.id,
        departmentId: departments['SMM'].id,
        projectId: project.id,
        createdById: pmUser.id,
        assigneeId: users['designer@epatang.com'].id,
        reviewerId: pmUser.id,
      },
    });
    await prisma.creativeVersion.create({
      data: { requestId: cr.id, version: 1, externalUrl: 'https://placehold.co/1080x1080/10b981/ffffff?text=Draft+v1', notes: 'First draft', status: 'submitted', uploadedById: users['designer@epatang.com'].id },
    });
  }

  let clientCreative = await prisma.creativeRequest.findFirst({
    where: { title: 'Acme homepage design concept', organizationId: organization.id },
  });
  if (!clientCreative) {
    clientCreative = await prisma.creativeRequest.create({
      data: {
        title: 'Acme homepage design concept',
        brief: 'First homepage design direction for the Website Redesign project.',
        dimensions: '1440x900',
        format: 'PNG',
        requirements: 'Review the visual direction and request changes if needed.',
        status: 'delivered',
        priority: 'high',
        deadline: new Date(Date.now() + 3 * 86400000),
        organizationId: organization.id,
        departmentId: departments['IT'].id,
        projectId: project.id,
        clientId: client.id,
        createdById: pmUser.id,
        assigneeId: users['designer@epatang.com'].id,
        reviewerId: pmUser.id,
      },
    });
  } else {
    clientCreative = await prisma.creativeRequest.update({
      where: { id: clientCreative.id },
      data: { status: 'delivered', clientId: client.id, projectId: project.id },
    });
  }
  await prisma.creativeVersion.upsert({
    where: { requestId_version: { requestId: clientCreative.id, version: 1 } },
    update: {
      externalUrl: 'https://placehold.co/1440x900/10b981/ffffff?text=Acme+Homepage+Concept',
      fileUrl: null,
      fileName: 'acme-homepage-concept.png',
      mimeType: 'image/png',
      notes: 'First design direction for client review.',
      status: 'submitted',
      feedback: null,
      uploadedById: users['designer@epatang.com'].id,
    },
    create: {
      requestId: clientCreative.id,
      version: 1,
      externalUrl: 'https://placehold.co/1440x900/10b981/ffffff?text=Acme+Homepage+Concept',
      fileName: 'acme-homepage-concept.png',
      mimeType: 'image/png',
      notes: 'First design direction for client review.',
      status: 'submitted',
      uploadedById: users['designer@epatang.com'].id,
    },
  });

  const existingVideo = await prisma.videoRequest.findFirst({ where: { title: 'Product teaser reel', organizationId: organization.id } });
  if (!existingVideo) {
    await prisma.videoRequest.create({
      data: {
        title: 'Product teaser reel',
        brief: '15-second teaser for social launch',
        requirements: 'Vertical 9:16, captions burned in',
        sourceLink: 'https://example.com/raw-footage',
        status: 'editing',
        priority: 'medium',
        deadline: new Date(Date.now() + 7 * 86400000),
        organizationId: organization.id,
        departmentId: departments['SMM'].id,
        createdById: pmUser.id,
        assigneeId: users['editor@epatang.com'].id,
        reviewerId: pmUser.id,
      },
    });
  }

  let clientVideo = await prisma.videoRequest.findFirst({
    where: { title: 'Acme launch preview', organizationId: organization.id },
  });
  if (!clientVideo) {
    clientVideo = await prisma.videoRequest.create({
      data: {
        title: 'Acme launch preview',
        brief: 'Short sample video deliverable for the Website Redesign launch.',
        requirements: 'Review the preview and share any requested changes.',
        status: 'delivered',
        priority: 'medium',
        deadline: new Date(Date.now() + 6 * 86400000),
        projectId: project.id,
        organizationId: organization.id,
        createdById: pmUser.id,
        assigneeId: users['editor@epatang.com'].id,
        reviewerId: pmUser.id,
      },
    });
  } else {
    clientVideo = await prisma.videoRequest.update({
      where: { id: clientVideo.id },
      data: { status: 'delivered', projectId: project.id },
    });
  }
  await prisma.videoVersion.upsert({
    where: { requestId_version: { requestId: clientVideo.id, version: 1 } },
    update: {
      externalUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      fileUrl: null,
      fileName: 'acme-launch-preview.mp4',
      mimeType: 'video/mp4',
      notes: 'Sample video preview for client review.',
      status: 'submitted',
      feedback: null,
      uploadedById: users['editor@epatang.com'].id,
    },
    create: {
      requestId: clientVideo.id,
      version: 1,
      externalUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      fileName: 'acme-launch-preview.mp4',
      mimeType: 'video/mp4',
      notes: 'Sample video preview for client review.',
      status: 'submitted',
      uploadedById: users['editor@epatang.com'].id,
    },
  });

  const existingClientConversation = await prisma.conversation.findFirst({
    where: { clientId: client.id, type: 'client_portal' },
  });
  const clientConversation = existingClientConversation
    ? await prisma.conversation.update({
        where: { id: existingClientConversation.id },
        data: { name: `${client.name} Client Portal` },
      })
    : await prisma.conversation.create({
        data: { clientId: client.id, type: 'client_portal', name: `${client.name} Client Portal` },
      });
  await prisma.conversationMember.createMany({
    data: [clientUser.id, pmUser.id, users['admin@epatang.com'].id].map((userId) => ({
      conversationId: clientConversation.id,
      userId,
    })),
    skipDuplicates: true,
  });
  const sampleClientMessage = await prisma.message.findFirst({
    where: { conversationId: clientConversation.id, userId: clientUser.id },
  });
  if (!sampleClientMessage) {
    await prisma.message.create({
      data: {
        conversationId: clientConversation.id,
        userId: clientUser.id,
        content: 'Thanks for sharing the first homepage concept. We will review it with our team and send feedback here.',
      },
    });
  }
  const sampleProjectFile = await prisma.projectFile.findFirst({
    where: { projectId: project.id, name: 'Acme brand direction preview' },
  });
  if (!sampleProjectFile) {
    await prisma.projectFile.create({
      data: {
        projectId: project.id,
        name: 'Acme brand direction preview',
        url: 'https://placehold.co/1200x800/10b981/ffffff?text=Acme+Brand+Direction',
        mimeType: 'image/png',
        uploadedBy: pmUser.id,
      },
    });
  }

  // Announcement + holiday + leave
  const existingAnn = await prisma.announcement.findFirst({ where: { title: 'Welcome to Epatang', organizationId: organization.id } });
  if (!existingAnn) {
    await prisma.announcement.create({
      data: { title: 'Welcome to Epatang', content: 'Our new task & approval system is live. Reach out to Priya with questions.', authorId: users['admin@epatang.com'].id, organizationId: organization.id },
    });
  }

  const holiday = await prisma.holiday.findFirst({ where: { name: 'Diwali', organizationId: organization.id } });
  if (!holiday) {
    await prisma.holiday.create({ data: { name: 'Diwali', date: new Date('2026-11-08'), organizationId: organization.id } });
    await prisma.holiday.create({ data: { name: 'New Year', date: new Date('2027-01-01'), organizationId: organization.id } });
  }

  const existingLeave = await prisma.leaveRequest.findFirst({ where: { userId: users['employee@epatang.com'].id } });
  if (!existingLeave) {
    await prisma.leaveRequest.create({
      data: { userId: users['employee@epatang.com'].id, type: 'casual', startDate: new Date(Date.now() + 10 * 86400000), endDate: new Date(Date.now() + 11 * 86400000), days: 2, reason: 'Family event', status: 'pending' },
    });
  }

  // Public demo users live in an isolated organization with synthetic records only.
  const demoOrganization = await prisma.organization.upsert({
    where: { slug: 'loopli-public-demo' },
    update: { name: 'LOOPLY Public Demo' },
    create: { name: 'LOOPLY Public Demo', slug: 'loopli-public-demo' },
  });
  const demoDepartmentData = [
    { name: 'Operations', code: 'DEMO-OPS', description: 'Public demo operations', color: '#10b981' },
    { name: 'Creative', code: 'DEMO-CREATIVE', description: 'Public demo creative team', color: '#8b5cf6' },
  ];
  const demoDepartments: Record<string, { id: string }> = {};
  for (const department of demoDepartmentData) {
    demoDepartments[department.name] = await prisma.department.upsert({
      where: { organizationId_name: { organizationId: demoOrganization.id, name: department.name } },
      update: { description: department.description, color: department.color },
      create: { ...department, organizationId: demoOrganization.id },
    });
  }
  await prisma.organizationSettings.upsert({
    where: { organizationId: demoOrganization.id },
    update: { brandName: 'LOOPLY DEMO' },
    create: { organizationId: demoOrganization.id, brandName: 'LOOPLY DEMO' },
  });

  const publicDemoUsersData = [
    { email: 'admin@loopli.com', firstName: 'Demo', lastName: 'Admin', roleName: 'Super Admin', department: 'Operations', designation: 'Demo Administrator', employeeId: 'LP-DEMO-001', passwordHash: demoAdminPasswordHash },
    { email: 'manager@loopli.com', firstName: 'Demo', lastName: 'Manager', roleName: 'Project Manager', department: 'Operations', designation: 'Demo Project Manager', employeeId: 'LP-DEMO-002', passwordHash: demoManagerPasswordHash },
    { email: 'hr@loopli.com', firstName: 'Demo', lastName: 'HR', roleName: 'HR Manager', department: 'Operations', designation: 'Demo HR Manager', employeeId: 'LP-DEMO-003', passwordHash: demoHrPasswordHash },
    { email: 'employee@loopli.com', firstName: 'Demo', lastName: 'Employee', roleName: 'Employee', department: 'Creative', designation: 'Demo Designer', employeeId: 'LP-DEMO-004', passwordHash: demoEmployeePasswordHash },
  ];
  const publicDemoUsers: Record<string, { id: string }> = {};
  for (const demoUser of publicDemoUsersData) {
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      update: {
        passwordHash: demoUser.passwordHash,
        firstName: demoUser.firstName,
        lastName: demoUser.lastName,
        organizationId: demoOrganization.id,
        departmentId: demoDepartments[demoUser.department].id,
        isActive: true,
      },
      create: {
        email: demoUser.email,
        passwordHash: demoUser.passwordHash,
        firstName: demoUser.firstName,
        lastName: demoUser.lastName,
        organizationId: demoOrganization.id,
        departmentId: demoDepartments[demoUser.department].id,
      },
    });
    publicDemoUsers[demoUser.email] = user;
    const role = createdRoles[demoUser.roleName];
    const userRole = await prisma.userRole.findFirst({ where: { userId: user.id, roleId: role.id } });
    if (!userRole) await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await prisma.employeeProfile.upsert({
      where: { userId: user.id },
      update: { designation: demoUser.designation, employeeId: demoUser.employeeId, reportingManager: 'Demo Manager' },
      create: {
        userId: user.id,
        employeeId: demoUser.employeeId,
        designation: demoUser.designation,
        reportingManager: 'Demo Manager',
        dateOfJoining: new Date('2025-01-15'),
        employmentStatus: 'active',
        leaveBalance: 20,
      },
    });
  }

  const demoClient = await prisma.client.upsert({
    where: { id: 'public-demo-client-id' },
    update: {
      name: 'Northstar Studio',
      email: 'client@loopli.com',
      status: 'active',
    },
    create: {
      id: 'public-demo-client-id',
      name: 'Northstar Studio',
      email: 'client@loopli.com',
      status: 'active',
      organizationId: demoOrganization.id,
    },
  });
  const demoClientUser = await prisma.user.upsert({
    where: { email: 'client@loopli.com' },
    update: {
      passwordHash: demoClientPasswordHash,
      firstName: 'Demo',
      lastName: 'Client',
      organizationId: demoOrganization.id,
      isActive: true,
    },
    create: {
      email: 'client@loopli.com',
      passwordHash: demoClientPasswordHash,
      firstName: 'Demo',
      lastName: 'Client',
      organizationId: demoOrganization.id,
    },
  });
  publicDemoUsers[demoClientUser.email] = demoClientUser;
  const demoClientRole = createdRoles.Client;
  const demoClientUserRole = await prisma.userRole.findFirst({
    where: { userId: demoClientUser.id, roleId: demoClientRole.id },
  });
  if (!demoClientUserRole) {
    await prisma.userRole.create({ data: { userId: demoClientUser.id, roleId: demoClientRole.id } });
  }
  await prisma.client.update({
    where: { id: demoClient.id },
    data: { portalUserId: demoClientUser.id },
  });
  await prisma.user.updateMany({
    where: {
      organizationId: demoOrganization.id,
      email: {
        in: [
          'demo-admin@loopli.com',
          'demo-manager@loopli.com',
          'demo-hr@loopli.com',
          'demo-employee@loopli.com',
          'demo-client@loopli.com',
        ],
      },
    },
    data: { isActive: false },
  });

  const demoManager = publicDemoUsers['manager@loopli.com'];
  const demoEmployee = publicDemoUsers['employee@loopli.com'];
  const demoProject = await prisma.project.upsert({
    where: { id: 'public-demo-project-id' },
    update: {
      name: 'Northstar Website Refresh',
      description: 'A sample client project showing progress, shared tasks and approvals.',
      status: 'active',
      progress: 45,
      clientId: demoClient.id,
      ownerId: demoManager.id,
    },
    create: {
      id: 'public-demo-project-id',
      name: 'Northstar Website Refresh',
      description: 'A sample client project showing progress, shared tasks and approvals.',
      status: 'active',
      priority: 'high',
      startDate: new Date(),
      deadline: new Date(Date.now() + 30 * 86400000),
      progress: 45,
      organizationId: demoOrganization.id,
      clientId: demoClient.id,
      ownerId: demoManager.id,
      departmentId: demoDepartments.Operations.id,
    },
  });
  const demoMilestone = await prisma.milestone.findFirst({
    where: { projectId: demoProject.id, name: 'Homepage design review' },
  });
  if (!demoMilestone) {
    await prisma.milestone.create({
      data: {
        projectId: demoProject.id,
        name: 'Homepage design review',
        description: 'Review and approve the initial visual direction.',
        dueDate: new Date(Date.now() + 5 * 86400000),
        status: 'in_progress',
      },
    });
  }

  const demoVisibleTask = await prisma.task.findFirst({
    where: { projectId: demoProject.id, title: 'Review landing page wireframe' },
  });
  if (demoVisibleTask) {
    await prisma.task.update({
      where: { id: demoVisibleTask.id },
      data: { status: 'in_progress', progress: 55, clientVisible: true },
    });
  } else {
    const task = await prisma.task.create({
      data: {
        title: 'Review landing page wireframe',
        description: 'Review the proposed homepage layout and share feedback.',
        status: 'in_progress',
        priority: 'medium',
        category: 'design',
        progress: 55,
        clientVisible: true,
        deadline: new Date(Date.now() + 5 * 86400000),
        projectId: demoProject.id,
        departmentId: demoDepartments.Creative.id,
        createdById: demoManager.id,
      },
    });
    await prisma.taskAssignee.create({ data: { taskId: task.id, userId: demoEmployee.id } });
    await prisma.taskStatusHistory.create({
      data: { taskId: task.id, fromStatus: 'todo', toStatus: 'in_progress', changedBy: demoManager.id },
    });
  }
  const demoInternalTask = await prisma.task.findFirst({
    where: { projectId: demoProject.id, title: 'Prepare internal project estimate' },
  });
  if (!demoInternalTask) {
    await prisma.task.create({
      data: {
        title: 'Prepare internal project estimate',
        description: 'An internal-only task that must never appear in the client portal.',
        status: 'todo',
        priority: 'medium',
        clientVisible: false,
        projectId: demoProject.id,
        departmentId: demoDepartments.Operations.id,
        createdById: demoManager.id,
      },
    });
  }

  let demoCreative = await prisma.creativeRequest.findFirst({
    where: { title: 'Northstar homepage design concept', organizationId: demoOrganization.id },
  });
  if (!demoCreative) {
    demoCreative = await prisma.creativeRequest.create({
      data: {
        title: 'Northstar homepage design concept',
        brief: 'Initial visual direction for the Northstar website refresh.',
        dimensions: '1440x900',
        format: 'PNG',
        status: 'delivered',
        priority: 'high',
        deadline: new Date(Date.now() + 3 * 86400000),
        organizationId: demoOrganization.id,
        departmentId: demoDepartments.Creative.id,
        projectId: demoProject.id,
        clientId: demoClient.id,
        createdById: demoManager.id,
        assigneeId: demoEmployee.id,
        reviewerId: demoManager.id,
      },
    });
  } else {
    demoCreative = await prisma.creativeRequest.update({
      where: { id: demoCreative.id },
      data: { status: 'delivered', projectId: demoProject.id, clientId: demoClient.id },
    });
  }
  await prisma.creativeVersion.upsert({
    where: { requestId_version: { requestId: demoCreative.id, version: 1 } },
    update: {
      externalUrl: 'https://placehold.co/1440x900/10b981/ffffff?text=Northstar+Homepage+Concept',
      fileUrl: null,
      fileName: 'northstar-homepage-concept.png',
      mimeType: 'image/png',
      notes: 'First design direction ready for client review.',
      status: 'submitted',
      feedback: null,
      uploadedById: demoEmployee.id,
    },
    create: {
      requestId: demoCreative.id,
      version: 1,
      externalUrl: 'https://placehold.co/1440x900/10b981/ffffff?text=Northstar+Homepage+Concept',
      fileName: 'northstar-homepage-concept.png',
      mimeType: 'image/png',
      notes: 'First design direction ready for client review.',
      status: 'submitted',
      uploadedById: demoEmployee.id,
    },
  });

  let demoVideo = await prisma.videoRequest.findFirst({
    where: { title: 'Northstar launch preview', organizationId: demoOrganization.id },
  });
  if (!demoVideo) {
    demoVideo = await prisma.videoRequest.create({
      data: {
        title: 'Northstar launch preview',
        brief: 'Short sample video deliverable for the website refresh.',
        requirements: 'Review the preview and share any requested changes.',
        status: 'delivered',
        priority: 'medium',
        deadline: new Date(Date.now() + 6 * 86400000),
        projectId: demoProject.id,
        organizationId: demoOrganization.id,
        createdById: demoManager.id,
        assigneeId: demoEmployee.id,
        reviewerId: demoManager.id,
      },
    });
  } else {
    demoVideo = await prisma.videoRequest.update({
      where: { id: demoVideo.id },
      data: { status: 'delivered', projectId: demoProject.id },
    });
  }
  await prisma.videoVersion.upsert({
    where: { requestId_version: { requestId: demoVideo.id, version: 1 } },
    update: {
      externalUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      fileUrl: null,
      fileName: 'northstar-launch-preview.mp4',
      mimeType: 'video/mp4',
      notes: 'Sample video preview for client review.',
      status: 'submitted',
      feedback: null,
      uploadedById: demoEmployee.id,
    },
    create: {
      requestId: demoVideo.id,
      version: 1,
      externalUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
      fileName: 'northstar-launch-preview.mp4',
      mimeType: 'video/mp4',
      notes: 'Sample video preview for client review.',
      status: 'submitted',
      uploadedById: demoEmployee.id,
    },
  });
  const demoConversation = await prisma.conversation.findFirst({
    where: { clientId: demoClient.id, type: 'client_portal' },
  }) ?? await prisma.conversation.create({
    data: { clientId: demoClient.id, type: 'client_portal', name: `${demoClient.name} Client Portal` },
  });
  await prisma.conversationMember.createMany({
    data: [demoClientUser.id, demoManager.id, publicDemoUsers['admin@loopli.com'].id].map((userId) => ({
      conversationId: demoConversation.id,
      userId,
    })),
    skipDuplicates: true,
  });
  const demoMessage = await prisma.message.findFirst({
    where: { conversationId: demoConversation.id, userId: demoClientUser.id },
  });
  if (!demoMessage) {
    await prisma.message.create({
      data: {
        conversationId: demoConversation.id,
        userId: demoClientUser.id,
        content: 'Thanks for sharing the first homepage concept. We will review it and send feedback here.',
      },
    });
  }
  const demoProjectFile = await prisma.projectFile.findFirst({
    where: { projectId: demoProject.id, name: 'Northstar brand direction preview' },
  });
  if (!demoProjectFile) {
    await prisma.projectFile.create({
      data: {
        projectId: demoProject.id,
        name: 'Northstar brand direction preview',
        url: 'https://placehold.co/1200x800/10b981/ffffff?text=Northstar+Brand+Direction',
        mimeType: 'image/png',
        uploadedBy: demoManager.id,
      },
    });
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
