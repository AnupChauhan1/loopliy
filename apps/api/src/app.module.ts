import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DataHygieneService } from './common/data-hygiene.service';
import { AccountBootstrapService } from './common/account-bootstrap.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';
import { ProjectsModule } from './projects/projects.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DepartmentsModule } from './departments/departments.module';
import { UsersModule } from './users/users.module';
import { CreativesModule } from './approvals/creative.module';
import { VideosModule } from './approvals/video.module';
import { ModulesModule } from './modules-registry/modules.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PreferencesModule } from './preferences/preferences.module';
import { LeaveModule } from './leave/leave.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { MiscModule } from './misc/misc.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { IssuesModule } from './issues/issues.module';
import { TemplatesModule } from './templates/templates.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ClientPortalModule } from './client-portal/client-portal.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    AuthModule,
    TasksModule,
    ProjectsModule,
    DepartmentsModule,
    UsersModule,
    CreativesModule,
    VideosModule,
    ModulesModule,
    DashboardModule,
    PreferencesModule,
    LeaveModule,
    AnnouncementsModule,
    MiscModule,
    TimeEntriesModule,
    IssuesModule,
    TemplatesModule,
    AttendanceModule,
    ClientPortalModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService, DataHygieneService, AccountBootstrapService],
})
export class AppModule {}
