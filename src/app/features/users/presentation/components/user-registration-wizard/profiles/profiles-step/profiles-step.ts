import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauSelect } from '../../../../../../../shared/ui/index';
import { SiauLucideIcon } from '../../../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserRegistrationTemplateContext } from '../../view/user-registration-template.context';

@Component({
    selector: 'app-user-registration-profiles-step',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauSelect, SiauLucideIcon],
    host: { style: 'display: contents' },
    templateUrl: './profiles-step.html',
})
export class ProfilesStep extends UserRegistrationTemplateContext {}
