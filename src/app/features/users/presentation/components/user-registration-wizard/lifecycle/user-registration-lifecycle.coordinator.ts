import { effect, inject, Injectable, Injector, untracked } from '@angular/core';
import { BorradorItem, UserDetailRecord, UserRecord } from '../../../../domain/models/user-record.model';
import { UserRegistrationContextFactory } from '../configuration/user-registration-context.factory';
import { UserRegistrationDraftProfileService } from '../drafts/user-registration-draft-profile.service';
import { UserRegistrationEditMapper } from '../editing/user-registration-edit.mapper';
import { UserRegistrationFormRules } from '../validation/user-registration-form.rules';
import { UserRegistrationIdentityCoordinator } from '../identity/user-registration-identity.coordinator';
import { UserRegistrationPresenter } from '../view/user-registration.presenter';
import { UserRegistrationState } from '../state/user-registration.state';
import { UserWizardMode } from '../models/user-registration-wizard.models';

export interface UserRegistrationLifecycleInputs {
    open: () => boolean;
    mode: () => UserWizardMode;
    user: () => UserRecord | null;
    userDetail: () => UserDetailRecord | null;
    readonlyMode: () => boolean;
    draftToOpen: () => BorradorItem | null;
    autoRestoreDraft: () => boolean;
}

/**
 * Coordina la apertura e hidratación del wizard.
 *
 * No contiene acciones de template: observa los inputs del componente y mantiene
 * sincronizado el estado de edición/creación con catálogos, borradores y perfiles.
 */
@Injectable()
export class UserRegistrationLifecycleCoordinator {
    private readonly injector = inject(Injector);
    private readonly state = inject(UserRegistrationState);
    private readonly presenter = inject(UserRegistrationPresenter);
    private readonly contextFactory = inject(UserRegistrationContextFactory);
    private readonly editMapper = inject(UserRegistrationEditMapper);
    private readonly identity = inject(UserRegistrationIdentityCoordinator);
    private readonly draftProfiles = inject(UserRegistrationDraftProfileService);
    private readonly formRules = inject(UserRegistrationFormRules);
    private hydrationKey = '';

    connect(inputs: UserRegistrationLifecycleInputs): void {
        effect(() => {
            this.state.syncInputs(
                inputs.mode(),
                inputs.readonlyMode(),
                inputs.open(),
                inputs.user(),
                inputs.userDetail(),
            );
        }, { injector: this.injector });

        effect(() => this.hydrateOnOpen(inputs), { injector: this.injector });
        effect(() => this.refreshProfileLabels(), { injector: this.injector });
        effect(() => this.loadProfilesForActiveStructure(inputs), { injector: this.injector });
    }

    private hydrateOnOpen(inputs: UserRegistrationLifecycleInputs): void {
        const isOpen = inputs.open();
        const catalogosReady = this.state.catalogosReady();

        if (isOpen && !catalogosReady) {
            this.contextFactory.loadCatalogos();
        }

        const mode = inputs.mode();
        const user = inputs.user();
        const detail = inputs.userDetail();
        const draftToOpen = inputs.draftToOpen();
        const autoRestoreDraft = inputs.autoRestoreDraft();

        if (!isOpen) {
            this.hydrationKey = '';
            return;
        }

        const key = `${mode}-${user?.userId ?? user?.username ?? 'sin-usuario'}-${detail ? 'con-detalle' : 'sin-detalle'}-${draftToOpen?.borradorId ?? 'sin-borrador'}-${autoRestoreDraft}-${catalogosReady}`;
        if (this.hydrationKey === key) {
            return;
        }
        this.hydrationKey = key;

        untracked(() => {
            if (mode === 'edit') {
                if (catalogosReady && detail) {
                    this.hydrateEditForm(detail, user);
                }
                return;
            }

            this.contextFactory.resetWizard();
            this.state.editEnabled.set(true);
            this.contextFactory.ensureDefaultSiauProfile();

            if (!catalogosReady) {
                return;
            }

            if (draftToOpen) {
                this.contextFactory.restoreProvidedRegistrationDraft(draftToOpen);
            } else if (autoRestoreDraft) {
                this.contextFactory.loadRegistrationDraft();
            }
        });
    }

    private refreshProfileLabels(): void {
        this.state.assignedSystemProfiles();
        this.state.systemOptions();
        this.state.allSystemOptions();
        this.state.structureRoleOptionsBySystem();
        this.state.roleOptions();
        this.draftProfiles.fallbackOptions();
        untracked(() => this.contextFactory.refreshAssignedProfileLabels());
    }

    private loadProfilesForActiveStructure(inputs: UserRegistrationLifecycleInputs): void {
        const shouldLoad = inputs.open() && this.state.catalogosReady() && this.state.activeStepId() === 'profiles';
        const current = this.state.form();
        if (!shouldLoad) {
            return;
        }

        const structureId = this.contextFactory.resolveProfileStructureId(current, this.presenter.activeProfileOrigin());
        untracked(() => this.contextFactory.loadStructureProfileOptions(structureId));
    }

    private hydrateEditForm(detail: UserDetailRecord, user: UserRecord | null): void {
        this.contextFactory.bumpAssignmentCatalogGeneration();
        this.contextFactory.bumpCommissionCatalogGeneration();
        this.identity.resetRenapoLookupState();
        this.identity.resetEcccPersonalLookupState();

        const hydration = this.editMapper.hydrate(
            detail,
            user,
            {
                gender: this.state.genderOptions,
                civilStatus: this.state.civilStatusOptions,
                institutionType: this.state.institutionTypeOptions,
                state: this.state.stateOptions,
                municipality: this.state.municipalityOptions,
                institution: this.state.institutionOptions,
                decentralizedBody: this.state.decentralizedBodyOptions,
                administrativeUnit: this.state.administrativeUnitOptions,
                commissionMunicipality: this.state.commissionMunicipalityOptions,
                commissionInstitution: this.state.commissionInstitutionOptions,
                commissionDecentralizedBody: this.state.commissionDecentralizedBodyOptions,
                commissionAdministrativeUnit: this.state.commissionAdministrativeUnitOptions,
            },
            this.presenter.knownSystemOptions(),
        );

        this.state.detailCurpValidated.set(hydration.persistedCurpValidated);
        if (hydration.persistedCurpValidated) {
            this.state.renapoLookupStatus.set('success');
            this.state.renapoMessage.set('La CURP de este usuario ya fue validada en RENAPO. En edición no se permite volver a consultar RENAPO ni modificar CURP, nombre(s), apellidos o fecha de nacimiento.');
            this.state.renapoMessageVisible.set(true);
            this.state.curpLocked.set(true);
            this.state.curpUnlockChecked.set(false);
        }

        const nextForm = hydration.form;
        const assignedProfiles = [...hydration.assignedProfiles];
        this.state.activeStepId.set('personal-data');
        this.state.completedSteps.set([...this.presenter.stepOrder()]);
        this.state.editEnabled.set(false);
        this.state.form.set(nextForm);
        this.state.initialIdentitySnapshot.set(this.formRules.toIdentitySnapshot(nextForm));
        this.state.initialEditFormSnapshot.set(this.formRules.toEditFormSnapshot(nextForm));
        this.state.initialStructureEmailSnapshot.set(this.contextFactory.toStructureEmailSnapshot(nextForm));
        this.state.selectedSystem.set('');
        this.state.selectedRole.set('');
        this.state.roleOptions.set([]);
        this.state.assignedSystemProfiles.set(assignedProfiles);
        this.state.assignmentProfileCarouselIndex.set(0);
        this.state.commissionProfileCarouselIndex.set(0);
        this.state.selectedProfileOrigin.set(nextForm.commissionEnabled ? 'comision' : 'adscripcion');
        this.state.profileResetNotice.set(null);
        this.state.editStructureScope.set(null);
        this.state.initialAssignedProfiles.set([...assignedProfiles]);
        this.state.detailRoleOptionsBySystem.set(hydration.roleOptionsBySystem);
        this.contextFactory.loadHydratedAssignmentCatalogs(nextForm);
    }
}
