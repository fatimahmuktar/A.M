import { useEffect, useState, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { generateSessionToken, type TokenData } from "@/lib/session-token";

interface QRCodeDisplayProps {
  sessionId?: string;
  onCodeChange?: (code: string) => void;
  showEnlarge?: boolean;
}

export function QRCodeDisplay({
  sessionId = "CS301",
  onCodeChange,
  showEnlarge = false,
}: QRCodeDisplayProps) {
  const [tokenData, setTokenData] = useState<TokenData>(() =>
    generateSessionToken(sessionId)
  );
  const [fullscreen, setFullscreen] = useState(false);

  /* ── Token rotation: re-generate every second, rotates every 120 s ── */
  const refreshRef = useRef<() => void>(() => {});
  refreshRef.current = () => {
    const next = generateSessionToken(sessionId);
    if (next.code !== tokenData.code) {
      setTokenData(next);
      onCodeChange?.(next.code);
    } else {
      /* Just update secondsLeft */
      setTokenData(next);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => refreshRef.current(), 1000);
    return () => clearInterval(interval);
  }, []);

  /* Notify parent of initial code */
  const onCodeChangeRef = useRef(onCodeChange);
  onCodeChangeRef.current = onCodeChange;
  useEffect(() => {
    onCodeChangeRef.current?.(tokenData.code);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Fullscreen API ── */
  const enterFullscreen = useCallback(async () => {
    setFullscreen(true);
    await new Promise((r) => setTimeout(r, 50));
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* not supported — overlay still shows */
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    setFullscreen(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("keydown", onKey);
    };
  }, [exitFullscreen]);

  /* ── QR value: JSON payload the student app can parse ── */
  const activeSessionId =
    (typeof localStorage !== "undefined" &&
      localStorage.getItem("neu_active_session_id")) ||
    "";
  const qrValue = JSON.stringify({
    v: 1,
    cid: sessionId,
    token: tokenData.code,
    sid: activeSessionId,
  });

  /* ── Countdown display ── */
  const { secondsLeft } = tokenData;
  const mm = Math.floor(secondsLeft / 60);
  const ss = secondsLeft % 60;
  const countdownStr = `${mm}:${ss.toString().padStart(2, "0")}`;
  const isUrgent = secondsLeft <= 20;
  const progressPct = (secondsLeft / 300) * 100;

  /* ── Code tiles (normal size) ── */
  const NormalCodeTiles = () => (
    <AnimatePresence mode="wait">
      <motion.div
        key={tokenData.window}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className="flex gap-2"
      >
        {tokenData.code.split("").map((digit, i) => (
          <div
            key={i}
            className="w-9 h-11 flex items-center justify-center rounded-lg font-mono font-bold text-xl bg-primary/15 border border-primary/30 text-primary"
          >
            {digit}
          </div>
        ))}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <>
      {/* ── Normal display ── */}
      <div className="flex flex-col items-center gap-4 w-full">
        {/* Real QR code */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tokenData.window}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-xl shadow-md p-3"
          >
            <QRCodeSVG
              value={qrValue}
              size={176}
              bgColor="#ffffff"
              fgColor="#000000"
              level="H"
              includeMargin={false}
            />
          </motion.div>
        </AnimatePresence>

        {/* 6-digit code */}
        <NormalCodeTiles />

        {/* Countdown */}
        <div
          className={`flex items-center gap-2 text-xs font-mono ${
            isUrgent ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          <motion.span
            className={`w-2 h-2 rounded-full ${
              isUrgent ? "bg-destructive" : "bg-primary"
            }`}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          Changes in {countdownStr}
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-[200px] h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${
              isUrgent ? "bg-destructive" : "bg-primary"
            }`}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.8 }}
          />
        </div>

        {/* Fullscreen button */}
        {showEnlarge && (
          <button
            onClick={enterFullscreen}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-sm font-medium transition-colors"
          >
            <Maximize2 className="w-4 h-4" /> ⛶ Fullscreen
          </button>
        )}
      </div>

      {/* ── Fullscreen overlay ── */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0a0f1e]"
          >
            {/* Header bar */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 py-5">
              <div>
                <p className="text-white font-bold text-xl tracking-tight">
                  {sessionId} — Attendance Session
                </p>
                <p className="text-white/40 text-sm mt-0.5">
                  Scan the QR code or enter the 6-digit code
                </p>
              </div>
              <button
                onClick={exitFullscreen}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Exit fullscreen (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Big QR — 500 px */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`fs-${tokenData.window}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-white rounded-2xl shadow-2xl p-6"
              >
                <QRCodeSVG
                  value={qrValue}
                  size={500}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="H"
                  includeMargin={false}
                />
              </motion.div>
            </AnimatePresence>

            {/* Big 6-digit code — 80 px font */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`fs-code-${tokenData.window}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-10 flex gap-3"
              >
                {tokenData.code.split("").map((digit, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-center rounded-xl bg-white/10 border border-white/20 text-white font-mono font-bold"
                    style={{ width: 96, height: 116, fontSize: 80 }}
                  >
                    {digit}
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>

            {/* Countdown */}
            <div
              className={`mt-8 flex items-center gap-3 text-lg font-mono ${
                isUrgent ? "text-red-400" : "text-white/60"
              }`}
            >
              <motion.span
                className={`w-3 h-3 rounded-full ${
                  isUrgent ? "bg-red-400" : "bg-white/40"
                }`}
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              Changes in {countdownStr}
            </div>

            {/* Bottom hint */}
            <p className="absolute bottom-6 text-white/20 text-xs tracking-wide">
              Press Esc or click × to exit · NEU AttendAI
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
