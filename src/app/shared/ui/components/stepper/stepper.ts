import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Single step definition. Pure data — the stepper component decides
 * how to render each state based on this + the active index.
 */
export interface SiauStep {
    /** Unique identifier of the step. Used as the click event payload. */
    readonly id: string;
    /** Visible name (e.g. "Datos Personales"). */
    readonly label: string;
    /** Material icon name rendered next to the label. */
    readonly icon: string;
    /** When true, the step is marked as completed regardless of position. */
    readonly completed?: boolean;
    /** When true, the user cannot navigate to this step. */
    readonly disabled?: boolean;
}

/**
 * Visual state derived for each step at render time.
 * Not part of the public input API — computed internally.
 */
type StepState = 'pending' | 'active' | 'completed' | 'disabled';

/**
 * SIAU Stepper — vertical navigator for multi-step wizards.
 *
 * Visible in the user registration wizard (pantallas 005-011). Shows:
 *   - The list of steps with icons and labels
 *   - The currently active step highlighted
 *   - Completed steps marked with a checkmark
 *   - A progress bar at the bottom (current / total)
 *
 * The stepper is "controlled": the parent owns the active step index
 * and the list of completed steps. The stepper only emits clicks; the
 * parent decides whether to navigate.
 *
 * @example
 *   <siau-stepper
 *     [steps]="wizardSteps"
 *     [activeIndex]="currentStep()"
 *     (stepClick)="goToStep($event)"
 *   />
 */
@Component({
    selector: 'siau-stepper',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [MatIconModule],
    templateUrl: './stepper.html',
    styleUrl: './stepper.scss',
})
export class SiauStepper {
    readonly steps = input.required<readonly SiauStep[]>();
    readonly activeIndex = input<number>(0);

    /** Section title rendered above the steps (e.g. "SECCIONES"). */
    readonly title = input<string>('Secciones');

    /** Progress label rendered at the bottom (e.g. "PROGRESO"). */
    readonly progressLabel = input<string>('Progreso');

    /** When false, users cannot click steps to navigate — they're display-only. */
    readonly navigable = input<boolean>(true);

    readonly stepClick = output<string>();

    /** Number of completed steps, derived from the steps array. */
    protected readonly completedCount = computed(() => {
        return this.steps().filter((s) => s.completed === true).length;
    });

    /** Current progress as a 0-100 percentage. */
    protected readonly progressPercent = computed(() => {
        const total = this.steps().length;
        if (total === 0) return 0;
        return Math.round((this.completedCount() / total) * 100);
    });

    /** Computes the visual state of a step given its index. */
    protected stateOf(index: number): StepState {
        const step = this.steps()[index];
        if (!step) return 'pending';
        if (step.disabled) return 'disabled';
        if (step.completed) return 'completed';
        if (index === this.activeIndex()) return 'active';
        return 'pending';
    }

    protected stepClasses(index: number): string {
        return `siau-stepper__step siau-stepper__step--${this.stateOf(index)}`;
    }

    protected onStepClick(step: SiauStep): void {
        if (!this.navigable() || step.disabled) return;
        this.stepClick.emit(step.id);
    }
}