import {
    ChangeDetectionStrategy,
    Component,
    inject,
    output,
    signal,
} from '@angular/core';
import {CdStrategy, CdTrackerService, EventTrigger} from '@cd-viz/data-access';
import {TuiButton} from '@taiga-ui/core';
import {TuiBadgeNotification} from '@taiga-ui/kit';

const TRIGGER_ICON: Record<string, string> = {
    dom: '🖱',
    promise: '⏳',
    signal: '⚡',
    render: '🔄',
};

const TRIGGER_COLOR: Record<string, string> = {
    dom: '#3b82f6',
    promise: '#f59e0b',
    signal: '#22c55e',
    render: '#64748b',
};

/**
 * `ControlPanelComponent` — дашборд на Taiga UI для управления CD-демо.
 */
@Component({
    selector: 'cd-control-panel',
    standalone: true,
    imports: [TuiButton, TuiBadgeNotification],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './control-panel.component.html',
    styleUrl: './control-panel.component.scss',
})
export class ControlPanelComponent {
    protected readonly tracker = inject(CdTrackerService);

    readonly currentStrategy = signal<CdStrategy>('OnPush');
    readonly triggerEvent = output<EventTrigger>();
    readonly strategyChange = output<CdStrategy>();

    /** События в обратном порядке (новые сверху) */
    protected readonly reversedEvents = () =>
        [...this.tracker.visibleEvents()].reverse();

    protected triggerIcon(trigger: string): string {
        return TRIGGER_ICON[trigger] ?? '●';
    }

    protected triggerColor(trigger: string): string {
        return TRIGGER_COLOR[trigger] ?? '#64748b';
    }

    protected setStrategy(strategy: CdStrategy): void {
        if (this.currentStrategy() === strategy) return

        this.currentStrategy.set(strategy);
        this.strategyChange.emit(strategy);
    }

    protected clearHistory(): void {
        this.tracker.clear();
    }
}
