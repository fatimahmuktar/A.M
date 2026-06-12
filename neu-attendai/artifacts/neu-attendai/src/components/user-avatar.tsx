import { useState, useRef, useEffect } from "react";
import { Camera, LogOut, X } from "lucide-react";
import { useLocation } from "wouter";

interface AuthData {
  id:    string;
  name:  string;
  role:  string;
  email: string;
}

function getAuth(): AuthData | null {
  try {
    const raw = localStorage.getItem("neu_auth");
    if (!raw) return null;
    return JSON.parse(raw) as AuthData;
  } catch {
    return null;
  }
}

function getAvatar(): string | null {
  return localStorage.getItem("neu_avatar");
}

function saveAvatar(base64: string) {
  localStorage.setItem("neu_avatar", base64);
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const ROLE_LABEL: Record<string, string> = {
  student:   "Student",
  professor: "Professor",
  admin:     "Admin",
};

export function UserAvatar() {
  const [, setLocation]   = useLocation();
  const [auth]            = useState<AuthData | null>(getAuth);
  const [avatar, setAvatar] = useState<string | null>(getAvatar);
  const [open, setOpen]   = useState(false);
  const fileRef           = useRef<HTMLInputElement>(null);
  const dropRef           = useRef<HTMLDivElement>(null);

  /* close dropdown on outside click */
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  if (!auth) return null;

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      saveAvatar(result);
      setAvatar(result);
      setOpen(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleRemove() {
    localStorage.removeItem("neu_avatar");
    setAvatar(null);
    setOpen(false);
  }

  function handleSignOut() {
    localStorage.removeItem("neu_auth");
    localStorage.removeItem("neu_token");
    setLocation("/");
  }

  const displayName = auth.name || auth.id;
  const roleLabel   = ROLE_LABEL[auth.role] ?? auth.role;

  return (
    <div className="relative" ref={dropRef}>
      {/* ── Trigger button ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-muted transition-colors"
      >
        {/* Avatar circle */}
        <div className="relative w-8 h-8 shrink-0">
          {avatar ? (
            <img
              src={avatar}
              alt={displayName}
              className="w-8 h-8 rounded-full object-cover border-2 border-primary/30"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-primary/40"
              style={{ background: "linear-gradient(135deg,#cc0000,#7b1d3a)" }}
            >
              {initials(displayName)}
            </div>
          )}
          {/* camera badge */}
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-primary rounded-full flex items-center justify-center ring-1 ring-background">
            <Camera className="w-2 h-2 text-white" />
          </span>
        </div>

        {/* Name + role (hidden on very small screens) */}
        <div className="hidden sm:block text-left">
          <p className="text-xs font-semibold text-foreground leading-tight max-w-[100px] truncate">
            {displayName}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">{roleLabel}</p>
        </div>
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-border bg-card shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            {avatar ? (
              <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover border border-border" />
            ) : (
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                style={{ background: "linear-gradient(135deg,#cc0000,#7b1d3a)" }}
              >
                {initials(displayName)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground">{roleLabel}</p>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Actions */}
          <div className="p-1.5 space-y-0.5">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition-colors text-left"
            >
              <Camera className="w-4 h-4 text-muted-foreground" />
              {avatar ? "Change Photo" : "Upload Photo"}
            </button>
            {avatar && (
              <button
                onClick={handleRemove}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
              >
                <X className="w-4 h-4" />
                Remove Photo
              </button>
            )}
          </div>

          <div className="border-t border-border p-1.5">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-left"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
