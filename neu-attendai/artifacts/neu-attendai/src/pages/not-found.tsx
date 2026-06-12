import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <div className="text-center space-y-6 max-w-sm">
        <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto border border-destructive/20">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>

        <div>
          <h1 className="text-5xl font-bold text-muted-foreground/30 font-mono mb-3">404</h1>
          <h2 className="text-xl font-bold">Page Not Found</h2>
          <p className="text-sm text-muted-foreground mt-2">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>

        <Button onClick={() => setLocation("/professor")} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
