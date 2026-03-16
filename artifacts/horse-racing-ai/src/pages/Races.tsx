import { useState } from "react";
import { useListRaces, ListRacesStatus } from "@workspace/api-client-react";
import { Card, CardContent, Badge, Button, Input } from "@/components/ui";
import { format } from "date-fns";
import { Link } from "wouter";
import { Search, Calendar, MapPin, Filter } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export function Races() {
  const [statusFilter, setStatusFilter] = useState<ListRacesStatus | "all">("all");
  
  // Real implementation would pass params, but to keep simple we filter client-side if API doesn't fully support all combos
  const { data: races, isLoading } = useListRaces({ 
    status: statusFilter === "all" ? undefined : statusFilter 
  });

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white">Race Schedule</h1>
          <p className="text-muted-foreground mt-1">Browse upcoming and historical races for AI analysis.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search tracks..." className="pl-9 bg-secondary border-transparent" />
          </div>
          <Button variant="outline" size="icon" className="shrink-0">
            <Filter className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 pb-2 overflow-x-auto">
        <Button 
          variant={statusFilter === "all" ? "default" : "secondary"} 
          size="sm" 
          onClick={() => setStatusFilter("all")}
          className="rounded-full"
        >
          All Races
        </Button>
        <Button 
          variant={statusFilter === "upcoming" ? "default" : "secondary"} 
          size="sm" 
          onClick={() => setStatusFilter("upcoming")}
          className="rounded-full"
        >
          Upcoming
        </Button>
        <Button 
          variant={statusFilter === "completed" ? "default" : "secondary"} 
          size="sm" 
          onClick={() => setStatusFilter("completed")}
          className="rounded-full"
        >
          Completed
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-48 animate-pulse bg-secondary/50 border-transparent" />
          ))
        ) : races?.map((race) => (
          <Link key={race.id} href={`/races/${race.id}`} className="block group">
            <Card className="h-full transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5">
              <CardContent className="p-0">
                <div className="p-5 border-b border-border/50 bg-secondary/20">
                  <div className="flex justify-between items-start mb-3">
                    <Badge variant={
                      race.status === "upcoming" ? "default" : 
                      race.status === "completed" ? "secondary" : "outline"
                    }>
                      {race.status.charAt(0).toUpperCase() + race.status.slice(1)}
                    </Badge>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground uppercase font-semibold">Race</span>
                      <p className="text-xl font-display font-bold leading-none">{race.raceNumber}</p>
                    </div>
                  </div>
                  <h3 className="font-bold text-xl text-white group-hover:text-primary transition-colors line-clamp-1">{race.trackName}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{race.raceName}</p>
                </div>
                
                <div className="p-5 grid grid-cols-2 gap-y-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase mb-1 flex items-center gap-1"><Calendar className="w-3 h-3"/> Date</p>
                    <p className="font-medium">{format(new Date(race.raceDate), 'MMM d, yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase mb-1 flex items-center gap-1"><MapPin className="w-3 h-3"/> Distance</p>
                    <p className="font-medium">{race.distance}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase mb-1">Surface</p>
                    <p className="font-medium capitalize">{race.surface}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase mb-1">Purse</p>
                    <p className="font-medium text-emerald-400">{race.purse ? formatCurrency(race.purse) : 'TBD'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      
      {races?.length === 0 && (
        <div className="py-20 text-center text-muted-foreground">
          <Flag className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg">No races found matching your criteria.</p>
        </div>
      )}
    </div>
  );
}
