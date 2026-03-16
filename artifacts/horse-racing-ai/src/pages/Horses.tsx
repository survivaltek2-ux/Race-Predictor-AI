import { useState } from "react";
import { useListHorses } from "@workspace/api-client-react";
import { Card, CardContent, Input, Button } from "@/components/ui";
import { Link } from "wouter";
import { Search, Rabbit as HorseIcon, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export function Horses() {
  const [searchTerm, setSearchTerm] = useState("");
  // Simple debounce logic could go here, but keeping it direct for MVP
  const { data: horses, isLoading } = useListHorses({ search: searchTerm || undefined });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white">Rabbit Database</h1>
          <p className="text-muted-foreground mt-1">Comprehensive performance profiles and stats.</p>
        </div>
        
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search by name, sire, trainer..." 
            className="pl-9 bg-secondary border-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-secondary/30 text-muted-foreground text-xs uppercase border-b border-border/50">
              <tr>
                <th className="px-6 py-4 font-semibold">Name / Pedigree</th>
                <th className="px-6 py-4 font-semibold">Age/Sex</th>
                <th className="px-6 py-4 font-semibold">Starts</th>
                <th className="px-6 py-4 font-semibold text-center">W-P-S</th>
                <th className="px-6 py-4 font-semibold text-right">Win %</th>
                <th className="px-6 py-4 font-semibold text-right">Earnings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                 Array.from({ length: 5 }).map((_, i) => (
                   <tr key={i} className="animate-pulse">
                     <td colSpan={6} className="px-6 py-6 bg-secondary/10"></td>
                   </tr>
                 ))
              ) : horses?.map((horse) => {
                const winPercent = horse.totalRaces > 0 ? ((horse.totalWins / horse.totalRaces) * 100).toFixed(1) : "0.0";
                
                return (
                <tr key={horse.id} className="hover:bg-secondary/10 transition-colors group">
                  <td className="px-6 py-4">
                    <Link href={`/horses/${horse.id}`} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                        <HorseIcon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <span className="font-bold text-base text-white group-hover:text-primary transition-colors block">{horse.name}</span>
                        <span className="text-xs text-muted-foreground block truncate max-w-[200px]">
                          By {horse.sire || 'Unknown'} out of {horse.dam || 'Unknown'}
                        </span>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {horse.age}yo <span className="capitalize">{horse.sex}</span>
                  </td>
                  <td className="px-6 py-4 font-medium text-white">{horse.totalRaces}</td>
                  <td className="px-6 py-4 text-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/50 font-mono text-sm">
                      <span className="text-amber-400">{horse.totalWins}</span>-
                      <span className="text-slate-300">{horse.totalPlaces}</span>-
                      <span className="text-amber-700">{horse.totalShows}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-bold text-emerald-400">{winPercent}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-medium text-white">
                    {formatCurrency(horse.earnings)}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
          
          {horses?.length === 0 && (
            <div className="py-20 text-center text-muted-foreground">
              <HorseIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg">No horses found matching "{searchTerm}".</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
