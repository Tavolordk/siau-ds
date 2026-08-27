import { Provider } from '@angular/core';
import { UserRegistrationCatalogCoordinator } from '../catalogs/user-registration-catalog.coordinator';
import { UserRegistrationContextFactory } from '../factories/user-registration-context.factory';
import { UserRegistrationDraftCoordinator } from '../coordinators/user-registration-draft.coordinator';
import { UserRegistrationDraftProfileService } from '../services/user-registration-draft-profile.service';
import { UserRegistrationEditScopeController } from '../controllers/user-registration-edit-scope.controller';
import { UserRegistrationFieldController } from '../controllers/user-registration-field.controller';
import { UserRegistrationIdentityCoordinator } from '../coordinators/user-registration-identity.coordinator';
import { UserRegistrationLifecycleCoordinator } from '../coordinators/user-registration-lifecycle.coordinator';
import { UserRegistrationNavigationController } from '../controllers/user-registration-navigation.controller';
import { UserRegistrationPresenter } from '../presenters/user-registration.presenter';
import { UserRegistrationProfileController } from '../controllers/user-registration-profile.controller';
import { UserRegistrationResetService } from '../services/user-registration-reset.service';
import { UserRegistrationState } from '../state/user-registration.state';
import { UserRegistrationStructureController } from '../controllers/user-registration-structure.controller';
import { UserRegistrationViewFacade } from '../facades/user-registration-view.facade';

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
