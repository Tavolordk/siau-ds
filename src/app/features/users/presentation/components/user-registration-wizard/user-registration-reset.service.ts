import { inject, Injectable } from '@angular/core';
import { INITIAL_FORM } from './user-registration-wizard.models';
import { UserRegistrationIdentityCoordinator } from './user-registration-identity.coordinator';
import { UserRegistrationState } from './user-registration.state';

/** Restablece el estado del asistente a su condición inicial. */
@Injectable()
export class UserRegistrationResetService {
    private readonly state = inject(UserRegistrationState);
    private readonly identity = inject(UserRegistrationIdentityCoordinator);

    reset(resetStructureProfileCatalog: () => void): void {
        this.identity.resetRenapoLookupState();
        this.identity.resetEcccPersonalLookupState();
        this.state.detailCurpValidated.set(false);
        this.state.initialIdentitySnapshot.set(null);
        this.state.initialEditFormSnapshot.set(null);
        this.state.initialAssignedProfiles.set([]);
        this.state.initialStructureEmailSnapshot.set(null);
        this.state.activeStepId.set('personal-data');
        this.state.completedSteps.set([]);
        this.state.editEnabled.set(true);
        this.state.form.set({ ...INITIAL_FORM, profiles: [] });
        this.state.isSubmitting.set(false);
        this.state.isDraftLoading.set(false);
        this.state.isDraftSaving.set(false);
        this.state.isDraftDeleting.set(false);
        this.state.draftId.set(null);
        this.state.draftMessage.set('');
        this.state.draftError.set('');
        this.state.deleteDraftConfirmationOpen.set(false);
        this.state.formErrors.set({});
        this.state.saveSuccess.set(null);
        this.state.selectedSystem.set('');
        this.state.selectedRole.set('');
        this.state.roleOptions.set([]);
        this.state.assignedSystemProfiles.set([]);
        this.state.assignmentProfileCarouselIndex.set(0);
        this.state.commissionProfileCarouselIndex.set(0);
        this.state.selectedProfileOrigin.set('adscripcion');
        this.state.profileResetNotice.set(null);
        this.state.editStructureScope.set(null);
        this.state.detailRoleOptionsBySystem.set({});
        resetStructureProfileCatalog();
        this.state.showPassword.set(false);
        this.state.showConfirmPassword.set(false);
        this.state.municipalityOptions.set([]);
        this.state.institutionOptions.set([]);
        this.state.decentralizedBodyOptions.set([]);
        this.state.administrativeUnitOptions.set([]);
        this.state.commissionMunicipalityOptions.set([]);
        this.state.commissionInstitutionOptions.set([]);
        this.state.commissionDecentralizedBodyOptions.set([]);
        this.state.commissionAdministrativeUnitOptions.set([]);
    }
}
