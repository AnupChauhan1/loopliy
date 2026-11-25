'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, LoaderCircle, X } from 'lucide-react';
import api from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { errorMessage, useToast } from '@/components/ui/toast';

export default function AttendanceCamera({
  action,
  onClose,
  onComplete,
}: {
  action: 'check-in' | 'check-out';
  onClose: () => void;
  onComplete: () => void;
}) {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let active = true;
    const openCamera = async () => {
      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        setCameraError('Camera access requires a secure HTTPS connection.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('This browser does not support camera access.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (error) {
        if (!active) return;
        const name = (error as DOMException)?.name;
        setCameraError(name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings and try again.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : 'Could not open the camera. Check that it is not being used by another app.');
      }
    };
    void openCamera();
    return () => {
      active = false;
      stopCamera();
    };
  }, [stopCamera]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('The camera is still starting. Please try again in a moment.');
      return;
    }
    setSaving(true);
    setCameraError('');
    try {
      const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare the camera image.');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const photo = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not capture the camera image.')), 'image/jpeg', 0.86);
      });
      const formData = new FormData();
      formData.append('photo', photo, 'attendance.jpg');
      await api.post(`/attendance/${action}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      stopCamera();
      toast.success(action === 'check-in' ? 'Punched in' : 'Punched out', 'Your attendance photo was securely saved.');
      onComplete();
    } catch (error) {
      const message = errorMessage(error, 'Could not save your attendance.');
      setCameraError(message);
      toast.error('Attendance was not saved', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="attendance-camera-title">
      <div className="w-[95vw] sm:w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 id="attendance-camera-title" className="font-semibold text-gray-900">
              Verify {action === 'check-in' ? 'punch in' : 'punch out'}
            </h2>
            <p className="mt-1 text-xs text-gray-500">Take a current photo to securely record this attendance action.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close camera" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4 p-5">
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-gray-950">
            <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline />
            {!ready && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/80">
                <LoaderCircle className="h-6 w-6 animate-spin" />
                Opening camera…
              </div>
            )}
            {ready && <span className="absolute bottom-3 left-3 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white">Live camera</span>}
          </div>
          {cameraError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{cameraError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={capture} disabled={!ready || saving} className="gradient-brand-btn text-white">
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <><Camera className="h-4 w-4" /><Check className="h-4 w-4" /></>}
              {saving ? 'Saving…' : 'Capture and punch'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
