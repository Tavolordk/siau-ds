import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthFacade } from '../../../core/auth/application/auth.facade';
import { SiauShellHeader } from '../shell-header/shell-header';
import { SiauShellSidebar, SidebarItem } from '../shell-sidebar/shell-sidebar';

@Component({
  selector: 'siau-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SiauShellHeader, SiauShellSidebar],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class SiauShell implements OnDestroy {
  protected readonly auth = inject(AuthFacade);

  private readonly router = inject(Router);
  private readonly currentUrl = signal<string>(this.router.url);

  protected readonly sidebarCollapsed = signal<boolean>(false);
  protected readonly userInitials = this.auth.userInitials;
  protected readonly userName = this.auth.userName;
  protected readonly userRole = this.auth.userRole;

  protected readonly navItems: SidebarItem[] = [
    { id: 'usuarios', label: 'Usuarios', icon: 'users', route: '/usuarios' },
    { id: 'solicitudes', label: 'Solicitudes', icon: 'clipboard-list', route: '/solicitudes' },
    { id: 'administracion', label: 'Administración', icon: 'settings-2', route: '/administracion' },
    { id: 'reportes', label: 'Reportes', icon: 'file-text', route: '/reportes' },
    { id: 'bitacora', label: 'Bitácora', icon: 'activity', route: '/bitacora' },
    { id: 'modals', label: 'Modals', icon: 'layers', route: '/modals' },
  ];

  protected readonly activeItemId = computed(() => {
    const url = this.currentUrl();
    return this.navItems.find((item) => url.startsWith(item.route))?.id ?? null;
  });

  constructor() {
    this.auth.startSessionMonitor();

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
      });
  }

  ngOnDestroy(): void {
    this.auth.stopSessionMonitor();
  }

  protected onItemClick(item: SidebarItem): void {
    if (item.disabled) {
      return;
    }

    void this.router.navigateByUrl(item.route);
  }

  protected onCollapseToggle(): void {
    this.sidebarCollapsed.update((value) => !value);
  }

  protected onSettingsClick(): void {
    void this.router.navigateByUrl('/administracion');
  }

  protected onLogoutClick(): void {
    this.auth.logout();
  }

  protected onDismissSessionPrompt(): void {
    this.auth.dismissSessionPrompt();
  }
}