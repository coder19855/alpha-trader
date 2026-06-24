import { CommonModule } from '@angular/common';
import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { WebSession } from '../../core/models/deck.models';
import { AuthService } from '../../core/services/auth.service';
import {
  DeckContextService,
  DeckTab,
} from '../../core/services/deck-context.service';
import { DeckApiService } from '../../core/services/deck-api.service';
import { ThemeService, DeckTheme } from '../../core/services/theme.service';
import {
  isIndianMarketOpen,
  NSE_SESSION_LABEL,
} from '../../core/utils/market-hours';
import { AlertSoundService } from '../../core/services/alert-sound.service';
import { DeckReloadService } from '../../core/services/deck-reload.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastStackComponent } from '../../shared/toast-stack/toast-stack.component';

interface AppNavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    MatIconModule,
    MatSelectModule,
    ToastStackComponent,
  ],
  styleUrls: ['./shell.component.scss'],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit, OnDestroy {
  readonly ctx = inject(DeckContextService);
  readonly deckReload = inject(DeckReloadService);
  readonly themes = inject(ThemeService);
  private readonly deckApi = inject(DeckApiService);
  private readonly notify = inject(NotificationService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertSounds = inject(AlertSoundService);

  readonly appNav: AppNavItem[] = [
    { path: '/live/signal', label: 'Live deck', icon: 'dashboard' },
    { path: '/replay/signal', label: 'Replay', icon: 'replay' },
    { path: '/benchmark', label: 'Benchmark', icon: 'speed' },
  ];

  readonly session = signal<WebSession | null>(null);
  readonly sidebarOpen = signal(false);
  readonly sidebarCollapsed = signal(false);
  readonly logoutOpen = signal(false);
  readonly logoutBusy = signal(false);
  readonly logoutError = signal<string | null>(null);
  readonly istNow = signal('— IST');
  readonly istNowIso = signal('');
  readonly marketOpen = signal(true);
  readonly sessionHours = NSE_SESSION_LABEL;

  private istClockTimer: number | null = null;

  ngOnInit(): void {
    this.tickIstClock();
    this.istClockTimer = window.setInterval(() => this.tickIstClock(), 1000);

    this.refreshSession();
    this.auth.checkLogin().subscribe();
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        this.closeSidebarIfMobile();
        this.refreshSession();
      });
  }

  ngOnDestroy(): void {
    if (this.istClockTimer != null) window.clearInterval(this.istClockTimer);
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!this.isMobileSidebar()) this.setSidebarOpen(false);
  }

  @HostListener('document:click')
  @HostListener('document:keydown')
  unlockAlertSounds(): void {
    this.alertSounds.unlock();
  }

  themeLabel(theme: DeckTheme): string {
    return theme.charAt(0).toUpperCase() + theme.slice(1);
  }

  selectTab(tab: DeckTab): void {
    this.ctx.setTab(tab);
    this.closeSidebarIfMobile();
  }

  appNavActive(item: AppNavItem): boolean {
    const view = this.ctx.appView();
    if (item.path.startsWith('/live') || item.path === '/')
      return view === 'live';
    if (item.path.startsWith('/replay')) return view === 'replay';
    if (item.path.startsWith('/benchmark')) return view === 'benchmark';
    return false;
  }

  login(): void {
    this.auth.startBrowserLogin(this.router.url || '/');
  }

  reloadDeck(): void {
    if (this.ctx.appView() !== 'live') {
      this.notify.info('Open Live deck to refresh the stream.');
      return;
    }
    this.deckReload.request();
  }

  toggleNav(): void {
    if (this.isMobileSidebar()) {
      this.setSidebarOpen(!this.sidebarOpen());
      return;
    }
    this.sidebarCollapsed.update((v) => !v);
  }

  openLogout(): void {
    this.logoutError.set(null);
    this.closeSidebarIfMobile();
    this.logoutOpen.set(true);
  }

  closeLogout(): void {
    this.logoutOpen.set(false);
  }

  confirmLogout(): void {
    this.logoutBusy.set(true);
    this.auth.logout().subscribe({
      next: () => {
        this.logoutBusy.set(false);
        this.logoutOpen.set(false);
        this.refreshSession();
        void this.router.navigate(['/login']);
      },
      error: (err) => {
        this.logoutBusy.set(false);
        this.logoutError.set(
          err?.error?.error || err.message || 'Logout failed',
        );
      },
    });
  }

  setSidebarOpen(open: boolean): void {
    this.sidebarOpen.set(open);
    document.documentElement.classList.toggle('sidebar-open', open);
  }

  closeSidebarIfMobile(): void {
    if (this.isMobileSidebar()) this.setSidebarOpen(false);
  }

  isMobileSidebar(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 900px)').matches
    );
  }

  private refreshSession(): void {
    this.deckApi.getSession().subscribe({
      next: (s) => {
        this.session.set(s);
        this.auth.fyersValid.set(s.auth.fyersValid);
      },
      error: () => this.session.set(null),
    });
  }

  private tickIstClock(): void {
    const now = new Date();
    const nowMs = now.getTime();
    this.marketOpen.set(isIndianMarketOpen(nowMs));
    this.istNowIso.set(now.toISOString());
    this.istNow.set(
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(now) + ' IST',
    );
  }
}
