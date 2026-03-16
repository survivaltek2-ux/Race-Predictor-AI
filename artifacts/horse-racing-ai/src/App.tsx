import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Components
import { Layout } from "@/components/Layout";

// Pages
import { Dashboard } from "@/pages/Dashboard";
import { Races } from "@/pages/Races";
import { RaceDetail } from "@/pages/RaceDetail";
import { Horses } from "@/pages/Horses";
import { HorseDetail } from "@/pages/HorseDetail";
import { Predictions } from "@/pages/Predictions";
import { Sports } from "@/pages/Sports";
import { SportEvents } from "@/pages/SportEvents";
import { SportEventDetail } from "@/pages/SportEventDetail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/races" component={Races} />
        <Route path="/races/:id" component={RaceDetail} />
        <Route path="/horses" component={Horses} />
        <Route path="/horses/:id" component={HorseDetail} />
        <Route path="/predictions" component={Predictions} />
        <Route path="/sports" component={Sports} />
        <Route path="/sports/:sport" component={SportEvents} />
        <Route path="/sports/:sport/events/:eventId" component={SportEventDetail} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
