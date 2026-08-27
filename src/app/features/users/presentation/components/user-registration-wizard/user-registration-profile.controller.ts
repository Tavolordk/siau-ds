import {
    inject,
    Injectable,
    WritableSignal,
} from '@angular/core';
import { SiauSelectOption } from '../../../../../shared/ui';
import {
    AssignedSystemProfile,
    ProfileOrigin,
    ProfileResetNotice,
    StructureProfileLookupStatus,
    UserRegistrationForm,
    WizardStepId,
} from './user-registration-wizard.models';
import { UserRegistrationFormRules } from './user-registration-form.rules';

export interface UserRegistrationProfileContext {
    readonly form: WritableSignal<UserRegistrationForm>;
    readonly formErrors: WritableSignal<Record<string, string>>;
    readonly selectedSystem: WritableSignal<string>;
    readonly selectedRole: WritableSignal<string>;
    readonly systemOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly roleOptions: WritableSignal<readonly SiauSelectOption[]>;
    readonly assignedSystemProfiles: WritableSignal<AssignedSystemProfile[]>;
    readonly assignmentProfileCarouselIndex: WritableSignal<number>;
    readonly commissionProfileCarouselIndex: WritableSignal<number>;
    readonly profileResetNotice: WritableSignal<ProfileResetNotice | null>;
    readonly completedSteps: WritableSignal<readonly WizardStepId[]>;
    readonly structureProfileLookupStatus: WritableSignal<StructureProfileLookupStatus>;
    readonly structureProfileMessage: WritableSignal<string>;
    readonly open: () => boolean;
    readonly mode: () => 'create' | 'edit';
    readonly isEditMode: () => boolean;
    readonly isFormDisabled: () => boolean;
    readonly isSubmitting: () => boolean;
    readonly isDraftBusy: () => boolean;
    readonly canSelectProfiles: () => boolean;
    readonly activeProfileOrigin: () => ProfileOrigin;
    readonly availableRoleOptions: () => readonly SiauSelectOption[];
    readonly isProfileOriginLocked: (origin: ProfileOrigin) => boolean;
    readonly claimEditStructureScope: (
        origin: ProfileOrigin,
        changed?: boolean,
        resetProfileCatalog?: boolean,
    ) => boolean;
    readonly loadProfileOptionsForSystem: (system: string) => void;
    readonly resetStructureProfileCatalog: () => void;
    readonly clearFieldError: (key: string) => void;
    readonly saveDraftAfterProfileChange: () => void;
    readonly isSiauSystem: (systemValue: string, systemLabel?: string) => boolean;
    readonly isRoleAlreadyAssigned: (system: string, role: SiauSelectOption) => boolean;
    readonly findStructureRoleOptionsForSystem: (system: string) => readonly SiauSelectOption[];
}

/**
 * Encapsula la selección, reemplazo y limpieza de perfiles por origen.
 * No decide reglas de endpoint ni construye requests.
 */
@Injectable()
export class UserRegistrationProfileController {
    private readonly formRules = inject(UserRegistrationFormRules);

    updateSelectedSystem(value: string | null, ctx: UserRegistrationProfileContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        if (!ctx.canSelectProfiles()) {
            ctx.formErrors.update((current) => ({
                ...current,
                profiles:
                    ctx.structureProfileMessage() ||
                    'Consulta los perfiles disponibles para la institución antes de asignarlos.',
            }));
            return;
        }

        const system = value ?? '';
        ctx.selectedSystem.set(system);
        ctx.selectedRole.set('');
        ctx.roleOptions.set([]);
        ctx.loadProfileOptionsForSystem(system);
    }

    updateSelectedRole(value: string | null, ctx: UserRegistrationProfileContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting()) {
            return;
        }

        ctx.selectedRole.set(value ?? '');
    }

    addAssignedProfile(ctx: UserRegistrationProfileContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting() || ctx.isDraftBusy()) {
            return;
        }

        if (!ctx.canSelectProfiles()) {
            ctx.formErrors.update((current) => ({
                ...current,
                profiles:
                    ctx.structureProfileMessage() ||
                    'Consulta los perfiles disponibles para la institución antes de asignarlos.',
            }));
            return;
        }

        const system = ctx.selectedSystem();
        const role = ctx.selectedRole();
        if (!system || !role) {
            return;
        }

        const systemOption = ctx.systemOptions().find(
            (item) =>
                item.value === system ||
                this.formRules.normalizeText(item.label) === this.formRules.normalizeText(system),
        );
        const roleOption = ctx.availableRoleOptions().find((item) => item.value === role);

        if (!systemOption || !roleOption) {
            return;
        }

        const isSiau = ctx.isSiauSystem(system, systemOption.label);
        if (ctx.isRoleAlreadyAssigned(system, roleOption)) {
            return;
        }

        const origin = ctx.activeProfileOrigin();
        if (!ctx.claimEditStructureScope(origin, true, false)) {
            return;
        }

        const newItem: AssignedSystemProfile = {
            id: `${origin}-${system}-${role}-${Date.now()}`,
            system,
            role,
            systemLabel: systemOption.label,
            roleLabel: roleOption.label,
            origin,
        };

        ctx.assignedSystemProfiles.update((current) => {
            const profilesToKeep = isSiau
                ? current.filter((profile) =>
                    profile.origin !== origin ||
                    !ctx.isSiauSystem(profile.system, profile.systemLabel),
                )
                : current;

            return [...profilesToKeep, newItem];
        });

        this.normalizeCarouselIndexes(ctx);
        this.setCarouselIndex(origin, this.profilesForOrigin(origin, ctx).length - 1, ctx);
        ctx.clearFieldError('profiles');
        ctx.selectedSystem.set('');
        ctx.selectedRole.set('');
        ctx.roleOptions.set([]);
        ctx.saveDraftAfterProfileChange();
    }

    removeAssignedProfile(id: string, ctx: UserRegistrationProfileContext): void {
        if (ctx.isFormDisabled() || ctx.isSubmitting() || ctx.isDraftBusy()) {
            return;
        }

        const profile = ctx.assignedSystemProfiles().find((item) => item.id === id);
        if (!profile || !this.canRemoveAssignedProfile(profile, ctx)) {
            return;
        }

        if (!ctx.claimEditStructureScope(profile.origin, true, false)) {
            return;
        }

        ctx.assignedSystemProfiles.update((current) => current.filter((item) => item.id !== id));
        this.normalizeCarouselIndexes(ctx);
        ctx.clearFieldError('profiles');
        ctx.saveDraftAfterProfileChange();
    }

    canRemoveAssignedProfile(
        profile: AssignedSystemProfile,
        ctx: UserRegistrationProfileContext,
    ): boolean {
        return !ctx.isProfileOriginLocked(profile.origin);
    }

    clearAfterAssignmentInstitutionChange(
        previousInstitution: string | null | undefined,
        nextInstitution: string | null | undefined,
        ctx: UserRegistrationProfileContext,
    ): void {
        const changed = String(previousInstitution ?? '').trim() !== String(nextInstitution ?? '').trim();
        if (!changed || !ctx.claimEditStructureScope('adscripcion')) {
            return;
        }

        if (!ctx.isEditMode()) {
            if (ctx.form().commissionEnabled) {
                return;
            }

            this.clearAllAfterCreationContextChange(
                'La estructura de adscripción cambió. Debes volver a seleccionar los sistemas y perfiles del usuario.',
                ctx,
            );
            return;
        }

        this.clearForOrigin(
            'adscripcion',
            'La estructura de adscripción cambió. Se eliminaron los perfiles de adscripción y la comisión existente junto con sus perfiles. Durante esta actualización no se puede agregar una nueva comisión; se recargarán los sistemas y perfiles de la nueva adscripción.',
            ctx,
        );
    }

    clearAfterCommissionInstitutionChange(
        previousInstitution: string | null | undefined,
        nextInstitution: string | null | undefined,
        ctx: UserRegistrationProfileContext,
    ): void {
        if (!ctx.form().commissionEnabled) {
            return;
        }

        const changed = String(previousInstitution ?? '').trim() !== String(nextInstitution ?? '').trim();
        if (!changed || !ctx.claimEditStructureScope('comision')) {
            return;
        }

        if (!ctx.isEditMode()) {
            this.clearAllAfterCreationContextChange(
                'La estructura de comisión cambió. Debes volver a seleccionar los sistemas y perfiles del usuario.',
                ctx,
            );
            return;
        }

        this.clearForOrigin(
            'comision',
            'La estructura de comisión cambió. Se eliminaron los perfiles de comisión existentes y se recargarán los sistemas y perfiles con la nueva selección.',
            ctx,
        );
    }

    clearAllAfterCreationContextChange(
        message: string,
        ctx: UserRegistrationProfileContext,
    ): void {
        ctx.resetStructureProfileCatalog();
        const hasAssignedProfiles =
            ctx.assignedSystemProfiles().length > 0 || ctx.form().profiles.length > 0;

        ctx.assignedSystemProfiles.set([]);
        ctx.form.update((current) => ({ ...current, profiles: [] }));
        ctx.selectedSystem.set('');
        ctx.selectedRole.set('');
        ctx.roleOptions.set([]);
        ctx.assignmentProfileCarouselIndex.set(0);
        ctx.commissionProfileCarouselIndex.set(0);
        ctx.completedSteps.update((current) => current.filter((stepId) => stepId !== 'profiles'));

        if (!hasAssignedProfiles) {
            ctx.clearFieldError('profiles');
            return;
        }

        ctx.formErrors.update((current) => ({ ...current, profiles: message }));
    }

    clearForOrigin(
        origin: ProfileOrigin,
        message: string,
        ctx: UserRegistrationProfileContext,
    ): void {
        const currentProfiles = ctx.assignedSystemProfiles();
        const removedProfiles = currentProfiles.filter((profile) => profile.origin === origin);
        const remainingProfiles = currentProfiles.filter((profile) => profile.origin !== origin);

        if (ctx.activeProfileOrigin() === origin) {
            ctx.resetStructureProfileCatalog();
        }

        ctx.assignedSystemProfiles.set(remainingProfiles);
        ctx.form.update((current) => ({
            ...current,
            profiles: remainingProfiles.map((profile) => profile.role),
        }));
        this.normalizeCarouselIndexes(ctx);
        ctx.completedSteps.update((current) => current.filter((stepId) => stepId !== 'profiles'));

        if (removedProfiles.length === 0) {
            ctx.clearFieldError('profiles');
            return;
        }

        if (ctx.isEditMode()) {
            ctx.profileResetNotice.set({ origin, message });
        }

        ctx.formErrors.update((current) => ({ ...current, profiles: message }));
    }

    previousProfile(origin: ProfileOrigin, ctx: UserRegistrationProfileContext): void {
        const profiles = this.profilesForOrigin(origin, ctx);
        if (profiles.length <= 1) {
            return;
        }

        const current = this.getCarouselIndex(origin, ctx);
        this.setCarouselIndex(origin, current <= 0 ? profiles.length - 1 : current - 1, ctx);
    }

    nextProfile(origin: ProfileOrigin, ctx: UserRegistrationProfileContext): void {
        const profiles = this.profilesForOrigin(origin, ctx);
        if (profiles.length <= 1) {
            return;
        }

        const current = this.getCarouselIndex(origin, ctx);
        this.setCarouselIndex(origin, (current + 1) % profiles.length, ctx);
    }

    getCarouselIndex(origin: ProfileOrigin, ctx: UserRegistrationProfileContext): number {
        const profiles = this.profilesForOrigin(origin, ctx);
        if (profiles.length === 0) {
            return 0;
        }

        const rawIndex = origin === 'comision'
            ? ctx.commissionProfileCarouselIndex()
            : ctx.assignmentProfileCarouselIndex();

        return Math.min(Math.max(rawIndex, 0), profiles.length - 1);
    }

    profileAtCarouselIndex(
        origin: ProfileOrigin,
        ctx: UserRegistrationProfileContext,
    ): AssignedSystemProfile | null {
        const profiles = this.profilesForOrigin(origin, ctx);
        return profiles[this.getCarouselIndex(origin, ctx)] ?? null;
    }

    ensureDefaultSiauProfile(ctx: UserRegistrationProfileContext): void {
        if (
            !ctx.open() ||
            ctx.mode() !== 'create' ||
            ctx.structureProfileLookupStatus() !== 'success' ||
            ctx.assignedSystemProfiles().some((profile) =>
                profile.origin === ctx.activeProfileOrigin() &&
                ctx.isSiauSystem(profile.system, profile.systemLabel),
            )
        ) {
            return;
        }

        const systemOption = ctx.systemOptions().find((option) =>
            ctx.isSiauSystem(option.value, option.label),
        );
        if (!systemOption) {
            return;
        }

        const system = systemOption.value || systemOption.label;
        const options = ctx.findStructureRoleOptionsForSystem(system);
        const userRole = options.find((option) =>
            this.formRules.normalizeText(option.label) === 'usuario' ||
            this.formRules.normalizeText(option.value) === 'usuario',
        );
        if (!userRole) {
            return;
        }

        ctx.assignedSystemProfiles.update((current) => [
            ...current,
            {
                id: `${ctx.activeProfileOrigin()}-${system}-${userRole.value}-default`,
                system,
                systemLabel: systemOption.label,
                role: userRole.value,
                roleLabel: userRole.label,
                origin: ctx.activeProfileOrigin(),
            },
        ]);
    }

    private profilesForOrigin(
        origin: ProfileOrigin,
        ctx: UserRegistrationProfileContext,
    ): readonly AssignedSystemProfile[] {
        return ctx.assignedSystemProfiles().filter((profile) => profile.origin === origin);
    }

    private setCarouselIndex(
        origin: ProfileOrigin,
        index: number,
        ctx: UserRegistrationProfileContext,
    ): void {
        const nextIndex = Math.max(index, 0);
        if (origin === 'comision') {
            ctx.commissionProfileCarouselIndex.set(nextIndex);
            return;
        }
        ctx.assignmentProfileCarouselIndex.set(nextIndex);
    }

    normalizeCarouselIndexes(ctx: UserRegistrationProfileContext): void {
        this.setCarouselIndex('adscripcion', this.getCarouselIndex('adscripcion', ctx), ctx);
        this.setCarouselIndex('comision', this.getCarouselIndex('comision', ctx), ctx);
    }
}
