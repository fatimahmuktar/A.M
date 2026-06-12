import { Brain, TrendingDown, TrendingUp, Minus, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";
import type { RiskLevel, TrendDir, FraudAlert } from "@/lib/ai-analytics";

/* ── AI Insight Card ─────────────────────────────────────────────────────── */

interface InsightCardProps {
  title?: string;
  insights: string[];
  className?: string;
  compact?: boolean;
}

export function AIInsightCard({ title = "AI Insights", insights, className = "", compact = false }: InsightCardProps) {
  if (insights.length === 0) return null;
  return (
    <div className={`bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-primary shrink-0" />
        <p className="text-sm font-semibold text-primary">{title}</p>
      </div>
      <ul className="space-y-1.5">
        {insights.slice(0, compact ? 3 : insights.length).map((insight, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="text-xs text-foreground/75 flex items-start gap-2"
          >
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
            {insight}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/* ── Risk Badge ──────────────────────────────────────────────────────────── */

export function RiskBadge({ level, size = "sm" }: { level: RiskLevel; size?: "sm" | "md" }) {
  const cfg = {
    low:    { label: "Low Risk",    cls: "bg-green-500/10 text-green-400 border-green-500/30" },
    medium: { label: "Medium Risk", cls: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" },
    high:   { label: "High Risk",   cls: "bg-destructive/10 text-destructive border-destructive/30" },
  }[level];

  const base = size === "md" ? "text-xs px-2.5 py-1" : "text-[10px] px-2 py-0.5";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-semibold ${cfg.cls} ${base}`}>
      {level === "high"   && <AlertTriangle className="w-2.5 h-2.5 shrink-0" />}
      {level === "medium" && <Minus         className="w-2.5 h-2.5 shrink-0" />}
      {level === "low"    && <CheckCircle2  className="w-2.5 h-2.5 shrink-0" />}
      {cfg.label}
    </span>
  );
}

/* ── Trend Icon ──────────────────────────────────────────────────────────── */

export function TrendIcon({ trend }: { trend: TrendDir }) {
  if (trend === "improving") return <TrendingUp  className="w-3.5 h-3.5 text-green-400" />;
  if (trend === "declining") return <TrendingDown className="w-3.5 h-3.5 text-destructive" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

/* ── Fraud Alert Banner ──────────────────────────────────────────────────── */

interface FraudBannerProps {
  alerts: FraudAlert[];
  onDismiss?: () => void;
}

export function FraudAlertBanner({ alerts, onDismiss }: FraudBannerProps) {
  if (alerts.length === 0) return null;
  const top = alerts[0];
  const colourCls =
    top.severity === "high"
      ? "bg-destructive/10 border-destructive/40 text-destructive"
      : "bg-yellow-500/10 border-yellow-500/40 text-yellow-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border px-4 py-3 ${colourCls}`}
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Suspicious Attendance Detected</p>
          <p className="text-xs mt-0.5 opacity-80">{top.message}</p>
          {alerts.length > 1 && (
            <p className="text-xs mt-1 opacity-70">+{alerts.length - 1} additional flag{alerts.length > 2 ? "s" : ""}</p>
          )}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="text-xs underline opacity-70 hover:opacity-100 shrink-0">
            Dismiss
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ── Mini Sparkline (weekly rate bars) ───────────────────────────────────── */

export function AttendanceSparkline({ data }: { data: { week: string; rate: number }[] }) {
  const max = 100;
  return (
    <div className="flex items-end gap-1 h-10">
      {data.map((d, i) => {
        const h = Math.round((d.rate / max) * 40);
        const colour = d.rate >= 80 ? "bg-green-500/60" : d.rate >= 70 ? "bg-yellow-500/60" : "bg-destructive/60";
        return (
          <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
            <div className={`w-full rounded-sm ${colour}`} style={{ height: `${h}px` }} title={`${d.week}: ${d.rate}%`} />
          </div>
        );
      })}
    </div>
  );
}
