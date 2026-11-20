'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, User, Clock, AlertCircle, FileText, MessageSquare, Paperclip, MoreHorizontal, Send, X, Pencil, Trash2, Plus } from 'lucide-react';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth-context';
import { fullName, initials, timeAgo } from '@/lib/format';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Issue {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  category?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
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
  comments: IssueComment[];
  attachments: IssueAttachment[];
  activities: IssueActivity[];
}

interface IssueComment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface IssueAttachment {
  id: string;
  name: string;
  url: string;
  size?: number;
  mimeType?: string;
  createdAt: string;
}

interface IssueActivity {
  id: string;
  action: string;
  changedBy: string;
  changes?: any;
  createdAt: string;
}

export default function IssueDetailPage() {
  const params = useParams();
  const issueId = params.id as string;
  const { user } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: issue, isLoading } = useQuery<Issue>({
    queryKey: ['issue', issueId],
    queryFn: () => api.get<Issue>(`/issues/${issueId}`).then(res => res.data),
    enabled: !!issueId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => api.put(`/issues/${issueId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', issueId] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: (content: string) => api.post(`/issues/${issueId}/comments`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', issueId] });
      setNewComment('');
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => api.delete(`/issues/${issueId}/comments/${commentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', issueId] });
    },
  });

  const addAttachmentMutation = useMutation({
    mutationFn: (data: { name: string; url: string; size?: number; mimeType?: string }) =>
      api.post(`/issues/${issueId}/attachments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', issueId] });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: string) => api.delete(`/issues/${issueId}/attachments/${attachmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issue', issueId] });
    },
  });

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

  const getActivityText = (activity: IssueActivity) => {
    const actionTexts: Record<string, string> = {
      created: 'created this issue',
      updated: 'updated this issue',
      status_changed: 'changed status',
      assigned: 'assigned this issue',
      commented: 'added a comment',
      closed: 'closed this issue',
    };
    return actionTexts[activity.action] || activity.action;
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    addCommentMutation.mutate(newComment);
  };

  const handleAddAttachment = () => {
    const name = prompt('Enter file name:');
    const url = prompt('Enter file URL:');
    if (name && url) {
      addAttachmentMutation.mutate({ name, url });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading issue...</div>
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-gray-500">Issue not found</p>
        <Link href="/issues">
          <Button variant="outline" className="mt-4">
            Back to Issues
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/issues">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">{issue.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Created {timeAgo(issue.createdAt)} by {fullName(issue.createdBy)}
          </p>
        </div>
        <DropdownMenu
          trigger={
            <Button variant="outline" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
        >
          <DropdownMenuItem onClick={() => setShowEditModal(true)}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Issue
          </DropdownMenuItem>
        </DropdownMenu>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Description</CardTitle>
            </CardHeader>
            <CardContent>
              {issue.description ? (
                <p className="text-gray-700 whitespace-pre-wrap">{issue.description}</p>
              ) : (
                <p className="text-gray-400 italic">No description provided</p>
              )}
            </CardContent>
          </Card>

          {/* Comments */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Comments ({issue.comments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add Comment */}
              <form onSubmit={handleAddComment} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
                  {initials(user?.firstName, user?.lastName)}
                </span>
                <div className="flex-1">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                    rows={3}
                  />
                  <div className="flex justify-end mt-2">
                    <Button
                      type="submit"
                      size="sm"
                      className="bg-brand-600 hover:bg-brand-700 text-white"
                      disabled={!newComment.trim() || addCommentMutation.isPending}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Comment
                    </Button>
                  </div>
                </div>
              </form>

              {/* Comments List */}
              <div className="space-y-4">
                {issue.comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                      {initials(comment.user.firstName, comment.user.lastName)}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{fullName(comment.user)}</span>
                        <span className="text-xs text-gray-500">{timeAgo(comment.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{comment.content}</p>
                    </div>
                    {comment.user.id === user?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => deleteCommentMutation.mutate(comment.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                {issue.comments.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No comments yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Paperclip className="h-5 w-5" />
                  Attachments ({issue.attachments.length})
                </div>
                <Button variant="outline" size="sm" onClick={handleAddAttachment}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {issue.attachments.length > 0 ? (
                <div className="space-y-2">
                  {issue.attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{attachment.name}</p>
                          {attachment.size && (
                            <p className="text-xs text-gray-500">{(attachment.size / 1024).toFixed(1)} KB</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                            Download
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => deleteAttachmentMutation.mutate(attachment.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">No attachments yet</p>
              )}
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Activity Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {issue.activities.map((activity) => (
                  <div key={activity.id} className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
                      <Clock className="h-4 w-4 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">{activity.changedBy}</span> {getActivityText(activity)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{timeAgo(activity.createdAt)}</p>
                    </div>
                  </div>
                ))}
                {issue.activities.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status & Priority */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Status & Priority</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Status</label>
                <select
                  value={issue.status}
                  onChange={(e) => updateStatusMutation.mutate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="ignore">Ignore</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Priority</label>
                <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium border ${getPriorityColor(issue.priority)}`}>
                  {issue.priority}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {issue.category && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Category</label>
                  <p className="text-sm text-gray-900">{issue.category}</p>
                </div>
              )}
              {issue.project && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Project</label>
                  <p className="text-sm text-gray-900">{issue.project.name}</p>
                </div>
              )}
              {issue.assignedTo && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Assigned To</label>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-semibold text-brand-700">
                      {initials(issue.assignedTo.firstName, issue.assignedTo.lastName)}
                    </span>
                    <span className="text-sm text-gray-900">{fullName(issue.assignedTo)}</span>
                  </div>
                </div>
              )}
              {issue.team && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Team</label>
                  <p className="text-sm text-gray-900">{issue.team.name}</p>
                </div>
              )}
              {issue.dueDate && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Due Date</label>
                  <div className="flex items-center gap-2 text-sm text-gray-900">
                    <Calendar className="h-4 w-4" />
                    {new Date(issue.dueDate).toLocaleDateString()}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* People */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">People</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {initials(issue.createdBy.firstName, issue.createdBy.lastName)}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{fullName(issue.createdBy)}</p>
                  <p className="text-xs text-gray-500">Created by</p>
                </div>
              </div>
              {issue.assignedTo && (
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                    {initials(issue.assignedTo.firstName, issue.assignedTo.lastName)}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{fullName(issue.assignedTo)}</p>
                    <p className="text-xs text-gray-500">Assigned to</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
