import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
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
import type {
  RequestReviewAction,
  RequestReviewCommand,
} from '../../../domain/models/request-review.model';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { SiauModal } from '../../../../../shared/ui/components/modal/modal';

export type RequestModalInitialView = 'form' | 'drafts' | 'detail';
type ModalView = RequestModalInitialView | 'success';
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
  selector: 'app-request-modal',
  standalone: true,
  imports: [FormsModule, SiauModal, SiauLucideIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-modal.html',
  styleUrl: './request-modal.scss',
})
export class RequestModal implements OnDestroy {
  private readonly requestStore = inject(RequestMockStore);
  private readonly draftStore = inject(RequestDraftStore);
  private readonly sanitizer = inject(DomSanitizer);
  private loadedDetailFolio: string | null = null;

  readonly open = input<boolean>(false);
  readonly initialView = input<RequestModalInitialView>('form');
  readonly request = input<RequestRecord | null>(null);
  readonly busy = input(false);
  readonly resultMessage = input<string | null>(null);
  readonly resultTone = input<'success' | 'error' | null>(null);

  readonly closed = output<void>();
  readonly created = output<RequestRecord>();
  readonly actionRequested = output<RequestReviewCommand>();
  readonly documentsChanged = output<readonly RequestDocument[]>();

  protected readonly drafts = this.draftStore.drafts;
  protected readonly view = signal<ModalView>('form');
  protected readonly activeStep = signal<RequestCreationStepId>('requester');
  protected readonly currentDraftId = signal<string | null>(null);
  protected readonly documents = signal<readonly RequestDocument[]>([]);
  protected readonly selectedDocumentId = signal<string | null>(null);
  protected readonly imageZoom = signal(100);
  protected readonly selectedDocument = computed(() => {
    const selectedId = this.selectedDocumentId();
    if (!selectedId) return null;
    return this.documents().find((document) => document.id === selectedId) ?? null;
  });
  protected readonly selectedPdfUrl = computed<SafeResourceUrl | null>(() => {
    const document = this.selectedDocument();
    if (!document?.objectUrl || document.mimeType !== 'application/pdf') return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(document.objectUrl);
  });
  protected readonly feedback = signal<FeedbackMessage | null>(null);
  protected readonly createdFolio = signal<string | null>(null);
  protected readonly selectedReviewAction = signal<RequestReviewAction | null>(null);
  protected readonly reviewComment = signal('');

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
    { id: 'review', label: 'Revisión', helper: 'Confirmación y resolución', icon: 'circle-check' },
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
      const isOpen = this.open();
      const initialView = this.initialView();
      const currentRequest = this.request();

      if (!isOpen) return;

      if (initialView === 'detail') {
        this.view.set('detail');
        if (currentRequest && this.loadedDetailFolio !== currentRequest.folio) {
          this.hydrateFromRequest(currentRequest);
          this.loadedDetailFolio = currentRequest.folio;
        }
        return;
      }

      this.loadedDetailFolio = null;

      if (initialView === 'drafts') {
        if (this.view() === 'detail') this.resetForm(true);
        this.view.set('drafts');
        return;
      }

      if (this.view() !== 'form' || this.currentDraftId()) {
        this.resetForm(true);
      } else {
        this.view.set('form');
      }
    });
  }

  ngOnDestroy(): void {
    this.revokeTemporaryDocuments();
  }

  protected isDetailMode(): boolean {
    return this.view() === 'detail';
  }

  protected modalTitle(): string {
    if (this.view() === 'detail') return 'Detalle de solicitud';
    if (this.view() === 'drafts') return 'Borradores de solicitudes';
    if (this.view() === 'success') return 'Solicitud registrada';
    return this.currentDraftId() ? 'Continuar solicitud' : 'Nueva solicitud';
  }

  protected modalSubtitle(): string {
    if (this.view() === 'detail') {
      const current = this.request();
      return current
        ? `${current.folio} · Consulta del expediente por secciones`
        : 'Consulta del expediente por secciones';
    }
    if (this.view() === 'drafts') return 'Continúa una solicitud guardada sin salir del módulo';
    if (this.view() === 'success') return 'El expediente quedó registrado correctamente';
    return 'Captura la información por secciones y adjunta los documentos correspondientes';
  }

  protected modalIcon(): string {
    if (this.view() === 'detail') return 'eye';
    if (this.view() === 'drafts') return 'clipboard-list';
    if (this.view() === 'success') return 'circle-check';
    return 'file-text';
  }

  protected headerBadge(): string {
    if (this.view() === 'detail') return this.request()?.status ?? 'Consulta';
    if (this.view() === 'drafts') return `${this.drafts().length} borradores`;
    if (this.currentDraftId()) return 'Borrador en edición';
    return 'Expediente nuevo';
  }

  protected detailFolio(): string {
    return this.request()?.folio ?? '';
  }

  protected detailCreatedAt(): string {
    return this.request()?.createdAt ?? '';
  }

  protected detailStatus(): string {
    return this.request()?.status ?? '';
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
    if (this.isDetailMode()) return true;

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
    if (!this.isDetailMode()) {
      const issue = this.validateStep(this.activeStep());
      if (issue) {
        this.feedback.set({ tone: 'error', text: issue });
        return;
      }
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
    if (this.isDetailMode()) return;
    this.view.set('drafts');
    this.feedback.set(null);
  }

  protected returnToForm(): void {
    this.view.set('form');
    this.feedback.set(null);
  }

  protected startBlankRequest(): void {
    this.loadedDetailFolio = null;
    this.resetForm(true);
    this.view.set('form');
  }

  protected saveDraft(): void {
    if (this.isDetailMode()) return;

    const draft = this.draftStore.save(this.draftPayload(), this.currentDraftId());
    this.currentDraftId.set(draft.id);
    this.feedback.set({
      tone: 'success',
      text: 'Borrador guardado. Puedes cerrar el modal y continuar más tarde.',
    });
  }

  protected resumeDraft(draft: RequestDraft): void {
    this.loadedDetailFolio = null;
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
    const restoredDocuments = draft.documents.map((document) => ({ ...document, objectUrl: null }));
    this.documents.set(restoredDocuments);
    this.selectedDocumentId.set(restoredDocuments[0]?.id ?? null);
    this.imageZoom.set(100);
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
    if (this.currentDraftId() === draftId) this.currentDraftId.set(null);
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
    if (this.isDetailMode()) return;

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
    this.selectedDocumentId.set(newDocuments[0]?.id ?? null);
    this.imageZoom.set(100);
    this.feedback.set({
      tone: 'success',
      text: newDocuments.length === 1
        ? `“${newDocuments[0].name}” se cargó correctamente. Verifica su contenido en el visualizador.`
        : `${newDocuments.length} archivos se cargaron correctamente. Verifica cada uno en el visualizador antes de continuar.`,
    });
  }

  protected removeDocument(documentId: string): void {
    if (this.isDetailMode()) return;

    const currentDocuments = this.documents();
    const document = currentDocuments.find((item) => item.id === documentId);
    const remainingDocuments = currentDocuments.filter((item) => item.id !== documentId);

    if (document?.objectUrl) URL.revokeObjectURL(document.objectUrl);
    this.documents.set(remainingDocuments);

    if (this.selectedDocumentId() === documentId) {
      this.selectedDocumentId.set(remainingDocuments[0]?.id ?? null);
      this.imageZoom.set(100);
    }
  }

  protected selectDocument(document: RequestDocument): void {
    this.selectedDocumentId.set(document.id);
    this.imageZoom.set(100);

    if (!document.objectUrl) {
      this.feedback.set({
        tone: 'info',
        text: this.isDetailMode()
          ? `“${document.name}” es un documento mock. Al conectar el backend, se visualizará aquí.`
          : `“${document.name}” conserva su metadata de borrador. Vuelve a seleccionar el archivo para visualizarlo.`,
      });
    } else {
      this.feedback.set(null);
    }
  }

  protected isImageDocument(document: RequestDocument | null): boolean {
    return Boolean(document && document.mimeType !== 'application/pdf');
  }

  protected zoomImage(delta: number): void {
    this.imageZoom.update((current) => Math.min(200, Math.max(50, current + delta)));
  }

  protected resetImageZoom(): void {
    this.imageZoom.set(100);
  }

  protected openDocument(document: RequestDocument): void {
    if (!document.objectUrl) {
      this.feedback.set({
        tone: 'info',
        text: `“${document.name}” es un documento mock. Al conectar el backend, el botón abrirá el archivo real.`,
      });
      return;
    }

    window.open(document.objectUrl, '_blank', 'noopener,noreferrer');
  }

  protected downloadDocument(document: RequestDocument): void {
    if (!document.objectUrl) return;
    const anchor = window.document.createElement('a');
    anchor.href = document.objectUrl;
    anchor.download = document.name;
    anchor.click();
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

  protected selectReviewAction(action: RequestReviewAction): void {
    if (!this.isDetailMode() || this.busy()) return;
    this.selectedReviewAction.set(action);
  }

  protected updateReviewComment(value: string): void {
    this.reviewComment.set(value.slice(0, 1000));
  }

  protected reviewCommentValid(): boolean {
    const length = this.reviewComment().trim().length;
    return length >= 5 && length <= 1000;
  }

  protected canSubmitReview(): boolean {
    return Boolean(
      this.isDetailMode() &&
      this.request() &&
      this.selectedReviewAction() &&
      this.reviewCommentValid() &&
      !this.busy(),
    );
  }

  protected reviewActionTitle(): string {
    const action = this.selectedReviewAction();
    if (action === 'approve') return 'Aprobar y notificar';
    if (action === 'reject') return 'Rechazar y notificar';
    if (action === 'request-correction') return 'Solicitar corrección y notificar';
    return 'Selecciona una acción';
  }

  protected submitReview(): void {
    const current = this.request();
    const action = this.selectedReviewAction();
    const comment = this.reviewComment().trim();

    if (!current || !action || !this.reviewCommentValid() || this.busy()) return;

    this.actionRequested.emit({ request: current, action, comment });
  }

  protected createRequest(): void {
    if (this.isDetailMode()) return;

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
      description: this.comments,
    });

    const draftId = this.currentDraftId();
    if (draftId) this.draftStore.remove(draftId);

    this.createdFolio.set(record.folio);
    this.view.set('success');
    this.feedback.set(null);
    this.created.emit(record);
  }

  protected closeModal(): void {
    if (this.busy()) return;

    const preserveObjectUrls = this.view() === 'success' && Boolean(this.createdFolio());
    if (!this.isDetailMode()) this.resetForm(!preserveObjectUrls);

    this.loadedDetailFolio = null;
    this.selectedReviewAction.set(null);
    this.reviewComment.set('');
    this.closed.emit();
  }

  private hydrateFromRequest(current: RequestRecord): void {
    this.revokeTemporaryDocuments();
    this.type = current.type;
    this.applicant = current.applicant;
    this.username = current.applicantUsername;
    this.email = current.applicantEmail ?? '';
    this.curp = current.curp ?? '';
    this.institution = current.institution;
    this.department = current.department ?? '';
    this.priority = current.priority;
    this.profiles = (current.profiles ?? []).join(', ');
    this.comments = current.description ?? '';
    const detailDocuments = (current.documents ?? []).map((document) => ({ ...document }));
    this.documents.set(detailDocuments);
    this.selectedDocumentId.set(detailDocuments[0]?.id ?? null);
    this.imageZoom.set(100);
    this.currentDraftId.set(null);
    this.activeStep.set('requester');
    this.feedback.set(null);
    this.selectedReviewAction.set(null);
    this.reviewComment.set('');
    this.createdFolio.set(null);
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
    this.selectedDocumentId.set(null);
    this.imageZoom.set(100);
    this.currentDraftId.set(null);
    this.activeStep.set('requester');
    this.view.set('form');
    this.feedback.set(null);
    this.createdFolio.set(null);
    this.selectedReviewAction.set(null);
    this.reviewComment.set('');
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
