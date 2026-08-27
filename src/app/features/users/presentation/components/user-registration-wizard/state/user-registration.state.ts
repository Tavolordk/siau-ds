import { inject, Injectable, signal } from '@angular/core';
import { SiauSelectOption } from '../../../../../../shared/ui';
import { UserDetailRecord, UserRecord } from '../../../../domain/models/user-record.model';
import {
    AssignedSystemProfile,
    IdentitySnapshot,
    INITIAL_FORM,
    ProfileOrigin,
    ProfileResetNotice,
    SaveSuccessModalState,
    StructureEmailSnapshot,
    StructureProfileLookupStatus,
    UserRegistrationForm,
    UserWizardMode,
    WizardStepId,
} from '../models/user-registration-wizard.models';
import { UserRegistrationIdentityCoordinator } from '../coordinators/user-registration-identity.coordinator';

/**
 * Estado mutable del asistente de registro.
 *
 * Mantiene los signals de la pantalla en un único lugar y evita que el
 * componente Angular sea también el almacén de estado de toda la feature.
 * No contiene reglas de negocio ni realiza llamadas HTTP.
 */
@Injectable()
export class UserRegistrationState {
    private readonly identity = inject(UserRegistrationIdentityCoordinator);

    readonly mode = signal<UserWizardMode>('create');
    readonly readonlyMode = signal(false);
    readonly open = signal(false);
    readonly user = signal<UserRecord | null>(null);
    readonly userDetail = signal<UserDetailRecord | null>(null);

    readonly initialIdentitySnapshot = signal<IdentitySnapshot | null>(null);
    readonly initialEditFormSnapshot = signal<UserRegistrationForm | null>(null);
    readonly initialAssignedProfiles = signal<readonly AssignedSystemProfile[]>([]);
    readonly initialStructureEmailSnapshot = signal<StructureEmailSnapshot | null>(null);
    readonly detailCurpValidated = signal(false);
    readonly catalogosReady = signal(false);
    readonly activeStepId = signal<WizardStepId>('personal-data');
    readonly editEnabled = signal(true);
    readonly completedSteps = signal<readonly WizardStepId[]>([]);
    readonly form = signal<UserRegistrationForm>({ ...INITIAL_FORM });
    readonly isSubmitting = signal(false);
    readonly isDraftLoading = signal(false);
    readonly isDraftSaving = signal(false);
    readonly isDraftDeleting = signal(false);
    readonly draftId = signal<number | null>(null);
    readonly draftMessage = signal('');
    readonly draftError = signal('');
    readonly deleteDraftConfirmationOpen = signal(false);
    readonly formErrors = signal<Record<string, string>>({});
    readonly saveSuccess = signal<SaveSuccessModalState | null>(null);

    readonly renapoLookupStatus = this.identity.renapoLookupStatus;
    readonly renapoMessage = this.identity.renapoMessage;
    readonly renapoMessageVisible = this.identity.renapoMessageVisible;
    readonly curpLocked = this.identity.curpLocked;
    readonly curpUnlockChecked = this.identity.curpUnlockChecked;
    readonly curpValidationSummary = this.identity.curpValidationSummary;

    readonly selectedSystem = signal('');
    readonly selectedRole = signal('');
    readonly selectedProfileOrigin = signal<ProfileOrigin>('adscripcion');
    readonly assignedSystemProfiles = signal<AssignedSystemProfile[]>([]);
    readonly assignmentProfileCarouselIndex = signal(0);
    readonly commissionProfileCarouselIndex = signal(0);
    readonly profileResetNotice = signal<ProfileResetNotice | null>(null);
    readonly editStructureScope = signal<ProfileOrigin | null>(null);
    readonly detailRoleOptionsBySystem = signal<Record<string, readonly SiauSelectOption[]>>({});
    readonly structureProfileLookupStatus = signal<StructureProfileLookupStatus>('idle');
    readonly structureProfileMessage = signal('');
    readonly structureRoleOptionsBySystem = signal<Record<string, readonly SiauSelectOption[]>>({});
    readonly allSystemOptions = signal<readonly SiauSelectOption[]>([]);

    readonly showPassword = signal(false);
    readonly showConfirmPassword = signal(false);

    readonly genderOptions = signal<readonly SiauSelectOption[]>([]);
    readonly civilStatusOptions = signal<readonly SiauSelectOption[]>([]);
    readonly userTypeOptions = signal<readonly SiauSelectOption[]>([]);
    readonly systemOptions = signal<readonly SiauSelectOption[]>([]);
    readonly roleOptions = signal<readonly SiauSelectOption[]>([]);
    readonly institutionTypeOptions = signal<readonly SiauSelectOption[]>([]);
    readonly stateOptions = signal<readonly SiauSelectOption[]>([]);
    readonly municipalityOptions = signal<readonly SiauSelectOption[]>([]);
    readonly institutionOptions = signal<readonly SiauSelectOption[]>([]);
    readonly decentralizedBodyOptions = signal<readonly SiauSelectOption[]>([]);
    readonly administrativeUnitOptions = signal<readonly SiauSelectOption[]>([]);
    readonly commissionMunicipalityOptions = signal<readonly SiauSelectOption[]>([]);
    readonly commissionInstitutionOptions = signal<readonly SiauSelectOption[]>([]);
    readonly commissionDecentralizedBodyOptions = signal<readonly SiauSelectOption[]>([]);
    readonly commissionAdministrativeUnitOptions = signal<readonly SiauSelectOption[]>([]);

    syncInputs(
        mode: UserWizardMode,
        readonlyMode: boolean,
        open: boolean,
        user: UserRecord | null,
        userDetail: UserDetailRecord | null,
    ): void {
        this.mode.set(mode);
        this.readonlyMode.set(readonlyMode);
        this.open.set(open);
        this.user.set(user);
        this.userDetail.set(userDetail);
    }
}
