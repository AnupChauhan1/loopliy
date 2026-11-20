'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCompletionCelebration, useUpdatePrefs } from '@/lib/use-sound-prefs';
import { useAuth } from '@/lib/auth-context';
import { Volume2, VolumeX, PartyPopper, Save, Send } from 'lucide-react';
import { volumeOf, type CelebrationKind } from '@/lib/sound';
import { MyVoiceRecorder } from '@/components/my-voice-recorder';

export default function SettingsPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const { prefs, preview, customVoice } = useCompletionCelebration();
  const updatePrefs = useUpdatePrefs();
  const [org, setOrg] = useState({ brandName: '', soundEnabled: true, primaryColor: '#00A878', timezone: 'UTC' });
  const [saved, setSaved] = useState(false);
  const [previewMsg, setPreviewMsg] = useState('');
  const [playing, setPlaying] = useState<CelebrationKind | null>(null);

  const { data: orgSettings } = useQuery({
    queryKey: ['org-settings'],
    queryFn: () => api.get('/settings/org').then((r) => r.data),
  });

  useEffect(() => {
    if (orgSettings) setOrg({ brandName: orgSettings.brandName ?? '', soundEnabled: orgSettings.soundEnabled ?? true, primaryColor: orgSettings.primaryColor ?? '#00A878', timezone: orgSettings.timezone ?? 'UTC' });
  }, [orgSettings]);

  const updateOrg = useMutation({
    mutationFn: () => api.put('/settings/org', org),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      queryClient.invalidateQueries({ queryKey: ['preferences'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const previewSound = async (kind: CelebrationKind = 'completed') => {
    setPlaying(kind);
    const ok = await preview(kind);
    setPlaying(null);
    setPreviewMsg(ok ? '' : 'Audio was blocked — interact with the page and try again.');
    if (ok && kind === 'completed' && !customVoice) setPreviewMsg('No recording yet — record or upload your voice above.');
    setTimeout(() => setPreviewMsg(''), 3000);
  };

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-[26px] font-semibold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Your preferences {role === 'admin' && '& organization settings'}</p>
      </div>

      {/* Sound settings */}
      <Card className="card-premium">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            {prefs?.soundEnabled ? <Volume2 className="h-4 w-4 text-brand-600" /> : <VolumeX className="h-4 w-4 text-gray-400" />}
            Task completion voice
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {prefs?.globalSoundEnabled === false && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-800">
              The admin has disabled the completion sound for the whole organization.
            </div>
          )}
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium text-gray-800">Enable celebration sound</p>
              <p className="text-xs text-gray-500">Play your recorded voice when a task you own reaches Completed</p>
            </div>
            <button
              onClick={() => updatePrefs.mutate({ soundEnabled: !(prefs?.soundEnabled ?? true) })}
              className={`relative h-6 w-11 rounded-full transition-all duration-300 ${(prefs?.soundEnabled ?? true) ? 'bg-brand-500 shadow-inner shadow-brand-600/30' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${(prefs?.soundEnabled ?? true) ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </label>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium text-gray-800">Volume</p>
              <span className="text-xs text-gray-500">{prefs?.soundVolume ?? 70}%</span>
            </div>
            <input
              type="range" min={0} max={100}
              value={prefs?.soundVolume ?? 70}
              onChange={(e) => updatePrefs.mutate({ soundVolume: Number(e.target.value) })}
              className="w-full accent-brand-600"
            />
          </div>

          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <p className="text-sm font-medium text-gray-800">Submission sound</p>
              <p className="text-xs text-gray-500">Also play when submitting for review (optional)</p>
            </div>
            <button
              onClick={() => updatePrefs.mutate({ submissionSound: !prefs?.submissionSound })}
              className={`relative h-6 w-11 rounded-full transition-all duration-300 ${prefs?.submissionSound ? 'bg-brand-500 shadow-inner shadow-brand-600/30' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${prefs?.submissionSound ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </label>

          <MyVoiceRecorder voice={customVoice} volume={volumeOf(prefs)} />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => previewSound('completed')} disabled={!!playing} className="rounded-xl">
              <PartyPopper className="h-4 w-4 text-brand-600" />{playing === 'completed' ? 'Playing…' : 'Preview completion'}
            </Button>
            <Button variant="outline" onClick={() => previewSound('submitted')} disabled={!!playing} className="rounded-xl">
              <Send className="h-4 w-4 text-brand-600" />{playing === 'submitted' ? 'Playing…' : 'Preview submission'}
            </Button>
            {previewMsg && <p className="text-xs text-gray-700">{previewMsg}</p>}
          </div>
          <p className="text-[11px] text-gray-400">Completion plays your own recording (no AI or computer voice) with the emoji &amp; confetti party. Submission plays a short chime.</p>
        </CardContent>
      </Card>

      {/* Org settings — admin only */}
      {role === 'admin' && (
        <Card className="card-premium">
          <CardHeader className="pb-3"><CardTitle className="text-base font-semibold">Organization & branding</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Brand name</label>
              <input value={org.brandName} onChange={(e) => setOrg({ ...org, brandName: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Primary color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={org.primaryColor} onChange={(e) => setOrg({ ...org, primaryColor: e.target.value })} className="h-9 w-14 cursor-pointer rounded-lg border border-gray-200" />
                  <span className="text-xs font-mono text-gray-500">{org.primaryColor}</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Timezone</label>
                <input value={org.timezone} onChange={(e) => setOrg({ ...org, timezone: e.target.value })} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm" />
              </div>
            </div>
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-sm font-medium text-gray-800">Global completion sound</p>
                <p className="text-xs text-gray-500">Allow the completion voice across the whole organization</p>
              </div>
              <button
                onClick={() => setOrg({ ...org, soundEnabled: !org.soundEnabled })}
                className={`relative h-6 w-11 rounded-full transition-all duration-300 ${org.soundEnabled ? 'bg-brand-500 shadow-inner shadow-brand-600/30' : 'bg-gray-200'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${org.soundEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <Button onClick={() => updateOrg.mutate()} disabled={updateOrg.isPending} className="gradient-brand-btn text-white border-0 rounded-xl">
              <Save className="h-4 w-4 mr-1.5" /> {updateOrg.isPending ? 'Saving...' : saved ? 'Saved ✓' : 'Save settings'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
