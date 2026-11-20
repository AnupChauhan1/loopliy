'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Search, Filter, MoreHorizontal, FileText, Copy, X, Pencil, Trash2, Layers } from 'lucide-react';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth-context';

interface Template {
  id: string;
  name: string;
  description?: string;
  category?: string;
  defaultPriority: string;
  defaultStatus: string;
  instructions?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  department?: {
    id: string;
    name: string;
  };
  _count?: {
    issues: number;
  };
}

const PRIORITIES = ['low', 'medium', 'high', 'critical'];

export default function TemplatesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    category: '',
    defaultPriority: 'medium',
    defaultStatus: 'open',
    instructions: '',
    departmentId: '',
  });
  const queryClient = useQueryClient();

  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get('/templates').then(res => res.data),
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(res => res.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['templates', 'categories'],
    queryFn: () => api.get('/templates/categories').then(res => res.data),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (templateData: any) => api.post('/templates', templateData).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowCreateModal(false);
      setNewTemplate({
        name: '',
        description: '',
        category: '',
        defaultPriority: 'medium',
        defaultStatus: 'open',
        instructions: '',
        departmentId: '',
      });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/templates/${id}`, data).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setShowEditModal(false);
      setSelectedTemplate(null);
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/templates/${id}`).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const createFromTemplateMutation = useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: any }) =>
      api.post(`/templates/${templateId}/create-issue`, data).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      alert('Issue created from template successfully!');
    },
  });

  const templates = templatesData?.templates || [];

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: 'bg-gray-100 text-gray-700 border-gray-200',
      medium: 'bg-blue-100 text-blue-700 border-blue-200',
      high: 'bg-orange-100 text-orange-700 border-orange-200',
      critical: 'bg-red-100 text-red-700 border-red-200',
    };
    return colors[priority] || colors.medium;
  };

  const filteredTemplates = templates.filter((template: Template) =>
    template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setNewTemplate({
      name: template.name,
      description: template.description || '',
      category: template.category || '',
      defaultPriority: template.defaultPriority,
      defaultStatus: template.defaultStatus,
      instructions: template.instructions || '',
      departmentId: template.department?.id || '',
    });
    setShowEditModal(true);
  };

  const handleDeleteTemplate = (id: string) => {
    if (confirm('Are you sure you want to delete this template?')) {
      deleteTemplateMutation.mutate(id);
    }
  };

  const handleCreateFromTemplate = (template: Template) => {
    const projectId = prompt('Enter Project ID (optional):');
    const assignedToId = prompt('Enter Assigned User ID (optional):');
    createFromTemplateMutation.mutate({
      templateId: template.id,
      data: {
        ...(projectId && { projectId }),
        ...(assignedToId && { assignedToId }),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Issue Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Create reusable issue templates for consistency</p>
        </div>
        <Button
          className="bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              >
                <option value="all">All Categories</option>
                {(categories || []).map((cat: string) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading templates...</div>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-4">
              <Layers className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500">No templates found</p>
            <Button variant="outline" className="mt-4" onClick={() => setShowCreateModal(true)}>
              Create your first template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template: Template) => (
            <Card key={template.id} className="card-premium hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg font-semibold">{template.name}</CardTitle>
                    {template.category && (
                      <Badge variant="outline" className="mt-2 text-xs">
                        {template.category}
                      </Badge>
                    )}
                  </div>
                  <DropdownMenu
                    trigger={
                      <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    }
                  >
                    <DropdownMenuItem onClick={() => handleCreateFromTemplate(template)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Create Issue
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleEditTemplate(template)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem danger onClick={() => handleDeleteTemplate(template.id)}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {template.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{template.description}</p>
                )}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Default Priority</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getPriorityColor(template.defaultPriority)}`}>
                      {template.defaultPriority}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Default Status</span>
                    <span className="text-gray-900">{template.defaultStatus.replace('_', ' ')}</span>
                  </div>
                  {template.department && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Department</span>
                      <span className="text-gray-900">{template.department.name}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Issues Created</span>
                    <span className="text-gray-900 font-medium">{template._count?.issues || 0}</span>
                  </div>
                </div>
                {!template.isActive && (
                  <div className="mt-4">
                    <Badge variant="secondary" className="text-xs">Inactive</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg border-gray-200 shadow-2xl">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Create New Template</CardTitle>
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createTemplateMutation.mutate({
                    ...newTemplate,
                    departmentId: newTemplate.departmentId || undefined,
                  });
                }}
                className="space-y-4"
              >
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Template Name</label>
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                  <textarea
                    value={newTemplate.description}
                    onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Category</label>
                    <input
                      type="text"
                      value={newTemplate.category}
                      onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="e.g. Bug, Feature"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Department</label>
                    <select
                      value={newTemplate.departmentId}
                      onChange={(e) => setNewTemplate({ ...newTemplate, departmentId: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">None</option>
                      {(departments || []).map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Default Priority</label>
                    <select
                      value={newTemplate.defaultPriority}
                      onChange={(e) => setNewTemplate({ ...newTemplate, defaultPriority: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {PRIORITIES.map(p => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Default Status</label>
                    <select
                      value={newTemplate.defaultStatus}
                      onChange={(e) => setNewTemplate({ ...newTemplate, defaultStatus: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="ignore">Ignore</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Instructions</label>
                  <textarea
                    value={newTemplate.instructions}
                    onChange={(e) => setNewTemplate({ ...newTemplate, instructions: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    rows={4}
                    placeholder="Predefined instructions for issues created from this template..."
                  />
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
                    disabled={createTemplateMutation.isPending}
                  >
                    {createTemplateMutation.isPending ? 'Creating...' : 'Create Template'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Template Modal */}
      {showEditModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg border-gray-200 shadow-2xl">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Edit Template</CardTitle>
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateTemplateMutation.mutate({
                    id: selectedTemplate.id,
                    data: {
                      ...newTemplate,
                      departmentId: newTemplate.departmentId || undefined,
                    },
                  });
                }}
                className="space-y-4"
              >
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Template Name</label>
                  <input
                    type="text"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
                  <textarea
                    value={newTemplate.description}
                    onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Category</label>
                    <input
                      type="text"
                      value={newTemplate.category}
                      onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Department</label>
                    <select
                      value={newTemplate.departmentId}
                      onChange={(e) => setNewTemplate({ ...newTemplate, departmentId: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">None</option>
                      {(departments || []).map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Default Priority</label>
                    <select
                      value={newTemplate.defaultPriority}
                      onChange={(e) => setNewTemplate({ ...newTemplate, defaultPriority: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {PRIORITIES.map(p => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Default Status</label>
                    <select
                      value={newTemplate.defaultStatus}
                      onChange={(e) => setNewTemplate({ ...newTemplate, defaultStatus: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="ignore">Ignore</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Instructions</label>
                  <textarea
                    value={newTemplate.instructions}
                    onChange={(e) => setNewTemplate({ ...newTemplate, instructions: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    rows={4}
                  />
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
                    disabled={updateTemplateMutation.isPending}
                  >
                    {updateTemplateMutation.isPending ? 'Updating...' : 'Update Template'}
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
