import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { UserRecord } from '../../../domain/models/user-record.model';

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

@Component({
    selector: 'app-user-management-page',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, MatIconModule],
    templateUrl: './user-management-page.html',
    styleUrl: './user-management-page.scss',
})
export class UserManagementPage {
    protected readonly searchTerm = signal<string>('');

    protected readonly users = signal<readonly UserRecord[]>([
        {
            username: 'ana.martinez',
            fullName: 'Ana Martínez López',
            email: 'ana.martinez@sspc.gob.mx',
            role: 'Administrador',
            status: 'Activo',
            rnpsp: 'Registrado',
            trust: 'Vigente',
        },
        {
            username: 'carlos.ruiz',
            fullName: 'Carlos Ruiz Hernández',
            email: 'carlos.ruiz@sspc.gob.mx',
            role: 'Enlace Institucional',
            status: 'Activo',
            rnpsp: 'Registrado',
            trust: 'Vigente',
        },
        {
            username: 'elena.gomez',
            fullName: 'Elena Gómez Vargas',
            email: 'elena.gomez@sspc.gob.mx',
            role: 'Usuario',
            status: 'Inhabilitado',
            rnpsp: 'No registrado',
            trust: 'Expirado',
        },
        {
            username: 'miguel.torres',
            fullName: 'Miguel Ángel Torres',
            email: 'miguel.torres@sspc.gob.mx',
            role: 'Supervisor Estatal',
            status: 'Suspendido',
            rnpsp: 'Registrado',
            trust: 'Expirado',
        },
        {
            username: 'laura.perez',
            fullName: 'Laura Pérez Soto',
            email: 'laura.perez@sspc.gob.mx',
            role: 'Usuario',
            status: 'Activo',
            rnpsp: 'No registrado',
            trust: 'Vigente',
        },
    ]);

    protected readonly filteredUsers = computed(() => {
        const term = this.searchTerm().trim().toLowerCase();

        if (!term) {
            return this.users();
        }

        return this.users().filter((user) => {
            const value = `${user.username} ${user.fullName} ${user.email}`.toLowerCase();
            return value.includes(term);
        });
    });

    protected updateSearchTerm(value: string): void {
        this.searchTerm.set(value);
    }

    protected getRoleTone(role: UserRecord['role']): BadgeTone {
        if (role === 'Usuario') {
            return 'info';
        }

        return 'neutral';
    }

    protected getStatusTone(status: UserRecord['status']): BadgeTone {
        if (status === 'Activo') {
            return 'success';
        }

        if (status === 'Suspendido') {
            return 'warning';
        }

        return 'danger';
    }

    protected getRegistryTone(status: UserRecord['rnpsp']): BadgeTone {
        return status === 'Registrado' ? 'success' : 'danger';
    }

    protected getTrustTone(status: UserRecord['trust']): BadgeTone {
        return status === 'Vigente' ? 'success' : 'warning';
    }
}