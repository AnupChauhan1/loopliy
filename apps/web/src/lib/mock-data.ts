// Mock data service for development when backend is unavailable
// This will be replaced with real API calls once the backend is running

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

interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  priority: string;
  startDate?: string;
  deadline?: string;
  budget?: number;
  progress: number;
}

const mockTasks: Task[] = [
  {
    id: '1',
    title: 'Design homepage mockup',
    description: 'Create initial homepage design for website redesign',
    status: 'ongoing',
    priority: 'high',
    deadline: '2026-10-20',
    assignees: [
      { user: { id: '1', firstName: 'John', lastName: 'Doe', email: 'john@example.com' } },
    ],
    project: { id: '1', name: 'Website Redesign' },
  },
  {
    id: '2',
    title: 'Implement user authentication',
    description: 'Set up JWT authentication with bcrypt',
    status: 'completed',
    priority: 'urgent',
    deadline: '2026-10-15',
    assignees: [
      { user: { id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' } },
    ],
    project: { id: '1', name: 'Website Redesign' },
  },
  {
    id: '3',
    title: 'Create database schema',
    description: 'Design Prisma schema for all ERP modules',
    status: 'completed',
    priority: 'high',
    deadline: '2026-10-10',
    assignees: [
      { user: { id: '3', firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com' } },
    ],
    project: { id: '2', name: 'ERP Setup' },
  },
  {
    id: '4',
    title: 'Build task management UI',
    description: 'Create task list, Kanban, and calendar views',
    status: 'in_review',
    priority: 'medium',
    deadline: '2026-10-25',
    assignees: [
      { user: { id: '1', firstName: 'John', lastName: 'Doe', email: 'john@example.com' } },
      { user: { id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' } },
    ],
    project: { id: '1', name: 'Website Redesign' },
  },
  {
    id: '5',
    title: 'Set up CI/CD pipeline',
    description: 'Configure automated testing and deployment',
    status: 'todo',
    priority: 'low',
    deadline: '2026-11-01',
    assignees: [
      { user: { id: '3', firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com' } },
    ],
    project: { id: '2', name: 'ERP Setup' },
  },
  {
    id: '6',
    title: 'Design social media campaign',
    description: 'Create visual assets for Q4 campaign',
    status: 'ongoing',
    priority: 'high',
    deadline: '2026-10-18',
    assignees: [
      { user: { id: '1', firstName: 'John', lastName: 'Doe', email: 'john@example.com' } },
    ],
    project: { id: '3', name: 'Marketing Campaign' },
  },
  {
    id: '7',
    title: 'Client presentation preparation',
    description: 'Prepare slides for client meeting',
    status: 'in_review',
    priority: 'urgent',
    deadline: '2026-10-17',
    assignees: [
      { user: { id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' } },
    ],
    project: { id: '1', name: 'Website Redesign' },
  },
  {
    id: '8',
    title: 'API documentation',
    description: 'Document all API endpoints',
    status: 'todo',
    priority: 'medium',
    deadline: '2026-10-30',
    assignees: [
      { user: { id: '3', firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com' } },
    ],
    project: { id: '2', name: 'ERP Setup' },
  },
];

const mockProjects: Project[] = [
  {
    id: '1',
    name: 'Website Redesign',
    description: 'Complete website redesign for client',
    status: 'ongoing',
    priority: 'high',
    startDate: '2026-10-01',
    deadline: '2026-11-15',
    budget: 15000,
    progress: 45,
  },
  {
    id: '2',
    name: 'ERP Setup',
    description: 'Internal ERP system implementation',
    status: 'ongoing',
    priority: 'high',
    startDate: '2026-09-15',
    deadline: '2026-11-30',
    budget: 50000,
    progress: 35,
  },
  {
    id: '3',
    name: 'Marketing Campaign',
    description: 'Q4 social media marketing campaign',
    status: 'planning',
    priority: 'medium',
    startDate: '2026-10-20',
    deadline: '2026-12-31',
    budget: 25000,
    progress: 10,
  },
];

export const mockDataService = {
  getTasks: async (query?: any) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    let filteredTasks = [...mockTasks];
    
    if (query?.status) {
      filteredTasks = filteredTasks.filter(task => task.status === query.status);
    }
    
    return {
      tasks: filteredTasks,
      pagination: {
        page: 1,
        limit: 20,
        total: filteredTasks.length,
        totalPages: 1,
      },
    };
  },
  
  getMyTasks: async (query?: any) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      tasks: mockTasks.slice(0, 5),
      pagination: {
        page: 1,
        limit: 20,
        total: 5,
        totalPages: 1,
      },
    };
  },
  
  getTask: async (id: string) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return mockTasks.find(task => task.id === id);
  },
  
  getProjects: async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      projects: mockProjects,
      pagination: {
        page: 1,
        limit: 20,
        total: mockProjects.length,
        totalPages: 1,
      },
    };
  },
  
  getDashboardStats: async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      activeProjects: 3,
      todayTasks: 5,
      overdueTasks: 2,
      teamMembers: 8,
      completedTasks: 15,
      pendingApprovals: 4,
      thisMonthRevenue: 45000,
      pendingInvoices: 12450,
    };
  },
};
