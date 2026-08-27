import {
    DestroyRef,
    inject,
    Injectable,
    WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    catchError,
    finalize,
    map,
    Observable,
    of,
    switchMap,
} from 'rxjs';
import { SiauSelectOption } from '../../../../../../shared/ui';
import { UsersFacade } from '../../../../application/facades/users.facade';
import {
    DraftStructureHierarchies,
    DraftStructureResolver,
    ResolvedDraftStructureHierarchy,
} from '../../../../application/drafts/draft-structure.resolver';
import {
    BorradorGuardarRequest,
    BorradorItem,
} from '../../../../domain/models/user-record.model';
import {
    AssignedSystemProfile,
    CREATE_WIZARD_STEPS,
    INITIAL_FORM,
    UserRegistrationForm,
    WizardStepId,
} from '../models/user-registration-wizard.models';
import { UserRegistrationDraftFactory } from './user-registration-draft.factory';
import { UserRegistrationDraftProfileService } from './user-registration-draft-profile.service';

export interface UserRegistrationDraftContext {
    readonly activeStepId: WritableSignal<WizardStepId>;
    readonly completedSteps: WritableSignal<readonly WizardStepId[]>;
    readonly form: WritableSignal<UserRegistrationForm>;
    readonly assignedSystemProfiles: WritableSignal<AssignedSystemProfile[]>;
    readonly draftId: WritableSignal<number | null>;
    readonly draftMessage: WritableSignal<string>;
    readonly draftError: WritableSignal<string>;
    readonly isDraftLoading: WritableSignal<boolean>;
    readonly isDraftSaving: WritableSignal<boolean>;
    readonly isDraftDeleting: WritableSignal<boolean>;
    readonly deleteDraftConfirmationOpen: WritableSignal<boolean>;
    readonly institutionOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly decentralizedBodyOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly administrativeUnitOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionInstitutionOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionDecentralizedBodyOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly commissionAdministrativeUnitOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly roleOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly structureRoleOptionsBySystem: WritableSignal<Record<string, readonly SiauSelectOption[]>>;
    readonly userTypeOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly isEditMode: () => boolean;
    readonly isDraftBusy: () => boolean;
    readonly isSubmitting: () => boolean;
    readonly resolveCurrentUserId: () => number | null;
    readonly resolveAssignedSystemId: (profile: AssignedSystemProfile) => number;
    readonly ensureDefaultSiauProfile: () => void;
    readonly consultEcccAndPersonal: () => void;
    readonly isWizardStep: (value: string) => value is WizardStepId;
    readonly loadHydratedAssignmentCatalogs: (form: UserRegistrationForm) => void;
    readonly resetWizard: () => void;
    readonly knownSystemOptions: () => readonly SiauSelectOption[];
    readonly stepOrder: () => readonly WizardStepId[];
}

/**
 * Maneja únicamente el ciclo de vida de borradores de registro.
 * Mantiene persistencia, restauración y reconstrucción de jerarquías fuera de la UI.
 */
@Injectable()
export class UserRegistrationDraftCoordinator {
    private readonly usersFacade = inject(UsersFacade);
    private readonly draftStructureResolver = inject(DraftStructureResolver);
    private readonly draftFactory = inject(UserRegistrationDraftFactory);
    private readonly draftProfileService = inject(UserRegistrationDraftProfileService);
    private readonly destroyRef = inject(DestroyRef);

    buildSaveRequest(
        nextStepId: WizardStepId,
        completedSteps: readonly WizardStepId[],
        ctx: UserRegistrationDraftContext,
    ): BorradorGuardarRequest {
        return this.draftFactory.buildSaveRequest(nextStepId, completedSteps, {
            form: ctx.form(),
            assignedProfiles: ctx.assignedSystemProfiles(),
            userTypeOptions: ctx.userTypeOptions(),
            draftId: ctx.draftId(),
            executorUserId: ctx.resolveCurrentUserId(),
            resolveSystemId: (profile) => ctx.resolveAssignedSystemId(profile),
        });
    }

    saveAfterProfileChange(ctx: UserRegistrationDraftContext): void {
        if (ctx.isEditMode() || ctx.isDraftBusy()) {
            return;
        }

        let request: BorradorGuardarRequest;

        try {
            request = this.buildSaveRequest(ctx.activeStepId(), ctx.completedSteps(), ctx);
        } catch {
            ctx.draftMessage.set('');
            ctx.draftError.set(
                'No se pudo guardar el cambio de perfil en el borrador. Puedes continuar con el registro.',
            );
            return;
        }

        ctx.isDraftSaving.set(true);
        ctx.draftError.set('');
        ctx.draftMessage.set('Guardando cambio de perfil...');

        this.usersFacade
            .saveRegistrationDraft(request)
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => ctx.isDraftSaving.set(false)),
            )
            .subscribe({
                next: (response) => {
                    const savedDraftId = response.datos?.borradorId;
                    if (savedDraftId && savedDraftId > 0) {
                        ctx.draftId.set(savedDraftId);
                    }

                    ctx.draftMessage.set(response.mensaje?.trim() || 'Cambio de perfil guardado.');
                },
                error: () => {
                    ctx.draftMessage.set('');
                    ctx.draftError.set(
                        'No se pudo guardar el cambio de perfil en el borrador. Puedes continuar con el registro.',
                    );
                },
            });
    }

    load(ctx: UserRegistrationDraftContext): void {
        if (ctx.isEditMode() || ctx.isDraftLoading()) {
            return;
        }

        ctx.isDraftLoading.set(true);
        ctx.draftError.set('');
        ctx.draftMessage.set('Buscando un borrador pendiente...');

        this.usersFacade
            .getRegistrationDraft(ctx.resolveCurrentUserId())
            .pipe(
                switchMap((draft) => {
                    if (!draft?.datos) {
                        return of({
                            draft,
                            hierarchies: {
                                assignment: null,
                                commission: null,
                            } as DraftStructureHierarchies,
                        });
                    }

                    return this.resolveHierarchies(draft).pipe(
                        map((hierarchies) => ({ draft, hierarchies })),
                        catchError((error: unknown) => {
                            console.error(
                                'No fue posible reconstruir la jerarquía de la estructura del borrador.',
                                error,
                            );

                            return of({
                                draft,
                                hierarchies: {
                                    assignment: null,
                                    commission: null,
                                } as DraftStructureHierarchies,
                            });
                        }),
                    );
                }),
                takeUntilDestroyed(this.destroyRef),
                finalize(() => ctx.isDraftLoading.set(false)),
            )
            .subscribe({
                next: ({ draft, hierarchies }) => this.apply(draft, hierarchies, ctx),
                error: (error: unknown) => {
                    ctx.draftMessage.set('');
                    ctx.draftError.set(
                        error instanceof Error
                            ? error.message
                            : 'No fue posible recuperar el borrador del registro.',
                    );
                },
            });
    }

    restoreProvided(draft: BorradorItem, ctx: UserRegistrationDraftContext): void {
        if (ctx.isEditMode() || ctx.isDraftLoading()) {
            return;
        }

        ctx.draftId.set(draft.borradorId);

        if (!draft.datos) {
            ctx.draftError.set('El borrador seleccionado no contiene información recuperable.');
            return;
        }

        ctx.isDraftLoading.set(true);
        ctx.draftError.set('');
        ctx.draftMessage.set('Recuperando el borrador seleccionado...');

        this.resolveHierarchies(draft)
            .pipe(
                map((hierarchies) => ({ draft, hierarchies })),
                catchError((error: unknown) => {
                    console.error(
                        'No fue posible reconstruir la jerarquía de la estructura del borrador.',
                        error,
                    );

                    return of({
                        draft,
                        hierarchies: {
                            assignment: null,
                            commission: null,
                        } as DraftStructureHierarchies,
                    });
                }),
                takeUntilDestroyed(this.destroyRef),
                finalize(() => ctx.isDraftLoading.set(false)),
            )
            .subscribe({
                next: ({ draft: selectedDraft, hierarchies }) =>
                    this.apply(selectedDraft, hierarchies, ctx),
                error: (error: unknown) => {
                    ctx.draftMessage.set('');
                    ctx.draftError.set(
                        error instanceof Error
                            ? error.message
                            : 'No fue posible recuperar el borrador seleccionado.',
                    );
                },
            });
    }

    requestDelete(ctx: UserRegistrationDraftContext): void {
        const borradorId = ctx.draftId();

        if (!borradorId || ctx.isDraftBusy() || ctx.isSubmitting()) {
            return;
        }

        ctx.deleteDraftConfirmationOpen.set(true);
    }

    closeDeleteConfirmation(ctx: UserRegistrationDraftContext): void {
        if (ctx.isDraftDeleting()) {
            return;
        }

        ctx.deleteDraftConfirmationOpen.set(false);
    }

    confirmDelete(ctx: UserRegistrationDraftContext): void {
        const borradorId = ctx.draftId();

        if (!borradorId || ctx.isDraftDeleting() || ctx.isSubmitting()) {
            return;
        }

        ctx.isDraftDeleting.set(true);
        ctx.draftError.set('');

        this.usersFacade
            .deleteRegistrationDraft(borradorId, ctx.resolveCurrentUserId())
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                finalize(() => ctx.isDraftDeleting.set(false)),
            )
            .subscribe({
                next: () => {
                    ctx.deleteDraftConfirmationOpen.set(false);
                    ctx.resetWizard();
                    ctx.ensureDefaultSiauProfile();
                    ctx.draftMessage.set('Borrador eliminado. Se inició un registro nuevo.');
                },
                error: (error: unknown) => {
                    ctx.deleteDraftConfirmationOpen.set(false);
                    ctx.draftError.set(
                        error instanceof Error
                            ? error.message
                            : 'No fue posible eliminar el borrador.',
                    );
                },
            });
    }

    deleteAfterSuccess(ctx: UserRegistrationDraftContext): Observable<void> {
        const borradorId = ctx.draftId();

        if (!borradorId) {
            return of(void 0);
        }

        return this.usersFacade
            .deleteRegistrationDraft(borradorId, ctx.resolveCurrentUserId())
            .pipe(
                map(() => {
                    ctx.draftId.set(null);
                    ctx.draftMessage.set('');
                    ctx.draftError.set('');
                }),
                catchError((error: unknown) => {
                    console.warn(
                        'El usuario fue registrado, pero no fue posible limpiar el borrador.',
                        error,
                    );
                    return of(void 0);
                }),
            );
    }

    private apply(
        draft: BorradorItem | null,
        hierarchies: DraftStructureHierarchies,
        ctx: UserRegistrationDraftContext,
    ): void {
        if (!draft?.datos) {
            ctx.draftMessage.set('');
            return;
        }

        const restoredForm = this.draftFactory.restoreForm(draft.datos, hierarchies, INITIAL_FORM);
        const restoredProfiles = this.draftProfileService.restoreProfiles(
            draft.datos,
            draft.catalogos,
            ctx.knownSystemOptions(),
            ctx.structureRoleOptionsBySystem(),
            ctx.roleOptions(),
        );

        ctx.draftId.set(draft.borradorId);
        ctx.form.set({
            ...restoredForm,
            profiles: restoredProfiles.map((profile) => profile.role),
        });
        this.seedResolvedStructureOptions(hierarchies.assignment, ctx.institutionOptions, ctx.decentralizedBodyOptions, ctx.administrativeUnitOptions);
        this.seedResolvedStructureOptions(
            hierarchies.commission,
            ctx.commissionInstitutionOptions,
            ctx.commissionDecentralizedBodyOptions,
            ctx.commissionAdministrativeUnitOptions,
        );
        ctx.assignedSystemProfiles.set(restoredProfiles);
        if (!restoredProfiles.length) {
            ctx.ensureDefaultSiauProfile();
        }

        const inferredStep = this.draftFactory.inferDraftStep(draft.datos);
        const requestedStep = draft.pasoActual || inferredStep;
        const normalizedRequestedStep: WizardStepId | string = requestedStep === 'documents'
            ? 'contact'
            : requestedStep;
        const activeStep = ctx.isWizardStep(normalizedRequestedStep)
            && CREATE_WIZARD_STEPS.includes(normalizedRequestedStep)
            ? normalizedRequestedStep
            : 'personal-data';

        ctx.activeStepId.set(activeStep);
        ctx.completedSteps.set(this.inferCompletedSteps(activeStep, ctx.stepOrder()));
        ctx.draftMessage.set('Borrador recuperado. Puedes continuar donde lo dejaste.');
        ctx.consultEcccAndPersonal();

        const unresolvedAssignment = Boolean(
            draft.datos.adscripcion.estructuraId && !hierarchies.assignment,
        );
        const unresolvedCommission = Boolean(
            draft.datos.comision?.estructuraId && !hierarchies.commission,
        );
        const partialAssignment = Boolean(
            hierarchies.assignment?.institution
            && !hierarchies.assignment.institutionType,
        );
        const partialCommission = Boolean(
            hierarchies.commission?.institution
            && !hierarchies.commission.institutionType,
        );

        if (unresolvedAssignment || unresolvedCommission) {
            ctx.draftError.set(
                'Se recuperó el borrador, pero no fue posible reconstruir toda la jerarquía de adscripción. Vuelve a seleccionar los catálogos faltantes.',
            );
        } else if (partialAssignment || partialCommission) {
            ctx.draftMessage.set(
                'Borrador recuperado. La estructura guardada se muestra en el primer nivel; si necesitas cambiarla, vuelve a elegir el tipo de institución.',
            );
        }

        ctx.loadHydratedAssignmentCatalogs(ctx.form());
    }

    private resolveHierarchies(draft: BorradorItem): Observable<DraftStructureHierarchies> {
        return this.draftStructureResolver.resolverJerarquias(draft);
    }

    private seedResolvedStructureOptions(
        hierarchy: ResolvedDraftStructureHierarchy | null,
        institutions: WritableSignal<readonly SiauSelectOption[]>,
        decentralizedBodies: WritableSignal<readonly SiauSelectOption[]>,
        administrativeUnits: WritableSignal<readonly SiauSelectOption[]>,
    ): void {
        institutions.set(hierarchy?.institutionOption ? [hierarchy.institutionOption] : []);
        decentralizedBodies.set(
            hierarchy?.decentralizedBodyOption ? [hierarchy.decentralizedBodyOption] : [],
        );
        administrativeUnits.set(
            hierarchy?.administrativeUnitOption ? [hierarchy.administrativeUnitOption] : [],
        );
    }

    private inferCompletedSteps(
        activeStep: WizardStepId,
        order: readonly WizardStepId[],
    ): readonly WizardStepId[] {
        const index = order.indexOf(activeStep);
        return index > 0
            ? order.slice(0, index).filter((step) => CREATE_WIZARD_STEPS.includes(step))
            : [];
    }
}
