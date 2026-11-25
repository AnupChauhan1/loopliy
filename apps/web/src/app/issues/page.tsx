'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Search, Filter, MoreHorizontal, Calendar, User, AlertCircle, CheckCircle, Clock, X, Pencil, Trash2, FileText } from 'lucide-react';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';
import { useAuth } from '@/lib/auth-context';
import { fullName, initials, timeAgo } from '@/lib/format';
import Link from 'next/link';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

interface Issue {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  category?: string;
  dueDate?: string;
  createdAt: string;
  project?: {
    id: string;
    name: string;
  };
  assignedTo?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  team?: {
    id: string;
    name: string;
  };
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  _count?: {
    comments: number;
    attachments: number;
  };
}

const STATUS_TABS = [
  { value: 'all', label: 'All Issues' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'ignore', label: 'Ignore' },
  { value: 'closed', label: 'Closed' },
];

const PRIORITIES = ['low', 'medium', 'high', 'critical'];

export default function IssuesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [assignedToFilter, setAssignedToFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const params: any = {};
  if (activeTab !== 'all') params.status = activeTab;
  if (statusFilter !== 'all') params.status = statusFilter;
  if (priorityFilter !== 'all') params.priority = priorityFilter;
  if (projectFilter !== 'all') params.projectId = projectFilter;
  if (assignedToFilter !== 'all') params.assignedToId = assignedToFilter;
  if (debouncedSearchQuery) params.search = debouncedSearchQuery;

  const { data: issuesData, isLoading } = useQuery({
    queryKey: ['issues', params],
    queryFn: () => api.get('/issues', { params }).then(res => res.data),
    placeholderData: keepPreviousData,
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects', { params: { limit: 100 } }).then(res => res.data),
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(res => res.data),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: (data: { ids: string[]; updates: any }) => api.post('/issues/bulk', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      setSelectedIssues(new Set());
    },
  });

  const deleteIssueMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/issues/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });

  const issues = issuesData?.issues || [];

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-blue-100 text-blue-700 border-blue-200',
      in_progress: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      ignore: 'bg-gray-100 text-gray-700 border-gray-200',
      closed: 'bg-green-100 text-green-700 border-green-200',
    };
    return colors[status] || colors.open;
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: 'bg-gray-100 text-gray-700 border-gray-200',
      medium: 'bg-blue-100 text-blue-700 border-blue-200',
      high: 'bg-orange-100 text-orange-700 border-orange-200',
      critical: 'bg-red-100 text-red-700 border-red-200',
    };
    return colors[priority] || colors.medium;
  };

  const getPriorityIcon = (priority: string) => {
    if (priority === 'critical') return <AlertCircle className="h-3 w-3" />;
    if (priority === 'high') return <AlertCircle className="h-3 w-3" />;
    return null;
  };

  const filteredIssues = issues.filter((issue: Issue) =>
    issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    issue.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectAll = () => {
    if (selectedIssues.size === filteredIssues.length) {
      setSelectedIssues(new Set());
    } else {
      setSelectedIssues(new Set(filteredIssues.map((i: Issue) => i.id)));
    }
  };

  const handleSelectIssue = (id: string) => {
    const newSet = new Set(selectedIssues);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIssues(newSet);
  };

  const handleBulkStatusChange = (status: string) => {
    if (selectedIssues.size === 0) return;
    bulkUpdateMutation.mutate({
      ids: Array.from(selectedIssues),
      updates: { status },
    });
  };

  const handleBulkDelete = () => {
    if (selectedIssues.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedIssues.size} issue(s)?`)) {
      selectedIssues.forEach(id => deleteIssueMutation.mutate(id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Issues</h1>
          <p className="text-sm text-gray-500 mt-1">Track and manage issues across projects</p>
        </div>
        <Button
          className="bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Issue
        </Button>
      </div>

      {/* Tabs */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="max-w-full overflow-x-auto p-4">
          <Segmented
            value={activeTab}
            onChange={setActiveTab}
            options={STATUS_TABS}
          />
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search issues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              >
                <option value="all">All Priorities</option>
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              >
                <option value="all">All Projects</option>
                {(projects?.projects || []).map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-500" />
              <select
                value={assignedToFilter}
                onChange={(e) => setAssignedToFilter(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              >
                <option value="all">All Assignees</option>
                {(users || []).map((u: any) => (
                  <option key={u.id} value={u.id}>{fullName(u)}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedIssues.size > 0 && (
        <Card className="border-brand-200 bg-brand-50 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-brand-900">
                {selectedIssues.size} issue(s) selected
              </p>
              <div className="flex items-center gap-2">
                <select
                  onChange={(e) => handleBulkStatusChange(e.target.value)}
                  className="rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Change Status...</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="ignore">Ignore</option>
                  <option value="closed">Closed</option>
                </select>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Issues List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading issues...</div>
        </div>
      ) : filteredIssues.length === 0 ? (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 mb-4">
              <AlertCircle className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-gray-500">No issues found</p>
            <Button variant="outline" className="mt-4" onClick={() => setShowCreateModal(true)}>
              Create your first issue
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIssues.size === filteredIssues.length}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </th>
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Issue</th>
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Priority</th>
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Project</th>
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Assigned To</th>
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Due Date</th>
                    <th className="py-3 px-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Created</th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((issue: Issue) => (
                    <tr key={issue.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <input
                          type="checkbox"
                          checked={selectedIssues.has(issue.id)}
                          onChange={() => handleSelectIssue(issue.id)}
                          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                        />
                      </td>
                      <td className="py-3.5 px-4">
                        <Link href={`/issues/${issue.id}`} className="text-sm font-medium text-gray-900 hover:text-brand-700 transition-colors">
                          {issue.title}
                        </Link>
                        {issue.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{issue.description}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(issue.status)}`}>
                          {issue.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(issue.priority)}`}>
                          {getPriorityIcon(issue.priority)}
                          {issue.priority}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-sm text-gray-600">
                        {issue.project?.name || '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        {issue.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                              {initials(issue.assignedTo.firstName, issue.assignedTo.lastName)}
                            </span>
                            <span className="text-sm text-gray-600">{fullName(issue.assignedTo)}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-sm text-gray-600">
                        {issue.dueDate ? (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(issue.dueDate).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-gray-500">
                        {timeAgo(issue.createdAt)}
                      </td>
                      <td className="py-3.5 px-4">
                        <DropdownMenu
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          }
                        >
                          <DropdownMenuItem>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem danger onClick={() => deleteIssueMutation.mutate(issue.id)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Issue Modal - Simplified for now */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <Card className="w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto border-gray-200 shadow-2xl">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Create New Issue</CardTitle>
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
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Issue creation form will be implemented with full CRUD functionality.</p>
                <Button variant="outline" className="mt-4" onClick={() => setShowCreateModal(false)}>
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
