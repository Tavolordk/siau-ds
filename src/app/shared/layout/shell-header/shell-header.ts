import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
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
    readonly title = input<string>('Sistema Integral de Administración de Usuarios SIAU');
    readonly brand = input<string>('Seguridad');
    readonly brandSubtitle = input<string>('Secretaría de Seguridad y Protección Ciudadana');
    readonly userInitials = input<string | null>(null);

    readonly avatarClick = output<void>();

    protected onAvatarClick(): void {
        this.avatarClick.emit();
    }
}