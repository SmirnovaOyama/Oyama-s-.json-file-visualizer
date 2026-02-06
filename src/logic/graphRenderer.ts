
import { JsonValue, JsonPath } from './store';

// Interface definitions (kept to avoid breakages in other files if they import types)
interface GraphNode {
    id: string;
    key: string | number;
    value: JsonValue;
    path: JsonPath;
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
    children: GraphNode[];
    parent: GraphNode | null;
    expanded: boolean;
}

interface RenderOptions {
    onNodeClick?: (path: JsonPath, node: GraphNode) => void;
    onNodeContextMenu?: (e: MouseEvent, path: JsonPath, node: GraphNode, element: SVGGElement) => void;
}

export class GraphRenderer {
    private container: HTMLElement;

    constructor(container: HTMLElement, _options: RenderOptions = {}) {
        this.container = container;
    }

    render(_data: JsonValue | null) {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    toggleAll(_expand: boolean) {
        // Do nothing
    }

    zoomIn() {
        // Do nothing
    }

    zoomOut() {
        // Do nothing
    }

    resetView() {
        // Do nothing
    }

    getScale(): number {
        return 1;
    }

    enableInlineEditing(
        _path: JsonPath,
        _type: 'value' | 'key',
        _onSave: (newValue: string) => void
    ) {
        // Do nothing
    }

    getNodePath(_path: JsonPath): string {
        return "";
    }
}
