import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export interface SiauStep {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly completed?: boolean;
  readonly disabled?: boolean;
}

@Component({
  selector: 'siau-stepper',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stepper.html',
  styleUrl: './stepper.scss',
})
export class SiauStepper {
  readonly steps = input<readonly SiauStep[]>([]);
  readonly activeIndex = input<number>(0);

  readonly stepClick = output<string>();

  protected readonly completedCount = computed(() => {
    return this.steps().filter((step) => step.completed).length;
  });

  protected readonly progress = computed(() => {
    const total = this.steps().length;

    if (total === 0) {
      return 0;
    }

    return Math.round((this.completedCount() / total) * 100);
  });

  protected getStepState(index: number, step: SiauStep): string {
    if (step.disabled) {
      return 'disabled';
    }

    if (index === this.activeIndex()) {
      return 'active';
    }

    if (step.completed) {
      return 'completed';
    }

    return 'pending';
  }

  protected selectStep(step: SiauStep): void {
    if (!step.disabled) {
      this.stepClick.emit(step.id);
    }
  }
}