import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { SiauShellHeader } from '../shell-header/shell-header';
import { SiauShellSidebar, SidebarItem } from '../shell-sidebar/shell-sidebar';

/**
 * SIAU Shell — main application layout.
 *
 * Composes header + sidebar + content slot. Manages the sidebar's
 * collapsed/active state internally. Renders user-projected content
 * via <ng-content/>.
 *
 * Nav items and active state are hardcoded here for the demo. When we
 * wire up routing, the active state will derive from the current URL.
 */
@Component({
    selector: 'siau-shell',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauShellHeader, SiauShellSidebar],
    templateUrl: './shell.html',
    styleUrl: './shell.scss',
})
export class SiauShell {
    protected readonly sidebarCollapsed = signal<boolean>(false);
    protected readonly activeItemId = signal<string>('usuarios');

    protected readonly navItems: SidebarItem[] = [
        { id: 'usuarios', label: 'Usuarios', icon: 'group' },
        { id: 'solicitudes', label: 'Solicitudes', icon: 'description' },
        { id: 'administracion', label: 'Administración', icon: 'tune' },
        { id: 'reportes', label: 'Reportes', icon: 'insert_chart' },
        { id: 'bitacora', label: 'Bitácora', icon: 'timeline' },
        { id: 'modals', label: 'Modals', icon: 'layers' },
    ];

    protected onItemClick(itemId: string): void {
        this.activeItemId.set(itemId);
    }

    protected onCollapseToggle(): void {
        this.sidebarCollapsed.update((v) => !v);
    }

    protected onAvatarClick(): void {
        console.log('Avatar clicked — abrir menú de perfil');
    }
}