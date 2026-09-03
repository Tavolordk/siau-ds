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
  RequestRecord,
  RequestType,
  RequestUserData,
} from '../../../domain/models/request-record.model';
import type {
  RequestReviewAction,
  RequestReviewCommand,
} from '../../../domain/models/request-review.model';
import { SiauLucideIcon } from '../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { SiauModal } from '../../../../../shared/ui/components/modal/modal';

export type RequestModalInitialView = 'form' | 'drafts' | 'detail';
export type RequestModalContext = 'requests' | 'account-registration';
type ModalView = RequestModalInitialView | 'success';
type FeedbackTone = 'success' | 'error' | 'info';

type CurrentRequestStepId = Exclude<RequestCreationStepId, 'requester' | 'request'>;

interface StepDefinition {
  readonly id: CurrentRequestStepId;
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
  readonly context = input<RequestModalContext>('requests');
  readonly busy = input(false);
  readonly resultMessage = input<string | null>(null);
  readonly resultTone = input<'success' | 'error' | null>(null);

  readonly closed = output<void>();
  readonly created = output<RequestRecord>();
  readonly actionRequested = output<RequestReviewCommand>();
  readonly documentsChanged = output<readonly RequestDocument[]>();

  protected readonly drafts = computed(() => {
    const drafts = this.draftStore.drafts();
    return this.isAccountRegistration()
      ? drafts.filter((draft) => draft.type === 'Alta de usuario')
      : drafts;
  });
  protected readonly view = signal<ModalView>('form');
  protected readonly activeStep = signal<CurrentRequestStepId>('personal-data');
  protected readonly currentDraftId = signal<string | null>(null);
  protected readonly documents = signal<readonly RequestDocument[]>([]);
  protected readonly selectedDocumentId = signal<string | null>(null);
  protected readonly imageZoom = signal(100);
  protected readonly feedback = signal<FeedbackMessage | null>(null);
  protected readonly createdFolio = signal<string | null>(null);
  protected readonly selectedReviewAction = signal<RequestReviewAction | null>(null);
  protected readonly reviewComment = signal('');

  protected userData: RequestUserData = this.emptyUserData();
  protected type: RequestType = 'Alta de usuario';
  protected requestReason = '';
  protected profileSystem = '';
  protected profileRole = '';

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

  private readonly allSteps: readonly StepDefinition[] = [
    { id: 'personal-data', label: 'Datos Personales', helper: 'Identidad oficial', icon: 'user' },
    { id: 'assignment', label: 'Adscripción', helper: 'Centro de trabajo', icon: 'building-2' },
    { id: 'commission', label: 'Comisión', helper: 'Si aplica', icon: 'briefcase' },
    { id: 'contact', label: 'Medio de Contacto', helper: 'Correo y celular', icon: 'phone' },
    { id: 'profiles', label: 'Perfiles', helper: 'Sistemas y roles', icon: 'shield' },
    { id: 'documents', label: 'Documentos', helper: 'Expediente y vista previa', icon: 'file-text' },
    { id: 'review', label: 'Revisión', helper: 'Motivo y resolución', icon: 'circle-check' },
  ];

  protected readonly visibleSteps = computed<readonly StepDefinition[]>(() =>
    this.isAccountRegistration()
      ? this.allSteps.filter((step) => step.id !== 'review')
      : this.allSteps,
  );

  protected readonly typeOptions: readonly RequestType[] = [
    'Alta de usuario',
    'Modificación de datos',
    'Cambio de rol',
    'Desbloqueo de cuenta',
    'Restablecimiento de contraseña',
  ];

  protected readonly genderOptions = ['Masculino', 'Femenino'];
  protected readonly civilStatusOptions = ['Soltero(a)', 'Casado(a)', 'Divorciado(a)', 'Viudo(a)', 'Unión libre'];
  protected readonly institutionTypeOptions = ['Federal', 'Estatal', 'Municipal'];
  protected readonly profileSystemOptions = ['SIAU', 'SAU', 'ECCC', 'Consulta Institucional'];
  protected readonly profileRoleOptions = ['Consulta', 'Captura', 'Supervisor', 'Administrador'];

  protected readonly maximumTodayDate = this.toDateInput(new Date());
  protected readonly maximumBirthDate = this.computeAdultBirthDate();
  protected readonly minimumBirthDate = '1900-01-01';

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const initialView = this.initialView();
      const currentRequest = this.request();

      if (!isOpen) return;

      if (this.isAccountRegistration()) {
        this.type = 'Alta de usuario';
      }

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

  protected isAccountRegistration(): boolean {
    return this.context() === 'account-registration';
  }

  protected modalTitle(): string {
    if (this.view() === 'detail') return 'Detalle de solicitud';
    if (this.view() === 'drafts') {
      return this.isAccountRegistration() ? 'Borradores de nueva cuenta' : 'Borradores de solicitudes';
    }
    if (this.view() === 'success') {
      return this.isAccountRegistration() ? 'Solicitud de nueva cuenta registrada' : 'Solicitud registrada';
    }
    if (this.isAccountRegistration()) {
      return this.currentDraftId() ? 'Continuar solicitud de nueva cuenta' : 'Solicitud de nueva cuenta';
    }
    return this.currentDraftId() ? 'Continuar solicitud' : 'Nueva solicitud';
  }

  protected modalSubtitle(): string {
    if (this.view() === 'detail') {
      const current = this.request();
      return current ? `${current.folio} · Consulta del expediente por secciones` : 'Consulta del expediente por secciones';
    }
    if (this.view() === 'drafts') {
      return this.isAccountRegistration()
        ? 'Continúa una solicitud de nueva cuenta guardada en este equipo'
        : 'Continúa una solicitud guardada sin salir del módulo';
    }
    if (this.view() === 'success') {
      return this.isAccountRegistration()
        ? 'Tu solicitud fue registrada y quedó pendiente de revisión'
        : 'El expediente quedó registrado correctamente';
    }
    return this.isAccountRegistration()
      ? 'Completa tus datos y adjunta los documentos necesarios para solicitar tu cuenta'
      : 'Mismos datos del registro de Usuario, más documentos, motivo y flujo de revisión';
  }

  protected modalIcon(): string {
    if (this.view() === 'detail') return 'eye';
    if (this.view() === 'drafts') return 'clipboard-list';
    if (this.view() === 'success') return 'circle-check';
    return this.isAccountRegistration() ? 'user-plus' : 'file-text';
  }

  protected headerBadge(): string {
    if (this.view() === 'detail') return this.request()?.status ?? 'Consulta';
    if (this.view() === 'drafts') return `${this.drafts().length} borradores`;
    if (this.currentDraftId()) return 'Borrador en edición';
    return this.isAccountRegistration() ? 'Alta de usuario' : 'Expediente nuevo';
  }

  protected detailFolio(): string { return this.request()?.folio ?? ''; }
  protected detailCreatedAt(): string { return this.request()?.createdAt ?? ''; }
  protected detailStatus(): string { return this.request()?.status ?? ''; }

  protected selectStep(stepId: CurrentRequestStepId): void {
    this.activeStep.set(stepId);
    this.feedback.set(null);
  }

  protected stepIndex(stepId = this.activeStep()): number {
    return this.visibleSteps().findIndex((step) => step.id === stepId);
  }

  protected progressPercent(): number {
    return Math.round(((this.stepIndex() + 1) / this.visibleSteps().length) * 100);
  }

  protected sectionNumber(): string {
    return String(this.stepIndex() + 1).padStart(2, '0');
  }

  protected isStepComplete(stepId: CurrentRequestStepId): boolean {
    if (this.isDetailMode()) return true;
    if (stepId === 'documents') return this.documents().length > 0;
    if (stepId === 'review') return this.isFormValid();
    return this.validateStep(stepId) === null;
  }

  protected nextStep(): void {
    if (!this.isDetailMode()) {
      const issue = this.validateStep(this.activeStep());
      if (issue) {
        this.feedback.set({ tone: 'error', text: issue });
        return;
      }
    }

    const steps = this.visibleSteps();
    const index = this.stepIndex();
    if (index < steps.length - 1) {
      this.activeStep.set(steps[index + 1].id);
      this.feedback.set(null);
    }
  }

  protected previousStep(): void {
    const steps = this.visibleSteps();
    const index = this.stepIndex();
    if (index > 0) {
      this.activeStep.set(steps[index - 1].id);
      this.feedback.set(null);
    }
  }

  protected isLastVisibleStep(): boolean {
    return this.stepIndex() === this.visibleSteps().length - 1;
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
    this.feedback.set({ tone: 'success', text: 'Borrador guardado. Puedes cerrar el modal y continuar más tarde.' });
  }

  protected resumeDraft(draft: RequestDraft): void {
    if (this.isAccountRegistration() && draft.type !== 'Alta de usuario') return;
    this.loadedDetailFolio = null;
    this.revokeTemporaryDocuments();
    this.type = draft.type;
    this.requestReason = draft.comments ?? '';
    this.userData = draft.userData ? this.cloneUserData(draft.userData) : this.legacyDraftUserData(draft);

    const restoredDocuments = draft.documents.map((document) => ({ ...document, objectUrl: null }));
    this.documents.set(restoredDocuments);
    this.selectedDocumentId.set(restoredDocuments[0]?.id ?? null);
    this.imageZoom.set(100);
    this.currentDraftId.set(draft.id);
    this.activeStep.set(this.normalizeStep(draft.activeStep));
    this.view.set('form');
    this.profileSystem = '';
    this.profileRole = '';
    this.feedback.set(
      draft.documents.length
        ? { tone: 'info', text: 'Se recuperó la metadata de los documentos. Si recargaste el navegador, vuelve a seleccionar los archivos antes de enviar la solicitud.' }
        : null,
    );
  }

  protected deleteDraft(event: Event, draftId: string): void {
    event.stopPropagation();
    this.draftStore.remove(draftId);
    if (this.currentDraftId() === draftId) this.currentDraftId.set(null);
  }

  protected draftTitle(draft: RequestDraft): string {
    const data = draft.userData;
    const name = data ? this.fullName(data) : draft.applicant.trim();
    return name || 'Solicitud sin usuario';
  }

  protected draftSubtitle(draft: RequestDraft): string {
    const institution = draft.userData?.institution?.trim() || draft.institution.trim() || 'Institución pendiente';
    return `${draft.type || 'Tipo pendiente'} · ${institution}`;
  }

  protected draftUpdatedAt(draft: RequestDraft): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(draft.updatedAt));
  }

  protected draftProgress(draft: RequestDraft): number {
    const normalized = this.normalizeStep(draft.activeStep);
    const index = this.visibleSteps().findIndex((step) => step.id === normalized);
    return Math.max(1, index + 1);
  }

  protected toggleCommission(enabled: boolean): void {
    if (this.isDetailMode()) return;
    this.userData.commissionEnabled = enabled;
    if (!enabled) {
      this.userData.commissionInstitutionType = '';
      this.userData.commissionEntity = '';
      this.userData.commissionMunicipality = '';
      this.userData.commissionInstitution = '';
      this.userData.commissionDecentralizedBody = '';
      this.userData.commissionAdministrativeUnit = '';
      this.userData.commissionAdmissionDate = '';
    }
  }

  protected addProfile(): void {
    if (this.isDetailMode()) return;
    const system = this.profileSystem.trim();
    const role = this.profileRole.trim();
    if (!system || !role) {
      this.feedback.set({ tone: 'error', text: 'Selecciona un sistema y un perfil/rol antes de agregarlo.' });
      return;
    }

    const label = `${system} · ${role}`;
    if (this.userData.profiles.includes(label)) {
      this.feedback.set({ tone: 'info', text: 'Ese sistema y perfil ya está agregado.' });
      return;
    }

    this.userData.profiles = [...this.userData.profiles, label];
    this.profileSystem = '';
    this.profileRole = '';
    this.feedback.set(null);
  }

  protected removeProfile(profile: string): void {
    if (this.isDetailMode()) return;
    this.userData.profiles = this.userData.profiles.filter((item) => item !== profile);
  }

  protected profileList(): readonly string[] {
    return this.userData.profiles;
  }

  protected requiresProfiles(): boolean {
    return this.type === 'Alta de usuario' || this.type === 'Cambio de rol';
  }

  protected applicantName(): string {
    return this.fullName(this.userData) || 'Pendiente';
  }

  protected primaryInstitution(): string {
    return this.userData.institution.trim() || 'Pendiente';
  }

  protected primaryDepartment(): string {
    return this.userData.administrativeUnit.trim() || this.userData.decentralizedBody.trim() || 'Pendiente';
  }

  protected onFilesSelected(event: Event): void {
    if (this.isDetailMode()) return;

    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;

    const invalidType = files.find((file) => !ACCEPTED_TYPES.includes(file.type as RequestDocumentMimeType));
    if (invalidType) {
      this.feedback.set({ tone: 'error', text: `El archivo “${invalidType.name}” no tiene un formato permitido.` });
      return;
    }

    const invalidSize = files.find((file) => file.size > MAX_FILE_SIZE);
    if (invalidSize) {
      this.feedback.set({ tone: 'error', text: `El archivo “${invalidSize.name}” supera el máximo de 10 MB.` });
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

  protected resetImageZoom(): void { this.imageZoom.set(100); }

  protected openDocument(document: RequestDocument): void {
    if (!document.objectUrl) {
      this.feedback.set({ tone: 'info', text: `“${document.name}” es un documento mock. Al conectar el backend, el botón abrirá el archivo real.` });
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
    return Boolean(this.isDetailMode() && this.request() && this.selectedReviewAction() && this.reviewCommentValid() && !this.busy());
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

    if (this.isAccountRegistration()) {
      this.type = 'Alta de usuario';
    }

    const issue = this.validateForm();
    if (issue) {
      this.activeStep.set(issue.step);
      this.feedback.set({ tone: 'error', text: issue.message });
      return;
    }

    const applicant = this.fullName(this.userData);
    const username = this.legacyUsername();

    const record = this.requestStore.create({
      type: this.type,
      applicant,
      username,
      email: this.userData.email,
      curp: this.userData.curp,
      institution: this.userData.institution,
      department: this.primaryDepartment(),
      priority: 'Media',
      profiles: this.userData.profiles,
      documents: this.documents(),
      description: this.requestReason.trim() || (this.isAccountRegistration() ? 'Solicitud de creación de cuenta.' : ''),
      userData: this.cloneUserData(this.userData),
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
    this.requestReason = current.description ?? '';
    this.userData = current.userData ? this.cloneUserData(current.userData) : this.legacyRecordUserData(current);

    const detailDocuments = (current.documents ?? []).map((document) => ({ ...document }));
    this.documents.set(detailDocuments);
    this.selectedDocumentId.set(detailDocuments[0]?.id ?? null);
    this.imageZoom.set(100);
    this.currentDraftId.set(null);
    this.activeStep.set('personal-data');
    this.feedback.set(null);
    this.selectedReviewAction.set(null);
    this.reviewComment.set('');
    this.createdFolio.set(null);
    this.profileSystem = '';
    this.profileRole = '';
  }

  private validateStep(stepId: CurrentRequestStepId): string | null {
    if (stepId === 'personal-data') {
      if (this.userData.curp.trim().length !== 18) return 'La CURP debe contener 18 caracteres.';
      if (this.userData.rfc.trim().length !== 13) return 'El RFC debe contener 13 caracteres.';
      if (!this.userData.firstName.trim()) return 'Captura el nombre del usuario.';
      if (!this.userData.lastName.trim()) return 'Captura el primer apellido.';
      if (!this.userData.gender.trim()) return 'Selecciona el sexo.';
      if (!this.userData.birthDate) return 'Captura la fecha de nacimiento.';
    }

    if (stepId === 'assignment') {
      if (!this.userData.institutionType.trim()) return 'Captura el tipo de institución.';
      if (!this.userData.entity.trim()) return 'Captura la entidad.';
      if (!this.userData.municipality.trim()) return 'Captura el municipio o alcaldía.';
      if (!this.userData.institution.trim()) return 'Captura la institución.';
      if (!this.userData.administrativeUnit.trim() && !this.userData.decentralizedBody.trim()) return 'Captura el órgano desconcentrado o la unidad administrativa.';
      if (!this.userData.position.trim()) return 'Captura el cargo.';
      if (!this.userData.functions.trim()) return 'Captura las funciones.';
      if (!this.userData.admissionDate) return 'Captura la fecha de ingreso.';
      if (!this.userData.employeeNumber.trim()) return 'Captura el número de empleado.';
    }

    if (stepId === 'commission' && this.userData.commissionEnabled) {
      if (!this.userData.commissionInstitutionType.trim()) return 'Captura el tipo de institución de la comisión.';
      if (!this.userData.commissionInstitution.trim()) return 'Captura la institución de la comisión.';
      if (!this.userData.commissionAdmissionDate) return 'Captura la fecha de inicio de la comisión.';
    }

    if (stepId === 'contact') {
      if (!/^\S+@\S+\.\S+$/.test(this.userData.email.trim())) return 'Captura un correo electrónico válido.';
      if (!/^\d{10}$/.test(this.userData.phone.trim())) return 'El teléfono celular debe contener 10 dígitos.';
    }

    if (stepId === 'profiles' && this.requiresProfiles() && !this.userData.profiles.length) {
      return 'Agrega al menos un sistema y perfil para este tipo de solicitud.';
    }

    if (stepId === 'review') {
      const reasonLength = this.requestReason.trim().length;
      if (!this.type) return 'Selecciona el tipo de solicitud.';
      if (reasonLength < 5) return 'Captura el motivo de la solicitud con al menos 5 caracteres.';
    }

    return null;
  }

  private validateForm(): { readonly step: CurrentRequestStepId; readonly message: string } | null {
    const requiredSteps: readonly CurrentRequestStepId[] = this.isAccountRegistration()
      ? ['personal-data', 'assignment', 'commission', 'contact', 'profiles']
      : ['personal-data', 'assignment', 'commission', 'contact', 'profiles', 'review'];
    for (const step of requiredSteps) {
      const message = this.validateStep(step);
      if (message) return { step, message };
    }
    return null;
  }

  private isFormValid(): boolean {
    return this.validateForm() === null;
  }

  private draftPayload() {
    const applicant = this.fullName(this.userData);
    return {
      activeStep: this.activeStep(),
      type: this.type,
      applicant,
      username: this.legacyUsername(),
      email: this.userData.email,
      curp: this.userData.curp,
      institution: this.userData.institution,
      department: this.primaryDepartment(),
      priority: 'Media' as const,
      profiles: this.userData.profiles.join(', '),
      comments: this.requestReason,
      userData: this.cloneUserData(this.userData),
      documents: this.documents(),
    } as const;
  }

  private resetForm(revokeDocuments: boolean): void {
    if (revokeDocuments) this.revokeTemporaryDocuments();
    this.type = 'Alta de usuario';
    this.requestReason = '';
    this.userData = this.emptyUserData();
    this.profileSystem = '';
    this.profileRole = '';
    this.documents.set([]);
    this.selectedDocumentId.set(null);
    this.imageZoom.set(100);
    this.currentDraftId.set(null);
    this.activeStep.set('personal-data');
    this.view.set('form');
    this.feedback.set(null);
    this.createdFolio.set(null);
    this.selectedReviewAction.set(null);
    this.reviewComment.set('');
  }

  private emptyUserData(): RequestUserData {
    return {
      cuip: '', curp: '', rfc: '', firstName: '', lastName: '', secondLastName: '', gender: '', civilStatus: '', birthDate: '',
      institutionType: '', entity: '', municipality: '', institution: '', decentralizedBody: '', administrativeUnit: '', position: '', functions: '', admissionDate: '', employeeNumber: '',
      commissionEnabled: false, commissionInstitutionType: '', commissionEntity: '', commissionMunicipality: '', commissionInstitution: '', commissionDecentralizedBody: '', commissionAdministrativeUnit: '', commissionAdmissionDate: '',
      email: '', phone: '', profiles: [],
    };
  }

  private cloneUserData(data: RequestUserData): RequestUserData {
    return { ...data, profiles: [...(data.profiles ?? [])] };
  }

  private legacyDraftUserData(draft: RequestDraft): RequestUserData {
    const parts = draft.applicant.trim().split(/\s+/).filter(Boolean);
    const data = this.emptyUserData();
    data.firstName = parts[0] ?? '';
    data.lastName = parts[1] ?? '';
    data.secondLastName = parts.slice(2).join(' ');
    data.curp = draft.curp ?? '';
    data.institution = draft.institution ?? '';
    data.administrativeUnit = draft.department ?? '';
    data.email = draft.email ?? '';
    data.profiles = (draft.profiles ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    return data;
  }

  private legacyRecordUserData(current: RequestRecord): RequestUserData {
    const parts = current.applicant.trim().split(/\s+/).filter(Boolean);
    const data = this.emptyUserData();
    data.firstName = parts[0] ?? '';
    data.lastName = parts[1] ?? '';
    data.secondLastName = parts.slice(2).join(' ');
    data.curp = current.curp ?? '';
    data.institution = current.institution ?? '';
    data.administrativeUnit = current.department ?? '';
    data.email = current.applicantEmail ?? '';
    data.profiles = [...(current.profiles ?? [])];
    return data;
  }

  private normalizeStep(step: RequestCreationStepId): CurrentRequestStepId {
    if (step === 'requester') return 'personal-data';
    if (step === 'request') return 'assignment';
    if (this.isAccountRegistration() && step === 'review') return 'documents';
    return step;
  }

  private fullName(data: RequestUserData): string {
    return [data.firstName, data.lastName, data.secondLastName].map((part) => part.trim()).filter(Boolean).join(' ');
  }

  private legacyUsername(): string {
    const emailUser = this.userData.email.split('@')[0]?.trim();
    if (emailUser) return emailUser;
    const first = this.userData.firstName.trim().split(/\s+/)[0]?.toLowerCase() ?? 'usuario';
    const last = this.userData.lastName.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    return [first, last].filter(Boolean).join('.');
  }

  private revokeTemporaryDocuments(): void {
    this.documents().forEach((document) => {
      if (document.objectUrl) URL.revokeObjectURL(document.objectUrl);
    });
  }

  private formatNow(): string {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date()).replace(',', '');
  }

  private computeAdultBirthDate(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 18);
    return this.toDateInput(date);
  }

  private toDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
