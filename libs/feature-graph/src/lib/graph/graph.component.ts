import {
    ChangeDetectionStrategy,
    Component,
    OnDestroy,
    afterNextRender,
    effect,
    inject,
    signal,
    viewChild,
    ElementRef,
} from '@angular/core';
import cytoscape, { Core, NodeDefinition, EdgeDefinition, StylesheetStyle } from 'cytoscape';
import { CdEvent, CdStrategy, CdTrackerService } from '@cd-viz/data-access';

// ─── Статическое определение графа ───────────────────────────────────────────

const INITIAL_NODES: NodeDefinition[] = [
    { data: { id: 'app', label: 'AppComponent', strategy: 'Default' } },
    { data: { id: 'graph', label: 'GraphComponent', strategy: 'Default' } },
    { data: { id: 'panel', label: 'ControlPanel', strategy: 'Default' } },
    { data: { id: 'node-a', label: 'CdNode A', strategy: 'Default' } },
    { data: { id: 'node-b', label: 'CdNode B', strategy: 'OnPush' } },
    { data: { id: 'node-c', label: 'CdNode C', strategy: 'Default' } },
];

const INITIAL_EDGES: EdgeDefinition[] = [
    { data: { id: 'e1', source: 'app', target: 'graph' } },
    { data: { id: 'e2', source: 'app', target: 'panel' } },
    { data: { id: 'e3', source: 'graph', target: 'node-a' } },
    { data: { id: 'e4', source: 'graph', target: 'node-b' } },
    { data: { id: 'e5', source: 'graph', target: 'node-c' } },
];

const CY_STYLES: StylesheetStyle[] = [
    {
        selector: 'node',
        style: {
            'background-color': '#3b82f6',
            'border-width': 2,
            'border-color': '#1d4ed8',
            label: 'data(label)',
            color: '#fff',
            'font-size': '11px',
            'font-family': 'Roboto, sans-serif',
            'text-valign': 'center',
            'text-halign': 'center',
            width: 130,
            height: 44,
            shape: 'round-rectangle',
        },
    },
    {
        // Ноды с OnPush отображаются другим цветом в состоянии покоя
        selector: 'node[strategy = "OnPush"]',
        style: { 'background-color': '#7c3aed', 'border-color': '#5b21b6' },
    },
    {
        selector: 'node.highlighted',
        style: {
            'background-color': '#22c55e',
            'border-color': '#15803d',
            'transition-property': 'background-color, border-color',
            'transition-duration': '200ms',
        } as Record<string, unknown>,
    },
    {
        selector: 'node.stale',
        style: {
            'background-color': '#ef4444',
            'border-color': '#b91c1c',
            'transition-property': 'background-color, border-color',
            'transition-duration': '200ms',
        } as Record<string, unknown>,
    },
    {
        selector: 'edge',
        style: {
            width: 2,
            'line-color': '#475569',
            'target-arrow-color': '#475569',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
        },
    },
];

// ─── Компонент ───────────────────────────────────────────────────────────────

/**
 * `GraphComponent` — тонкая Angular-обёртка над экземпляром Cytoscape.js.
 *
 * Жизненный цикл:
 * 1. `afterNextRender` → инициализирует Cytoscape после первого рендера в DOM.
 * 2. `effect()` реагирует на `CdTrackerService.lastEvent` → вызывает `highlightNode`.
 *
 * Всё взаимодействие с DOM происходит через API Cytoscape, поэтому компонент
 * никогда не касается конвейера рендеринга Angular после первой отрисовки.
 */
@Component({
    selector: 'cd-graph',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './graph.component.html',
    styleUrl: './graph.component.scss',
})
export class GraphComponent implements OnDestroy {
    private readonly tracker = inject(CdTrackerService);
    private cy: Core | null = null;
    private readonly flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

    /** Ссылка на шаблонный элемент — точка монтирования Cytoscape */
    readonly cyContainer = viewChild.required<ElementRef<HTMLDivElement>>('cyContainer');

    /** Флаг: был ли Cytoscape уже инициализирован */
    readonly ready = signal(false);

    constructor() {
        // Инициализируем Cytoscape после первого рендера (только в браузере)
        afterNextRender(() => {
            this.initCytoscape();
        });

        // Реагируем на каждый новый CD-евент и подсвечиваем соответствующую ноду
        effect(() => {
            const event = this.tracker.lastEvent();
            if (event && this.ready()) {
                this.highlightNode(event);
            }
        });
    }

    // ── Публичное API (вызывается родителем / тестами) ───────────────────────────

    /** Обновляет метку стратегии на ноде и переприменяет визуальные классы */
    setNodeStrategy(nodeId: string, strategy: CdStrategy): void {
        if (!this.cy) return;
        const node = this.cy.$(`#${nodeId}`);
        node.data('strategy', strategy);
        if (strategy === 'OnPush') {
            node.addClass('onpush');
        } else {
            node.removeClass('onpush');
        }
    }

    // ── Приватные вспомогательные методы ─────────────────────────────────────────

    private initCytoscape(): void {
        this.cy = cytoscape({
            container: this.cyContainer().nativeElement,
            elements: {
                nodes: INITIAL_NODES,
                edges: INITIAL_EDGES,
            },
            style: CY_STYLES,
            layout: {
                name: 'breadthfirst',
                directed: true,
                roots: '#app',
                padding: 20,
                spacingFactor: 1.4,
            } as cytoscape.LayoutOptions,
            userZoomingEnabled: true,
            userPanningEnabled: true,
            minZoom: 0.4,
            maxZoom: 2.5,
        });

        this.ready.set(true);
    }

    private highlightNode(event: CdEvent): void {
        if (!this.cy) return;

        const node = this.cy.$(`#${event.nodeId}`);
        if (!node || node.length === 0) return;

        // Отменяем предыдущую подсветку, если она ещё не завершилась
        const existing = this.flashTimers.get(event.nodeId);
        if (existing) clearTimeout(existing);

        node.removeClass('stale').addClass('highlighted');

        const timer = setTimeout(() => {
            node.removeClass('highlighted').addClass('stale');

            // Плавное возвращение к базовому цвету после второй задержки
            const fadeTimer = setTimeout(() => {
                node.removeClass('stale');
                this.flashTimers.delete(event.nodeId);
            }, 600);

            this.flashTimers.set(`${event.nodeId}_fade`, fadeTimer);
        }, 800);

        this.flashTimers.set(event.nodeId, timer);
    }

    ngOnDestroy(): void {
        this.flashTimers.forEach(t => clearTimeout(t));
        this.cy?.destroy();
        this.cy = null;
    }
}
