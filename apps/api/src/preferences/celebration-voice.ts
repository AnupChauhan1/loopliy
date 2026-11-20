import {
  BadRequestException, Controller, Delete, Get, Injectable, NotFoundException, Post, Request, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { join } from 'path';
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, renameSync } from 'fs';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

export const MAX_VOICE_BYTES = 10 * 1024 * 1024;

/**
 * Per-user celebration recordings. Stored outside the public /uploads folder so they are only
 * reachable through the authenticated endpoints below, and only by their owner.
 */
const VOICE_DIR = join(process.cwd(), 'private', 'celebration-voices');

export interface VoiceMeta {
  mimeType: string;
  size: number;
  originalName: string;
  updatedAt: string;
}

type Format = { mime: string; test: (b: Buffer) => boolean };
// Detected from the file's magic bytes, never from the client-supplied name or MIME type
const FORMATS: Format[] = [
  { mime: 'audio/wav', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE' },
  { mime: 'audio/mpeg', test: (b) => b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  { mime: 'audio/webm', test: (b) => b.readUInt32BE(0) === 0x1a45dfa3 },
  { mime: 'audio/ogg', test: (b) => b.toString('ascii', 0, 4) === 'OggS' },
  // Safari / iOS MediaRecorder produces MP4 (AAC) audio
  { mime: 'audio/mp4', test: (b) => b.toString('ascii', 4, 8) === 'ftyp' },
];

@Injectable()
export class CelebrationVoiceService {
  constructor() {
    mkdirSync(VOICE_DIR, { recursive: true });
  }

  private paths(userId: string) {
    if (!/^[0-9a-zA-Z-]{1,64}$/.test(userId)) throw new BadRequestException('Invalid user');
    return { audio: join(VOICE_DIR, `${userId}.audio`), meta: join(VOICE_DIR, `${userId}.json`) };
  }

  getMeta(userId: string): VoiceMeta | null {
    const { audio, meta } = this.paths(userId);
    if (!existsSync(audio) || !existsSync(meta)) return null;
    return JSON.parse(readFileSync(meta, 'utf8'));
  }

  save(userId: string, file: { buffer: Buffer; originalname: string; size: number } | undefined): VoiceMeta {
    if (!file?.buffer?.length) throw new BadRequestException('No audio file received');
    if (file.size > MAX_VOICE_BYTES) throw new BadRequestException('Audio file must be 10 MB or smaller');
    const format = file.buffer.length >= 12 ? FORMATS.find((f) => f.test(file.buffer)) : undefined;
    if (!format) throw new BadRequestException('Unsupported audio. Please use an MP3, WAV or WebM file.');
    const { audio, meta } = this.paths(userId);
    const info: VoiceMeta = {
      mimeType: format.mime,
      size: file.size,
      originalName: String(file.originalname || 'recording').replace(/[^\w.\- ()]/g, '_').slice(0, 120),
      updatedAt: new Date().toISOString(),
    };
    // Write to temp files first so a failed upload never leaves a half-written recording
    writeFileSync(audio + '.tmp', file.buffer);
    writeFileSync(meta + '.tmp', JSON.stringify(info));
    renameSync(audio + '.tmp', audio);
    renameSync(meta + '.tmp', meta);
    return info;
  }

  remove(userId: string) {
    const { audio, meta } = this.paths(userId);
    rmSync(audio, { force: true });
    rmSync(meta, { force: true });
  }

  audioPath(userId: string) {
    const info = this.getMeta(userId);
    if (!info) throw new NotFoundException('No celebration recording uploaded');
    return { path: this.paths(userId).audio, info };
  }
}

@Controller('preferences/voice')
@UseGuards(JwtAuthGuard)
export class CelebrationVoiceController {
  constructor(private readonly voice: CelebrationVoiceService) {}

  @Get()
  meta(@Request() req: any) {
    return { voice: this.voice.getMeta(req.user.id) };
  }

  @Get('audio')
  audio(@Request() req: any, @Res() res: Response) {
    const { path, info } = this.voice.audioPath(req.user.id);
    res.setHeader('Content-Type', info.mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_VOICE_BYTES, files: 1 } }))
  upload(@Request() req: any, @UploadedFile() file: any) {
    return { voice: this.voice.save(req.user.id, file) };
  }

  @Delete()
  remove(@Request() req: any) {
    this.voice.remove(req.user.id);
    return { voice: null };
  }
}
