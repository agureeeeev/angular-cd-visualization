import {
  Component,
  inject,
  output,
  untracked,
} from '@angular/core';
import { CdStrategy, CdTrackerService, EventTrigger } from '@cd-viz/data-access';
import { TuiButton } from '@taiga-ui/core';

const TRIGGER_ICON: Record<string, string> = {
  dom: '🖱',
  promise: '⏳',
  signal: '⚡',
  render: '🔄',
  bootstrap: '🚀',
};

const TRIGGER_COLOR: Record<EventTrigger, string> = {
  dom: '#3b82f6',
  promise: '#f59e0b',
  signal: '#22c55e',
  render: '#64748b',
  bootstrap: '#ec4899',
};

/**
 * `ControlPanelComponent` — дашборд на Taiga UI для управления CD-демо.
 */
@Component({
  selector: 'cd-control-panel',
  standalone: true,
  imports: [TuiButton],
  templateUrl: './control-panel.component.html',
  styleUrl: './control-panel.component.scss',
})
export class ControlPanelComponent {
  protected readonly tracker = inject(CdTrackerService);

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

  protected trackRender(): string {
    if (!this.tracker.startTrackingNode('panel')) return '';
    const cycleTrigger = this.tracker.currentTrigger;
    const trigger = cycleTrigger === 'bootstrap' ? 'bootstrap' : 'render';

    Promise.resolve().then(() => {
      untracked(() => {
        this.tracker.push({
          nodeId: 'panel',
          label: 'ControlPanel',
          strategy: 'Default',
          trigger,
        });
      });
    });
    return '';
  }

  protected clearHistory(): void {
    this.tracker.clear();
  }

  protected async copyQueue(): Promise<void> {
    const events = this.tracker.events();
    if (events.length === 0) return;

    // Копируем ID узлов в буфер обмена
    const text = events.map(e => e.nodeId).join('\n');

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback if clipboard API is unavailable
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('Failed to copy', err);
    }
  }
}
