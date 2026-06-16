import { useState } from "react";
import { useLocation } from "wouter";
import {
  User, Lock, Eye, EyeOff,
  MapPin, Cpu, BarChart3, Users, CheckCircle,
  Mail, ArrowRight, RefreshCw, AlertCircle, KeyRound,
} from "lucide-react";
import { NeuLogo } from "@/components/neu-logo";
import { useTheme } from "@/context/theme-context";
import { useLang } from "@/context/lang-context";
import { apiValidateInvitation } from "@/lib/api";

/* ── Types ── */
type Tab    = "student" | "professor" | "admin";
type Screen = "login" | "register" | "verify" | "forgot" | "reset";

const STATS = [
  { icon: Users,        value: "12,400+", label: "Students"  },
  { icon: CheckCircle,  value: "98.5%",   label: "Accuracy"  },
  { icon: MapPin,       value: "34",      label: "Buildings" },
  { icon: Cpu,          value: "AI",      label: "Powered"   },
];

/* ── Shared input field component ── */
function Field({
  label, type = "text", placeholder, value, onChange, error, icon: Icon, rightEl, autoComplete,
}: {
  label: string; type?: string; placeholder?: string;
  value: string; onChange: (v: string) => void; error?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; rightEl?: React.ReactNode; autoComplete?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5"
        style={{ color: "rgba(255,255,255,0.45)" }}>{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
          style={{ color: error ? "#ef4444" : "rgba(255,255,255,0.3)" }} />
        <input
          type={type} value={value} autoComplete={autoComplete ?? "off"}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl pl-10 pr-10 py-3 text-sm text-white outline-none transition-all placeholder:text-white/20"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: `1px solid ${error ? "#ef4444" : "rgba(255,255,255,0.12)"}`,
          }}
          onFocus={e => !error && (e.currentTarget.style.borderColor = "#cc0000")}
          onBlur={e  => !error && (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
        />
        {rightEl && <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightEl}</div>}
      </div>
      {error && (
        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "#ef4444" }}>
          <AlertCircle className="w-3 h-3 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}

function PasswordField({ label, value, onChange, error, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field
      label={label} type={show ? "text" : "password"}
      placeholder={placeholder ?? "••••••••"} value={value} onChange={onChange} error={error}
      icon={Lock} autoComplete="new-password"
      rightEl={
        <button type="button" onClick={() => setShow(s => !s)} className="text-white/30 hover:text-white/60 transition-colors">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      }
    />
  );
}

/* ── API helpers ── */
async function apiRegister(body: object) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ message?: string; email?: string; demoCode?: string; error?: string }>;
}

async function apiVerifyEmail(email: string, code: string) {
  const res = await fetch("/api/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  return res.json() as Promise<{ token?: string; user?: { id: string; email: string; name: string; role: string; studentNumber?: string | null }; error?: string }>;
}

async function apiLogin(identifier: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  return res.json() as Promise<{ token?: string; user?: { id: string; email: string; name: string; role: string; studentNumber?: string | null }; error?: string }>;
}

async function apiForgotPassword(identifier: string) {
  const res = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier }),
  });
  return res.json() as Promise<{ message?: string; email?: string; demoCode?: string; error?: string }>;
}

async function apiResetPassword(email: string, code: string, newPassword: string) {
  const res = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, newPassword }),
  });
  return res.json() as Promise<{ message?: string; error?: string }>;
}

/* ── Persist session after auth ── */
function persistSession(token: string, user: { id: string; email: string; name: string; role: string; studentNumber?: string | null }) {
  const legacyId = user.role === "student" ? (user.studentNumber ?? user.id) : user.email;
  localStorage.setItem("neu_auth", JSON.stringify({ role: user.role, id: legacyId, name: user.name, email: user.email }));
  localStorage.setItem("neu_token", token);
}

/* ── Main component ── */
export default function Login() {
  const [, setLocation] = useLocation();
  const { theme, toggle: toggleTheme } = useTheme();
  const { lang, toggle: toggleLang } = useLang();

  const [tab,    setTab]    = useState<Tab>("student");
  const [screen, setScreen] = useState<Screen>("login");
  const [busy,   setBusy]   = useState(false);

  /* Login fields */
  const [loginId,   setLoginId]   = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState(DEMO_PASS_FOR_TAB(tab));
  const [loginErr,  setLoginErr]  = useState("");

  /* Register fields */
  const [regName,   setRegName]   = useState("");
  const [regEmail,  setRegEmail]  = useState("");
  const [regId,     setRegId]     = useState("");
  const [regPass,   setRegPass]   = useState("");
  const [regPass2,  setRegPass2]  = useState("");
  const [regErr,    setRegErr]    = useState<Record<string, string>>({});
  const [inviteCode, setInviteCode] = useState("");

  /* Verify fields */
  const [verifyEmail,     setVerifyEmail]     = useState("");
  const [verifyCode,      setVerifyCode]      = useState("");
  const [verifyDemoCode,  setVerifyDemoCode]  = useState<string | null>(null);
  const [verifyErr,       setVerifyErr]       = useState("");

  /* Forgot / Reset fields */
  const [forgotId,        setForgotId]        = useState("");
  const [forgotEmail,     setForgotEmail]     = useState(""); // resolved email for reset step
  const [forgotDemoCode,  setForgotDemoCode]  = useState<string | null>(null);
  const [resetCode,       setResetCode]       = useState("");
  const [resetPass,       setResetPass]       = useState("");
  const [resetPass2,      setResetPass2]      = useState("");
  const [forgotErr,       setForgotErr]       = useState("");

  function DEMO_PASS_FOR_TAB(t: Tab) { return t === "student" ? "" : ""; }

  function switchTab(t: Tab) {
    setTab(t);
    setLoginErr("");
    setLoginId("");
    setLoginEmail("");
    setLoginPass("");
  }

  function goScreen(s: Screen) { setScreen(s); setLoginErr(""); setVerifyErr(""); setForgotErr(""); }

  /* ── LOGIN ── */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr("");
    const identifier = tab === "student" ? loginId.trim() : loginEmail.trim();
    if (!identifier) { setLoginErr(tab === "student" ? "University ID is required" : "Email is required"); return; }
    if (!loginPass)  { setLoginErr("Password is required"); return; }
    setBusy(true);
    const data = await apiLogin(identifier, loginPass).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (data.error) { setLoginErr(data.error); return; }
    if ('token' in data && data.token && data.user) {
      persistSession(data.token, data.user);
      setLocation(`/${data.user.role}`);
    }
  }

  /* ── REGISTER ── */
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!regName.trim())  errs.name  = "Full name is required";
    if (!regEmail.trim()) errs.email = "Email is required";
    if (tab === "student" && !regId.trim()) errs.id = "University ID is required";
    if (tab === "professor" && !inviteCode.trim()) errs.invite = "Invitation code is required";
    if (regPass.length < 8)     errs.pass  = "Password must be at least 8 characters";
    if (regPass !== regPass2)   errs.pass2 = "Passwords do not match";
    if (Object.keys(errs).length) { setRegErr(errs); return; }

    // Validate invitation code on the server before proceeding
    if (tab === "professor") {
      setBusy(true);
      const invResult = await apiValidateInvitation(inviteCode.trim());
      setBusy(false);
      if (invResult.error) { setRegErr({ invite: invResult.error }); return; }
    }

    setBusy(true);
    const data = await apiRegister({
      role: tab,
      email: regEmail.trim(),
      password: regPass,
      name: regName.trim(),
      ...(tab === "student" ? { studentNumber: regId.trim() } : {}),
      ...(tab === "professor" ? { invitationCode: inviteCode.trim() } : {}),
    }).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (data.error) { setRegErr({ _: data.error }); return; }
    setVerifyEmail('email' in data ? (data.email ?? regEmail.trim()) : regEmail.trim());
    setVerifyDemoCode('demoCode' in data ? (data.demoCode ?? null) : null);
    setVerifyCode("");
    setVerifyErr("");
    goScreen("verify");
  }

  /* ── VERIFY EMAIL ── */
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifyErr("");
    if (verifyCode.trim().length !== 6) { setVerifyErr("Enter the 6-digit code"); return; }
    setBusy(true);
    const data = await apiVerifyEmail(verifyEmail, verifyCode.trim()).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (data.error) { setVerifyErr(data.error); return; }
    if ('token' in data && data.token && data.user) {
      persistSession(data.token, data.user);
      setLocation(`/${data.user.role}`);
    }
  }

  async function handleResend() {
    setBusy(true);
    const data = await apiRegister({
      role: tab,
      email: verifyEmail,
      password: regPass,
      name: regName.trim(),
      ...(tab === "student" ? { studentNumber: regId.trim() } : {}),
    }).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (!data.error) {
      setVerifyDemoCode('demoCode' in data ? (data.demoCode ?? null) : null);
      setVerifyCode("");
      setVerifyErr("");
    }
  }

  /* ── FORGOT PASSWORD ── */
  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setForgotErr("");
    if (!forgotId.trim()) { setForgotErr("Please enter your University ID or email"); return; }
    setBusy(true);
    const data = await apiForgotPassword(forgotId.trim()).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (data.error) { setForgotErr(data.error); return; }
    setForgotEmail('email' in data ? (data.email ?? "") : "");
    setForgotDemoCode('demoCode' in data ? (data.demoCode ?? null) : null);
    setResetCode("");
    setResetPass("");
    setResetPass2("");
    goScreen("reset");
  }

  /* ── RESET PASSWORD ── */
  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setForgotErr("");
    if (resetCode.trim().length !== 6) { setForgotErr("Enter the 6-digit reset code"); return; }
    if (resetPass.length < 8) { setForgotErr("Password must be at least 8 characters"); return; }
    if (resetPass !== resetPass2) { setForgotErr("Passwords do not match"); return; }
    setBusy(true);
    const data = await apiResetPassword(forgotEmail, resetCode.trim(), resetPass).catch(() => ({ error: "Network error" }));
    setBusy(false);
    if (data.error) { setForgotErr(data.error); return; }
    goScreen("login");
  }

  /* ── Shared styles ── */
  const btn = "w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-60 transition-opacity";
  const btnPrimary = { background: "linear-gradient(135deg,#cc0000,#990000)", boxShadow: "0 4px 20px rgba(204,0,0,0.35)" };
  const linkStyle = { color: "rgba(255,255,255,0.4)" };

  /* ──────────────────────────────────────────── RIGHT PANEL SCREENS ── */

  const screenLogin = (
    <>
      {/* Tab toggle */}
      <div className="flex rounded-xl mb-6 p-1" style={{ background: "rgba(255,255,255,0.06)" }}>
        {(["student", "professor", "admin"] as Tab[]).map(t => (
          <button key={t} type="button"
            onClick={() => switchTab(t)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
            style={tab === t
              ? { background: "#cc0000", color: "#fff", boxShadow: "0 2px 12px rgba(204,0,0,0.4)" }
              : { color: "rgba(255,255,255,0.45)" }}>
            {t === "student" ? "Student" : t === "professor" ? "Professor" : "Admin"}
          </button>
        ))}
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        {tab === "student" ? (
          <Field label="University ID" placeholder="e.g. 20225507"
            value={loginId} onChange={setLoginId} icon={User} />
        ) : (
          <Field label="Email" type="email"
            placeholder={tab === "admin" ? "admin@neu.edu.tr" : "name@neu.edu.tr"}
            value={loginEmail} onChange={setLoginEmail} icon={Mail} autoComplete="email" />
        )}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.45)" }}>Password</label>
            <button type="button" onClick={() => { setForgotId(""); goScreen("forgot"); }}
              className="text-xs transition-colors" style={{ color: "#cc0000" }}>Forgot password?</button>
          </div>
          <PasswordField label="" value={loginPass} onChange={setLoginPass} placeholder="••••••••" />
        </div>

        {loginErr && (
          <p className="text-xs flex items-center gap-1.5 rounded-lg px-3 py-2"
            style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />{loginErr}
          </p>
        )}

        <button type="submit" disabled={busy} className={btn} style={btnPrimary}>
          {busy ? "Signing in…" : <>Sign In <ArrowRight className="inline w-4 h-4 ml-1" /></>}
        </button>
      </form>


      {tab === "student" && (
        <p className="text-center text-xs mt-4" style={linkStyle}>
          Don't have an account?{" "}
          <button type="button" onClick={() => { setRegErr({}); goScreen("register"); }}
            className="font-semibold" style={{ color: "#cc0000" }}>Register</button>
        </p>
      )}
      {tab === "professor" && (
        <p className="text-center text-xs mt-4" style={linkStyle}>
          New professor?{" "}
          <button type="button" onClick={() => { setRegErr({}); goScreen("register"); }}
            className="font-semibold" style={{ color: "#cc0000" }}>Create account</button>
        </p>
      )}
      {tab === "admin" && (
        <p className="text-center text-xs mt-4" style={{ color: "rgba(255,255,255,0.2)" }}>
          Admin accounts are managed by the system administrator.
        </p>
      )}
    </>
  );

  const screenRegister = (
    <>
      <div className="mb-5">
        <h2 className="text-xl font-bold text-white">
          {tab === "student" ? "Student Registration" : "Professor Registration"}
        </h2>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
          {tab === "student" ? "Use your @std.neu.edu.tr email" : "Use your @neu.edu.tr email"}
        </p>
      </div>

      <form onSubmit={handleRegister} className="space-y-3">
        <Field label="Full Name" placeholder="e.g. Ali Hassan" value={regName} onChange={setRegName}
          icon={User} error={regErr.name} />
        {tab === "student" && (
          <Field label="University ID" placeholder="e.g. 20225507" value={regId} onChange={setRegId}
            icon={User} error={regErr.id} />
        )}
        <Field label="University Email" type="email"
          placeholder={tab === "student" ? "20225507@std.neu.edu.tr" : "name@neu.edu.tr"}
          value={regEmail} onChange={setRegEmail} icon={Mail} error={regErr.email} autoComplete="email" />
        {tab === "professor" && (
          <Field label="Invitation Code" placeholder="e.g. ABC12345"
            value={inviteCode} onChange={setInviteCode} icon={KeyRound} error={regErr.invite} />
        )}
        <PasswordField label="Password" value={regPass} onChange={setRegPass} error={regErr.pass} />
        <PasswordField label="Confirm Password" value={regPass2} onChange={setRegPass2} error={regErr.pass2} />

        {regErr._ && (
          <p className="text-xs flex items-center gap-1.5 rounded-lg px-3 py-2"
            style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />{regErr._}
          </p>
        )}

        <button type="submit" disabled={busy} className={btn} style={btnPrimary}>
          {busy ? "Sending code…" : <>Send Verification Code <ArrowRight className="inline w-4 h-4 ml-1" /></>}
        </button>
      </form>

      <button type="button" onClick={() => goScreen("login")}
        className="w-full text-center text-xs mt-3" style={linkStyle}>
        ← Back to Sign In
      </button>
    </>
  );

  const screenVerify = (
    <>
      <div className="mb-5">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "rgba(204,0,0,0.15)", border: "1px solid rgba(204,0,0,0.3)" }}>
          <Mail className="w-6 h-6" style={{ color: "#cc0000" }} />
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Verify your email</h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          A 6-digit code was sent to <span className="text-white font-medium">{verifyEmail}</span>.
        </p>
      </div>

      {/* Demo code box — shown when email service not configured */}
      {verifyDemoCode && (
        <div className="mb-4 rounded-xl px-4 py-3 flex flex-col gap-0.5"
          style={{ background: "rgba(204,0,0,0.12)", border: "1px solid rgba(204,0,0,0.3)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(204,0,0,0.8)" }}>
            Your verification code
          </p>
          <p className="text-3xl font-mono font-bold tracking-[0.3em] text-white">{verifyDemoCode}</p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Copy and paste below</p>
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-4">
        <Field label="Verification Code" placeholder="000000" value={verifyCode}
          onChange={v => { setVerifyCode(v.replace(/\D/g, "").slice(0, 6)); setVerifyErr(""); }}
          icon={KeyRound} error={verifyErr} />

        <button type="submit" disabled={busy} className={btn} style={btnPrimary}>
          {busy ? "Verifying…" : <>Verify & Continue <ArrowRight className="inline w-4 h-4 ml-1" /></>}
        </button>
      </form>

      <button type="button" onClick={handleResend} disabled={busy}
        className="w-full py-2 text-xs flex items-center justify-center gap-1.5 mt-2 disabled:opacity-40"
        style={linkStyle}>
        <RefreshCw className="w-3.5 h-3.5" /> Resend code
      </button>
      <button type="button" onClick={() => goScreen("register")}
        className="w-full text-center text-xs" style={linkStyle}>
        ← Back to Registration
      </button>
    </>
  );

  const screenForgot = (
    <>
      <div className="mb-5">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "rgba(204,0,0,0.15)", border: "1px solid rgba(204,0,0,0.3)" }}>
          <KeyRound className="w-6 h-6" style={{ color: "#cc0000" }} />
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Forgot password?</h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          Enter your University ID or email and we'll send a reset code.
        </p>
      </div>

      <form onSubmit={handleForgot} className="space-y-4">
        <Field label="University ID or Email" placeholder="20225507 or name@neu.edu.tr"
          value={forgotId} onChange={setForgotId} icon={User} error={forgotErr} />
        <button type="submit" disabled={busy} className={btn} style={btnPrimary}>
          {busy ? "Sending…" : <>Send Reset Code <ArrowRight className="inline w-4 h-4 ml-1" /></>}
        </button>
      </form>

      <button type="button" onClick={() => goScreen("login")}
        className="w-full text-center text-xs mt-3" style={linkStyle}>
        ← Back to Sign In
      </button>
    </>
  );

  const screenReset = (
    <>
      <div className="mb-5">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: "rgba(204,0,0,0.15)", border: "1px solid rgba(204,0,0,0.3)" }}>
          <KeyRound className="w-6 h-6" style={{ color: "#cc0000" }} />
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Reset password</h2>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          Enter the code sent to <span className="text-white font-medium">{forgotEmail || "your email"}</span>.
        </p>
      </div>

      {forgotDemoCode && (
        <div className="mb-4 rounded-xl px-4 py-3 flex flex-col gap-0.5"
          style={{ background: "rgba(204,0,0,0.12)", border: "1px solid rgba(204,0,0,0.3)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(204,0,0,0.8)" }}>Reset code</p>
          <p className="text-3xl font-mono font-bold tracking-[0.3em] text-white">{forgotDemoCode}</p>
        </div>
      )}

      <form onSubmit={handleReset} className="space-y-3">
        <Field label="Reset Code" placeholder="000000" value={resetCode}
          onChange={v => { setResetCode(v.replace(/\D/g, "").slice(0, 6)); setForgotErr(""); }}
          icon={KeyRound} />
        <PasswordField label="New Password" value={resetPass} onChange={setResetPass} />
        <PasswordField label="Confirm New Password" value={resetPass2} onChange={setResetPass2} />

        {forgotErr && (
          <p className="text-xs flex items-center gap-1.5 rounded-lg px-3 py-2"
            style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />{forgotErr}
          </p>
        )}

        <button type="submit" disabled={busy} className={btn} style={btnPrimary}>
          {busy ? "Resetting…" : <>Reset Password <ArrowRight className="inline w-4 h-4 ml-1" /></>}
        </button>
      </form>

      <button type="button" onClick={() => goScreen("login")}
        className="w-full text-center text-xs mt-3" style={linkStyle}>
        ← Back to Sign In
      </button>
    </>
  );

  const screenMap: Record<Screen, React.ReactNode> = {
    login:    screenLogin,
    register: screenRegister,
    verify:   screenVerify,
    forgot:   screenForgot,
    reset:    screenReset,
  };

  /* ── Render ── */
  return (
    <div className="min-h-screen flex" style={{ background: "#0a0f1e" }}>

      {/* Form panel */}
      <div className="flex-1 flex flex-col" style={{ background: "#0e1525" }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 pt-5">
          <div className="flex items-center">
            <NeuLogo height={28} color="#cc6666" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
              🌐 {lang.toUpperCase()}
            </button>
            <button onClick={toggleTheme}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          <div className="w-full max-w-sm">
            {/* University header */}
            <div className="flex flex-col items-center gap-3 mb-7">
              <NeuLogo height={48} color="#e08888" />
              <div className="text-center">
                <div className="text-xs tracking-widest uppercase mt-0.5"
                  style={{ color: "rgba(255,255,255,0.35)" }}>Attendance Management System</div>
              </div>
            </div>

            {screenMap[screen]}
          </div>
        </div>

        <div className="pb-4 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
            style={{ background: "rgba(34,197,94,0.1)", color: "rgba(34,197,94,0.8)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            All systems operational
          </span>
          <p className="mt-1 text-xs font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>
            Near East Technology
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "rgba(255,255,255,0.18)" }}>
            © 2026. All Rights Reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
