import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauLucideIcon } from '../../../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserRegistrationTemplateContext } from '../user-registration-template.context';

@Component({
    selector: 'app-user-registration-wizard-sidebar',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauLucideIcon],
    host: { style: 'display: contents' },
    templateUrl: './wizard-sidebar.html',
})
export class WizardSidebar extends UserRegistrationTemplateContext {}
