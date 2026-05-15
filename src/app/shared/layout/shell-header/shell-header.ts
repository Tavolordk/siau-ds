import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * SIAU Shell Header — top institutional bar.
 *
 * Renders the SSPC seal, the system title and a user avatar / menu trigger.
 * Pure presentational: emits avatar clicks; the parent decides what to show
 * (profile menu, logout, etc).
 */
@Component({
    selector: 'siau-shell-header',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule],
    templateUrl: './shell-header.html',
    styleUrl: './shell-header.scss',
})
export class SiauShellHeader {
    /** Main title shown in the center. */
    readonly title = input<string>('Sistema Integral de Administración de Usuarios SIAU');

    /** Institutional brand text shown next to the seal. */
    readonly brand = input<string>('Seguridad');

    /** Subtitle below the brand. */
    readonly brandSubtitle = input<string>('Secretaría de Seguridad y Protección Ciudadana');

    /** Optional user initials shown in the avatar. */
    readonly userInitials = input<string | null>(null);

    readonly avatarClick = output<void>();

    protected onAvatarClick(): void {
        this.avatarClick.emit();
    }
}