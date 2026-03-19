import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component, computed,
  inject, signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TuiRoot, TuiButton } from '@taiga-ui/core';
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
  standalone: true,
  imports: [TuiRoot, TuiButton, GraphComponent, CdNodeComponent, ControlPanelComponent],
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
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
    this.tracker.startCycle(trigger);
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

  setGraph1Strategy(strategy: CdStrategy | 'Reset'): void {
    const nodes = [this.nodeA(), this.nodeB(), this.nodeC()];
    nodes.forEach(n => {
      if (strategy === 'Reset') n?.resetStrategyRecursive();
      else n?.setStrategyRecursive(strategy);
    });
  }

  setGraph2Strategy(strategy: CdStrategy | 'Reset'): void {
    const nodes = [this.node2A(), this.node2B(), this.node2C()];
    nodes.forEach(n => {
      if (strategy === 'Reset') n?.resetStrategyRecursive();
      else n?.setStrategyRecursive(strategy);
    });
  }

  protected trackRender(): string {
    if (!this.tracker.startTrackingNode('app')) return '';
    const cycleTrigger = this.tracker.currentTrigger;
    const trigger = cycleTrigger === 'bootstrap' ? 'bootstrap' : 'render';

    Promise.resolve().then(() => {
      untracked(() => {
        this.tracker.push({
          nodeId: 'app',
          label: 'AppComponent',
          strategy: 'Default',
          trigger,
        });
      });
    });

    return '';
  }

  protected trackGraph1(): string {
    if (!this.tracker.startTrackingNode('graph1')) return '';
    const cycleTrigger = this.tracker.currentTrigger;
    const trigger = cycleTrigger === 'bootstrap' ? 'bootstrap' : 'render';

    Promise.resolve().then(() => {
      untracked(() => {
        this.tracker.push({
          nodeId: 'graph1',
          label: 'GraphComponent 1',
          strategy: 'Default',
          trigger,
        });
      });
    });

    return '';
  }

  protected trackGraph2(): string {
    if (!this.tracker.startTrackingNode('graph2')) return '';
    const cycleTrigger = this.tracker.currentTrigger;
    const trigger = cycleTrigger === 'bootstrap' ? 'bootstrap' : 'render';

    Promise.resolve().then(() => {
      untracked(() => {
        this.tracker.push({
          nodeId: 'graph2',
          label: 'GraphComponent 2',
          strategy: 'Default',
          trigger,
        });
      });
    });

    return '';
  }

  protected evaluateGraph1Nodes(): string {
    const cycleTrigger = this.tracker.currentTrigger;
    const trigger = cycleTrigger === 'bootstrap' ? 'bootstrap' : 'render';
    [this.nodeA(), this.nodeB(), this.nodeC()].forEach(node => {
      if (node?.strategy() === 'Default' || cycleTrigger === 'bootstrap' || node?.isDirtySpine) {
        node.performSyncIvyTraversal(trigger);
      }
    });
    return '';
  }

  protected evaluateGraph2Nodes(): string {
    const cycleTrigger = this.tracker.currentTrigger;
    const trigger = cycleTrigger === 'bootstrap' ? 'bootstrap' : 'render';
    [this.node2A(), this.node2B(), this.node2C()].forEach(node => {
      if (node?.strategy() === 'Default' || cycleTrigger === 'bootstrap' || node?.isDirtySpine) {
        node.performSyncIvyTraversal(trigger);
      }
    });
    return '';
  }
}
