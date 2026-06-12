import { useMemo, useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, User, Loader2 } from "lucide-react";
import { type CourseRecord } from "@/lib/store";
import { apiGetStudentCourses } from "@/lib/api";
import { useLang } from "@/context/lang-context";

const DAYS_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday",
  Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

const TODAY_SHORT = (() => {
  const d = new Date().getDay();
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] ?? "Mon";
})();

function parseDays(days: string): string[] {
  if (!days) return [];
  return days.split(/[,/\s]+/).map((s) => s.trim()).filter(Boolean).map((s) => {
    const low = s.toLowerCase();
    if (low.startsWith("mon")) return "Mon";
    if (low.startsWith("tue")) return "Tue";
    if (low.startsWith("wed")) return "Wed";
    if (low.startsWith("thu")) return "Thu";
    if (low.startsWith("fri")) return "Fri";
    if (low.startsWith("sat")) return "Sat";
    if (low.startsWith("sun")) return "Sun";
    return s;
  });
}

function mapApiToCourse(c: { courseCode: string; courseName: string; instructor: string; room: string; days: string; startTime: string; endTime: string; semester: string; source: string }): CourseRecord {
  return {
    id:         c.courseCode,
    name:       c.courseName,
    instructor: c.instructor,
    room:       c.room,
    days:       c.days,
    startTime:  c.startTime,
    endTime:    c.endTime,
    semester:   c.semester,
    source:     c.source as "imported" | "manual",
  };
}

export default function StudentSchedule() {
  const { t } = useLang();
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetStudentCourses().then((r) => {
      if (r.data) setCourses(r.data.courses.map(mapApiToCourse));
      setLoading(false);
    });
  }, []);

  const byDay = useMemo(() => {
    const map: Record<string, typeof courses> = {};
    for (const day of DAYS_ORDER) map[day] = [];
    for (const c of courses) {
      const days = parseDays(c.days ?? "");
      for (const d of days) {
        if (map[d]) map[d].push(c);
      }
    }
    for (const day of DAYS_ORDER) {
      map[day]?.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    }
    return map;
  }, [courses]);

  const todayCourses = byDay[TODAY_SHORT] ?? [];
  const hasAnyCourse = courses.length > 0;

  return (
    <Layout role="student">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 sm:w-7 sm:h-7 text-primary shrink-0" />
            My Schedule
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Your weekly lecture timetable from enrolled courses.
          </p>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/40 mx-auto" />
            </CardContent>
          </Card>
        ) : !hasAnyCourse ? (
          <Card>
            <CardContent className="py-16 text-center space-y-3">
              <Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto" />
              <p className="font-semibold text-sm">No courses enrolled yet</p>
              <p className="text-xs text-muted-foreground">Add courses from the Self Attendance page to see your schedule here.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Today highlight */}
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Today — {DAY_LABELS[TODAY_SHORT]}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {todayCourses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lectures today. Enjoy your day!</p>
                ) : (
                  <div className="space-y-2">
                    {todayCourses.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
                        <div className="w-1 self-stretch rounded-full bg-primary" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-primary text-sm">{c.id}</span>
                            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary bg-primary/5">Today</Badge>
                          </div>
                          <p className="font-medium text-sm mt-0.5">{c.name}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                            {c.instructor && <span className="flex items-center gap-1"><User className="w-3 h-3" />{c.instructor}</span>}
                            {c.room && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.room}</span>}
                            {c.startTime && c.endTime && (
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{c.startTime} – {c.endTime}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Weekly grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {DAYS_ORDER.map((day) => {
                const dayCourses = byDay[day] ?? [];
                const isToday = day === TODAY_SHORT;
                return (
                  <Card key={day} className={isToday ? "border-primary/40" : ""}>
                    <CardHeader className="pb-2">
                      <CardTitle className={`text-sm font-semibold flex items-center justify-between ${isToday ? "text-primary" : ""}`}>
                        {DAY_LABELS[day]}
                        {isToday && <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30">Today</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {dayCourses.length === 0 ? (
                        <p className="text-xs text-muted-foreground/50 py-2">No lectures</p>
                      ) : (
                        <div className="space-y-2">
                          {dayCourses.map((c) => (
                            <div key={c.id} className="border border-border rounded-lg px-3 py-2 bg-muted/20 hover:bg-muted/40 transition-colors">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-bold text-primary">{c.id}</span>
                                {c.startTime && (
                                  <span className="text-xs text-muted-foreground font-mono">{c.startTime}</span>
                                )}
                              </div>
                              <p className="text-xs font-medium mt-0.5 truncate">{c.name}</p>
                              {c.room && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <MapPin className="w-2.5 h-2.5" />{c.room}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
