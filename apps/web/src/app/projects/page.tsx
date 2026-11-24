'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Filter, Search, MoreHorizontal, Calendar, Users, TrendingUp, FolderKanban, X, Pencil, Trash2, Loader2 } from 'lucide-react';
import api from '@/lib/api-client';
import { useToast, errorMessage } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';

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

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['projects', { status: filter, section: sectionFilter }],
    queryFn: () => api.get('/projects', {
      params: {
        ...(filter !== 'all' && { status: filter }),
        ...(sectionFilter !== 'all' && { section: sectionFilter }),
      }
    }).then(res => res.data),
  });

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
      setFormError('');
      toast.success('Project created', `"${created?.name ?? 'Project'}" is now in your projects list.`);
    },
    onError: (e: any) => setFormError(errorMessage(e)),
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and track your projects</p>
        </div>
        <Button
          className="bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              >
                <option value="all">All Status</option>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-gray-500" />
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-fade-in">
          <Card className="w-full max-w-md border-gray-200 shadow-2xl animate-scale-in">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Create New Project</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowCreateModal(false)}
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
                createProjectMutation.mutate(projectData);
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
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Section</label>
                    <select
                      value={newProject.section}
                      onChange={(e) => setNewProject({ ...newProject, section: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {SECTIONS.filter(s => s.value !== 'all').map(section => (
                        <option key={section.value} value={section.value}>{section.label}</option>
                      ))}
                    </select>
                  </div>
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
                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-brand-600 hover:bg-brand-700 text-white"
                    disabled={createProjectMutation.isPending}
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
          <Card className="w-full max-w-md border-gray-200 shadow-2xl animate-scale-in">
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
                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowEditModal(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-brand-600 hover:bg-brand-700 text-white"
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
