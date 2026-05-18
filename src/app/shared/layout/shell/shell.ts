import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SiauShellHeader } from '../shell-header/shell-header';
import { SiauShellSidebar, SidebarItem } from '../shell-sidebar/shell-sidebar';

@Component({
  selector: 'siau-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiauShellHeader, SiauShellSidebar],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class SiauShell {
  private readonly router = inject(Router);
  private readonly currentUrl = signal<string>(this.router.url);

  protected readonly sidebarCollapsed = signal<boolean>(false);

  protected readonly navItems: SidebarItem[] = [
    { id: 'usuarios', label: 'Usuarios', icon: 'group', route: '/usuarios' },
    { id: 'solicitudes', label: 'Solicitudes', icon: 'description', route: '/solicitudes' },
    { id: 'administracion', label: 'Administración', icon: 'tune', route: '/administracion' },
    { id: 'reportes', label: 'Reportes', icon: 'insert_chart', route: '/reportes' },
    { id: 'bitacora', label: 'Bitácora', icon: 'timeline', route: '/bitacora' },
    { id: 'modals', label: 'Modals', icon: 'layers', route: '/modals' },
  ];

  protected readonly activeItemId = computed(() => {
    const url = this.currentUrl();

    return this.navItems.find((item) => url.startsWith(item.route))?.id ?? 'usuarios';
  });

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
      });
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

  protected onAvatarClick(): void {}
}