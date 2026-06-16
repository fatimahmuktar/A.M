import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LangProvider } from "@/context/lang-context";
import { ThemeProvider } from "@/context/theme-context";
import { AuthGuard } from "@/components/auth-guard";

import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ProfessorDashboard from "@/pages/professor/dashboard";
import SessionHistory from "@/pages/professor/sessions";
import ProfessorSchedule from "@/pages/professor/schedule";
import StudentRecords from "@/pages/professor/students";
import AdminDashboard from "@/pages/admin/dashboard";
import CourseManagement from "@/pages/admin/courses";
import StudentDashboard from "@/pages/student/dashboard";
import StudentAttendance from "@/pages/student/attendance";
import StudentSchedule from "@/pages/student/schedule";

const queryClient = new QueryClient();

export default function App() {
  useEffect(() => {
    const stored = localStorage.getItem("neu_theme");
    if (!stored || stored === "dark") {
      document.documentElement.classList.add("dark");
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <LangProvider>
            <WouterRouter>
              <Switch>
                <Route path="/" component={Login} />
                <Route path="/professor">
                  <AuthGuard role="professor"><ProfessorDashboard /></AuthGuard>
                </Route>
                <Route path="/professor/schedule">
                  <AuthGuard role="professor"><ProfessorSchedule /></AuthGuard>
                </Route>
                <Route path="/professor/sessions">
                  <AuthGuard role="professor"><SessionHistory /></AuthGuard>
                </Route>
                <Route path="/professor/students">
                  <AuthGuard role="professor"><StudentRecords /></AuthGuard>
                </Route>
                <Route path="/admin">
                  <AuthGuard role="admin"><AdminDashboard /></AuthGuard>
                </Route>
                <Route path="/admin/courses">
                  <AuthGuard role="admin"><CourseManagement /></AuthGuard>
                </Route>
                <Route path="/student">
                  <AuthGuard role="student"><StudentDashboard /></AuthGuard>
                </Route>
                <Route path="/student/schedule">
                  <AuthGuard role="student"><StudentSchedule /></AuthGuard>
                </Route>
                <Route path="/student/attendance">
                  <AuthGuard role="student"><StudentAttendance /></AuthGuard>
                </Route>
                <Route component={NotFound} />
              </Switch>
            </WouterRouter>
            <Toaster />
          </LangProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
