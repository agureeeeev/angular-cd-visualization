import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component, computed,
  inject, signal,
  viewChild,
} from '@angular/core';
import { TuiRoot } from '@taiga-ui/core';
import { GraphComponent } from '@cd-viz/feature-graph';
import { CdNodeComponent } from '@cd-viz/feature-graph';
import { ControlPanelComponent } from '@cd-viz/ui-kit';
import { CdStrategy, CdTrackerService, EventTrigger } from '@cd-viz/data-access';

/**
 * Корневая оболочка приложения.
 *
 * Макет (две колонки):
 * ┌─────────────────────────────────┬──────────────────┐
 * │  Граф Cytoscape (левая ~68%)    │  Панель управл.  │
 * │  + карточки нод (снизу)         │  (правая ~32%)   │
 * └─────────────────────────────────┴──────────────────┘
 *
 * `< tui - root > ` обязан оборачивать всё приложение для работы темизации Taiga UI.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [TuiRoot, GraphComponent, CdNodeComponent, ControlPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  public strategyDynamic = signal<CdStrategy>('OnPush');
  public nodeBLabel = computed(() => `Node B — ${this.strategyDynamic()}`)

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly tracker = inject(CdTrackerService);

  /** Прямая ссылка на GraphComponent для обновления стратегии */
  private readonly graphRef = viewChild<GraphComponent>('graphRef');

  private readonly nodeA = viewChild<CdNodeComponent>('nodeA');
  private readonly nodeB = viewChild<CdNodeComponent>('nodeB');
  private readonly nodeC = viewChild<CdNodeComponent>('nodeC');

  private readonly node2A = viewChild<CdNodeComponent>('node2A');
  private readonly node2B = viewChild<CdNodeComponent>('node2B');
  private readonly node2C = viewChild<CdNodeComponent>('node2C');

  /** Вызывается ControlPanel; инициирует CD-цикл */
  onTriggerEvent(trigger: EventTrigger): void {
    this.nodeA()?.simulateTrigger(trigger);
    this.nodeB()?.simulateTrigger(trigger);
    this.nodeC()?.simulateTrigger(trigger);
    this.node2A()?.simulateTrigger(trigger);
    this.node2B()?.simulateTrigger(trigger);
    this.node2C()?.simulateTrigger(trigger);

    // В случае Promise, нужно сымитировать асинхронную задачу
    if (trigger === 'promise') {
      Promise.resolve().then(() => {
        this.nodeA()?.simulateTrigger(trigger);
        this.nodeB()?.simulateTrigger(trigger);
        this.nodeC()?.simulateTrigger(trigger);
        this.node2A()?.simulateTrigger(trigger);
        this.node2B()?.simulateTrigger(trigger);
        this.node2C()?.simulateTrigger(trigger);
      });
    }
  }

  /** Вызывается ControlPanel; обновляет стратегию на нодах графа */
  onStrategyChange(strategy: CdStrategy): void {
    const graph = this.graphRef();

    this.strategyDynamic.set(strategy);

    // Применяем визуально только к node-b (демо-нода с OnPush)
    graph?.setNodeStrategy('node-b', strategy);
    graph?.setNodeStrategy('node2-b', strategy);

    // Симулируем ре-рендер, чтобы показать что смена стратегии произошла
    this.nodeB()?.simulateTrigger('signal');
    this.node2B()?.simulateTrigger('signal');
  }
}
