import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { SiauLucideIcon } from '../../ui/components/lucide-icon/lucide-icon';

export interface SidebarItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly route: string;
  readonly disabled?: boolean;
}

@Component({
  selector: 'siau-shell-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiauLucideIcon],
  templateUrl: './shell-sidebar.html',
  styleUrl: './shell-sidebar.scss',
})
export class SiauShellSidebar {
  readonly items = input.required<readonly SidebarItem[]>();
  readonly activeId = input<string | null>(null);
  readonly collapsed = input<boolean>(false);

  readonly itemClick = output<SidebarItem>();
  readonly collapseToggle = output<void>();

  protected readonly hostClasses = computed(() => {
    return ['siau-shell-sidebar', this.collapsed() ? 'siau-shell-sidebar--collapsed' : ''].join(' ').trim();
  });

  protected itemClasses(itemId: string): string {
    const isActive = itemId === this.activeId();
    return `siau-shell-sidebar__item ${isActive ? 'siau-shell-sidebar__item--active' : ''}`.trim();
  }

  protected onItemClick(item: SidebarItem): void {
    if (item.disabled) {
      return;
    }

    this.itemClick.emit(item);
  }

  protected onCollapseClick(): void {
    this.collapseToggle.emit();
  }
}