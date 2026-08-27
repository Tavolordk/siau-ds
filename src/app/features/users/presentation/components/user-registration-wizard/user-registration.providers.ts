import { Provider } from '@angular/core';
import { UserRegistrationCatalogCoordinator } from './user-registration-catalog.coordinator';
import { UserRegistrationContextFactory } from './user-registration-context.factory';
import { UserRegistrationDraftCoordinator } from './user-registration-draft.coordinator';
import { UserRegistrationDraftProfileService } from './user-registration-draft-profile.service';
import { UserRegistrationEditScopeController } from './user-registration-edit-scope.controller';
import { UserRegistrationFieldController } from './user-registration-field.controller';
import { UserRegistrationIdentityCoordinator } from './user-registration-identity.coordinator';
import { UserRegistrationLifecycleCoordinator } from './user-registration-lifecycle.coordinator';
import { UserRegistrationNavigationController } from './user-registration-navigation.controller';
import { UserRegistrationPresenter } from './user-registration.presenter';
import { UserRegistrationProfileController } from './user-registration-profile.controller';
import { UserRegistrationResetService } from './user-registration-reset.service';
import { UserRegistrationState } from './user-registration.state';
import { UserRegistrationStructureController } from './user-registration-structure.controller';
import { UserRegistrationViewFacade } from './user-registration-view.facade';

/** Dependencias de alcance local al modal de registro/edición. */
export const USER_REGISTRATION_PROVIDERS: readonly Provider[] = [
    UserRegistrationIdentityCoordinator,
    UserRegistrationState,
    UserRegistrationPresenter,
    UserRegistrationFieldController,
    UserRegistrationEditScopeController,
    UserRegistrationNavigationController,
    UserRegistrationResetService,
    UserRegistrationContextFactory,
    UserRegistrationCatalogCoordinator,
    UserRegistrationDraftProfileService,
    UserRegistrationDraftCoordinator,
    UserRegistrationProfileController,
    UserRegistrationStructureController,
    UserRegistrationLifecycleCoordinator,
    UserRegistrationViewFacade,
];
