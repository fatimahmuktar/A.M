import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Loader2, CameraOff, ScanLine } from "lucide-react";

interface QrScannerProps {
  onScan: (data: string) => void;
  active: boolean;
}

type ScanState = "requesting" | "active" | "denied" | "unsupported";

export function QrScanner({ onScan, active }: QrScannerProps) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number>(0);
  const scannedRef = useRef(false);

  const [state, setState]     = useState<ScanState>("requesting");
  const [flashLine, setFlash] = useState(false);

  useEffect(() => {
    if (!active) return;
    scannedRef.current = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unsupported");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setState("active");
          scan();
        }
      } catch {
        setState("denied");
      }
    }

    function scan() {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || scannedRef.current) return;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      const tick = () => {
        if (!video || !canvas || scannedRef.current) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width  = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code?.data) {
            scannedRef.current = true;
            setFlash(true);
            setTimeout(() => {
              stopStream();
              onScan(code.data);
            }, 200);
            return;
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      stopStream();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function stopStream() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  if (state === "unsupported") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-44 bg-muted/30 rounded-xl border border-border text-center px-6">
        <CameraOff className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm font-medium text-muted-foreground">Camera not supported</p>
        <p className="text-xs text-muted-foreground/60">Use Enter Code instead</p>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-44 bg-destructive/10 rounded-xl border border-destructive/30 text-center px-6">
        <CameraOff className="w-8 h-8 text-destructive" />
        <p className="text-sm font-medium text-destructive">Camera access denied</p>
        <p className="text-xs text-destructive/70">
          Allow camera in your browser settings, then refresh the page
        </p>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-black border border-border" style={{ aspectRatio: "4/3" }}>
      {/* Live camera feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      {/* Hidden canvas for jsQR processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Loading overlay */}
      {state === "requesting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-xs text-white/70">Starting camera…</p>
        </div>
      )}

      {/* Flash on successful scan */}
      {flashLine && (
        <div className="absolute inset-0 bg-green-500/40 transition-opacity" />
      )}

      {/* Corner brackets */}
      {state === "active" && (
        <>
          <div className="absolute top-4 left-4  w-8 h-8 border-t-[3px] border-l-[3px] border-primary rounded-tl" />
          <div className="absolute top-4 right-4 w-8 h-8 border-t-[3px] border-r-[3px] border-primary rounded-tr" />
          <div className="absolute bottom-4 left-4  w-8 h-8 border-b-[3px] border-l-[3px] border-primary rounded-bl" />
          <div className="absolute bottom-4 right-4 w-8 h-8 border-b-[3px] border-r-[3px] border-primary rounded-br" />

          {/* Animated scan line */}
          <div className="absolute left-6 right-6 h-0.5 bg-primary/80 shadow-[0_0_6px_2px_rgba(239,68,68,0.5)] animate-scan-line" />
        </>
      )}

      {/* Label */}
      {state === "active" && (
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent pt-6 pb-2 text-center">
          <p className="text-xs text-white/80 flex items-center justify-center gap-1.5">
            <ScanLine className="w-3.5 h-3.5" />
            Point at instructor's QR code
          </p>
        </div>
      )}
    </div>
  );
}
