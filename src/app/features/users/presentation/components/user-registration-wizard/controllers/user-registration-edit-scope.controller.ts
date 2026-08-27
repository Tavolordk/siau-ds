import { inject, Injectable } from '@angular/core';
import { ProfileOrigin } from '../models/user-registration-wizard.models';
import { UserRegistrationCatalogCoordinator } from '../catalogs/user-registration-catalog.coordinator';
import { UserRegistrationPresenter } from '../presenters/user-registration.presenter';
import { UserRegistrationState } from '../state/user-registration.state';

/**
 * Controla el alcance exclusivo de edición entre adscripción y comisión.
 * Mantiene esta regla transversal fuera del componente visual.
 */
@Injectable()
export class UserRegistrationEditScopeController {
    private readonly state = inject(UserRegistrationState);
    private readonly presenter = inject(UserRegistrationPresenter);
    private readonly catalogCoordinator = inject(UserRegistrationCatalogCoordinator);

    selectProfileOrigin(origin: ProfileOrigin, resetProfileCatalog: () => void): void {
        if (
            !this.presenter.isEditMode() ||
            this.presenter.isFormDisabled() ||
            this.state.isSubmitting()
        ) {
            return;
        }
        if (origin === 'comision' && !this.state.form().commissionEnabled) {
            return;
        }
        if (
            this.presenter.isProfileOriginLocked(origin) ||
            this.state.selectedProfileOrigin() === origin
        ) {
            return;
        }

        this.state.selectedProfileOrigin.set(origin);
        resetProfileCatalog();
    }

    claim(
        origin: ProfileOrigin,
        changed = true,
        resetProfileCatalog = true,
        resetCatalog: () => void,
    ): boolean {
        if (!this.presenter.isEditMode() || !changed) {
            return true;
        }

        const currentScope = this.state.editStructureScope();
        if (currentScope && currentScope !== origin) {
            return false;
        }

        if (!currentScope) {
            this.state.editStructureScope.set(origin);
            this.state.selectedProfileOrigin.set(origin);

            if (resetProfileCatalog) {
                resetCatalog();
            }
            if (origin === 'adscripcion') {
                this.removeCommissionForAssignmentUpdate();
            }
        }

        return true;
    }

    private removeCommissionForAssignmentUpdate(): void {
        if (!this.presenter.isEditMode()) {
            return;
        }

        const hadCommission = this.state.form().commissionEnabled;
        const hadCommissionProfiles = this.presenter.commissionAssignedProfiles().length > 0;
        const remainingProfiles = this.state.assignedSystemProfiles().filter(
            (profile) => profile.origin !== 'comision',
        );

        this.catalogCoordinator.bumpCommissionCatalogGeneration();
        this.state.commissionMunicipalityOptions.set([]);
        this.state.commissionInstitutionOptions.set([]);
        this.state.commissionDecentralizedBodyOptions.set([]);
        this.state.commissionAdministrativeUnitOptions.set([]);
        this.state.commissionProfileCarouselIndex.set(0);

        this.state.assignedSystemProfiles.set(remainingProfiles);
        this.state.form.update((current) => ({
            ...current,
            commissionEnabled: false,
            commissionInstitutionType: '',
            commissionInstitution: '',
            commissionEntity: '',
            commissionMunicipality: '',
            commissionDecentralizedBody: '',
            commissionAdministrativeUnit: '',
            commissionAdmissionDate: '',
            profiles: remainingProfiles.map((profile) => profile.role),
        }));
        this.normalizeCarouselIndexes();

        this.state.formErrors.update((current) => {
            const next = { ...current };
            [
                'commissionInstitutionType',
                'commissionEntity',
                'commissionMunicipality',
                'commissionInstitution',
                'commissionDecentralizedBody',
                'commissionAdministrativeUnit',
                'commissionAdmissionDate',
            ].forEach((key) => delete next[key]);
            return next;
        });

        const message = hadCommission || hadCommissionProfiles
            ? 'Al modificar la adscripción se eliminó la comisión existente junto con sus perfiles. Durante esta actualización no se puede agregar una nueva comisión.'
            : 'Esta actualización está modificando la adscripción. Durante esta operación no se puede agregar una comisión.';

        this.state.profileResetNotice.set({ origin: 'adscripcion', message });
    }

    private normalizeCarouselIndexes(): void {
        const assignmentCount = this.presenter.assignmentAssignedProfiles().length;
        const commissionCount = this.presenter.commissionAssignedProfiles().length;
        this.state.assignmentProfileCarouselIndex.set(
            assignmentCount === 0
                ? 0
                : Math.min(this.state.assignmentProfileCarouselIndex(), assignmentCount - 1),
        );
        this.state.commissionProfileCarouselIndex.set(
            commissionCount === 0
                ? 0
                : Math.min(this.state.commissionProfileCarouselIndex(), commissionCount - 1),
        );
    }
}
