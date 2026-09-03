import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SiauLucideIcon } from '../../../../../../../shared/ui/components/lucide-icon/lucide-icon';
import { UserManagementTemplateContext } from '../../view/user-management-template.context';

@Component({
    selector: 'app-user-management-filter-workspace',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [SiauLucideIcon],
    host: { style: 'display: contents' },
    templateUrl: './filter-workspace.html',
})
export class FilterWorkspace extends UserManagementTemplateContext {}
