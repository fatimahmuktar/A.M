import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, CalendarOff, Clock, CheckCircle2 } from "lucide-react";
import { apiGetSessions, type ApiSession } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

function formatDT(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function durationMin(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

export default function SessionHistory() {
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data } = await apiGetSessions();
      if (cancelled) return;
      if (data?.sessions) {
        const ended = data.sessions.filter((s) => s.endedAt);
        setSessions(ended);
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const q = search.toLowerCase().trim();
  const filtered = q
    ? sessions.filter((s) => s.courseId.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
    : sessions;

  return (
    <Layout role="professor">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Session History</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Review past attendance records and session analytics.
          </p>
        </div>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search sessions by course or ID…" className="pl-8 bg-card" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 mt-6">
          {[1,2,3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 gap-3">
            <CalendarOff className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-base font-semibold text-muted-foreground">No sessions recorded yet</p>
            <p className="text-sm text-muted-foreground/60 text-center max-w-xs">
              Sessions will appear here after you start and end a live attendance session from the Live Session page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <Card key={s.id} className="border-border/60">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{s.courseId}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{s.id}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDT(s.startedAt)}</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-green-400" /> Ended {formatDT(s.endedAt!)}</span>
                  <span className="bg-muted/50 px-2 py-0.5 rounded text-xs font-mono">{durationMin(s.startedAt, s.endedAt!)} min</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}
