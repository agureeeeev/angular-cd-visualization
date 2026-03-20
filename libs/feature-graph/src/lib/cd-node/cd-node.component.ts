import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  input,
  model,
  signal,
  untracked,
  contentChildren,
  forwardRef,
  OnInit,
} from '@angular/core';
import { CdStrategy, CdTrackerService, EventTrigger } from '@cd-viz/data-access';
import { TuiBadge } from '@taiga-ui/kit';
import { TuiButton } from '@taiga-ui/core';

/**
 * `CdNodeComponent` — подписанная нода-лист внутри демонстрационного дерева компонентов.
 *
 * Как работает демо:
 * Мы просто помещаем вызов `{{trackRender()}}` в шаблон.
 * Если Angular доходит до проверки (Check) этого компонента в ходе своего цикла Change Detection,
 * функция срабатывает. Она асинхронно отправляет событие в трекер.
 * Компоненты со стратегией OnPush просто пропустят проверку (и не вызовут функцию),
 * если их никто явно не пометил грязными.
 */
@Component({
  selector: 'cd-node',
  standalone: true,
  imports: [TuiBadge, TuiButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cd-node.component.html',
  styleUrl: './cd-node.component.scss',
})
export class CdNodeComponent implements OnInit {
  private readonly tracker = inject(CdTrackerService);
  private readonly cdr = inject(ChangeDetectorRef);

  // ── Входные данные ────────────────────────────────────────────────────────────
  readonly nodeId = input.required<string>();
  readonly label = input<string>('CD Node');
  readonly strategy = model<CdStrategy>('Default');

  // ── Внутреннее состояние ──────────────────────────────────────────────────────
  readonly children = contentChildren<CdNodeComponent>(forwardRef(() => CdNodeComponent));
  private readonly parentNode = inject(
    forwardRef(() => CdNodeComponent),
    { optional: true, skipSelf: true }
  );
  readonly isCollapsed = signal(false);

  private initialStrategy: CdStrategy | null = null;

  ngOnInit(): void {
    this.initialStrategy = this.strategy();
  }

  setStrategyRecursive(strategy: CdStrategy): void {
    this.strategy.set(strategy);
    this.tracker.notifyStrategyChange(this.nodeId(), strategy);
    this.children().forEach((child) => child.setStrategyRecursive(strategy));
  }

  resetStrategyRecursive(): void {
    if (this.initialStrategy) {
      this.strategy.set(this.initialStrategy);
      this.tracker.notifyStrategyChange(this.nodeId(), this.initialStrategy);
    }
    this.children().forEach((child) => child.resetStrategyRecursive());
  }

  toggleStrategy(): void {
    const newStrategy = this.strategy() === 'Default' ? 'OnPush' : 'Default';
    this.strategy.set(newStrategy);
    this.tracker.notifyStrategyChange(this.nodeId(), newStrategy);
  }

  toggleVisibility(): void {
    const collapsed = !this.isCollapsed();
    this.isCollapsed.set(collapsed);
    this.tracker.notifyVisibilityChange(this.nodeId(), !collapsed);
  }

  /** Временный маркер, чтобы передать причину рендера из `simulateTrigger` в `trackRender` */
  private _activeTrigger: EventTrigger | null = null;

  /** Флаг, имитирующий LView.FLAGS.Dirty для обхода OnPush сверху-вниз */
  get isDirtySpine(): boolean {
    return this._isDirtySpine;
  }
  private _isDirtySpine = false;

  /**
   * Эмулирует завершение асинхронной микротаски (например, HTTP-запрос).
   */
  triggerPromise(): void {
    Promise.resolve().then(() => {
      this.simulateTrigger('promise');
    });
  }

  /**
   * Имитация триггера.
   * Вызывается вручную из ControlPanel (через AppComponent) или из HTML шаблона.
   */
  simulateTrigger(trigger: EventTrigger, isOrigin = true): void {
    const isBootstrap = trigger === 'bootstrap';

    if (this.strategy() === 'Default' || isBootstrap || isOrigin || this._isDirtySpine) {
      this._activeTrigger = trigger;
      this._isDirtySpine = true; // Узел становится грязным, так как событие произошло внутри него

      if (isOrigin) {
        this.tracker.startCycle(trigger);
      }

      this.cdr.markForCheck();

      if (isOrigin && this.parentNode) {
        this.parentNode.markSpineDirty(trigger);
      }
    }
  }

  protected markSpineDirty(trigger: EventTrigger): void {
    this._activeTrigger = trigger;
    this._isDirtySpine = true;
    this.cdr.markForCheck();
    if (this.parentNode) {
      this.parentNode.markSpineDirty(trigger);
    }
  }

  performSyncIvyTraversal(trigger: EventTrigger): void {
    if (!this._activeTrigger || trigger === 'bootstrap') {
      this._activeTrigger = trigger;
    }
    this._isDirtySpine = false;

    if (this.tracker.isTrackingActive) {
      this.cdr.detectChanges();
    }
  }

  protected evaluateChildrenSync(): string {
    const cycleTrigger = this.tracker.currentTrigger;
    const downwardTrigger = cycleTrigger === 'bootstrap' ? 'bootstrap' : 'render';

    this.children().forEach((child) => {
      const isBootstrap = cycleTrigger === 'bootstrap';
      if (child.strategy() === 'Default' || isBootstrap || child.isDirtySpine) {
        child.performSyncIvyTraversal(downwardTrigger);
      }
    });
    return '';
  }

  /**
   * Вызывается движком Angular каждый раз при проверке (Check) этого шаблона.
   * Возвращает пустую строку, чтобы не портить HTML.
   */
  protected trackRender(): string {
    if (!this.tracker.startTrackingNode(this.nodeId())) return '';

    const trigger = this._activeTrigger ?? 'render';
    this._activeTrigger = null; // сбрасываем, чтобы следующий фоновый рендер (если будет) был 'render'

    Promise.resolve().then(() => {
      untracked(() => {
        this.tracker.push({
          nodeId: this.nodeId(),
          label: this.label(),
          strategy: this.strategy(),
          trigger,
        });
      });
    });

    return '';
  }
}
