import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Filter, Users } from "lucide-react";
import { useLang } from "@/context/lang-context";

function WarningBadge({ level }: { level: number }) {
  if (level === 0) return <Badge variant="outline" className="text-muted-foreground border-border">No Warning</Badge>;
  if (level === 1) return <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 bg-yellow-500/10">Stage 1</Badge>;
  if (level === 2) return <Badge variant="outline" className="text-orange-500 border-orange-500/30 bg-orange-500/10">Stage 2</Badge>;
  return <Badge variant="destructive" className="animate-pulse">Stage 3 — At Risk</Badge>;
}

function AttendanceBar({ value }: { value: number }) {
  const danger = value < 70;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${danger ? "bg-destructive" : "bg-primary"}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-sm font-medium ${danger ? "text-destructive" : ""}`}>{value}%</span>
    </div>
  );
}

const STUDENTS: { id: string; name: string; attendance: number; warning: number }[] = [];

export default function StudentRecords() {
  const { t } = useLang();
  return (
    <Layout role="professor">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t("professor.studentRecords")}</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">{t("professor.srDesc")}</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by ID or name…" className="pl-8 bg-card" />
          </div>
          <Button variant="outline" className="gap-2 shrink-0">
            <Filter className="w-4 h-4" /> Filters
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {STUDENTS.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto" />
              <p className="text-sm font-medium text-muted-foreground">{t("professor.noStudentRec")}</p>
              <p className="text-xs text-muted-foreground/60">{t("professor.noStudentRecHint")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-6">Student ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Attendance Rate</TableHead>
                  <TableHead>Warning Level</TableHead>
                  <TableHead className="text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {STUDENTS.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="pl-6 font-mono text-sm text-primary">{student.id}</TableCell>
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell><AttendanceBar value={student.attendance} /></TableCell>
                    <TableCell><WarningBadge level={student.warning} /></TableCell>
                    <TableCell className="text-right pr-6">
                      <Button variant="ghost" size="sm">Details</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Layout>
  );
}
