
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonPath = (string | number)[];

export class JsonStore {
    private data: JsonValue | null = null;
    private listeners: (() => void)[] = [];

    constructor(initialData: JsonValue | null = null) {
        this.data = initialData;
    }

    get(): JsonValue | null {
        return this.data;
    }

    set(data: JsonValue | null) {
        this.data = data;
        this.notify();
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

        const parentPath = path.slice(0, -1);
        const key = path[path.length - 1];
        const target = parentPath.length === 0 ? this.data : this.getAt(parentPath);

        // Type normalization
        let finalVal = value;
        const strVal = String(value).trim();

        if (strVal.startsWith('"') && strVal.endsWith('"')) {
            // Explicit string (strip quotes)
            finalVal = strVal.slice(1, -1);
        } else if (value === 'true') {
            finalVal = true;
        } else if (value === 'false') {
            finalVal = false;
        } else if (value === 'null') {
            finalVal = null;
        } else if (!isNaN(Number(value)) && strVal !== '') {
            finalVal = Number(value);
        }

        (target as any)[key] = finalVal;
        this.notify();
    }

    renameKey(path: JsonPath, newKey: string) {
        if (!this.data) return;

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
        const target = path.length === 0 ? this.data : this.getAt(path);

        // Normalize value
        let finalVal = value;
        const strVal = String(value).trim();

        if (strVal.startsWith('"') && strVal.endsWith('"')) {
            finalVal = strVal.slice(1, -1);
        } else if (value === 'true') {
            finalVal = true;
        } else if (value === 'false') {
            finalVal = false;
        } else if (value === 'null') {
            finalVal = null;
        } else if (!isNaN(Number(value)) && strVal !== '') {
            finalVal = Number(value);
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
}
