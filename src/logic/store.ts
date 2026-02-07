
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonPath = (string | number)[];

export class JsonStore {
    private data: JsonValue | null = null;
    private listeners: (() => void)[] = [];
    private history: string[] = [];  // Undo history (JSON strings)
    private maxHistory = 50;

    constructor(initialData: JsonValue | null = null) {
        this.data = initialData;
    }

    get(): JsonValue | null {
        return this.data;
    }

    set(data: JsonValue | null, saveHistory = true) {
        // Save current state to history before changing
        if (saveHistory && this.data !== null) {
            this.pushHistory();
        }
        this.data = data;
        this.notify();
    }

    private pushHistory() {
        if (this.data !== null) {
            this.history.push(JSON.stringify(this.data));
            if (this.history.length > this.maxHistory) {
                this.history.shift();
            }
        }
    }

    undo(): boolean {
        if (this.history.length === 0) return false;
        const prev = this.history.pop()!;
        this.data = JSON.parse(prev);
        this.notify();
        return true;
    }

    canUndo(): boolean {
        return this.history.length > 0;
    }

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        this.listeners.forEach(l => l());
    }

    // --- CRUD Operations ---

    getAt(path: JsonPath): JsonValue {
        let target = this.data!;
        for (const key of path) {
            target = (target as any)[key];
        }
        return target;
    }

    updateValue(path: JsonPath, value: any) {
        if (!this.data) return;
        this.pushHistory();  // Save before modification

        const parentPath = path.slice(0, -1);
        const key = path[path.length - 1];
        const target = parentPath.length === 0 ? this.data : this.getAt(parentPath);

        // Type normalization
        // Type normalization
        let finalVal = value;
        if (typeof value === 'string') {
            const strVal = value.trim();
            if (strVal.startsWith('"') && strVal.endsWith('"')) {
                // Explicit string (strip quotes)
                finalVal = strVal.slice(1, -1);
            } else if (strVal === 'true') {
                finalVal = true;
            } else if (strVal === 'false') {
                finalVal = false;
            } else if (strVal === 'null') {
                finalVal = null;
            } else if (!isNaN(Number(strVal)) && strVal !== '') {
                finalVal = Number(strVal);
            }
        }

        (target as any)[key] = finalVal;
        this.notify();
    }

    renameKey(path: JsonPath, newKey: string) {
        if (!this.data) return;
        this.pushHistory();  // Save before modification

        const parentPath = path.slice(0, -1);
        const oldKey = path[path.length - 1] as string;
        const target = parentPath.length === 0 ? this.data : this.getAt(parentPath);

        if (Array.isArray(target)) {
            throw new Error("Cannot rename array index");
        }

        const obj = target as Record<string, JsonValue>;
        if (obj.hasOwnProperty(newKey) && newKey !== oldKey) {
            throw new Error("Key already exists");
        }

        // Preserve order
        const keys = Object.keys(obj);
        const temp = { ...obj };
        keys.forEach(k => delete obj[k]);

        keys.forEach(k => {
            if (k === oldKey) obj[newKey] = temp[oldKey];
            else obj[k] = temp[k];
        });

        this.notify();
    }

    addNode(path: JsonPath, key: string, value: any) {
        this.pushHistory();  // Save before modification
        const target = path.length === 0 ? this.data : this.getAt(path);

        // Normalize value
        // Normalize value
        let finalVal = value;

        if (typeof value === 'string') {
            const strVal = value.trim();
            if (strVal.startsWith('"') && strVal.endsWith('"')) {
                finalVal = strVal.slice(1, -1);
            } else if (strVal === 'true') {
                finalVal = true;
            } else if (strVal === 'false') {
                finalVal = false;
            } else if (strVal === 'null') {
                finalVal = null;
            } else if (!isNaN(Number(strVal)) && strVal !== '') {
                finalVal = Number(strVal);
            }
        }

        if (Array.isArray(target)) {
            target.push(finalVal);
        } else {
            const obj = target as Record<string, JsonValue>;
            if (!key) throw new Error("Key is required");
            if (obj.hasOwnProperty(key)) throw new Error("Key already exists");
            obj[key] = finalVal;
        }
        this.notify();
    }

    deleteNode(path: JsonPath) {
        if (path.length === 0) throw new Error("Cannot delete root");
        this.pushHistory();  // Save before modification

        const parentPath = path.slice(0, -1);
        const key = path[path.length - 1];
        const parent = parentPath.length === 0 ? this.data : this.getAt(parentPath);

        if (Array.isArray(parent)) {
            parent.splice(key as number, 1);
        } else {
            delete (parent as any)[key];
        }
        this.notify();
    }

    duplicateNode(path: JsonPath) {
        if (path.length === 0) return; // Cannot duplicate root
        this.pushHistory();

        const parentPath = path.slice(0, -1);
        const oldKey = path[path.length - 1];
        const parent = parentPath.length === 0 ? this.data : this.getAt(parentPath);
        const originalValue = this.getAt(path);

        // Deep clone the original value
        const clonedValue = JSON.parse(JSON.stringify(originalValue));

        if (Array.isArray(parent)) {
            // Insert after the original index in array
            parent.splice((oldKey as number) + 1, 0, clonedValue);
        } else {
            const obj = parent as Record<string, JsonValue>;
            // Generate a unique key
            let newKey = `${oldKey}_copy`;
            let counter = 1;
            while (obj.hasOwnProperty(newKey)) {
                newKey = `${oldKey}_copy_${counter++}`;
            }

            // To preserve order, we need to rebuild the object and insert newKey after oldKey
            const keys = Object.keys(obj);
            const temp = { ...obj };
            keys.forEach(k => delete obj[k]);

            keys.forEach(k => {
                obj[k] = temp[k];
                if (k === oldKey) {
                    obj[newKey] = clonedValue;
                }
            });
        }
        this.notify();
    }

    moveNode(fromPath: JsonPath, toPath: JsonPath, position: 'before' | 'after' | 'inside' = 'inside') {
        if (fromPath.length === 0) return; // Cannot move root

        // Don't move if target is a descendant of source
        if (JSON.stringify(toPath).startsWith(JSON.stringify(fromPath).slice(0, -1))) {
            if (toPath.length > fromPath.length) return;
        }

        const value = JSON.parse(JSON.stringify(this.getAt(fromPath)));
        this.pushHistory();

        // 1. Delete original
        const fromParentPath = fromPath.slice(0, -1);
        const fromKey = fromPath[fromPath.length - 1];
        const fromParent = fromParentPath.length === 0 ? this.data : this.getAt(fromParentPath);

        if (Array.isArray(fromParent)) {
            fromParent.splice(fromKey as number, 1);
        } else {
            delete (fromParent as any)[fromKey];
        }

        // 2. Adjust target path if source was a preceding sibling in the same array
        let adjustedToPath = [...toPath];
        if (Array.isArray(fromParent) && fromParentPath.join('.') === toPath.slice(0, -1).join('.')) {
            const fromIdx = fromKey as number;
            const toIdx = toPath[toPath.length - 1] as number;
            if (fromIdx < toIdx) {
                adjustedToPath[adjustedToPath.length - 1] = toIdx - 1;
            }
        }

        // 3. Insert value
        if (position === 'inside') {
            const target = this.getAt(adjustedToPath);
            if (Array.isArray(target)) {
                target.push(value);
            } else if (typeof target === 'object' && target !== null) {
                let newKey = String(fromKey);
                // Ensure unique key in new container
                let counter = 1;
                while ((target as any).hasOwnProperty(newKey)) {
                    newKey = `${fromKey}_${counter++}`;
                }
                (target as any)[newKey] = value;
            }
        } else {
            const targetParentPath = adjustedToPath.slice(0, -1);
            const targetKey = adjustedToPath[adjustedToPath.length - 1];
            const targetParent = targetParentPath.length === 0 ? this.data : this.getAt(targetParentPath);

            if (Array.isArray(targetParent)) {
                let insertIdx = targetKey as number;
                if (position === 'after') insertIdx++;
                targetParent.splice(insertIdx, 0, value);
            } else {
                const obj = targetParent as Record<string, JsonValue>;
                let newKey = String(fromKey);
                // Ensure unique key
                let counter = 1;
                const originalNewKey = newKey;
                while (obj.hasOwnProperty(newKey) && newKey !== targetKey) {
                    newKey = `${originalNewKey}_${counter++}`;
                }

                const keys = Object.keys(obj);
                const temp = { ...obj };
                keys.forEach(k => delete obj[k]);

                keys.forEach(k => {
                    if (position === 'before' && k === targetKey) obj[newKey] = value;
                    obj[k] = temp[k];
                    if (position === 'after' && k === targetKey) obj[newKey] = value;
                });
            }
        }

        this.notify();
    }
}
