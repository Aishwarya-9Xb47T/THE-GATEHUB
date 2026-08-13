import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Link as LinkIcon, Keyboard, Loader2, X, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { parseClassroomJoinInput, classroomJoinTargetPath } from '@/lib/classroom/joinUrls';
import jsQR from 'jsqr';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoinPath: (path: string) => void;
  onRequestPasteLink?: () => void;
  onRequestEnterCode?: () => void;
};

export function ClassroomQrScannerDialog({
  open,
  onOpenChange,
  onJoinPath,
  onRequestPasteLink,
  onRequestEnterCode,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const handledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<'idle' | 'starting' | 'scanning' | 'detected' | 'error'>('idle');
  const [message, setMessage] = useState('Point your camera at the classroom QR code');
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const handleDecoded = useCallback(
    (raw: string) => {
      if (handledRef.current) return;
      const parsed = parseClassroomJoinInput(raw);
      if (!parsed.ok) {
        setError(parsed.reason || 'Invalid classroom QR code.');
        setStatus('error');
        setMessage('Invalid classroom QR code.');
        return;
      }
      handledRef.current = true;
      setStatus('detected');
      setMessage('QR detected ✓  Joining classroom…');
      stopCamera();
      onJoinPath(classroomJoinTargetPath(parsed));
      onOpenChange(false);
    },
    [onJoinPath, onOpenChange, stopCamera],
  );

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || handledRef.current) return;
    if (video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const code = jsQR(image.data, w, h, { inversionAttempts: 'attemptBoth' });
    if (code?.data) {
      handleDecoded(code.data);
      return;
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, [handleDecoded]);

  const startCamera = useCallback(async () => {
    setError(null);
    setStatus('starting');
    setMessage('Starting camera…');
    handledRef.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setError('No camera detected.');
        setMessage('No camera detected. Use Upload QR Image, Paste Link, or Enter Session Code.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus('scanning');
      setMessage('Scanning for classroom QR…');
      rafRef.current = requestAnimationFrame(scanFrame);
    } catch (err: any) {
      const name = String(err?.name || '');
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Camera access was denied.');
        setMessage('Camera access was denied. You can still join using Paste Link or Enter Session Code.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('No camera detected.');
        setMessage('No camera detected. Use Upload QR Image, Paste Link, or Enter Session Code.');
      } else {
        setError('Unable to start camera.');
        setMessage('Unable to start camera. Try uploading a QR image instead.');
      }
      setStatus('error');
    }
  }, [scanFrame]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setStatus('idle');
      setError(null);
      setMessage('Point your camera at the classroom QR code');
      handledRef.current = false;
      return;
    }
    void startCamera();
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  const onUploadFile = async (file: File | null) => {
    if (!file) return;
    const okType = /image\/(png|jpeg|jpg|webp)/i.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
    if (!okType) {
      setError('Please upload a PNG, JPG, or WEBP image of the QR code.');
      setStatus('error');
      return;
    }
    setError(null);
    setMessage('Reading QR image…');
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(bitmap, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
      if (!code?.data) {
        setError('QR code could not be read.');
        setStatus('error');
        setMessage('QR code could not be read. Try a clearer photo.');
        return;
      }
      handleDecoded(code.data);
    } catch {
      setError('QR code could not be read.');
      setStatus('error');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>Scan QR Code</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>

        <div className="relative bg-black aspect-[3/4] sm:aspect-video mx-4 rounded-xl overflow-hidden border border-border">
          <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[70%] max-w-[240px] aspect-square border-2 border-white/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          {status === 'starting' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Starting camera…
            </div>
          )}
          {status === 'detected' && (
            <div className="absolute inset-0 flex items-center justify-center bg-emerald-950/70 text-emerald-100 text-sm font-semibold">
              QR detected ✓ Joining classroom…
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-4 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={(e) => void onUploadFile(e.target.files?.[0] || null)}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full h-11"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4 mr-2" />
            Upload QR Image
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-11"
              onClick={() => {
                onOpenChange(false);
                onRequestPasteLink?.();
              }}
            >
              <LinkIcon className="h-4 w-4 mr-2" />
              Paste Link
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-11"
              onClick={() => {
                onOpenChange(false);
                onRequestEnterCode?.();
              }}
            >
              <Keyboard className="h-4 w-4 mr-2" />
              Enter Code
            </Button>
          </div>
          <Button type="button" variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          {status === 'error' && (
            <Button type="button" className="w-full" onClick={() => void startCamera()}>
              <Camera className="h-4 w-4 mr-2" />
              Retry Camera
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
