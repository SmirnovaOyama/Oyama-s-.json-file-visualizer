
import { JsonValue, JsonPath } from './store';
import { i18n, detectLanguage } from '../i18n';

interface RenderOptions {
    onNodeClick?: (e: MouseEvent, path: JsonPath, isContainer: boolean) => void;
    onNodeSelect?: (path: JsonPath, element: HTMLElement, data: JsonValue) => void;
    onContextMenu?: (e: MouseEvent, path: JsonPath, nodeElement: HTMLElement) => void;
    onMoveNode?: (from: JsonPath, to: JsonPath, pos: 'before' | 'after' | 'inside') => void;
}

export class TreeRenderer {
    private container: HTMLElement;
    private options: RenderOptions;
    private t = i18n[detectLanguage()];

    private collapsedPaths = new Set<string>();
    private matchedElements: HTMLElement[] = [];
    private currentMatchIndex: number = -1;

    constructor(container: HTMLElement, options: RenderOptions = {}) {
        this.container = container;
        this.options = options;
    }

    // ...

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
        keySpan.textContent = String(key || 'ROOT');
        nodeContent.appendChild(keySpan);

        // Value
        if (!isObj) {
            this.renderPrimitiveValue(nodeContent, key, value);
            this.bindEvents(nodeContent, path);

            // Single click: Select primitive node
            nodeContent.addEventListener('click', (e) => {
                if (e.altKey) return;
                if ((e.target as HTMLElement).isContentEditable) return;
                e.stopPropagation();

                // Clear previous selection
                this.container.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                nodeContent.classList.add('selected');

                // Trigger selection callback
                if (this.options.onNodeSelect) {
                    this.options.onNodeSelect(path, nodeContent, value);
                }
            });
        } else {
            this.renderContainerInfo(nodeContent, count, value);
            this.bindEvents(nodeContent, path);
        }

        // Set data-path for collapse state tracking
        nodeContent.setAttribute('data-path', JSON.stringify(path));

        nodeWrapper.appendChild(nodeContent);
        branch.appendChild(nodeWrapper);

        // Children
        if (isObj && count > 0) {
            branch.classList.add('has-children');
            const childrenBlock = this.renderChildren(value, depth, path);

            // Check persisted state
            const pathKey = JSON.stringify(path);
            if (this.collapsedPaths.has(pathKey)) {
                childrenBlock.classList.add('collapsed');
                nodeContent.classList.add('node-collapsed');
            }

            // Single click: Select node and show in detail panel
            nodeContent.addEventListener('click', (e) => {
                if (e.altKey) return;
                if ((e.target as HTMLElement).isContentEditable) return;
                e.stopPropagation();

                // Clear previous selection
                this.container.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                nodeContent.classList.add('selected');

                // Trigger selection callback
                if (this.options.onNodeSelect) {
                    this.options.onNodeSelect(path, nodeContent, value);
                }
            });

            // Double click: Expand/Collapse logic
            nodeContent.addEventListener('dblclick', (e) => {
                if (e.altKey) return;
                if ((e.target as HTMLElement).isContentEditable) return;
                e.stopPropagation();

                const isCollapsed = childrenBlock.classList.contains('collapsed');

                if (isCollapsed) {
                    childrenBlock.classList.remove('collapsed');
                    nodeContent.classList.remove('node-collapsed');
                    this.collapsedPaths.delete(pathKey);
                } else {
                    childrenBlock.classList.add('collapsed');
                    nodeContent.classList.add('node-collapsed');
                    this.collapsedPaths.add(pathKey);
                }

                // Icon update logic
                const icon = nodeContent.querySelector('.icon-expand');
                if (icon && !document.querySelector('.traditional-mode')) {
                    icon.textContent = isCollapsed ? '▼' : '▶';
                }
            });

            branch.appendChild(childrenBlock);
        }

        return branch;
    }

    private renderPrimitiveValue(container: HTMLElement, key: string | number, value: JsonValue) {
        let valStr = String(value);

        // Store full value for editing
        const fullValue = valStr;

        // Truncate for display
        if (valStr.length > 120) valStr = valStr.substring(0, 120) + '...';

        let typeClass = value === null ? 'type-null' : `type-${typeof value}`;

        // Separator
        const separator = document.createElement('span');
        separator.className = 'separator';
        separator.textContent = ': ';
        separator.style.opacity = '0.6';
        separator.style.marginRight = '4px';
        container.appendChild(separator);

        const valSpan = document.createElement('span');
        valSpan.className = `val-text ${typeClass}`;
        valSpan.textContent = valStr;
        valSpan.dataset.fullValue = fullValue; // Store full value
        container.appendChild(valSpan);

        // Smart Enhancements (Time, Color, Link)
        this.renderSmartBadges(container, key, value);
    }

    private renderSmartBadges(container: HTMLElement, key: string | number, value: JsonValue) {
        if (typeof value !== 'string' && typeof value !== 'number') return;

        // Color Preview in Search Results
        const colorRegex = /^(#([0-9A-F]{3,4}){1,2}|(rgb|hsl)a?\(.*?\))$/i;
        if (typeof value === 'string' && colorRegex.test(value.trim())) {
            const colorBadge = document.createElement('span');
            colorBadge.className = 'color-preview';
            colorBadge.style.backgroundColor = value.trim();
            colorBadge.title = `Color: ${value}`;
            container.appendChild(colorBadge);
            return;
        }

        // 2. Time Recognition
        const kStr = String(key).toLowerCase();
        const isTimeKey = kStr.includes('time') || kStr.includes('date') || kStr.includes('at') || kStr.includes('on') || kStr === 'start' || kStr === 'end';

        let dateStr = '';

        if (typeof value === 'number' && isTimeKey) {
            // Unix Timestamp?
            if (value > 631152000 && value < 4102444800) {
                dateStr = new Date(value * 1000).toLocaleString();
            } else if (value > 631152000000 && value < 4102444800000) {
                dateStr = new Date(value).toLocaleString();
            } else if (value > 260000 && value < 800000) {
                // Hours from epoch (rare but possible in some systems)
                dateStr = new Date(value * 3600 * 1000).toLocaleString();
            }
        } else if (typeof value === 'string') {
            // ISO Date? 2023-01-01T...
            if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
                const d = new Date(value);
                if (!isNaN(d.getTime())) dateStr = d.toLocaleString();
            }
        }

        if (dateStr) {
            const badge = document.createElement('span');
            badge.className = 'smart-badge time-badge';
            badge.style.display = 'inline-flex';
            badge.style.alignItems = 'center';
            badge.style.marginLeft = '8px';
            badge.style.fontSize = '11px';
            badge.style.color = '#888';
            badge.style.background = 'rgba(0,0,0,0.05)';
            badge.style.padding = '1px 5px';
            badge.style.borderRadius = '4px';
            badge.style.userSelect = 'none';

            // Icon
            const iconSvg = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:3px"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
            badge.innerHTML = `${iconSvg} ${dateStr}`;

            container.appendChild(badge);
        }
    }

    private renderContainerInfo(container: HTMLElement, count: number, value?: JsonValue) {
        const separator = document.createElement('span');
        separator.className = 'separator';
        separator.textContent = ': ';
        separator.style.opacity = '0.6';
        separator.style.marginRight = '4px';
        container.appendChild(separator);

        const span = document.createElement('span');
        span.className = 'info-span';
        span.textContent = `(${count})`;

        // --- Sparkline Logic ---
        if (Array.isArray(value) && value.length > 2 && count > 2) {
            // Check if all are numbers
            const nums = value as any[];
            // Only check first 10 items for performance
            const checkLimit = Math.min(nums.length, 10);
            let allNumbers = true;
            for (let i = 0; i < checkLimit; i++) {
                if (typeof nums[i] !== 'number') { allNumbers = false; break; }
            }

            if (allNumbers) {
                const numData = nums as number[];
                // Generate Sparkline SVG
                const width = 60;
                const height = 14;
                const min = Math.min(...numData);
                const max = Math.max(...numData);
                const range = max - min || 1;

                // Limit points for performance
                const points = numData.length > 30
                    ? numData.filter((_, i) => i % Math.ceil(numData.length / 30) === 0)
                    : numData;

                const step = width / (Math.max(points.length - 1, 1));

                const pathData = points.map((n, i) => {
                    const x = i * step;
                    const y = height - ((n - min) / range) * height; // Invert Y
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                }).join(' ');

                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', String(width));
                svg.setAttribute('height', String(height));
                svg.setAttribute('class', 'sparkline');
                svg.style.marginLeft = '8px';
                svg.style.verticalAlign = 'middle';
                svg.style.opacity = '0.7';

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', pathData);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', '#0969da'); // GitHub Blue
                path.setAttribute('stroke-width', '1.5');
                path.setAttribute('stroke-linejoin', 'round');

                svg.appendChild(path);
                span.appendChild(svg);
            }
        }

        container.appendChild(span);

        // Icon
        if (count > 0) {
            const icon = document.createElement('span');
            icon.className = 'icon-expand';
            icon.textContent = '▼';
            container.appendChild(icon);
        }
    }

    private renderChildren(value: JsonValue, depth: number, path: JsonPath): HTMLElement {
        const childrenBlock = document.createElement('div');
        childrenBlock.className = 'children-container';

        // Wrap content for grid animation
        const innerBlock = document.createElement('div');
        innerBlock.className = 'children-inner';

        const isArray = Array.isArray(value);

        // Render ALL arrays as compact list cards (like groups)
        if (isArray && (value as JsonValue[]).length > 0) {
            // Render as a compact array list card
            const listCard = this.renderArrayListCard(value as JsonValue[], depth, path);
            innerBlock.appendChild(listCard);
        } else {
            // Normal rendering for objects
            const keys = isArray
                ? (value as JsonValue[]).map((_, i) => i)
                : Object.keys(value as Record<string, JsonValue>);

            keys.forEach(k => {
                const childPath = [...path, k];
                const childVal = (value as any)[k];
                innerBlock.appendChild(this.createBranch(k, childVal, depth + 1, childPath));
            });
        }

        childrenBlock.appendChild(innerBlock);
        return childrenBlock;
    }

    // Render array as a compact list card (like groups)
    private renderArrayListCard(items: JsonValue[], depth: number, path: JsonPath): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'tree-branch';

        const nodeWrapper = document.createElement('div');
        nodeWrapper.className = 'node-wrapper';

        const listCard = document.createElement('div');
        listCard.className = `array-list-card depth-${depth % 7}`;

        items.forEach((item, index) => {
            const childPath = [...path, index];
            const isObject = item !== null && typeof item === 'object' && !Array.isArray(item);
            const isArray = Array.isArray(item);
            const isPrimitive = !isObject && !isArray;

            const rowWrapper = document.createElement('div');
            rowWrapper.className = 'array-list-row-wrapper';

            const row = document.createElement('div');
            row.className = `array-list-row depth-${depth % 7}`;
            row.dataset.index = String(index);

            // Index number
            const indexSpan = document.createElement('span');
            indexSpan.className = 'array-list-index';
            indexSpan.textContent = String(index);
            row.appendChild(indexSpan);

            // Separator (subtle colon)
            const separator = document.createElement('span');
            separator.className = 'separator';
            separator.textContent = ':';
            separator.style.opacity = '0.4';
            row.appendChild(separator);

            // Info or value based on type
            const infoSpan = document.createElement('span');
            if (isObject) {
                const itemCount = Object.keys(item as Record<string, JsonValue>).length;
                infoSpan.className = 'array-list-info';
                infoSpan.textContent = `{${itemCount}}`;
            } else if (isArray) {
                infoSpan.className = 'array-list-info';
                infoSpan.textContent = `[${(item as JsonValue[]).length}]`;
            } else {
                // Primitive value - display inline
                infoSpan.className = `array-list-value ${this.getTypeClass(item)}`;
                const valStr = String(item);
                infoSpan.textContent = valStr.length > 30 ? valStr.substring(0, 30) + '...' : valStr;
                infoSpan.dataset.fullValue = valStr;
                this.renderSmartBadges(row, index, item);
            }
            row.appendChild(infoSpan);

            // Expand indicator (only for objects/arrays)
            if (!isPrimitive) {
                const indicator = document.createElement('span');
                indicator.className = 'array-list-indicator';
                row.appendChild(indicator);
            }

            // Bind context menu
            this.bindEvents(row, childPath);

            // Single click selection for primitive items
            if (isPrimitive) {
                row.addEventListener('click', (e) => {
                    if (e.altKey) return;
                    e.stopPropagation();

                    // Clear previous selection
                    this.container.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                    row.classList.add('selected');

                    // Trigger selection callback
                    if (this.options.onNodeSelect) {
                        this.options.onNodeSelect(childPath, row, item);
                    }
                });
            }

            rowWrapper.appendChild(row);

            // Children container for objects/arrays
            if (!isPrimitive) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'array-list-children children-container';

                const childInner = document.createElement('div');
                childInner.className = 'children-inner';

                if (isObject) {
                    // Create a table card for the object
                    const tableCard = this.createTableCard(item as Record<string, JsonValue>, depth + 1, childPath);
                    childInner.appendChild(tableCard);
                } else if (isArray) {
                    // Nested array - render as another list card
                    const nestedListCard = this.renderArrayListCard(item as JsonValue[], depth + 1, childPath);
                    childInner.appendChild(nestedListCard);
                }

                childrenContainer.appendChild(childInner);

                // Check if collapsed - default to EXPANDED for array items
                const pathKey = JSON.stringify(childPath);
                const shouldCollapse = this.collapsedPaths.has(pathKey);
                if (shouldCollapse) {
                    childrenContainer.classList.add('collapsed');
                    row.classList.add('node-collapsed');
                } else {
                    row.classList.add('is-expanded');
                }

                // Single click: Select row and show in detail panel
                row.addEventListener('click', (e) => {
                    if (e.altKey) return;
                    e.stopPropagation();

                    // Clear previous selection
                    this.container.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                    row.classList.add('selected');

                    // Trigger selection callback
                    if (this.options.onNodeSelect) {
                        this.options.onNodeSelect(childPath, row, item);
                    }
                });

                // Double click: Toggle expand/collapse
                row.addEventListener('dblclick', (e) => {
                    if (e.altKey) return;
                    e.stopPropagation();

                    const isCollapsed = childrenContainer.classList.contains('collapsed');

                    if (isCollapsed) {
                        childrenContainer.classList.remove('collapsed');
                        row.classList.remove('node-collapsed');
                        row.classList.add('is-expanded');
                        this.collapsedPaths.delete(pathKey);
                    } else {
                        childrenContainer.classList.add('collapsed');
                        row.classList.add('node-collapsed');
                        row.classList.remove('is-expanded');
                        this.collapsedPaths.add(pathKey);
                    }
                });

                rowWrapper.appendChild(childrenContainer);
            }

            listCard.appendChild(rowWrapper);
        });

        nodeWrapper.appendChild(listCard);
        wrapper.appendChild(nodeWrapper);
        return wrapper;
    }

    // Create a table card for an object
    private createTableCard(obj: Record<string, JsonValue>, depth: number, path: JsonPath): HTMLElement {
        const branch = document.createElement('div');
        branch.className = 'tree-branch';

        const nodeWrapper = document.createElement('div');
        nodeWrapper.className = 'node-wrapper';

        const card = document.createElement('div');
        card.className = `table-card depth-${depth % 7}`;

        Object.entries(obj).forEach(([key, val]) => {
            const childPath = [...path, key];
            const isNested = val !== null && typeof val === 'object';

            const rowWrapper = document.createElement('div');
            rowWrapper.className = 'table-row-wrapper';

            const row = document.createElement('div');
            row.className = `table-row depth-${depth % 7}`;
            if (isNested) row.classList.add('table-row-nested');

            // Key
            const keySpan = document.createElement('span');
            keySpan.className = 'table-key';
            keySpan.textContent = key;
            row.appendChild(keySpan);

            // Separator
            const separator = document.createElement('span');
            separator.className = 'separator';
            separator.textContent = ':';
            separator.style.opacity = '0.4';
            row.appendChild(separator);

            // Value or info
            const valSpan = document.createElement('span');
            if (!isNested) {
                valSpan.className = `table-value ${this.getTypeClass(val)}`;
                const fullVal = String(val);
                valSpan.textContent = fullVal.length > 40 ? fullVal.substring(0, 40) + '...' : fullVal;
                valSpan.dataset.fullValue = fullVal;
                row.appendChild(valSpan);
                this.renderSmartBadges(row, key, val);
            } else {
                const arr = Array.isArray(val);
                const count = arr ? (val as any[]).length : Object.keys(val as object).length;
                valSpan.className = 'table-value info-span';

                if (arr) {
                    valSpan.textContent = `[${count}]`;
                    // --- Sparkline Injection for Table View ---
                    const nums = val as any[];
                    if (count > 2) {
                        const checkLimit = Math.min(nums.length, 10);
                        let allNumbers = true;
                        for (let i = 0; i < checkLimit; i++) if (typeof nums[i] !== 'number') { allNumbers = false; break; }

                        if (allNumbers) {
                            const numData = nums as number[];
                            const width = 60, height = 12;
                            const min = Math.min(...numData), max = Math.max(...numData);
                            const range = max - min || 1;
                            const points = numData.length > 30 ? numData.filter((_, i) => i % Math.ceil(numData.length / 30) === 0) : numData;
                            const step = width / (Math.max(points.length - 1, 1));
                            const pathData = points.map((n, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${height - ((n - min) / range) * height}`).join(' ');

                            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                            svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
                            svg.setAttribute('class', 'sparkline');
                            svg.style.marginLeft = '8px'; svg.style.verticalAlign = 'middle'; svg.style.opacity = '0.7';

                            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                            path.setAttribute('d', pathData);
                            path.setAttribute('fill', 'none');
                            path.setAttribute('stroke', '#0969da');
                            path.setAttribute('stroke-width', '1.5');
                            path.setAttribute('stroke-linejoin', 'round');
                            svg.appendChild(path);
                            valSpan.appendChild(svg);
                        }
                    }
                } else {
                    valSpan.textContent = `{${count}}`;
                }

                // Add indicator for nested
                const indicator = document.createElement('span');
                indicator.className = 'array-list-indicator';
                row.appendChild(indicator);
                row.appendChild(valSpan);
            }

            // Bind events
            this.bindEvents(row, childPath);

            // Single click selection for non-nested rows
            if (!isNested) {
                row.addEventListener('click', (e) => {
                    if (e.altKey) return;
                    if ((e.target as HTMLElement).isContentEditable) return;
                    e.stopPropagation();

                    // Clear previous selection
                    this.container.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                    row.classList.add('selected');

                    // Trigger selection callback
                    if (this.options.onNodeSelect) {
                        this.options.onNodeSelect(childPath, row, val);
                    }
                });
            }

            rowWrapper.appendChild(row);

            // Render nested children
            if (isNested) {
                const nestedChildren = document.createElement('div');
                nestedChildren.className = 'table-row-children children-container';

                const nestedInner = document.createElement('div');
                nestedInner.className = 'children-inner';

                if (Array.isArray(val)) {
                    // Nested array - always render as list card
                    const listCard = this.renderArrayListCard(val as JsonValue[], depth + 1, childPath);
                    nestedInner.appendChild(listCard);
                } else {
                    // Nested object - also render as table card (like list-in-list)
                    const nestedCard = this.createTableCard(val as Record<string, JsonValue>, depth + 1, childPath);
                    nestedInner.appendChild(nestedCard);
                }

                nestedChildren.appendChild(nestedInner);

                const nestedPathKey = JSON.stringify(childPath);
                // Default to EXPANDED for nested items
                if (this.collapsedPaths.has(nestedPathKey)) {
                    nestedChildren.classList.add('collapsed');
                    row.classList.add('node-collapsed');
                } else {
                    row.classList.add('is-expanded');
                }

                // Single click: Select row and show in detail panel
                row.addEventListener('click', (e) => {
                    if (e.altKey) return;
                    if ((e.target as HTMLElement).isContentEditable) return;
                    e.stopPropagation();

                    // Clear previous selection
                    this.container.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                    row.classList.add('selected');

                    // Trigger selection callback
                    if (this.options.onNodeSelect) {
                        this.options.onNodeSelect(childPath, row, val);
                    }
                });

                // Double click: Expand/Collapse
                row.addEventListener('dblclick', (e) => {
                    if (e.altKey) return;
                    if ((e.target as HTMLElement).isContentEditable) return;
                    e.stopPropagation();

                    const isCollapsed = nestedChildren.classList.contains('collapsed');
                    if (isCollapsed) {
                        nestedChildren.classList.remove('collapsed');
                        row.classList.remove('node-collapsed');
                        row.classList.add('is-expanded');
                        this.collapsedPaths.delete(nestedPathKey);
                    } else {
                        nestedChildren.classList.add('collapsed');
                        row.classList.add('node-collapsed');
                        row.classList.remove('is-expanded');
                        this.collapsedPaths.add(nestedPathKey);
                    }
                });

                rowWrapper.appendChild(nestedChildren);
            }



            card.appendChild(rowWrapper);
        });

        nodeWrapper.appendChild(card);
        branch.appendChild(nodeWrapper);
        return branch;
    }

    private getTypeClass(val: JsonValue): string {
        if (val === null) return 'type-null';
        if (typeof val === 'boolean') return 'type-boolean';
        if (typeof val === 'number') return 'type-number';
        return 'type-string';
    }

    private bindEvents(element: HTMLElement, path: JsonPath) {
        // Right Click for Context Menu
        element.oncontextmenu = (e) => {
            e.preventDefault();
            this.options.onContextMenu?.(e, path, element);
        };

        // Drag & Drop
        element.draggable = true;
        element.setAttribute('data-path', JSON.stringify(path));

        element.ondragstart = (e) => {
            e.stopPropagation();
            if (e.dataTransfer) {
                e.dataTransfer.setData('sourcePath', JSON.stringify(path));
                e.dataTransfer.effectAllowed = 'move';
            }
            element.classList.add('dragging');
            document.body.classList.add('is-dragging');
        };

        element.ondragend = () => {
            element.classList.remove('dragging');
            document.body.classList.remove('is-dragging');
            this.clearDropIndicators();
        };

        element.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const rect = element.getBoundingClientRect();
            const y = e.clientY - rect.top;

            this.clearDropIndicators(element);

            if (y < rect.height * 0.25) {
                element.classList.add('drop-target-before');
            } else if (y > rect.height * 0.75) {
                element.classList.add('drop-target-after');
            } else {
                element.classList.add('drop-target-inside');
            }
        };

        element.ondragleave = () => {
            element.classList.remove('drop-target-before', 'drop-target-after', 'drop-target-inside');
        };

        element.ondrop = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const sourcePathRaw = e.dataTransfer?.getData('sourcePath');
            if (!sourcePathRaw) return;
            const sourcePath = JSON.parse(sourcePathRaw);

            let pos: 'before' | 'after' | 'inside' = 'inside';
            if (element.classList.contains('drop-target-before')) pos = 'before';
            else if (element.classList.contains('drop-target-after')) pos = 'after';

            this.clearDropIndicators();

            if (this.options.onMoveNode) {
                this.options.onMoveNode(sourcePath, path, pos);
            }
        };

        // Alt+Click (Keep as backup)
        element.addEventListener('click', (e) => {
            if (e.altKey) {
                e.stopPropagation();
                e.preventDefault();
                this.options.onContextMenu?.(e, path, element);
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
                this.options.onContextMenu?.(mouseEvent, path, element);
            }, 500);
        };
        const end = () => clearTimeout(timer);

        element.addEventListener('touchstart', start, { passive: false });
        element.addEventListener('touchend', end);
        element.addEventListener('touchmove', end);
    }

    toggleAll(expand: boolean) {
        // Clear all cached expand/collapse states
        this.collapsedPaths.clear();

        const containers = document.querySelectorAll('.children-container') as NodeListOf<HTMLElement>;
        const nodeContents = document.querySelectorAll('.node-content') as NodeListOf<HTMLElement>;
        const arrayListRows = document.querySelectorAll('.array-list-row') as NodeListOf<HTMLElement>;
        const tableRows = document.querySelectorAll('.table-row') as NodeListOf<HTMLElement>;
        const icons = document.querySelectorAll('.icon-expand') as NodeListOf<HTMLElement>;

        containers.forEach(c => {
            if (expand) {
                c.classList.remove('collapsed');
            } else {
                c.classList.add('collapsed');
                // Find the path from the parent element
                const branch = c.closest('.tree-branch');
                const nodeContent = branch?.querySelector(':scope > .node-wrapper > .node-content') as HTMLElement;
                const arrayListRow = c.previousElementSibling as HTMLElement;
                const tableRow = c.previousElementSibling as HTMLElement;

                let pathAttr: string | null = null;

                // Try multiple sources to get the path
                if (nodeContent?.hasAttribute('data-path')) {
                    pathAttr = nodeContent.getAttribute('data-path');
                } else if (arrayListRow?.classList.contains('array-list-row')) {
                    pathAttr = arrayListRow.getAttribute('data-path');
                } else if (tableRow?.classList.contains('table-row')) {
                    pathAttr = tableRow.getAttribute('data-path');
                }

                if (pathAttr) {
                    this.collapsedPaths.add(pathAttr);
                }
            }

            // Clean inline style if any remnants exist (from old code)
            c.style.display = '';
        });

        nodeContents.forEach(n => {
            if (expand) n.classList.remove('node-collapsed');
            else if (n.closest('.has-children')) n.classList.add('node-collapsed');
        });

        // Update array list rows and table rows
        arrayListRows.forEach(r => {
            if (expand) {
                r.classList.remove('node-collapsed');
                r.classList.add('is-expanded');
            } else {
                r.classList.add('node-collapsed');
                r.classList.remove('is-expanded');
            }
        });

        tableRows.forEach(r => {
            if (r.closest('.table-row-wrapper')?.querySelector('.table-row-children')) {
                if (expand) {
                    r.classList.remove('node-collapsed');
                    r.classList.add('is-expanded');
                } else {
                    r.classList.add('node-collapsed');
                    r.classList.remove('is-expanded');
                }
            }
        });

        // Update icons text if not in traditional mode (CSS rotation handles traditional)
        // Or if we just want to reset them to default state '▼' (expanded)
        if (!document.querySelector('.traditional-mode')) {
            icons.forEach(i => i.textContent = expand ? '▼' : '▶');
        }
    }

    // --- Inline Editing ---
    public enableInlineEditing(element: HTMLElement, type: 'key' | 'value', onSave: (newVal: string) => void) {
        // Support multiple element types: node-content, table-row, array-list-row
        let targetSpan: HTMLElement | null = null;

        if (type === 'key') {
            targetSpan = element.querySelector('.key-text, .table-key') as HTMLElement;
        } else {
            targetSpan = element.querySelector('.val-text, .table-value:not(.info-span), .array-list-value') as HTMLElement;
        }

        if (!targetSpan) return;

        // Use full value if available (for truncated values), else textContent
        const originalText = targetSpan.dataset.fullValue || targetSpan.textContent || '';

        // Setup editing state
        targetSpan.contentEditable = 'true';
        targetSpan.textContent = originalText; // Expand to full text for editing
        targetSpan.focus();

        // Select all text
        const range = document.createRange();
        range.selectNodeContents(targetSpan);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);

        // Styling during edit
        targetSpan.style.outline = '2px solid #3B82F6';
        targetSpan.style.borderRadius = '4px';
        targetSpan.style.minWidth = '20px';
        targetSpan.style.padding = '0 2px';
        targetSpan.style.backgroundColor = '#fff';
        targetSpan.style.zIndex = '100';
        targetSpan.style.color = '#000'; // Force black during edit

        let isSaving = false;

        const finish = (save: boolean) => {
            if (isSaving) return; // Prevent double fire
            isSaving = true;

            targetSpan.contentEditable = 'false';
            targetSpan.style.outline = '';
            targetSpan.style.borderRadius = '';
            targetSpan.style.backgroundColor = '';
            targetSpan.style.padding = '';
            targetSpan.style.color = ''; // Restore

            // Clean up listeners
            targetSpan.removeEventListener('keydown', onKeyDown);
            targetSpan.removeEventListener('blur', onBlur);

            if (save) {
                const newVal = targetSpan.textContent || '';
                if (newVal !== originalText) {
                    onSave(newVal);
                } else {
                    // If no change, we might want to restore truncation?
                    // A full re-render happens usually on ANY store update action?
                    // If we don't save, we should restore original text (truncated version if applicable).
                    // But if we do save, store updates and triggers re-render.
                }
            } else {
                // Cancel: Restore original visual state (potentially truncated)
                // Simple way: re-call renderPrimitiveValue logic? Or just reload from store?
                // Since we don't hold ref to data here easily, let's just restore original TEXT CONTENT.
                // But originalText was the FULL value. We want the DISPLAY (truncated) value.
                // We didn't save the truncated/display value.
                // It's okay, usually re-render fixes it.
                targetSpan.textContent = originalText;
            }
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finish(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
            }
        };

        const onBlur = () => {
            finish(true); // Save on blur
        };

        targetSpan.addEventListener('keydown', onKeyDown);
        targetSpan.addEventListener('blur', onBlur);
    }

    // --- Inline Adding ---
    public showInlineAdd(
        parentElement: HTMLElement,
        containerType: 'object' | 'array',
        addType: 'node' | 'object' | 'array' | 'paste',
        onConfirm: (key: string, value: any) => void
    ) {
        // 1. Identify the target container and where to append
        let childrenBlock: HTMLElement | null = null;

        // Search Strategy:
        // A. Check sibling (works for standard tree rows and nested table rows)
        const sibling = parentElement.nextElementSibling;
        if (sibling && sibling.classList.contains('children-container')) {
            childrenBlock = sibling as HTMLElement;
        }

        // B. Fallback to branch search
        if (!childrenBlock) {
            const treeBranch = parentElement.closest('.tree-branch');
            if (treeBranch) {
                childrenBlock = treeBranch.querySelector(':scope > .children-container') as HTMLElement;
            }
        }

        let innerBlock: HTMLElement;

        if (!childrenBlock) {
            // Find branch to append NEW container to
            const treeBranch = parentElement.closest('.tree-branch');
            if (!treeBranch) return;

            // Create for empty container
            childrenBlock = document.createElement('div');
            childrenBlock.className = 'children-container';

            innerBlock = document.createElement('div');
            innerBlock.className = 'children-inner';

            childrenBlock.appendChild(innerBlock);
            treeBranch.appendChild(childrenBlock);

            treeBranch.classList.add('has-children');
        } else {
            // Ensure expanded
            if (childrenBlock.classList.contains('collapsed')) {
                childrenBlock.classList.remove('collapsed');
                childrenBlock.style.display = ''; // Clear potentially hidden style
                const nodeContent = parentElement; // The row we clicked
                nodeContent.classList.remove('node-collapsed');
                const icon = nodeContent.querySelector('.icon-expand');
                if (icon && !document.querySelector('.traditional-mode')) icon.textContent = '▼';

                const pathAttr = parentElement.getAttribute('data-path');
                if (pathAttr) {
                    this.collapsedPaths.delete(pathAttr);
                }
            }
            innerBlock = childrenBlock.querySelector('.children-inner') as HTMLElement || childrenBlock;
        }

        // 2. Decide EXACT append target (Table/List Card vs Branch)
        const existingCard = innerBlock.querySelector(':scope > .table-card, :scope > .array-list-card') as HTMLElement;
        const appendTarget = existingCard || innerBlock;
        const isIntoCard = !!existingCard;

        // 3. Create Temporary Input Node
        const tempBranch = document.createElement('div');
        tempBranch.className = 'tree-branch child-branch';
        tempBranch.style.animation = 'fadeIn 0.2s ease-out';
        if (isIntoCard) tempBranch.style.margin = '4px 8px'; // Slighter margin if inside card

        const tempWrapper = document.createElement('div');
        tempWrapper.className = 'node-wrapper';

        const tempContent = document.createElement('div');
        tempContent.className = 'node-content';
        tempContent.style.background = '#fff';
        tempContent.style.border = '1px dashed #3B82F6';
        tempContent.style.borderRadius = '4px';
        tempContent.style.padding = '8px';
        tempContent.style.display = 'flex';
        tempContent.style.flexDirection = 'column';
        tempContent.style.gap = '8px';
        tempContent.style.marginLeft = isIntoCard ? '0' : '20px'; // No indent if in card
        tempContent.style.minWidth = '280px';
        tempContent.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.1)';

        // Inputs Wrapper
        const inputsRow = document.createElement('div');
        inputsRow.style.display = 'flex';
        inputsRow.style.alignItems = 'center';
        inputsRow.style.gap = '8px';

        // Inputs
        const keyInput = document.createElement('input');
        keyInput.placeholder = this.t.key || 'Key';
        keyInput.style.border = 'none';
        keyInput.style.borderBottom = '1px solid #CBD5E1';
        keyInput.style.outline = 'none';
        keyInput.style.fontSize = '13px';
        keyInput.style.width = '100px';
        keyInput.style.fontFamily = 'var(--tm-font-code)';
        keyInput.style.background = 'transparent';
        keyInput.style.color = '#334155';

        const valInput = document.createElement('input');
        valInput.placeholder = this.t.value || 'Value';
        valInput.style.border = 'none';
        valInput.style.borderBottom = '1px solid #CBD5E1';
        valInput.style.outline = 'none';
        valInput.style.fontSize = '13px';
        valInput.style.width = '140px';
        valInput.style.fontFamily = 'var(--tm-font-code)';
        valInput.style.background = 'transparent';
        valInput.style.color = '#334155';

        // Textarea for Paste
        const pasteArea = document.createElement('textarea');
        pasteArea.placeholder = (this.t as any).pasteJsonData || 'Paste JSON here...';
        pasteArea.style.border = '1px solid #CBD5E1';
        pasteArea.style.borderRadius = '4px';
        pasteArea.style.outline = 'none';
        pasteArea.style.fontSize = '12px';
        pasteArea.style.width = '100%';
        pasteArea.style.height = '120px';
        pasteArea.style.fontFamily = 'var(--tm-font-code)';
        pasteArea.style.background = '#F8FAFC';
        pasteArea.style.color = '#334155';
        pasteArea.style.padding = '8px';
        pasteArea.style.resize = 'vertical';
        pasteArea.style.boxSizing = 'border-box';

        // Logic based on types
        const showKey = containerType === 'object';
        const showValue = addType === 'node';
        const isPaste = addType === 'paste';

        if (showKey) {
            inputsRow.appendChild(keyInput);
            if (showValue) {
                const sep = document.createElement('span');
                sep.textContent = ':';
                sep.style.color = '#94A3B8';
                inputsRow.appendChild(sep);
            }
        }

        if (showValue) {
            inputsRow.appendChild(valInput);
        } else if (!isPaste) {
            // Adding Object or Array
            if (showKey) {
                const sep = document.createElement('span');
                sep.textContent = ':';
                sep.style.color = '#94A3B8';
                inputsRow.appendChild(sep);
            }

            const label = document.createElement('span');
            label.style.opacity = '0.6';
            label.style.fontSize = '12px';
            label.style.color = '#64748B';
            label.textContent = addType === 'object' ? '{} (Object)' : '[] (List)';
            inputsRow.appendChild(label);
        }

        // Actions
        const confirmBtn = document.createElement('button');
        confirmBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        confirmBtn.title = "Confirm (Enter)";
        confirmBtn.style.border = 'none';
        confirmBtn.style.background = 'transparent';
        confirmBtn.style.color = '#3B82F6';
        confirmBtn.style.cursor = 'pointer';
        confirmBtn.style.borderRadius = '4px';
        confirmBtn.style.padding = '6px';
        confirmBtn.style.display = 'flex';
        confirmBtn.style.alignItems = 'center';
        confirmBtn.style.justifyContent = 'center';

        const cancelBtn = document.createElement('button');
        cancelBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        cancelBtn.title = "Cancel (Esc)";
        cancelBtn.style.border = 'none';
        cancelBtn.style.background = 'transparent';
        cancelBtn.style.color = '#EF4444';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.borderRadius = '4px';
        cancelBtn.style.padding = '6px';
        cancelBtn.style.display = 'flex';

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.gap = '4px';
        btnGroup.style.marginLeft = 'auto'; // Push to the right
        btnGroup.appendChild(cancelBtn);
        btnGroup.appendChild(confirmBtn);
        inputsRow.appendChild(btnGroup);

        tempContent.appendChild(inputsRow);

        if (isPaste) {
            tempContent.appendChild(pasteArea);
        }

        tempWrapper.appendChild(tempContent);
        tempBranch.appendChild(tempWrapper);

        // Append to inner block or card (AT THE END)
        appendTarget.appendChild(tempBranch);

        // Scroll to view
        setTimeout(() => {
            tempBranch.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Focus logic
            if (isPaste) pasteArea.focus();
            else if (showKey) keyInput.focus();
            else if (showValue) valInput.focus();
        }, 50);

        // Handlers
        const close = () => {
            tempBranch.remove();
        };

        const confirm = () => {
            const k = keyInput.value.trim();
            const v = valInput.value.trim();
            const pv = pasteArea.value.trim();

            if (showKey && !k && (!isPaste || !pv)) {
                keyInput.style.borderBottom = '1px solid #EF4444';
                keyInput.focus();
                return;
            }

            let finalValue: any = isPaste ? pv : v;

            if (isPaste) {
                try {
                    finalValue = JSON.parse(pv);
                    // Smart Key Inference: if key is empty and the object has 'id' or 'name', use it
                    if (showKey && !k) {
                        const inferredKey = finalValue.id || finalValue.name || finalValue.key;
                        if (inferredKey) {
                            onConfirm(String(inferredKey), finalValue);
                            close();
                            return;
                        } else {
                            keyInput.style.borderBottom = '1px solid #EF4444';
                            keyInput.focus();
                            return;
                        }
                    }
                } catch (e) {
                    pasteArea.style.border = '1px solid #EF4444';
                    pasteArea.focus();
                    return;
                }
            } else if (showValue) {
                // Simple Type Inference
                if (v === 'true') finalValue = true;
                else if (v === 'false') finalValue = false;
                else if (v === 'null') finalValue = null;
                else if (!isNaN(Number(v)) && v !== '') finalValue = Number(v);
                else {
                    // Try parsing as JSON anyway if it looks like it
                    if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))) {
                        try { finalValue = JSON.parse(v); } catch (e) { }
                    }
                }
            } else {
                if (addType === 'object') finalValue = {};
                else if (addType === 'array') finalValue = [];
            }

            onConfirm(k, finalValue);
            close();
        };

        confirmBtn.onclick = (e) => { e.stopPropagation(); confirm(); };
        cancelBtn.onclick = (e) => { e.stopPropagation(); close(); };

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                if (e.target === pasteArea) return; // Allow newlines in textarea
                e.preventDefault();
                e.stopPropagation();
                confirm();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
            }
        };

        keyInput.addEventListener('keydown', onKeyDown);
        valInput.addEventListener('keydown', onKeyDown);
        pasteArea.addEventListener('keydown', onKeyDown);
    }

    // --- Navigation ---
    public nextMatch(): number {
        if (this.matchedElements.length === 0) return 0;
        let nextIndex = this.currentMatchIndex + 1;
        if (nextIndex >= this.matchedElements.length) nextIndex = 0;
        this.focusMatch(nextIndex);
        return nextIndex + 1;
    }

    public prevMatch(): number {
        if (this.matchedElements.length === 0) return 0;
        let prevIndex = this.currentMatchIndex - 1;
        if (prevIndex < 0) prevIndex = this.matchedElements.length - 1;
        this.focusMatch(prevIndex);
        return prevIndex + 1;
    }

    private focusMatch(index: number) {
        if (this.currentMatchIndex >= 0 && this.currentMatchIndex < this.matchedElements.length) {
            this.matchedElements[this.currentMatchIndex].classList.remove('active-match');
        }
        this.currentMatchIndex = index;
        const el = this.matchedElements[index];
        if (el) {
            el.classList.add('active-match');
            // Remove scrollIntoView to avoid conflict with custom transform-based panning
            // el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    public get currentMatchElement(): HTMLElement | null {
        if (this.currentMatchIndex >= 0 && this.currentMatchIndex < this.matchedElements.length) {
            return this.matchedElements[this.currentMatchIndex];
        }
        return null;
    }

    // --- Search Suggestions ---
    public getSearchSuggestions(query: string, maxResults = 8): Array<{
        key: string;
        value: string | null;
        path: string;
        type: 'key' | 'value' | 'both';
        element: HTMLElement;
    }> {
        const results: Array<{
            key: string;
            value: string | null;
            path: string;
            type: 'key' | 'value' | 'both';
            element: HTMLElement;
        }> = [];

        if (!query.trim()) return results;

        const term = query.toLowerCase();

        // Search in node-content elements
        const nodes = this.container.querySelectorAll('.node-content');
        nodes.forEach(node => {
            if (results.length >= maxResults) return;

            const el = node as HTMLElement;
            const keySpan = el.querySelector('.key-text');
            const valSpan = el.querySelector('.val-text') as HTMLElement;

            const keyText = keySpan?.textContent || '';
            const valText = valSpan?.dataset.fullValue || valSpan?.textContent || '';

            const matchKey = keyText.toLowerCase().includes(term);
            const matchVal = valText.toLowerCase().includes(term);

            if (matchKey || matchVal) {
                const path = this.buildPathString(el);

                results.push({
                    key: keyText,
                    value: valSpan ? valText : null,
                    path: path,
                    type: matchKey && matchVal ? 'both' : (matchKey ? 'key' : 'value'),
                    element: el
                });
            }
        });

        // Search in table-row elements (for table card layout)
        const tableRows = this.container.querySelectorAll('.table-row');
        tableRows.forEach(row => {
            if (results.length >= maxResults) return;

            const el = row as HTMLElement;
            const keySpan = el.querySelector('.table-key');
            const valSpan = el.querySelector('.table-value') as HTMLElement;

            const keyText = keySpan?.textContent || '';
            const valText = valSpan?.dataset.fullValue || valSpan?.textContent || '';

            const matchKey = keyText.toLowerCase().includes(term);
            const matchVal = valText.toLowerCase().includes(term);

            if (matchKey || matchVal) {
                const path = this.buildPathStringForTableRow(el, keyText);

                results.push({
                    key: keyText,
                    value: valSpan && !el.classList.contains('table-row-nested') ? valText : null,
                    path: path,
                    type: matchKey && matchVal ? 'both' : (matchKey ? 'key' : 'value'),
                    element: el
                });
            }
        });

        return results;
    }

    private buildPathStringForTableRow(row: HTMLElement, keyText: string): string {
        // Find parent table-card, then traverse up
        let tableCard = row.closest('.table-card');
        if (!tableCard) return '$ > ' + keyText;

        const parts: string[] = [keyText];

        // Find the tree-branch containing this table-card
        let currentBranch = tableCard.closest('.tree-branch') as HTMLElement | null;

        while (currentBranch && currentBranch !== this.container) {
            // Get the node-content of this branch
            const nodeContent = currentBranch.querySelector(':scope > .node-wrapper > .node-content');
            if (nodeContent) {
                const keySpan = nodeContent.querySelector('.key-text');
                if (keySpan) {
                    parts.unshift(keySpan.textContent || '');
                }
            }

            // Go to the parent of this tree-branch (could be children-block)
            const parentOfBranch = currentBranch.parentElement;
            if (!parentOfBranch || parentOfBranch === this.container) break;

            // Find the grandparent tree-branch
            currentBranch = parentOfBranch.closest('.tree-branch') as HTMLElement | null;
        }

        return '$ > ' + parts.join(' > ');
    }

    private buildPathString(el: HTMLElement): string {
        const parts: string[] = [];

        // First, collect the current element's key
        if (el.classList.contains('node-content')) {
            const keySpan = el.querySelector('.key-text');
            if (keySpan) {
                parts.unshift(keySpan.textContent || '');
            }
        }

        // Find the tree-branch containing this node-content
        let currentBranch = el.closest('.tree-branch') as HTMLElement | null;

        // Traverse up through parent tree-branches
        while (currentBranch && currentBranch !== this.container) {
            // Go to the parent of this tree-branch (could be children-block or container)
            const parentOfBranch = currentBranch.parentElement;
            if (!parentOfBranch || parentOfBranch === this.container) break;

            // Find the grandparent tree-branch (the one containing this branch)
            const grandParentBranch = parentOfBranch.closest('.tree-branch') as HTMLElement | null;
            if (!grandParentBranch || grandParentBranch === this.container) break;

            // Get the node-content of the grandparent branch
            const nodeContent = grandParentBranch.querySelector(':scope > .node-wrapper > .node-content');
            if (nodeContent) {
                const keySpan = nodeContent.querySelector('.key-text');
                if (keySpan) {
                    parts.unshift(keySpan.textContent || '');
                }
            }

            currentBranch = grandParentBranch;
        }

        return '$ > ' + parts.join(' > ');
    }

    // --- Search ---
    public search(query: string): number {
        // Clear previous
        this.matchedElements = [];
        this.currentMatchIndex = -1;

        const matches = this.container.querySelectorAll('.search-match');
        matches.forEach(m => {
            m.classList.remove('search-match');
            m.classList.remove('active-match');
        });

        if (!query.trim()) return 0;



        // Search in node-content elements
        const nodes = this.container.querySelectorAll('.node-content');
        nodes.forEach(node => {
            const el = node as HTMLElement;
            const keySpan = el.querySelector('.key-text');
            const valSpan = el.querySelector('.val-text') as HTMLElement;

            const keyText = keySpan?.textContent || '';
            const valText = valSpan?.dataset.fullValue || valSpan?.textContent || '';

            const isRegex = query.startsWith('/') && query.length > 1;
            const isExact = query.startsWith('"') && query.endsWith('"') && query.length > 2;

            let matchKey = false;
            let matchVal = false;

            if (isRegex) {
                try {
                    const regex = new RegExp(query.slice(1), 'i');
                    matchKey = regex.test(keyText);
                    matchVal = regex.test(valText);
                } catch {
                    // Fallback to simple include if regex invalid
                    const term = query.toLowerCase();
                    matchKey = keyText.toLowerCase().includes(term);
                    matchVal = valText.toLowerCase().includes(term);
                }
            } else if (isExact) {
                const exactTerm = query.slice(1, -1).toLowerCase();
                matchKey = keyText.toLowerCase() === exactTerm;
                matchVal = valText.toLowerCase() === exactTerm;
            } else {
                const term = query.toLowerCase();
                matchKey = keyText.toLowerCase().includes(term);
                matchVal = valText.toLowerCase().includes(term);
            }

            if (matchKey || matchVal) {
                el.classList.add('search-match');
                this.matchedElements.push(el);
                this.expandParents(el);
            }
        });

        // Search in table-row elements
        const tableRows = this.container.querySelectorAll('.table-row');
        tableRows.forEach(row => {
            const el = row as HTMLElement;
            const keySpan = el.querySelector('.table-key');
            const valSpan = el.querySelector('.table-value') as HTMLElement;

            const keyText = keySpan?.textContent || '';
            const valText = valSpan?.dataset.fullValue || valSpan?.textContent || '';

            const isRegex = query.startsWith('/') && query.length > 1;
            const isExact = query.startsWith('"') && query.endsWith('"') && query.length > 2;

            let matchKey = false;
            let matchVal = false;

            if (isRegex) {
                try {
                    const regex = new RegExp(query.slice(1), 'i');
                    matchKey = regex.test(keyText);
                    matchVal = regex.test(valText);
                } catch {
                    const term = query.toLowerCase();
                    matchKey = keyText.toLowerCase().includes(term);
                    matchVal = valText.toLowerCase().includes(term);
                }
            } else if (isExact) {
                const exactTerm = query.slice(1, -1).toLowerCase();
                matchKey = keyText.toLowerCase() === exactTerm;
                matchVal = valText.toLowerCase() === exactTerm;
            } else {
                const term = query.toLowerCase();
                matchKey = keyText.toLowerCase().includes(term);
                matchVal = valText.toLowerCase().includes(term);
            }

            if (matchKey || matchVal) {
                el.classList.add('search-match');
                this.matchedElements.push(el);
                this.expandParents(el);
            }
        });

        if (this.matchedElements.length > 0) {
            this.focusMatch(0);
        }

        return this.matchedElements.length;
    }

    private expandParents(el: HTMLElement) {
        let parent = el.parentElement;
        while (parent && parent !== this.container) {
            if (parent.classList.contains('children-container')) {
                parent.classList.remove('collapsed');

                const branch = parent.parentElement;
                if (branch) {
                    const wrapper = branch.querySelector('.node-wrapper');
                    const content = wrapper?.querySelector('.node-content') as HTMLElement;
                    if (content) {
                        content.classList.remove('node-collapsed');
                        content.classList.add('is-expanded');
                        const icon = content.querySelector('.icon-expand');
                        if (icon && !document.querySelector('.traditional-mode')) icon.textContent = '▼';

                        // Sync with collapsedPaths
                        const pathAttr = content.getAttribute('data-path');
                        if (pathAttr) {
                            this.collapsedPaths.delete(pathAttr);
                        }
                    }
                }

                // Also handle array-list-row and table-row siblings
                const siblingRow = parent.previousElementSibling as HTMLElement;
                if (siblingRow?.classList.contains('array-list-row') || siblingRow?.classList.contains('table-row')) {
                    siblingRow.classList.remove('node-collapsed');
                    siblingRow.classList.add('is-expanded');
                    const pathAttr = siblingRow.getAttribute('data-path');
                    if (pathAttr) {
                        this.collapsedPaths.delete(pathAttr);
                    }
                }
            }
            parent = parent.parentElement;
        }
    }
    private clearDropIndicators(except?: HTMLElement) {
        const classes = ['drop-target-before', 'drop-target-after', 'drop-target-inside'];
        document.querySelectorAll('.node-content, .table-row, .array-list-row').forEach(el => {
            if (el !== except) {
                classes.forEach(c => el.classList.remove(c));
            }
        });
    }
}
