import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RequestDraftStore } from '../../../application/stores/request-draft.store';
import { RequestMockStore } from '../../../application/stores/request-mock.store';
import {
  RequestCreationStepId,
  RequestDraft,
} from '../../../domain/models/request-draft.model';
import {
  RequestDocument,
  RequestDocumentMimeType,
  RequestPriority,
  RequestRecord,
  RequestType,
} from '../../../domain/models/request-record.model';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { SiauModal } from '../../../../../shared/ui/components/modal/modal';

type ModalView = 'form' | 'drafts' | 'success';
type FeedbackTone = 'success' | 'error' | 'info';

interface StepDefinition {
  readonly id: RequestCreationStepId;
  readonly label: string;
  readonly helper: string;
  readonly icon: string;
}

interface FeedbackMessage {
  readonly tone: FeedbackTone;
  readonly text: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES: readonly RequestDocumentMimeType[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

@Component({
  selector: 'app-request-create-modal',
  standalone: true,
  imports: [FormsModule, SiauModal, SiauLucideIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-create-modal.html',
  styleUrl: './request-create-modal.scss',
})
export class RequestCreateModal implements OnDestroy {
  private readonly requestStore = inject(RequestMockStore);
  private readonly draftStore = inject(RequestDraftStore);

  readonly open = input<boolean>(false);
  readonly initialView = input<'form' | 'drafts'>('form');
  readonly closed = output<void>();
  readonly created = output<RequestRecord>();

  protected readonly drafts = this.draftStore.drafts;
  protected readonly view = signal<ModalView>('form');
  protected readonly activeStep = signal<RequestCreationStepId>('requester');
  protected readonly currentDraftId = signal<string | null>(null);
  protected readonly documents = signal<readonly RequestDocument[]>([]);
  protected readonly feedback = signal<FeedbackMessage | null>(null);
  protected readonly createdFolio = signal<string | null>(null);

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

  protected readonly steps: readonly StepDefinition[] = [
    { id: 'requester', label: 'Solicitante', helper: 'Identificación y contacto', icon: 'user' },
    { id: 'request', label: 'Solicitud', helper: 'Movimiento y adscripción', icon: 'clipboard-list' },
    { id: 'profiles', label: 'Perfiles', helper: 'Accesos solicitados', icon: 'layers' },
    { id: 'documents', label: 'Documentos', helper: 'Carga libre de archivos', icon: 'file-text' },
    { id: 'review', label: 'Revisión', helper: 'Confirmación final', icon: 'circle-check' },
  ];

  protected readonly typeOptions: readonly RequestType[] = [
    'Alta de usuario',
    'Modificación de datos',
    'Cambio de rol',
    'Desbloqueo de cuenta',
    'Restablecimiento de contraseña',
  ];
  protected readonly priorityOptions: readonly RequestPriority[] = ['Alta', 'Media', 'Baja'];

  constructor() {
    effect(() => {
      if (this.open()) {
        this.view.set(this.initialView());
      }
    });
  }

  ngOnDestroy(): void {
    this.revokeTemporaryDocuments();
  }

  protected modalTitle(): string {
    if (this.view() === 'drafts') return 'Borradores de solicitudes';
    if (this.view() === 'success') return 'Solicitud registrada';
    return this.currentDraftId() ? 'Continuar solicitud' : 'Nueva solicitud';
  }

  protected modalSubtitle(): string {
    if (this.view() === 'drafts') return 'Continúa una solicitud guardada sin salir del módulo';
    if (this.view() === 'success') return 'El expediente quedó registrado correctamente';
    return 'Captura la información por secciones y adjunta los documentos correspondientes';
  }

  protected modalIcon(): string {
    if (this.view() === 'drafts') return 'clipboard-list';
    if (this.view() === 'success') return 'circle-check';
    return 'file-text';
  }

  protected headerBadge(): string {
    if (this.view() === 'drafts') return `${this.drafts().length} borradores`;
    if (this.currentDraftId()) return 'Borrador en edición';
    return 'Expediente nuevo';
  }

  protected selectStep(stepId: RequestCreationStepId): void {
    this.activeStep.set(stepId);
    this.feedback.set(null);
  }

  protected stepIndex(stepId = this.activeStep()): number {
    return this.steps.findIndex((step) => step.id === stepId);
  }

  protected progressPercent(): number {
    return Math.round(((this.stepIndex() + 1) / this.steps.length) * 100);
  }

  protected isStepComplete(stepId: RequestCreationStepId): boolean {
    switch (stepId) {
      case 'requester':
        return Boolean(
          this.applicant.trim() &&
          this.username.trim() &&
          this.email.trim() &&
          this.curp.trim().length === 18,
        );
      case 'request':
        return Boolean(this.institution.trim() && this.department.trim() && this.type);
      case 'profiles':
        return !this.requiresProfiles() || this.profileList().length > 0;
      case 'documents':
        return this.documents().length > 0;
      case 'review':
        return this.isFormValid();
    }
  }

  protected nextStep(): void {
    const issue = this.validateStep(this.activeStep());
    if (issue) {
      this.feedback.set({ tone: 'error', text: issue });
      return;
    }

    const index = this.stepIndex();
    if (index < this.steps.length - 1) {
      this.activeStep.set(this.steps[index + 1].id);
      this.feedback.set(null);
    }
  }

  protected previousStep(): void {
    const index = this.stepIndex();
    if (index > 0) {
      this.activeStep.set(this.steps[index - 1].id);
      this.feedback.set(null);
    }
  }

  protected showDrafts(): void {
    this.view.set('drafts');
    this.feedback.set(null);
  }

  protected returnToForm(): void {
    this.view.set('form');
    this.feedback.set(null);
  }

  protected startBlankRequest(): void {
    this.resetForm(true);
    this.view.set('form');
  }

  protected saveDraft(): void {
    const draft = this.draftStore.save(this.draftPayload(), this.currentDraftId());
    this.currentDraftId.set(draft.id);
    this.feedback.set({
      tone: 'success',
      text: 'Borrador guardado. Puedes cerrar el modal y continuar más tarde.',
    });
  }

  protected resumeDraft(draft: RequestDraft): void {
    this.revokeTemporaryDocuments();
    this.type = draft.type;
    this.applicant = draft.applicant;
    this.username = draft.username;
    this.email = draft.email;
    this.curp = draft.curp;
    this.institution = draft.institution;
    this.department = draft.department;
    this.priority = draft.priority;
    this.profiles = draft.profiles;
    this.comments = draft.comments;
    this.documents.set(draft.documents.map((document) => ({ ...document, objectUrl: null })));
    this.currentDraftId.set(draft.id);
    this.activeStep.set(draft.activeStep);
    this.view.set('form');
    this.feedback.set(
      draft.documents.length
        ? {
            tone: 'info',
            text: 'Se recuperó la metadata de los documentos. Si recargaste el navegador, vuelve a seleccionar los archivos antes de enviar la solicitud.',
          }
        : null,
    );
  }

  protected deleteDraft(event: Event, draftId: string): void {
    event.stopPropagation();
    this.draftStore.remove(draftId);
    if (this.currentDraftId() === draftId) {
      this.currentDraftId.set(null);
    }
  }

  protected draftTitle(draft: RequestDraft): string {
    return draft.applicant.trim() || 'Solicitud sin solicitante';
  }

  protected draftSubtitle(draft: RequestDraft): string {
    const type = draft.type || 'Tipo pendiente';
    const institution = draft.institution.trim() || 'Institución pendiente';
    return `${type} · ${institution}`;
  }

  protected draftUpdatedAt(draft: RequestDraft): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(draft.updatedAt));
  }

  protected draftProgress(draft: RequestDraft): number {
    const index = this.steps.findIndex((step) => step.id === draft.activeStep);
    return Math.max(1, index + 1);
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;

    const invalidType = files.find(
      (file) => !ACCEPTED_TYPES.includes(file.type as RequestDocumentMimeType),
    );
    if (invalidType) {
      this.feedback.set({
        tone: 'error',
        text: `El archivo “${invalidType.name}” no tiene un formato permitido.`,
      });
      return;
    }

    const invalidSize = files.find((file) => file.size > MAX_FILE_SIZE);
    if (invalidSize) {
      this.feedback.set({
        tone: 'error',
        text: `El archivo “${invalidSize.name}” supera el máximo de 10 MB.`,
      });
      return;
    }

    const uploadedAt = this.formatNow();
    const newDocuments = files.map<RequestDocument>((file) => ({
      id: `request-doc-${crypto.randomUUID()}`,
      name: file.name,
      mimeType: file.type as RequestDocumentMimeType,
      sizeBytes: file.size,
      uploadedAt,
      objectUrl: URL.createObjectURL(file),
    }));

    this.documents.update((current) => [...current, ...newDocuments]);
    this.feedback.set(null);
  }

  protected removeDocument(documentId: string): void {
    const document = this.documents().find((item) => item.id === documentId);
    if (document?.objectUrl) URL.revokeObjectURL(document.objectUrl);
    this.documents.update((current) => current.filter((item) => item.id !== documentId));
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

  protected profileList(): readonly string[] {
    return this.profiles
      .split(',')
      .map((profile) => profile.trim())
      .filter(Boolean);
  }

  protected requiresProfiles(): boolean {
    return this.type === 'Alta de usuario' || this.type === 'Cambio de rol';
  }

  protected createRequest(): void {
    const issue = this.validateForm();
    if (issue) {
      this.activeStep.set(issue.step);
      this.feedback.set({ tone: 'error', text: issue.message });
      return;
    }

    const record = this.requestStore.create({
      type: this.type,
      applicant: this.applicant,
      username: this.username,
      email: this.email,
      curp: this.curp,
      institution: this.institution,
      department: this.department,
      priority: this.priority,
      profiles: this.profileList(),
      documents: this.documents(),
    });

    const draftId = this.currentDraftId();
    if (draftId) this.draftStore.remove(draftId);

    this.createdFolio.set(record.folio);
    this.view.set('success');
    this.feedback.set(null);
    this.created.emit(record);
  }

  protected closeModal(): void {
    const preserveObjectUrls = this.view() === 'success' && Boolean(this.createdFolio());
    this.resetForm(!preserveObjectUrls);
    this.closed.emit();
  }

  private validateStep(stepId: RequestCreationStepId): string | null {
    if (stepId === 'requester') {
      if (!this.applicant.trim()) return 'Captura el nombre completo del solicitante.';
      if (!this.username.trim()) return 'Captura el usuario asociado a la solicitud.';
      if (!/^\S+@\S+\.\S+$/.test(this.email.trim())) return 'Captura un correo electrónico válido.';
      if (this.curp.trim().length !== 18) return 'La CURP debe contener 18 caracteres.';
    }

    if (stepId === 'request') {
      if (!this.institution.trim()) return 'Captura la institución.';
      if (!this.department.trim()) return 'Captura la adscripción o unidad administrativa.';
    }

    if (stepId === 'profiles' && this.requiresProfiles() && !this.profileList().length) {
      return 'Agrega al menos un perfil para este tipo de solicitud.';
    }

    return null;
  }

  private validateForm(): { readonly step: RequestCreationStepId; readonly message: string } | null {
    for (const step of ['requester', 'request', 'profiles'] as const) {
      const message = this.validateStep(step);
      if (message) return { step, message };
    }
    return null;
  }

  private isFormValid(): boolean {
    return this.validateForm() === null;
  }

  private draftPayload() {
    return {
      activeStep: this.activeStep(),
      type: this.type,
      applicant: this.applicant,
      username: this.username,
      email: this.email,
      curp: this.curp,
      institution: this.institution,
      department: this.department,
      priority: this.priority,
      profiles: this.profiles,
      comments: this.comments,
      documents: this.documents(),
    } as const;
  }

  private resetForm(revokeDocuments: boolean): void {
    if (revokeDocuments) this.revokeTemporaryDocuments();
    this.type = 'Alta de usuario';
    this.applicant = '';
    this.username = '';
    this.email = '';
    this.curp = '';
    this.institution = 'SSPC';
    this.department = '';
    this.priority = 'Media';
    this.profiles = 'SIAU · Consulta';
    this.comments = '';
    this.documents.set([]);
    this.currentDraftId.set(null);
    this.activeStep.set('requester');
    this.view.set('form');
    this.feedback.set(null);
    this.createdFolio.set(null);
  }

  private revokeTemporaryDocuments(): void {
    this.documents().forEach((document) => {
      if (document.objectUrl) URL.revokeObjectURL(document.objectUrl);
    });
  }

  private formatNow(): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date()).replace(',', '');
  }
}
