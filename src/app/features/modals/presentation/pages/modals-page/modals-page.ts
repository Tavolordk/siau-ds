import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { SiauButton } from '../../../../../shared/ui/components/button/button';
import { SiauModal } from '../../../../../shared/ui/components/modal/modal';

type ModalType = 'success' | 'warning' | 'error' | 'confirmation' | null;

interface ModalDemo {
  readonly id: Exclude<ModalType, null>;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly buttonLabel: string;
}

@Component({
  selector: 'app-modals-page',
  standalone: true,
  imports: [MatIconModule, SiauButton, SiauModal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modals-page.html',
  styleUrl: './modals-page.scss',
})
export class ModalsPage {
  protected readonly activeModal = signal<ModalType>(null);

  protected readonly demos: readonly ModalDemo[] = [
    {
      id: 'success',
      title: 'Modal de éxito',
      description: 'Confirma que una operación fue realizada correctamente.',
      icon: 'check_circle',
      buttonLabel: 'Ver éxito',
    },
    {
      id: 'warning',
      title: 'Modal de advertencia',
      description: 'Informa una acción que requiere atención antes de continuar.',
      icon: 'warning',
      buttonLabel: 'Ver advertencia',
    },
    {
      id: 'error',
      title: 'Modal de error',
      description: 'Notifica que ocurrió un problema durante la operación.',
      icon: 'error',
      buttonLabel: 'Ver error',
    },
    {
      id: 'confirmation',
      title: 'Modal de confirmación',
      description: 'Solicita confirmar una acción importante del sistema.',
      icon: 'help',
      buttonLabel: 'Ver confirmación',
    },
  ];

  protected openModal(type: Exclude<ModalType, null>): void {
    this.activeModal.set(type);
  }

  protected closeModal(): void {
    this.activeModal.set(null);
  }

  protected isOpen(type: Exclude<ModalType, null>): boolean {
    return this.activeModal() === type;
  }
}