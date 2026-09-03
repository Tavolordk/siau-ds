import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauInput, SiauSelect } from '../../../../../../../shared/ui/index';
import { SiauLucideIcon } from '../../../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserRegistrationTemplateContext } from '../../view/user-registration-template.context';

@Component({
    selector: 'app-user-registration-commission-step',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauInput, SiauSelect, SiauLucideIcon],
    host: { style: 'display: contents' },
    templateUrl: './commission-step.html',
})
export class CommissionStep extends UserRegistrationTemplateContext {}
