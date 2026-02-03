
import { JsonValue, JsonPath } from './store';
import { i18n, detectLanguage } from '../i18n';

interface RenderOptions {
    onNodeClick?: (e: MouseEvent, path: JsonPath, isContainer: boolean) => void;
    onContextMenu?: (e: MouseEvent, path: JsonPath) => void;
}

export class TreeRenderer {
    private container: HTMLElement;
    private options: RenderOptions;
    private t = i18n[detectLanguage()];

    constructor(container: HTMLElement, options: RenderOptions = {}) {
        this.container = container;
        this.options = options;
    }

    updateLanguage() {
        this.t = i18n[detectLanguage()];
    }

    render(data: JsonValue | null) {
        this.container.innerHTML = '';
        if (!data && data !== 0 && data !== false && data !== '') {
            this.renderEmptyState();
            return;
        }

        const root = this.createBranch('ROOT', data!, 0, []);
        this.container.appendChild(root);
    }

    private renderEmptyState() {
        this.container.innerHTML = `
      <div class="empty-placeholder">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.3">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="16"></line>
          <line x1="8" y1="12" x2="16" y2="12"></line>
        </svg>
        <p>${this.t.emptyPlaceholder}</p>
      </div>`;
    }

    private createBranch(key: string | number, value: JsonValue, depth: number, path: JsonPath): HTMLDivElement {
        const branch = document.createElement('div');
        branch.className = 'tree-branch';
        if (depth > 0) branch.classList.add('child-branch');

        // Node Wrapper
        const nodeWrapper = document.createElement('div');
        nodeWrapper.className = 'node-wrapper';

        const nodeContent = document.createElement('div');
        nodeContent.className = `node-content depth-${depth % 7}`;

        // Helper to determine type
        const isObj = value !== null && typeof value === 'object';
        const isArray = Array.isArray(value);
        const count = isObj ? (isArray ? value.length : Object.keys(value).length) : 0;

        // Key
        const keySpan = document.createElement('span');
        keySpan.className = 'key-text';
        keySpan.textContent = String(key || 'Root');
        nodeContent.appendChild(keySpan);

        // Value
        if (!isObj) {
            this.renderPrimitiveValue(nodeContent, value);
            this.bindEvents(nodeContent, path, false);
        } else {
            this.renderContainerInfo(nodeContent, count);
            this.bindEvents(nodeContent, path, true);
        }

        nodeWrapper.appendChild(nodeContent);
        branch.appendChild(nodeWrapper);

        // Children
        if (isObj && count > 0) {
            branch.classList.add('has-children');
            const childrenBlock = this.renderChildren(value, depth, path);

            // Expand/Collapse logic
            let expanded = true;
            nodeContent.addEventListener('click', (e) => {
                if (e.altKey) return; // Let context menu handle it
                expanded = !expanded;
                childrenBlock.style.display = expanded ? 'flex' : 'none';
                nodeContent.classList.toggle('node-collapsed', !expanded);
                const icon = nodeContent.querySelector('.icon-expand');
                if (icon) icon.textContent = expanded ? '▼' : '▶';
            });

            branch.appendChild(childrenBlock);
        }

        return branch;
    }

    private renderPrimitiveValue(container: HTMLElement, value: JsonValue) {
        let valStr = String(value);
        if (valStr.length > 30) valStr = valStr.substring(0, 30) + '...';

        let typeClass = value === null ? 'type-null' : `type-${typeof value}`;

        const valSpan = document.createElement('span');
        valSpan.className = `val-text ${typeClass}`;
        valSpan.textContent = `: ${valStr}`;
        container.appendChild(valSpan);
    }

    private renderContainerInfo(container: HTMLElement, count: number) {
        const infoSpan = document.createElement('span');
        infoSpan.style.marginLeft = '5px';
        infoSpan.style.fontSize = '11px';
        infoSpan.textContent = `(${count})`;
        container.appendChild(infoSpan);

        if (count > 0) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'icon-expand';
            iconSpan.textContent = '▼';
            container.appendChild(iconSpan);
        }
    }

    private renderChildren(value: JsonValue, depth: number, path: JsonPath): HTMLElement {
        const childrenBlock = document.createElement('div');
        childrenBlock.className = 'children-container';

        const isArray = Array.isArray(value);
        const keys = isArray
            ? (value as JsonValue[]).map((_, i) => i)
            : Object.keys(value as Record<string, JsonValue>);

        keys.forEach(k => {
            const childPath = [...path, k];
            const childVal = (value as any)[k];
            childrenBlock.appendChild(this.createBranch(k, childVal, depth + 1, childPath));
        });

        return childrenBlock;
    }

    private bindEvents(element: HTMLElement, path: JsonPath, isContainer: boolean) {
        // Right Click for Context Menu
        element.addEventListener('contextmenu', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.options.onContextMenu?.(e, path);
        });

        // Alt+Click (Keep as backup)
        element.addEventListener('click', (e) => {
            if (e.altKey) {
                e.stopPropagation();
                e.preventDefault();
                this.options.onContextMenu?.(e, path);
            }
        });

        // Mobile Long Press
        let timer: any;
        const start = (e: TouchEvent) => {
            timer = setTimeout(() => {
                const touch = e.touches[0];
                // Create a synthetic mouse event for consistency
                const mouseEvent = new MouseEvent('contextmenu', {
                    clientX: touch.clientX,
                    clientY: touch.clientY
                });
                this.options.onContextMenu?.(mouseEvent, path);
            }, 500);
        };
        const end = () => clearTimeout(timer);

        element.addEventListener('touchstart', start, { passive: false });
        element.addEventListener('touchend', end);
        element.addEventListener('touchmove', end);
    }

    toggleAll(expand: boolean) {
        const containers = document.querySelectorAll('.children-container') as NodeListOf<HTMLElement>;
        const nodeContents = document.querySelectorAll('.node-content') as NodeListOf<HTMLElement>;
        const icons = document.querySelectorAll('.icon-expand') as NodeListOf<HTMLElement>;

        containers.forEach(c => c.style.display = expand ? 'flex' : 'none');
        nodeContents.forEach(n => {
            if (expand) n.classList.remove('node-collapsed');
            else if (n.closest('.has-children')) n.classList.add('node-collapsed');
        });
        icons.forEach(i => i.textContent = expand ? '▼' : '▶');
    }
}
