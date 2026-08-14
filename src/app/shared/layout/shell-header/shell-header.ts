import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostListener,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { SiauLucideIcon } from '../../ui/components/lucide-icon/lucide-icon';

@Component({
    selector: 'siau-shell-header',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauLucideIcon],
    templateUrl: './shell-header.html',
    styleUrl: './shell-header.scss',
})
export class SiauShellHeader {
    private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

    readonly title = input<string>('Sistema Integral de Administración de Usuarios');
    readonly brand = input<string>('Seguridad');
    readonly brandSubtitle = input<string>('Secretaría de Seguridad y Protección Ciudadana');

    readonly userInitials = input<string | null>('JA');
    readonly userName = input<string>('Juan Administrador');
    readonly userRole = input<string>('Super Admin');

    readonly settingsClick = output<void>();
    readonly logoutClick = output<void>();

    protected readonly userMenuOpen = signal(false);

    protected toggleUserMenu(event: MouseEvent): void {
        event.stopPropagation();
        this.userMenuOpen.update((open) => !open);
    }

    protected closeUserMenu(): void {
        this.userMenuOpen.set(false);
    }

    protected onSettingsClick(): void {
        this.closeUserMenu();
        this.settingsClick.emit();
    }

    protected onLogoutClick(): void {
        this.closeUserMenu();
        this.logoutClick.emit();
    }

    @HostListener('document:click', ['$event'])
    protected onDocumentClick(event: MouseEvent): void {
        const target = event.target as Node | null;

        if (!target) {
            return;
        }

        if (!this.elementRef.nativeElement.contains(target)) {
            this.closeUserMenu();
        }
    }

    @HostListener('document:keydown.escape')
    protected onEscapeKey(): void {
        this.closeUserMenu();
    }
}