import {
  Component,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
  ElementRef,
  DestroyRef,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import G6, { Graph } from '@antv/g6';
import { CdEvent, CdStrategy, CdTrackerService } from '@cd-viz/data-access';

// ─── Статическое определение графа ───────────────────────────────────────────

const INITIAL_NODES = [
  { id: 'app', label: 'AppComponent', strategy: 'Default' },
  { id: 'graph1', label: 'GraphComponent 1', strategy: 'Default' },
  { id: 'graph2', label: 'GraphComponent 2', strategy: 'Default' },
  { id: 'panel', label: 'ControlPanel', strategy: 'Default' },
  { id: 'node-a', label: 'Node A', strategy: 'Default' },
  { id: 'node-a-1', label: 'Node A.1', strategy: 'Default' },
  { id: 'node-a-2', label: 'Node A.2', strategy: 'OnPush' },
  { id: 'node-b', label: 'Node B', strategy: 'OnPush' },
  { id: 'node-b-1', label: 'Node B.1', strategy: 'Default' },
  { id: 'node-b-1-1', label: 'Node B.1.1', strategy: 'Default' },
  { id: 'node-b-2', label: 'Node B.2', strategy: 'OnPush' },
  { id: 'node-b-2-1', label: 'Node B.2.1', strategy: 'Default' },
  { id: 'node-c', label: 'Node C', strategy: 'Default' },
  { id: 'node-c-1', label: 'Node C.1', strategy: 'OnPush' },
  { id: 'node-c-2', label: 'Node C.2', strategy: 'Default' },

  // Graph 2 Nodes
  { id: 'node2-a', label: 'Node 2.A', strategy: 'Default' },
  { id: 'node2-b', label: 'Node 2.B', strategy: 'OnPush' },
  { id: 'node2-c', label: 'Node 2.C', strategy: 'Default' },
];

const INITIAL_EDGES = [
  { source: 'app', target: 'graph1' },
  { source: 'app', target: 'graph2' },
  { source: 'app', target: 'panel' },
  { source: 'graph1', target: 'node-a' },
  { source: 'graph1', target: 'node-b' },
  { source: 'graph1', target: 'node-c' },
  { source: 'node-b', target: 'node-b-1' },
  { source: 'node-b', target: 'node-b-2' },
  { source: 'node-a', target: 'node-a-1' },
  { source: 'node-a', target: 'node-a-2' },
  { source: 'node-b-1', target: 'node-b-1-1' },
  { source: 'node-b-2', target: 'node-b-2-1' },
  { source: 'node-c', target: 'node-c-1' },
  { source: 'node-c', target: 'node-c-2' },

  { source: 'graph2', target: 'node2-a' },
  { source: 'graph2', target: 'node2-b' },
  { source: 'graph2', target: 'node2-c' },
];

/**
 * `GraphComponent` — тонкая Angular-обёртка над экземпляром G6.
 *
 * Жизненный цикл:
 * 1. `afterNextRender` → инициализирует G6 после первого рендера в DOM.
 * 2. `effect()` реагирует на `CdTrackerService.lastEvent` → вызывает `highlightNode`.
 *
 * Всё взаимодействие с DOM происходит через API G6, поэтому компонент
 * никогда не касается конвейера рендеринга Angular после первой отрисовки.
 */
@Component({
  selector: 'cd-graph',
  standalone: true,
  templateUrl: './graph.component.html',
  styleUrl: './graph.component.scss',
})
export class GraphComponent implements OnDestroy {
  private readonly tracker = inject(CdTrackerService);
  private readonly destroyRef = inject(DestroyRef);
  private graph: Graph | null = null;
  private readonly flashTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Ссылка на шаблонный элемент — точка монтирования G6 */
  readonly graphContainer = viewChild.required<ElementRef<HTMLDivElement>>('graphContainer');

  readonly ready = signal(false);

  constructor() {
    afterNextRender(() => {
      this.initGraph();
    });

    effect(() => {
      const event = this.tracker.lastEvent();
      if (event && this.ready()) {
        this.highlightNode(event);
      }
    });

    this.tracker.strategyChanges$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ nodeId, strategy }) => {
        this.setNodeStrategy(nodeId, strategy);
      });

    this.tracker.visibilityChanges$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ nodeId, isVisible }) => {
        this.setNodeVisibility(nodeId, isVisible);
      });
  }

  // ── Публичное API (вызывается родителем / тестами) ───────────────────────────

  setNodeStrategy(nodeId: string, strategy: CdStrategy): void {
    if (!this.graph) return;
    const item = this.graph.findById(nodeId);
    if (!item) return;

    this.graph.updateItem(item, { strategy });

    if (strategy === 'OnPush') {
      this.graph.setItemState(item, 'onpush', true);
    } else {
      this.graph.setItemState(item, 'onpush', false);
    }
  }

  setNodeVisibility(nodeId: string, isVisible: boolean): void {
    if (!this.graph) return;

    // Рекурсивно скрываем/показываем узел и всех его потомков
    const toggleNodeAndDescendants = (nId: string, visible: boolean) => {
      const item = this.graph?.findById(nId);
      if (!item || item.destroyed || item.getType() !== 'node') return;

      const node = item as any; // Type-cast to any to bypass TS Item interface constraints
      if (visible) {
        node.show();
        node.getEdges().forEach((e: any) => e.show());
      } else {
        node.hide();
        node.getEdges().forEach((e: any) => e.hide());
      }

      // Перебираем всех детей по исходящим рёбрам
      node.getOutEdges().forEach((edge: any) => {
        const targetId = edge.getTarget().getID();
        toggleNodeAndDescendants(targetId, visible);
      });
    };

    toggleNodeAndDescendants(nodeId, isVisible);

    // Перерисовываем лэйаут, если скрытие меняет дерево
    this.graph.layout();

    // Центрируем перед тем, как браузер физически отрисует новый кадр,
    // чтобы избежать визуального скачка длительностью 50мс
    requestAnimationFrame(() => {
      if (this.graph && !this.graph.destroyed) {
        this.graph.fitCenter();
      }
    });
  }

  resetLayout(): void {
    if (!this.graph) return;
    this.graph.layout(); // Повторно считает layout и возвращает ноды на свои места

    requestAnimationFrame(() => {
      if (this.graph && !this.graph.destroyed) {
        this.graph.fitCenter();
      }
    });
  }

  // ── Приватные вспомогательные методы ─────────────────────────────────────────

  private initGraph(): void {
    const container = this.graphContainer().nativeElement;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    this.graph = new G6.Graph({
      container: container,
      width,
      height,
      fitView: true,
      fitCenter: true,
      minZoom: 0.2,
      maxZoom: 2.5,
      modes: {
        default: ['drag-node'], // drag-node - перетаскивание узлов
      },
      layout: {
        type: 'dagre',
        rankdir: 'TB',
        nodesep: 10, // Отступы между узлами в одном уровне
        ranksep: 20, // Отступы между уровнями
        controlPoints: true,
      },
      defaultNode: {
        type: 'rect',
        size: [160, 52],
        anchorPoints: [
          [0.5, 0], // вход сверху
          [0.5, 1], // выход снизу
        ],
        style: {
          radius: 8,
          fill: '#3b82f6',
          stroke: '#1d4ed8',
          lineWidth: 2,
        },
        labelCfg: {
          style: {
            fill: '#fff',
            fontSize: 13,
            fontFamily: 'Roboto, sans-serif',
            fontWeight: 500,
          },
        },
      },
      defaultEdge: {
        type: 'polyline',
        style: {
          radius: 12,
          offset: 20,
          stroke: '#475569',
          lineWidth: 2,
          endArrow: {
            path: G6.Arrow.triangle(8, 10, 0),
            fill: '#475569',
            d: 0,
          },
        },
      },
      nodeStateStyles: {
        onpush: {
          fill: '#7c3aed',
          stroke: '#5b21b6',
        },
        highlighted: {
          fill: '#22c55e',
          stroke: '#15803d',
        },
        stale: {
          fill: '#ef4444',
          stroke: '#b91c1c',
        },
      },
    });

    const processedNodes = INITIAL_NODES.map((node) => ({ ...node }));

    this.graph.data({
      nodes: processedNodes,
      edges: INITIAL_EDGES,
    });

    this.graph.render();

    processedNodes.forEach((node) => {
      if (node.strategy === 'OnPush') {
        const item = this.graph!.findById(node.id);
        if (item) {
          this.graph!.setItemState(item, 'onpush', true);
        }
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.onResize);
    }

    this.ready.set(true);
  }

  private onResize = () => {
    if (!this.graph || !this.graphContainer) return;
    const container = this.graphContainer().nativeElement;
    this.graph.changeSize(container.clientWidth || 800, container.clientHeight || 600);
    this.graph.fitCenter();
  };

  private highlightNode(event: CdEvent): void {
    if (!this.graph) return;

    const item = this.graph.findById(event.nodeId);
    if (!item || item.destroyed) return;

    const existing = this.flashTimers.get(event.nodeId);
    if (existing) clearTimeout(existing);

    const fadeExisting = this.flashTimers.get(`${event.nodeId}_fade`);
    if (fadeExisting) clearTimeout(fadeExisting);

    this.graph.setItemState(item, 'stale', false);
    this.graph.setItemState(item, 'highlighted', true);

    const timer = setTimeout(() => {
      if (!this.graph) return;
      const currentItem = this.graph.findById(event.nodeId);
      if (!currentItem || currentItem.destroyed) return;

      this.graph.setItemState(currentItem, 'highlighted', false);
      this.graph.setItemState(currentItem, 'stale', true);

      const fadeTimer = setTimeout(() => {
        if (!this.graph) return;
        const fi = this.graph.findById(event.nodeId);
        if (!fi || fi.destroyed) return;

        this.graph.setItemState(fi, 'stale', false);
        this.flashTimers.delete(event.nodeId);
      }, 600);

      this.flashTimers.set(`${event.nodeId}_fade`, fadeTimer);
    }, 800);

    this.flashTimers.set(event.nodeId, timer);
  }

  ngOnDestroy(): void {
    this.flashTimers.forEach((t) => clearTimeout(t));
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.onResize);
    }
    this.graph?.destroy();
    this.graph = null;
  }

  protected trackRender(): string {
    if (!this.tracker.startTrackingNode('graph1')) return '';
    Promise.resolve().then(() => {
      untracked(() => {
        this.tracker.push({
          nodeId: 'graph1',
          label: 'GraphComponent 1',
          strategy: 'Default',
          trigger: 'render',
        });
      });
    });
    return '';
  }
}
