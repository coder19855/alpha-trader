import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

export interface LoginStatus {
  hasActiveToken: boolean;
  redirectUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly fyersValid = signal(false);

  checkLogin(): Observable<LoginStatus> {
    return this.http.get<LoginStatus>('/api/login').pipe(
      tap((res) => this.fyersValid.set(Boolean(res.hasActiveToken))),
    );
  }

  startBrowserLogin(nextPath = '/'): void {
    const next = encodeURIComponent(nextPath || '/');
    window.location.href = `/api/login/browser?next=${next}`;
  }

  forceRelogin(nextPath = '/'): void {
    const next = encodeURIComponent(nextPath || '/');
    window.location.href = `/api/login/browser?forceRelogin=1&next=${next}`;
  }

  logout(): Observable<{ message?: string; error?: string }> {
    return this.http.get<{ message?: string; error?: string }>('/api/logout').pipe(
      tap(() => this.fyersValid.set(false)),
    );
  }
}