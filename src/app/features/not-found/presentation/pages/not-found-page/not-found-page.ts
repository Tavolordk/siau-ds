import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';

@Component({
  selector: 'siau-not-found-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiauLucideIcon],
  templateUrl: './not-found-page.html',
  styleUrl: './not-found-page.scss',
})
export class NotFoundPage {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly requestedPath = signal(this.resolveRequestedPath(this.router.url));

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.requestedPath.set(this.resolveRequestedPath(event.urlAfterRedirects));
      });
  }

  protected goBack(): void {
    this.location.back();
  }

  protected goToUsers(): void {
    void this.router.navigateByUrl('/usuarios');
  }

  private resolveRequestedPath(url: string): string {
    const [path] = url.split('?');
    return path || '/';
  }
}
