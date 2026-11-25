'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Filter, Search, MoreHorizontal, Calendar, Users, TrendingUp, FolderKanban, X, Pencil, Trash2, Loader2, RefreshCw } from 'lucide-react';
import api from '@/lib/api-client';
import { useToast, errorMessage } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { SMM_CYCLE_1, PROJECT_SERVICES, SmmTaskSpec, dueDateFor, fmtShortDate, todayInputValue } from '@/lib/smm-template';
import { useAuth } from '@/lib/auth-context';
import { isManager } from '@/lib/roles';
import { fullName } from '@/lib/format';

const LEAD_ROLE_NAMES = ['Super Admin', 'Admin', 'Project Manager', 'HR Manager'];
const NON_EMPLOYEE_ROLES = [...LEAD_ROLE_NAMES, 'Client'];

interface Project {
  id: string;
  name: string;
  description?: string;
  section?: string;
  status: string;
  priority: string;
  startDate?: string;
  deadline?: string;
  progress: number;
  client?: {
    id: string;
    name: string;
  };
  owner: {
    id: string;
    firstName: string;
    lastName: string;
  };
  members: Array<{
    user: {
      id: string;
      firstName: string;
      lastName: string;
    };
  }>;
  _count?: {
    tasks: number;
  };
  projectType?: string;
  tenureUnit?: string;
  tenureValue?: number;
  planStructure?: string;
  service?: string;
  currentCycle?: number;
  cycleStartDate?: string;
}

const SECTIONS = [
  { value: 'all', label: 'All Sections' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'it', label: 'IT' },
  { value: 'facilities', label: 'Facilities' },
  { value: 'template_set', label: 'Template Set' },
  { value: 'floors', label: 'Floors' },
  { value: 'work', label: 'Work' },
];

export default function ProjectsPage() {
  const { user, role } = useAuth();
  const currentUserIsManager = isManager(role);
  const [filter, setFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    status: 'planning',
    priority: 'medium',
    section: 'corporate',
    startDate: '',
    deadline: '',
  });
  const [formError, setFormError] = useState('');
  const toast = useToast();
  const queryClient = useQueryClient();

  // Smart create-project wizard state (zero manual task-date entry)
  const emptySmart = {
    name: '',
    description: '',
    startDate: todayInputValue(),
    projectType: 'recurring',
    tenureUnit: 'months',
    tenureValue: 1,
    planStructure: 'fixed',
    service: 'smm',
    managerId: '',
    employeeIds: [] as string[],
  };
  const [smart, setSmart] = useState(emptySmart);
  const [smmTasks, setSmmTasks] = useState<SmmTaskSpec[]>(SMM_CYCLE_1);
  const [customTasks, setCustomTasks] = useState<{ title: string; dayOffset: number }[]>([]);

  const isFixedSmm = smart.planStructure === 'fixed' && smart.service === 'smm';
  const showTemplatePreview = isFixedSmm;
  const showCustomTasks = !isFixedSmm;

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['projects', { status: filter, section: sectionFilter }],
    queryFn: () => api.get('/projects', {
      params: {
        ...(filter !== 'all' && { status: filter }),
        ...(sectionFilter !== 'all' && { section: sectionFilter }),
      }
    }).then(res => res.data),
  });

  // Team directory for the Assign Project section (only needed while the modal is open)
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: showCreateModal,
  });

  const allUsers: any[] = usersData ?? [];
  const leadOptions = allUsers.filter(
    (u) => u.isActive !== false && (u.roleNames ?? []).some((r: string) => LEAD_ROLE_NAMES.includes(r)),
  );
  const employeeOptions = allUsers.filter(
    (u) => u.isActive !== false && !(u.roleNames ?? []).some((r: string) => NON_EMPLOYEE_ROLES.includes(r)),
  );

  // Auto-select the logged-in manager/admin as project lead when the modal opens
  useEffect(() => {
    if (showCreateModal && currentUserIsManager && user?.id && !smart.managerId) {
      setSmart((s) => ({ ...s, managerId: user.id }));
    }
  }, [showCreateModal, currentUserIsManager, user?.id, smart.managerId]);

  const createProjectMutation = useMutation({
    mutationFn: (projectData: any) => api.post('/projects', projectData).then(res => res.data),
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreateModal(false);
      setNewProject({
        name: '',
        description: '',
        status: 'planning',
        priority: 'medium',
        section: 'corporate',
        startDate: '',
        deadline: '',
      });
      setSmart(emptySmart);
      setSmmTasks(SMM_CYCLE_1);
      setCustomTasks([]);
      setFormError('');
      toast.success('Project created', `"${created?.name ?? 'Project'}" is now in your projects list.`);
    },
    onError: (e: any) => setFormError(errorMessage(e)),
  });

  const generateCycleMutation = useMutation({
    mutationFn: (id: string) => api.post(`/projects/${id}/cycles`).then((r) => r.data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Next cycle generated', `${data?.tasksCreated ?? 0} auto-dated tasks scheduled for cycle ${data?.cycle}.`);
    },
    onError: (e: any) => toast.error('Could not generate cycle', errorMessage(e)),
  });

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/projects/${id}`, data).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowEditModal(false);
      setSelectedProject(null);
      setFormError('');
      toast.success('Project updated');
    },
    onError: (e: any) => setFormError(errorMessage(e)),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const projects = projectsData?.projects || [];

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      planning: 'bg-gray-100 text-gray-700 border-gray-200',
      active: 'bg-brand-100 text-brand-700 border-brand-200',
      on_hold: 'bg-gray-100 text-gray-700 border-gray-200',
      completed: 'bg-brand-100 text-brand-700 border-brand-200',
      cancelled: 'bg-red-100 text-red-700 border-red-200',
    };
    return colors[status] || colors.planning;
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: 'bg-gray-100 text-gray-700 border-gray-200',
      medium: 'bg-brand-100 text-brand-700 border-brand-200',
      high: 'bg-white text-gray-900 border-gray-400',
      urgent: 'bg-gray-900 text-white border-gray-900',
    };
    return colors[priority] || colors.medium;
  };

  const getProgressColor = (progress: number) => {
    if (progress >= 75) return 'bg-brand-600';
    if (progress >= 50) return 'bg-brand-500';
    if (progress >= 25) return 'bg-brand-500';
    return 'bg-gray-400';
  };

  const filteredProjects = projects.filter((project: Project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditProject = (project: Project) => {
    setSelectedProject(project);
    setNewProject({
      name: project.name,
      description: project.description || '',
      status: project.status,
      priority: project.priority,
      section: project.section || 'corporate',
      startDate: project.startDate ? new Date(project.startDate).toISOString().split('T')[0] : '',
      deadline: project.deadline ? new Date(project.deadline).toISOString().split('T')[0] : '',
    });
    setShowEditModal(true);
  };

  const handleDeleteProject = (id: string) => {
    if (confirm('Are you sure you want to delete this project? This will also delete all associated tasks.')) {
      deleteProjectMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and track your projects</p>
        </div>
        <Button
          className="w-full shrink-0 justify-center whitespace-nowrap bg-brand-600 px-3.5 py-2 text-xs text-white shadow-sm hover:bg-brand-700 sm:w-auto sm:text-sm"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <div className="relative w-full sm:min-w-[200px] sm:max-w-md sm:flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              />
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <Filter className="h-4 w-4 shrink-0 text-gray-500" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              >
                <option value="all">All Status</option>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <FolderKanban className="h-4 w-4 shrink-0 text-gray-500" />
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              >
                {SECTIONS.map(section => (
                  <option key={section.value} value={section.value}>{section.label}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading projects...</div>
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-4">
              <FolderKanban className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500">No projects found</p>
            <Button variant="outline" className="mt-4" onClick={() => setShowCreateModal(true)}>
              Create your first project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 stagger">
          {filteredProjects.map((project: Project) => (
            <Card key={project.id} className="card-premium">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">{project.name}</h3>
                    {project.description && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{project.description}</p>
                    )}
                  </div>
                  <DropdownMenu
                    trigger={
                      <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 ml-2">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    }
                  >
                    {project.projectType === 'recurring' && (
                      <DropdownMenuItem onClick={() => generateCycleMutation.mutate(project.id)}>
                        <RefreshCw className="h-4 w-4 mr-2 inline" />
                        Generate Next Cycle{(project.currentCycle ?? 1) > 1 ? ` (Cycle ${project.currentCycle})` : ''}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleEditProject(project)}>
                      <Pencil className="h-4 w-4 mr-2 inline" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDeleteProject(project.id)} danger>
                      <Trash2 className="h-4 w-4 mr-2 inline" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenu>
                </div>

                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(project.status)}`}>
                    {project.status.replace('_', ' ')}
                  </span>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(project.priority)}`}>
                    {project.priority}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-100 text-gray-700 border-gray-200">
                    {SECTIONS.find(s => s.value === project.section)?.label || project.section}
                  </span>
                  {project.projectType === 'recurring' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-brand-50 text-brand-700 border-brand-200">
                      🔁 Cycle {project.currentCycle ?? 1}
                    </span>
                  )}
                  {project.service && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-600 border-gray-200">
                      {PROJECT_SERVICES.find(s => s.value === project.service)?.label ?? project.service}
                    </span>
                  )}
                </div>

                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <TrendingUp className="h-4 w-4" />
                      <span>Progress</span>
                    </div>
                    <span className="font-medium text-gray-900">{project.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full progress-fill ${getProgressColor(project.progress)}`}
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t border-gray-200">
                  {project.deadline && (
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span>Deadline</span>
                      </div>
                      <span className="font-medium text-gray-900">
                        {new Date(project.deadline).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Users className="h-4 w-4" />
                      <span>Team</span>
                    </div>
                    <span className="font-medium text-gray-900">{project.members?.length || 0} members</span>
                  </div>
                  <Link href={`/tasks?projectId=${project.id}`} className="block text-center text-xs font-medium text-brand-600 hover:text-brand-700 pt-1">
                    View & assign tasks →
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Project Modal — smart auto-dated wizard */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-2 sm:p-4 animate-fade-in">
          <Card className="mx-auto w-[94vw] max-w-lg max-h-[88dvh] overflow-y-auto overflow-x-hidden border-gray-200 shadow-2xl animate-scale-in">
            <CardHeader className="p-4 pb-4 sm:p-6 sm:pb-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="min-w-0 text-lg font-semibold">Create New Project</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setShowCreateModal(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-500">All task due dates are auto-computed from the start date — no manual date entry.</p>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              <form onSubmit={(e) => {
                e.preventDefault();
                setFormError('');
                const taskTemplate = isFixedSmm
                  ? smmTasks.filter((t) => t.title.trim())
                  : customTasks.filter((t) => t.title.trim() && t.dayOffset > 0);
                const projectData: any = {
                  name: smart.name,
                  description: smart.description || undefined,
                  status: 'active',
                  priority: 'medium',
                  section: 'corporate',
                  startDate: new Date(`${smart.startDate}T00:00:00`).toISOString(),
                  projectType: smart.projectType,
                  planStructure: smart.planStructure,
                  service: smart.service,
                  managerId: smart.managerId || undefined,
                  assignedEmployeeIds: smart.employeeIds.length ? smart.employeeIds : undefined,
                  ...(smart.projectType === 'recurring' && {
                    tenureUnit: smart.tenureUnit,
                    tenureValue: Number(smart.tenureValue) || 1,
                  }),
                  ...(taskTemplate.length ? { taskTemplate } : {}),
                };
                createProjectMutation.mutate(projectData);
              }} className="space-y-5">
                {formError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{formError}</div>
                )}

                {/* Step 1 — title */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Project Title *</label>
                  <input
                    type="text"
                    value={smart.name}
                    onChange={(e) => setSmart({ ...smart, name: e.target.value })}
                    placeholder="e.g. Monthly SMM Campaign"
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
                  <input
                    type="date"
                    value={smart.startDate}
                    onChange={(e) => setSmart({ ...smart, startDate: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Day 1 of every cycle is anchored to this date.</p>
                </div>

                {/* Step 2 — project type */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Project Type</label>
                  <div className="flex gap-2">
                    {(['recurring', 'one_time'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSmart({ ...smart, projectType: t })}
                        className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${smart.projectType === t ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                      >
                        {t === 'recurring' ? '🔁 Recurring' : '📌 One-Time'}
                      </button>
                    ))}
                  </div>
                  {smart.projectType === 'recurring' && (
                    <div className="mt-3 grid w-full grid-cols-12 items-center gap-2 rounded-xl border border-brand-100 bg-brand-50/50 p-3">
                      <span className="col-span-12 text-xs font-medium text-gray-600 sm:col-span-3">Tenure:</span>
                      <select
                        value={smart.tenureUnit}
                        onChange={(e) => setSmart({ ...smart, tenureUnit: e.target.value })}
                        className="col-span-8 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 sm:col-span-6"
                      >
                        <option value="days">Days</option>
                        <option value="weeks">Weeks</option>
                        <option value="months">Months</option>
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={smart.tenureValue}
                        onChange={(e) => setSmart({ ...smart, tenureValue: Number(e.target.value) })}
                        className="col-span-4 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-center text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 sm:col-span-3"
                      />
                      <span className="col-span-12 text-xs leading-snug text-gray-500">
                        {smart.tenureUnit === 'days' ? 'day(s)' : smart.tenureUnit === 'weeks' ? 'week(s)' : 'month(s)'} per cycle — use “Generate Next Cycle” on the project card to renew.
                      </span>
                    </div>
                  )}
                </div>

                {/* Step 3 — plan structure */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Plan Structure</label>
                  <div className="flex gap-2">
                    {(['fixed', 'customised'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setSmart({ ...smart, planStructure: p })}
                        className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${smart.planStructure === p ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                      >
                        {p === 'fixed' ? '📋 Fixed Template' : '✏️ Customised'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 4 — service */}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Service</label>
                  <div className="grid w-full grid-cols-2 gap-2">
                    {PROJECT_SERVICES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setSmart({ ...smart, service: s.value })}
                        className={`w-full min-w-0 whitespace-normal break-words rounded-xl border px-2 py-2.5 text-center text-xs font-semibold leading-tight transition-all ${smart.service === s.value ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 4b — assign project lead & team */}
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Assign Project</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">Assign Manager / Lead</label>
                      <select
                        value={smart.managerId}
                        onChange={(e) => setSmart({ ...smart, managerId: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="">No lead — defaults to you</option>
                        {leadOptions.map((u) => (
                          <option key={u.id} value={u.id}>
                            {fullName(u)}{u.id === user?.id ? ' (you)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1.5 block">
                        Assign Team Employees{smart.employeeIds.length > 0 && (
                          <span className="ml-1.5 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">{smart.employeeIds.length} selected</span>
                        )}
                      </label>
                      {employeeOptions.length === 0 ? (
                        <p className="text-xs text-gray-400 py-1">No employees available to assign.</p>
                      ) : (
                        <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1">
                          {employeeOptions.map((u) => {
                            const selected = smart.employeeIds.includes(u.id);
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() =>
                                  setSmart({
                                    ...smart,
                                    employeeIds: selected
                                      ? smart.employeeIds.filter((id) => id !== u.id)
                                      : [...smart.employeeIds, u.id],
                                  })
                                }
                                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                                  selected
                                    ? 'border-brand-500 bg-brand-600 text-white shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-600 hover:border-brand-300 hover:text-brand-700'
                                }`}
                              >
                                {fullName(u)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {smart.employeeIds.length === 1 && (
                        <p className="mt-1.5 text-[11px] text-brand-700">All generated tasks will be auto-assigned to this employee.</p>
                      )}
                      {smart.employeeIds.length > 1 && (
                        <p className="mt-1.5 text-[11px] text-gray-500">Selected employees join the project team — assign tasks to them from the Tasks page.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Step 5 — auto-generated task preview */}
                {showTemplatePreview ? (
                  <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3 sm:p-4">
                    <div className="mb-2 flex flex-col gap-1">
                      <p className="text-sm font-semibold text-gray-900">
                        Auto-generated SMM schedule — {smmTasks.length} tasks
                      </p>
                      <span className="text-[11px] text-gray-500">Month 1 · Days 1–24 · dates auto-computed</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mb-3">
                      Recurring Month 2+ cycles automatically skip Day 1–3 onboarding and run Day 4–24 from the new cycle start.
                    </p>
                    <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                      {smmTasks.map((t, i) => (
                        <div key={t.dayOffset} className="flex w-full flex-col gap-0.5 rounded-lg border border-gray-100 bg-white/80 p-2.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="shrink-0 text-[11px] font-bold text-brand-600">Day {t.dayOffset}</span>
                            <span className="shrink-0 text-right text-[11px] text-gray-400">
                              {fmtShortDate(dueDateFor(smart.startDate, t.dayOffset))}
                            </span>
                          </div>
                          <input
                            type="text"
                            value={t.title}
                            onChange={(e) => {
                              const next = [...smmTasks];
                              next[i] = { ...next[i], title: e.target.value };
                              setSmmTasks(next);
                            }}
                            className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-0 py-1 !text-xs font-medium text-gray-800 hover:border-gray-200 focus:border-brand-400 focus:bg-white focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-900">Custom tasks — day offsets</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-lg text-xs"
                        onClick={() => setCustomTasks([...customTasks, { title: '', dayOffset: customTasks.length + 1 }])}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add task
                      </Button>
                    </div>
                    {customTasks.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">No custom tasks yet — add tasks with a Day Offset and their due dates auto-calculate.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {customTasks.map((t, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={t.title}
                              onChange={(e) => {
                                const next = [...customTasks];
                                next[i] = { ...next[i], title: e.target.value };
                                setCustomTasks(next);
                              }}
                              placeholder={`Task ${i + 1} title`}
                              className="flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                            <input
                              type="number"
                              min={1}
                              value={t.dayOffset}
                              onChange={(e) => {
                                const next = [...customTasks];
                                next[i] = { ...next[i], dayOffset: Number(e.target.value) };
                                setCustomTasks(next);
                              }}
                              className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                              title="Day offset"
                            />
                            <span className="w-16 text-right text-[11px] text-gray-400">
                              {t.dayOffset > 0 ? fmtShortDate(dueDateFor(smart.startDate, t.dayOffset)) : '—'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCustomTasks(customTasks.filter((_, j) => j !== i))}
                              className="text-gray-400 hover:text-rose-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Description (optional)</label>
                  <textarea
                    value={smart.description}
                    onChange={(e) => setSmart({ ...smart, description: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    rows={2}
                  />
                </div>

                <div className="grid w-full grid-cols-2 gap-2.5 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateModal(false)}
                    className="w-full justify-center whitespace-nowrap px-3 py-2.5 text-xs font-semibold"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="w-full justify-center whitespace-nowrap bg-brand-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-brand-700"
                    disabled={createProjectMutation.isPending || !smart.name.trim()}
                  >
                    {createProjectMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</> : 'Create Project'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Project Modal */}
      {showEditModal && selectedProject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-fade-in">
          <Card className="w-[95vw] sm:w-full max-w-md max-h-[90vh] overflow-y-auto border-gray-200 shadow-2xl animate-scale-in">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Edit Project</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowEditModal(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => {
                e.preventDefault();
                setFormError('');
                const projectData = {
                  name: newProject.name,
                  description: newProject.description,
                  status: newProject.status,
                  priority: newProject.priority,
                  section: newProject.section,
                  startDate: newProject.startDate ? new Date(newProject.startDate).toISOString() : null,
                  deadline: newProject.deadline ? new Date(newProject.deadline).toISOString() : null,
                };
                updateProjectMutation.mutate({ id: selectedProject.id, data: projectData });
              }} className="space-y-4">
                {formError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{formError}</div>
                )}
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Project Name</label>
                  <input
                    type="text"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                  <textarea
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Status</label>
                    <select
                      value={newProject.status}
                      onChange={(e) => setNewProject({ ...newProject, status: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="planning">Planning</option>
                      <option value="active">Active</option>
                      <option value="on_hold">On Hold</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Priority</label>
                    <select
                      value={newProject.priority}
                      onChange={(e) => setNewProject({ ...newProject, priority: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
                    <input
                      type="date"
                      value={newProject.startDate}
                      onChange={(e) => setNewProject({ ...newProject, startDate: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Deadline</label>
                    <input
                      type="date"
                      value={newProject.deadline}
                      onChange={(e) => setNewProject({ ...newProject, deadline: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-2.5 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowEditModal(false)}
                    className="w-full justify-center whitespace-nowrap px-3 py-2.5 text-xs font-semibold"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="w-full justify-center whitespace-nowrap bg-brand-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-brand-700"
                    disabled={updateProjectMutation.isPending}
                  >
                    {updateProjectMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : 'Update Project'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
