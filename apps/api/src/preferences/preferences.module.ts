import { Body, Controller, Get, Injectable, Module, Put, Request, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles, PRIVILEGED_ROLES } from '../common/roles';
import { CelebrationVoiceController, CelebrationVoiceService } from './celebration-voice';

@Injectable()
export class PreferencesService {
  constructor(private prisma: PrismaService, private voice: CelebrationVoiceService) {}

  async get(userId: string, organizationId: string) {
    const [prefs, orgSettings] = await Promise.all([
      this.prisma.userPreference.upsert({ where: { userId }, update: {}, create: { userId } }),
      this.prisma.organizationSettings.findUnique({ where: { organizationId } }),
    ]);
    return {
      soundEnabled: prefs.soundEnabled,
      soundVolume: prefs.soundVolume,
      submissionSound: prefs.submissionSound,
      globalSoundEnabled: orgSettings?.soundEnabled ?? true,
      brandName: orgSettings?.brandName ?? 'EPATANG',
      customVoice: this.voice.getMeta(userId),
    };
  }

  update(userId: string, data: any) {
    return this.prisma.userPreference.upsert({
      where: { userId },
      update: {
        soundEnabled: data.soundEnabled ?? undefined,
        soundVolume: data.soundVolume !== undefined ? Math.min(100, Math.max(0, Number(data.soundVolume))) : undefined,
        submissionSound: data.submissionSound ?? undefined,
      },
      create: {
        userId,
        soundEnabled: data.soundEnabled ?? true,
        soundVolume: data.soundVolume ?? 70,
        submissionSound: data.submissionSound ?? false,
      },
    });
  }
}

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  getOrg(organizationId: string) {
    return this.prisma.organizationSettings.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId },
    });
  }

  async updateOrg(organizationId: string, data: any, userId: string) {
    const updated = await this.prisma.organizationSettings.upsert({
      where: { organizationId },
      update: {
        brandName: data.brandName, soundEnabled: data.soundEnabled, primaryColor: data.primaryColor,
        timezone: data.timezone, dateFormat: data.dateFormat, currency: data.currency,
      },
      create: {
        organizationId, brandName: data.brandName || 'EPATANG',
        soundEnabled: data.soundEnabled ?? true, primaryColor: data.primaryColor || '#10b981',
      },
    });
    await this.prisma.auditLog.create({
      data: { organizationId, userId, action: 'update', resource: 'settings', changes: data },
    });
    return updated;
  }
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class PreferencesController {
  constructor(
    private readonly preferences: PreferencesService,
    private readonly settings: SettingsService,
  ) {}

  @Get('preferences')
  get(@Request() req: any) {
    return this.preferences.get(req.user.id, req.user.organizationId);
  }

  @Put('preferences')
  update(@Request() req: any, @Body() body: any) {
    return this.preferences.update(req.user.id, body);
  }

  @Get('settings/org')
  getOrg(@Request() req: any) {
    return this.settings.getOrg(req.user.organizationId);
  }

  @Put('settings/org')
  @Roles(...PRIVILEGED_ROLES)
  updateOrg(@Request() req: any, @Body() body: any) {
    return this.settings.updateOrg(req.user.organizationId, body, req.user.id);
  }
}

@Module({
  controllers: [PreferencesController, CelebrationVoiceController],
  providers: [PreferencesService, SettingsService, CelebrationVoiceService],
})
export class PreferencesModule {}
