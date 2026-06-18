import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snack = inject(MatSnackBar);

  info(message: string): void {
    this.open(message, 'snack-info');
  }

  success(message: string): void {
    this.open(message, 'snack-success');
  }

  warn(message: string): void {
    this.open(message, 'snack-warn');
  }

  error(message: string): void {
    this.open(message, 'snack-error', 6000);
  }

  private open(message: string, panelClass: string, duration = 4000): void {
    this.snack.open(message, 'Dismiss', {
      duration,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: ['deck-snack', panelClass],
    });
  }
}