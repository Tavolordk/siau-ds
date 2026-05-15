import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Single navigation item in the sidebar.
 *
 * The `id` is used as the click event payload — the parent decides
 * how to navigate (router, signal change, etc).
 */
export interface SidebarItem {
    readonly id: string;
    readonly label: string;
    readonly icon: string;
    readonly disabled?: boolean;
}

/**
 * SIAU Shell Sidebar — left navigation panel.
 *
 * Controlled component: the parent owns the `collapsed` and `activeId` state.
 * The sidebar only renders and emits events. This keeps state in one place
 * and lets the parent persist collapse preference, route-based active state, etc.
 */
@Component({
    selector: 'siau-shell-sidebar',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule],
    templateUrl: './shell-sidebar.html',
    styleUrl: './shell-sidebar.scss',
})
export class SiauShellSidebar {
    readonly items = input.required<readonly SidebarItem[]>();
    readonly activeId = input<string | null>(null);
    readonly collapsed = input<boolean>(false);

    readonly itemClick = output<string>();
    readonly collapseToggle = output<void>();

    protected readonly hostClasses = computed(() => {
        return ['siau-shell-sidebar', this.collapsed() ? 'siau-shell-sidebar--collapsed' : ''].join(' ').trim();
    });

    protected itemClasses(itemId: string): string {
        const isActive = itemId === this.activeId();
        return `siau-shell-sidebar__item ${isActive ? 'siau-shell-sidebar__item--active' : ''}`.trim();
    }

    protected onItemClick(item: SidebarItem): void {
        if (item.disabled) return;
        this.itemClick.emit(item.id);
    }

    protected onCollapseClick(): void {
        this.collapseToggle.emit();
    }
}