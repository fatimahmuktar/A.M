import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShieldAlert, Users, RadioTower, FileSpreadsheet,
  CheckCircle2, BookOpen, ShieldOff,
} from "lucide-react";
import { getImportedCourses } from "@/lib/store";
import { useLang } from "@/context/lang-context";
import { motion } from "framer-motion";

function StatCard({
  title, value, note, icon, variant = "default",
}: {
  title: string; value: string; note: string;
  icon: React.ReactNode;
  variant?: "default" | "danger" | "warning" | "success";
}) {
  const cls = {
    default: "",
    danger:  "bg-destructive/10 border-destructive/30",
    warning: "bg-yellow-500/10 border-yellow-500/30",
    success: "bg-green-500/10 border-green-500/30",
  }[variant];
  const titleCls = {
    default: "text-muted-foreground",
    danger:  "text-destructive",
    warning: "text-yellow-500",
    success: "text-green-500",
  }[variant];
  const valCls = {
    default: "",
    danger:  "text-destructive",
    warning: "text-yellow-500",
    success: "text-green-500",
  }[variant];

  return (
    <Card className={cls}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className={`text-sm font-medium ${titleCls}`}>{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${valCls}`}>{value}</p>
        <p className={`text-xs mt-1 ${variant !== "default" ? valCls + "/80" : "text-muted-foreground"}`}>{note}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { t } = useLang();
  const [importedCourses] = useState(() => getImportedCourses());

  const totalCourses = importedCourses.length;

  return (
    <Layout role="admin">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("admin.overview")}</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">{t("admin.overviewDesc")}</p>
      </div>

      {/* Timetable status banner */}
      {importedCourses.length === 0 ? (
        <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-5 py-4 text-sm text-yellow-500">
          <FileSpreadsheet className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold">{t("admin.noTimetable")}</p>
            <p className="text-xs text-yellow-500/80 mt-0.5">{t("admin.noTimetableDesc")}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-5 py-4 text-sm text-green-500">
          <FileSpreadsheet className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold">{t("admin.timetableLoaded")} — {totalCourses} courses available</p>
            <p className="text-xs text-green-500/80 mt-0.5">Students and professors can now search for their courses by code.</p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Courses"
          value={totalCourses > 0 ? String(totalCourses) : "—"}
          note={totalCourses > 0 ? "From imported timetable" : "Import timetable first"}
          icon={<BookOpen className="w-4 h-4 text-primary" />}
        />
        <StatCard
          title="Registered Students"
          value="—"
          note="Available after sessions begin"
          icon={<Users className="w-4 h-4 text-muted-foreground" />}
        />
        <StatCard
          title="Avg. Attendance Rate"
          value="—"
          note="Available after sessions begin"
          icon={<RadioTower className="w-4 h-4 text-muted-foreground" />}
        />
        <StatCard
          title="Fraud Alerts Today"
          value="0"
          note="No suspicious activity detected"
          icon={<ShieldAlert className="w-4 h-4 text-green-500" />}
          variant="success"
        />
      </div>

      {/* Two-column: Fraud alerts + Timetable preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Fraud alerts — empty state */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive" />
              Integrity Flags — Recent Fraud Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-14 gap-3">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1,   opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <ShieldOff className="w-10 h-10 text-muted-foreground/25" />
            </motion.div>
            <p className="text-sm font-medium text-muted-foreground">No fraud alerts</p>
            <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
              Fraud events will appear here in real time when suspicious check-ins are detected during live sessions.
            </p>
          </CardContent>
        </Card>

        {/* Timetable preview */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Imported Timetable Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {importedCourses.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />
                No timetable imported yet
              </div>
            ) : (
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-6 py-2 text-xs font-medium text-muted-foreground">Course Code</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Room</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importedCourses.slice(0, 20).map((c) => (
                      <tr key={c.id} className="border-t border-border/40">
                        <td className="px-6 py-2 font-mono text-xs text-primary">{c.id}</td>
                        <td className="px-4 py-2">{c.name}</td>
                        <td className="px-4 py-2 text-muted-foreground">{c.room}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importedCourses.length > 20 && (
                  <p className="text-xs text-center text-muted-foreground py-2">
                    …and {importedCourses.length - 20} more — see Course Management for full list
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Courses Loaded</CardTitle>
            <FileSpreadsheet className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalCourses > 0 ? totalCourses : "—"}</p>
            <p className="text-xs mt-1 text-muted-foreground">
              {totalCourses > 0 ? "From imported timetable" : "Import timetable first"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Students on Track</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">—</p>
            <p className="text-xs mt-1 text-muted-foreground">Available after sessions begin</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">System Health</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-400">Online</p>
            <p className="text-xs mt-1 text-muted-foreground">All services operational</p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
