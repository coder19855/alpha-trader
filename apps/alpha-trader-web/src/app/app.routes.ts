import { Route } from '@angular/router';
import { ShellComponent } from './layout/shell/shell.component';
import { LiveDeckComponent } from './pages/live-deck/live-deck.component';
import { ReplayDeckComponent } from './pages/replay-deck/replay-deck.component';
import { BenchmarkComponent } from './pages/benchmark/benchmark.component';
import { LoginComponent } from './pages/login/login.component';

export const appRoutes: Route[] = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', redirectTo: 'live/signal', pathMatch: 'full' },
      { path: 'live', redirectTo: 'live/signal', pathMatch: 'full' },
      { path: 'live/:tab', component: LiveDeckComponent },
      { path: 'replay', redirectTo: 'replay/signal', pathMatch: 'full' },
      { path: 'replay/:tab', component: ReplayDeckComponent },
      { path: 'benchmark', component: BenchmarkComponent },
    ],
  },
];