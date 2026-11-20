# LOOPLI CRM - Setup Guide

## Prerequisites

- Node.js 20.9+
- npm 9+
- Docker and Docker Compose (recommended for local PostgreSQL and Redis)

The CRM login and backend features require a reachable PostgreSQL database. The login page does not provide hard-coded demo credentials.

## Local development

### 1. Install Dependencies

```bash
npm ci
npm ci --prefix apps/api
npm ci --prefix apps/web
npm ci --prefix apps/worker
```

### 2. Configure PostgreSQL and Redis

Copy `.env.example` to the repository-root `.env`, then set a private local PostgreSQL password, `DATABASE_URL`, `JWT_SECRET`, and passwords for the private workspace and public sandbox accounts. The PostgreSQL user, password, and database in `.env` must match the Compose configuration. Since Next.js loads environment files from `apps/web`, create `apps/web/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:3001`, `NEXT_PUBLIC_DEMO_ACCESS_ENABLED=true`, and each `NEXT_PUBLIC_DEMO_*_PASSWORD` matching its server-side `DEMO_*_PASSWORD`.

```bash
Copy-Item .env.example .env
docker-compose up -d
```

### 3. Migrate and seed the database

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

Seeding requires `ADMIN_PASSWORD`, `STAFF_PASSWORD`, `CLIENT_PASSWORD`, and separate `DEMO_*_PASSWORD` values for Admin, Manager, HR, Employee and Client. The public demo accounts use `admin@loopli.com`, `manager@loopli.com`, `hr@loopli.com`, `employee@loopli.com`, and `client@loopli.com`; they are assigned to a separate synthetic-data organization. The login page shows only these isolated sandbox credentials.

### 4. Start the services

```bash
npm run dev
```

This will start:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Background worker (if configured)

### Start individual services

```bash
# Frontend only
npm run dev:web

# Backend only
npm run dev:api

# Worker only
npm run dev:worker
```

## Project Structure

```
digital-das-erp/
├── apps/
│   ├── web/          # Next.js frontend
│   ├── api/          # NestJS backend
│   └── worker/       # Background job worker
├── packages/
│   ├── ui/           # Shared UI components
│   ├── types/        # Shared TypeScript types
│   └── config/       # Shared configuration
├── prisma/
│   ├── schema.prisma # Database schema
│   └── seed.ts       # Database seed script
├── docs/             # Documentation
└── docker-compose.yml
```

## Available Scripts

- `npm run dev` - Start all services in development mode
- `npm run build` - Build all services
- `npm run test` - Run all tests
- `npm run lint` - Lint all code
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:seed` - Seed database with demo data
- `npm run prisma:studio` - Open Prisma Studio

## Database Management

### View and Edit Database

```bash
npm run prisma:studio
```

### Create a New Migration

```bash
npx prisma migrate dev --name migration_name
```

### Reset Database (CAUTION: deletes all data)

```bash
npx prisma migrate reset
```

## Troubleshooting

### PostgreSQL Connection Issues

If you encounter database connection errors:

1. Verify PostgreSQL is running:
```bash
# Docker
docker ps

# Local
pg_isready
```

2. Check your DATABASE_URL in `.env`

3. Ensure the database exists:
```sql
\l digital_das_erp
```

### Port Already in Use

If port 3000 or 3001 is already in use:

```bash
# Find the process using the port
# Windows
netstat -ano | findstr :3000

# Kill the process
taskkill /PID <PID> /F
```

### Permission Errors

If you encounter permission errors:

1. Check file permissions on the project directory
2. Ensure you have write access to create `.next` and `dist` folders

### Build Errors

If you encounter build errors:

1. Clear the cache:
```bash
rm -rf .next node_modules
npm install
```

2. Check for TypeScript errors:
```bash
npm run lint
```

## Development Notes

### Frontend (Next.js)

- Uses App Router
- React Query for data fetching
- Tailwind CSS for styling
- shadcn/ui components
- Lucide icons

### Backend (NestJS)

- REST API under `/api/v1`
- JWT authentication
- Prisma ORM for database
- Class-validator for validation
- Role-based access control

### Database (PostgreSQL + Prisma)

- UUID primary keys
- Organization-level data isolation
- Audit logging
- Foreign key constraints
- Indexes for performance

## Current Implementation Status

### Completed Features ✅

- **Frontend UI:**
  - Premium redesigned dashboard with real-time stats
  - Professional sidebar with collapsible sections
  - Modern header with search and quick actions
  - Tasks page with advanced filtering
  - Projects page with card-based layout
  - CRM page with pipeline visualization
  - Social Media page with content management
  - Login page with authentication
  - Placeholder pages for all other modules

- **Backend:**
  - Authentication system (JWT, bcrypt)
  - Task management API with full CRUD
  - Role-based access control
  - Organization data isolation
  - Audit logging
  - Database schema for all modules

- **Infrastructure:**
  - API client with axios
  - React Query setup
  - Mock data service for development
  - Environment configuration
  - Docker Compose setup

### Modules Implemented (Frontend)

- ✅ Dashboard
- ✅ Tasks
- ✅ Projects
- ✅ CRM
- ✅ Clients
- ✅ Social Media
- ✅ Login/Authentication
- ⏳ Calendar (placeholder)
- ⏳ Approvals (placeholder)
- ⏳ Proposals (placeholder)
- ⏳ Content Calendar (placeholder)
- ⏳ Creative Review (placeholder)
- ⏳ Inbox/Chat (placeholder)
- ⏳ Meetings (placeholder)
- ⏳ Calls (placeholder)
- ⏳ Employees (placeholder)
- ✅ Attendance (camera-verified punches, schedules, reports, policy and correction approvals)
- ⏳ Leave (placeholder)
- ⏳ Invoices (placeholder)
- ⏳ Payments (placeholder)
- ⏳ Expenses (placeholder)
- ⏳ Reports (placeholder)
- ⏳ Analytics (placeholder)
- ⏳ Automation (placeholder)
- ⏳ User Management (placeholder)
- ⏳ Settings (placeholder)

### Next Steps for Full Implementation

1. **Connect Frontend to Backend API:**
   - Replace mock data service with real API calls
   - Implement proper error handling
   - Add loading states for all pages

2. **Complete Backend Modules:**
   - Projects API
   - CRM API
   - Social Media API
   - HR Module API
   - Finance Module API
   - Communication Module API

3. **Implement Real-time Features:**
   - WebSockets for chat
   - Live notifications
   - Real-time updates

4. **Add Testing:**
   - Unit tests for backend
   - Integration tests for API
   - E2E tests with Playwright

5. **Production Ready:**
   - Security audit
   - Performance optimization
   - Database backups
   - Monitoring setup

## API Documentation

### Authentication

**POST /api/v1/auth/login**
```json
{
  "email": "admin@epatang.com",
  "password": "<the ADMIN_PASSWORD configured during seeding>"
}
```

**POST /api/v1/auth/register**
```json
{
  "email": "user@example.com",
  "password": "<a private password>",
  "firstName": "John",
  "lastName": "Doe",
  "organizationName": "My Company"
}
```

### Tasks

**GET /api/v1/tasks**
- Headers: `Authorization: Bearer <token>`
- Query params: `status`, `priority`, `projectId`, `search`, `page`, `limit`

**POST /api/v1/tasks**
```json
{
  "title": "Task title",
  "description": "Task description",
  "status": "todo",
  "priority": "medium",
  "deadline": "2026-10-20",
  "projectId": "project-id"
}
```

**PUT /api/v1/tasks/:id**
- Update task details

**DELETE /api/v1/tasks/:id**
- Delete a task

## Support

For issues or questions:
- Email: support@digitaldas.com
- Check the documentation in `docs/` folder
- Review the implementation status in `IMPLEMENTATION_STATUS.md`

## License

UNLICENSED
