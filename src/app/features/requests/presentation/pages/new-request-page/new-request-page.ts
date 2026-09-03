import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RequestMockStore } from '../../../application/stores/request-mock.store';
import {
  RequestDocument,
  RequestDocumentMimeType,
  RequestPriority,
  RequestType,
} from '../../../domain/models/request-record.model';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';

interface DraftDocument extends RequestDocument {
  readonly objectUrl: string;
}

@Component({
  selector: 'app-new-request-page',
  standalone: true,
  imports: [FormsModule, SiauLucideIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './new-request-page.html',
  styleUrl: './new-request-page.scss',
})
export class NewRequestPage implements OnDestroy {
  private readonly router = inject(Router);
  private readonly mockStore = inject(RequestMockStore);

  protected type: RequestType = 'Alta de usuario';
  protected applicant = '';
  protected username = '';
  protected email = '';
  protected curp = '';
  protected institution = 'SSPC';
  protected department = '';
  protected priority: RequestPriority = 'Media';
  protected profiles = 'SIAU · Consulta';
  protected comments = '';

  protected readonly typeOptions: readonly RequestType[] = [
    'Alta de usuario',
    'Modificación de datos',
    'Cambio de rol',
    'Desbloqueo de cuenta',
    'Restablecimiento de contraseña',
  ];
  protected readonly priorityOptions: readonly RequestPriority[] = ['Alta', 'Media', 'Baja'];

  protected readonly documents = signal<readonly DraftDocument[]>([]);
  protected readonly validationMessage = signal<string | null>(null);
  protected readonly createdFolio = signal<string | null>(null);

  ngOnDestroy(): void {
    if (!this.createdFolio()) {
      this.documents().forEach((document) => URL.revokeObjectURL(document.objectUrl));
    }
  }

  protected backToRequests(): void {
    void this.router.navigateByUrl('/solicitudes');
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    if (files.length === 0) {
      return;
    }

    const allowed = new Set<RequestDocumentMimeType>(['application/pdf', 'image/jpeg', 'image/png']);
    const invalidType = files.find((file) => !allowed.has(file.type as RequestDocumentMimeType));
    if (invalidType) {
      this.validationMessage.set(`El archivo "${invalidType.name}" no tiene un formato permitido.`);
      return;
    }

    const invalidSize = files.find((file) => file.size > 10 * 1024 * 1024);
    if (invalidSize) {
      this.validationMessage.set(`El archivo "${invalidSize.name}" supera el máximo de 10 MB.`);
      return;
    }

    const now = new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date()).replace(',', '');

    const appended = files.map<DraftDocument>((file) => ({
      id: `new-doc-${crypto.randomUUID()}`,
      name: file.name,
      mimeType: file.type as RequestDocumentMimeType,
      sizeBytes: file.size,
      uploadedAt: now,
      objectUrl: URL.createObjectURL(file),
    }));

    this.documents.update((current) => [...current, ...appended]);
    this.validationMessage.set(null);
  }

  protected removeDocument(documentId: string): void {
    const target = this.documents().find((document) => document.id === documentId);
    if (target) {
      URL.revokeObjectURL(target.objectUrl);
    }
    this.documents.update((current) => current.filter((document) => document.id !== documentId));
  }

  protected fileType(document: RequestDocument): string {
    if (document.mimeType === 'application/pdf') return 'PDF';
    if (document.mimeType === 'image/png') return 'PNG';
    return 'JPG';
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected createRequest(): void {
    if (this.createdFolio()) {
      return;
    }

    const required = [
      ['Nombre del solicitante', this.applicant],
      ['Usuario', this.username],
      ['Correo electrónico', this.email],
      ['CURP', this.curp],
      ['Institución', this.institution],
      ['Adscripción', this.department],
    ] as const;

    const missing = required.find(([, value]) => !value.trim());
    if (missing) {
      this.validationMessage.set(`Completa el campo: ${missing[0]}.`);
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(this.email.trim())) {
      this.validationMessage.set('Ingresa un correo electrónico válido.');
      return;
    }

    if (this.curp.trim().length !== 18) {
      this.validationMessage.set('La CURP debe contener 18 caracteres.');
      return;
    }

    const request = this.mockStore.create({
      type: this.type,
      applicant: this.applicant,
      username: this.username,
      email: this.email,
      curp: this.curp,
      institution: this.institution,
      department: this.department,
      priority: this.priority,
      profiles: this.profiles
        .split(',')
        .map((profile) => profile.trim())
        .filter(Boolean),
      documents: this.documents(),
    });

    this.validationMessage.set(null);
    this.createdFolio.set(request.folio);
  }
}
