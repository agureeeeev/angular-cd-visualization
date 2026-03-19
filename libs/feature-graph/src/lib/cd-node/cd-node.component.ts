import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    inject,
    input,
    untracked,
} from '@angular/core';
import {CdStrategy, CdTrackerService, EventTrigger} from '@cd-viz/data-access';
import {TuiBadge} from '@taiga-ui/kit';

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
    imports: [TuiBadge],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './cd-node.component.html',
    styleUrl: './cd-node.component.scss',
})
export class CdNodeComponent {
    private readonly tracker = inject(CdTrackerService);
    private readonly cdr = inject(ChangeDetectorRef);

    // ── Входные данные ────────────────────────────────────────────────────────────
    readonly nodeId = input.required<string>();
    readonly label = input<string>('CD Node');
    readonly strategy = input<CdStrategy>('Default');

    // ── Внутреннее состояние ──────────────────────────────────────────────────────
    /** Временный маркер, чтобы передать причину рендера из `simulateTrigger` в `trackRender` */
    private _activeTrigger: EventTrigger | null = null;

    /**
     * Имитация триггера.
     * Вызывается вручную из ControlPanel (через AppComponent).
     */
    simulateTrigger(trigger: EventTrigger): void {
        const isSignal = trigger === 'signal';

        // Если компонент Default, он реагирует на любые события дерева.
        // Если компонент OnPush, он реагирует ТОЛЬКО если изменились его инпуты
        // или произошло событие, связанное с Сигналами (которые он читает).
        // Мы имитируем это поведение управляемо:
        if (this.strategy() === 'Default' || isSignal) {
            this._activeTrigger = trigger;
            this.cdr.markForCheck();
        }
        // Если это OnPush и триггер - DOM/Promise, мы НИЧЕГО не делаем.
        // Узел пропускает проверку, и trackRender() не сработает!
    }

    /**
     * Вызывается движком Angular каждый раз при проверке (Check) этого шаблона.
     * Возвращает пустую строку, чтобы не портить HTML.
     */
    protected trackRender(): string {
        // В zoneless Promise.resolve().then() НЕ инициирует CD-цикл (если не обновляются сигналы локального шаблона),
        // поэтому мы безопасно пушим лог асинхронно, избегая ошибки ExpressionChangedAfterItHasBeenCheckedError
        // и бесконечного цикла самовызова (Infinite Loop).
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
