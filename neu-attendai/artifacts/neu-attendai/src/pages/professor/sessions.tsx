import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, CalendarOff } from "lucide-react";

export default function SessionHistory() {
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
          <Input placeholder="Search sessions…" className="pl-8 bg-card" />
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 gap-3">
          <CalendarOff className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-base font-semibold text-muted-foreground">No sessions recorded yet</p>
          <p className="text-sm text-muted-foreground/60 text-center max-w-xs">
            Sessions will appear here after you start and end a live attendance session from the Live Session page.
          </p>
        </CardContent>
      </Card>
    </Layout>
  );
}
