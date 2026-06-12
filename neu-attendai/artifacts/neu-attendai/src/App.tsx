import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LangProvider } from "@/context/lang-context";
import { ThemeProvider } from "@/context/theme-context";

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
                <Route path="/"                          component={Login}             />
                <Route path="/professor"                 component={ProfessorDashboard}/>
                <Route path="/professor/schedule"        component={ProfessorSchedule} />
                <Route path="/professor/sessions"        component={SessionHistory}    />
                <Route path="/professor/students"        component={StudentRecords}    />
                <Route path="/admin"                     component={AdminDashboard}    />
                <Route path="/admin/courses"             component={CourseManagement}  />
                <Route path="/student"                   component={StudentDashboard}  />
                <Route path="/student/schedule"          component={StudentSchedule}   />
                <Route path="/student/attendance"        component={StudentAttendance} />
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
