import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api-client';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  deadline?: string;
  assignees: Array<{
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
  }>;
  project?: {
    id: string;
    name: string;
  };
}

interface TasksResponse {
  tasks: Task[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function useTasks(query?: any) {
  return useQuery({
    queryKey: ['tasks', query],
    queryFn: async () => {
      const { data } = await api.get<TasksResponse>('/tasks', { params: query });
      return data;
    },
    retry: false,
  });
}

export function useMyTasks(query?: any) {
  return useQuery({
    queryKey: ['my-tasks', query],
    queryFn: async () => {
      const { data } = await api.get<TasksResponse>('/tasks/my', { params: query });
      return data;
    },
    retry: false,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: async () => {
      const { data } = await api.get<Task>(`/tasks/${id}`);
      return data;
    },
    enabled: !!id,
    retry: false,
  });
}
