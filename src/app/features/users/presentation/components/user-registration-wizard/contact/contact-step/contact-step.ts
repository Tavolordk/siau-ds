import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauInput } from '../../../../../../../shared/ui/index';
import { SiauLucideIcon } from '../../../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserRegistrationTemplateContext } from '../../view/user-registration-template.context';

@Component({
    selector: 'app-user-registration-contact-step',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauInput, SiauLucideIcon],
    host: { style: 'display: contents' },
    templateUrl: './contact-step.html',
})
export class ContactStep extends UserRegistrationTemplateContext {}
