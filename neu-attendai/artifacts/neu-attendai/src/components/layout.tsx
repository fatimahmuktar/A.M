import { type ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Users, BookOpen,
  Clock, LogOut, ClipboardList, Calendar,
  LayoutDashboard, Sun, Moon, Languages,
  GraduationCap, UserCheck, ShieldCheck, Menu, X,
  type LucideIcon,
} from "lucide-react";
import { NeuLogo } from "@/components/neu-logo";
import { UserAvatar } from "@/components/user-avatar";
import { useLang } from "@/context/lang-context";
import { useTheme } from "@/context/theme-context";
import { t, type TKey } from "@/lib/i18n";

type Role = "professor" | "admin" | "student";

interface NavItem {
  href:     string;
  labelKey: TKey;
  icon:     LucideIcon;
}

const NAV_ITEMS: Record<Role, NavItem[]> = {
  professor: [
    { href: "/professor",          labelKey: "nav.liveSession",    icon: Clock           },
    { href: "/professor/schedule", labelKey: "nav.teachSchedule",  icon: Calendar        },
    { href: "/professor/sessions", labelKey: "nav.sessionHistory", icon: BookOpen        },
    { href: "/professor/students", labelKey: "nav.studentRecords", icon: Users           },
  ],
  admin: [
    { href: "/admin",         labelKey: "nav.overview", icon: LayoutDashboard },
    { href: "/admin/courses", labelKey: "nav.courses",  icon: BookOpen        },
  ],
  student: [
    { href: "/student",             labelKey: "nav.selfAttendance", icon: LayoutDashboard },
    { href: "/student/schedule",    labelKey: "nav.mySchedule",     icon: Calendar        },
    { href: "/student/attendance",  labelKey: "nav.myAttendance",   icon: ClipboardList   },
  ],
};

const SHORT_LABEL: Partial<Record<TKey, string>> = {
  "nav.liveSession":    "Live",
  "nav.teachSchedule":  "Schedule",
  "nav.sessionHistory": "History",
  "nav.studentRecords": "Students",
  "nav.overview":       "Overview",
  "nav.courses":        "Courses",
  "nav.selfAttendance": "Attendance",
  "nav.mySchedule":     "Schedule",
  "nav.myAttendance":   "Report",
};

const ROLE_LABEL: Record<Role, string> = {
  professor: "Professor Portal",
  admin:     "Admin Panel",
  student:   "Student Portal",
};

const VIEW_OPTIONS: { role: Role; label: string; icon: LucideIcon; color: string }[] = [
  { role: "student",   label: "Student",   icon: GraduationCap, color: "text-blue-400 bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20"    },
  { role: "professor", label: "Professor", icon: UserCheck,     color: "text-amber-400 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20" },
  { role: "admin",     label: "Admin",     icon: ShieldCheck,   color: "text-rose-400 bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20"     },
];

const VIEW_ACTIVE: Record<Role, string> = {
  student:   "bg-blue-500 text-white border-blue-600",
  professor: "bg-amber-500 text-white border-amber-600",
  admin:     "bg-rose-600 text-white border-rose-700",
};

const ROOT_PAGE: Record<Role, string> = {
  student:   "/student",
  professor: "/professor",
  admin:     "/admin",
};

function getAuthRole(): Role | null {
  try {
    const raw = localStorage.getItem("neu_auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { role: string };
    return (parsed.role as Role) ?? null;
  } catch { return null; }
}

function getStoredView(): Role | null {
  return (localStorage.getItem("neu_view_as") as Role | null) ?? null;
}

interface LayoutProps {
  children: ReactNode;
  role: Role;
}

export function Layout({ children, role }: LayoutProps) {
  const [location, navigate]           = useLocation();
  const { lang, toggle: toggleLang }   = useLang();
  const { theme, toggle: toggleTheme } = useTheme();
  const [drawerOpen, setDrawerOpen]    = useState(false);

  const authRole = getAuthRole() ?? role;
  const isAdmin  = authRole === "admin";

  const [viewAs, setViewAs] = useState<Role>(() => {
    if (!isAdmin) return role;
    return getStoredView() ?? role;
  });

  useEffect(() => {
    if (isAdmin) localStorage.setItem("neu_view_as", viewAs);
  }, [viewAs, isAdmin]);

  /* Close drawer on navigation */
  useEffect(() => { setDrawerOpen(false); }, [location]);

  function switchView(v: Role) {
    setViewAs(v);
    navigate(ROOT_PAGE[v]);
  }

  const effectiveRole = isAdmin ? viewAs : role;
  const items = NAV_ITEMS[effectiveRole];

  /* Shared nav list used in both sidebar and drawer */
  const navList = (
    <>
      <nav className="flex-1 p-4 space-y-1">
        {items.map((item) => {
          const active = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-colors ${
                active
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}>
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="text-sm">{t(item.labelKey, lang)}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <Link href="/">
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer text-muted-foreground hover:text-destructive hover:bg-muted transition-colors">
            <LogOut className="w-5 h-5 shrink-0" />
            <span className="text-sm">{t("nav.signOut", lang)}</span>
          </div>
        </Link>
      </div>
    </>
  );

  const sidebarHeader = (
    <div className="px-5 pt-5 pb-4 border-b border-border">
      <NeuLogo height={36} />
      <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wider">
        {ROLE_LABEL[effectiveRole]}
      </p>
    </div>
  );

  const viewAsSwitcher = isAdmin && (
    <div className="px-4 pt-3 pb-2 border-b border-border">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 px-1">View As</p>
      <div className="flex gap-1.5">
        {VIEW_OPTIONS.map(({ role: v, label, icon: Icon, color }) => {
          const active = viewAs === v;
          return (
            <button
              key={v}
              onClick={() => switchView(v)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl border text-[10px] font-semibold transition-all ${
                active ? VIEW_ACTIVE[v] : color
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background text-foreground">

      {/* ── Sidebar (desktop only) ── */}
      <aside className="w-64 border-r border-border bg-sidebar hidden md:flex flex-col shrink-0">
        {sidebarHeader}
        {viewAsSwitcher}
        {navList}
      </aside>

      {/* ── Mobile Drawer overlay ── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile Drawer panel ── */}
      <aside className={`md:hidden fixed top-0 left-0 h-full w-72 z-50 bg-sidebar border-r border-border flex flex-col transition-transform duration-300 ease-in-out ${
        drawerOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <NeuLogo height={32} />
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground px-5 pt-2 pb-1 uppercase tracking-wider">
          {ROLE_LABEL[effectiveRole]}
        </p>
        {viewAsSwitcher && <div className="px-4 pt-2 pb-2 border-b border-border">{viewAsSwitcher}</div>}
        {navList}
      </aside>

      <main className="flex-1 flex flex-col min-h-screen overflow-x-hidden">

        {/* ── Top bar ── */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-3 sm:px-4 shrink-0 gap-2">
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo in top bar — mobile only */}
          <div className="md:hidden flex-1 flex justify-start min-w-0 pl-1">
            <NeuLogo height={32} />
          </div>

          <div className="hidden md:block" />

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Languages className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{lang === "EN" ? "🇹🇷 TR" : "🇬🇧 EN"}</span>
              <span className="sm:hidden">{lang === "EN" ? "TR" : "EN"}</span>
            </button>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {theme === "dark"
                ? <><Sun className="w-3.5 h-3.5 shrink-0" /><span className="hidden sm:inline">Light</span></>
                : <><Moon className="w-3.5 h-3.5 shrink-0" /><span className="hidden sm:inline">Dark</span></>}
            </button>
            <div className="border-l border-border pl-1.5 ml-0.5">
              <UserAvatar />
            </div>
          </div>
        </header>

        {/* ── Page content (extra bottom padding for bottom nav) ── */}
        <div className="flex-1 overflow-auto p-3 sm:p-4 md:p-8 pb-28 md:pb-8">
          <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
            {children}
          </div>
        </div>
      </main>

      {/* ── Bottom Navigation Bar (mobile only) ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-md border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}
      >
        <div className="flex items-stretch h-16">
          {items.map((item) => {
            const active = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div className={`relative flex flex-col items-center justify-center gap-1 h-full transition-all ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}>
                  {active && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                  )}
                  <item.icon className={`w-[22px] h-[22px] shrink-0 ${active ? "stroke-[2.2]" : "stroke-[1.8]"}`} />
                  <span className={`text-[10px] font-medium leading-none ${active ? "font-semibold" : ""}`}>
                    {SHORT_LABEL[item.labelKey] ?? t(item.labelKey, lang)}
                  </span>
                </div>
              </Link>
            );
          })}

          {/* Menu button opens the drawer */}
          <button className="flex-1 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setDrawerOpen(true)}>
            <Menu className="w-[22px] h-[22px] stroke-[1.8]" />
            <span className="text-[10px] font-medium leading-none">Menu</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
