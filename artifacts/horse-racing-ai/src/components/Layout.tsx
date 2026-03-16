import React from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Flag, Rabbit, History, BrainCircuit } from "lucide-react";
import { useGetPredictionStats } from "@workspace/api-client-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/races", label: "Races", icon: Flag },
  { href: "/horses", label: "Horses", icon: Rabbit },
  { href: "/predictions", label: "AI History", icon: History },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: stats } = useGetPredictionStats();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-card border-r border-border flex-shrink-0 z-10 sticky top-0 md:h-screen md:sticky flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <BrainCircuit className="w-6 h-6 text-primary" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">Equine<span className="text-primary">AI</span></span>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-x-auto md:overflow-x-visible flex md:flex-col pb-4 md:pb-0">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium whitespace-nowrap",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Global Stats Widget in Sidebar */}
        <div className="p-4 hidden md:block mt-auto mb-4">
          <div className="bg-secondary/50 rounded-2xl p-4 border border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Global AI Accuracy</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-display font-bold text-white">
                {stats ? `${stats.accuracyPercentage}%` : '--'}
              </span>
              <span className="text-sm text-primary mb-1">Win Rate</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full min-w-0 flex flex-col relative pb-20 md:pb-0">
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
