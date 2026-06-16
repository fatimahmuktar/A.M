import { type ReactNode } from "react";
import { Redirect } from "wouter";

interface AuthData {
  id:    string;
  name:  string;
  role:  string;
  email: string;
}

function getAuth(): AuthData | null {
  try {
    const raw = localStorage.getItem("neu_auth");
    const token = localStorage.getItem("neu_token");
    if (!raw || !token) return null;
    return JSON.parse(raw) as AuthData;
  } catch {
    return null;
  }
}

interface AuthGuardProps {
  children: ReactNode;
  role?: string;
}

export function AuthGuard({ children, role }: AuthGuardProps) {
  const auth = getAuth();
  if (!auth) return <Redirect to="/" />;
  if (role && auth.role !== role) return <Redirect to={`/${auth.role}`} />;
  return <>{children}</>;
}
