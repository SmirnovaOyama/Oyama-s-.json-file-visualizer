
import './style.css';
import { i18n, detectLanguage, LangKey } from './i18n';
import { JsonStore, JsonValue, JsonPath } from './logic/store';
import { TreeRenderer } from './logic/render';
import { Toast } from './utils/toast';

// --- Initialization ---
const store = new JsonStore();
const treeRoot = document.getElementById('treeRoot') as HTMLDivElement;
let renderer: TreeRenderer;

// --- DOM Elements ---
const canvas = document.getElementById('canvas') as HTMLDivElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;

// Modals
const pasteModal = document.getElementById('pasteModal') as HTMLDialogElement;
const editModal = document.getElementById('editModal') as HTMLDialogElement;
const addNodeModal = document.getElementById('addNodeModal') as HTMLDialogElement;

// Context Menu
const contextMenu = document.getElementById('nodeContextMenu') as HTMLDivElement;
let activeContextPath: JsonPath | null = null;
let pendingEditPath: JsonPath | null = null;
let pendingEditType: 'value' | 'key' = 'value';
let pendingContainerType: 'object' | 'array' | null = null;

// i18n
let currentLang: LangKey = detectLanguage();
let t = i18n[currentLang];

function init() {
  renderer = new TreeRenderer(treeRoot, {
    onContextMenu: (e, path) => {
      activeContextPath = path;
      showContextMenu(e.clientX, e.clientY, path);
    }
  });

  store.subscribe(() => {
    renderer.render(store.get());
  });

  // Initial render (empty)
  renderer.render(null);

  applyTranslations();
  setupEventListeners();
  setupPanZoom();
}

// --- Event Listeners ---
function setupEventListeners() {
  // 1. Top Bar Actions
  document.getElementById('uploadBtn')!.onclick = () => fileInput.click();

  fileInput.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const r = new FileReader();
      r.onload = (evt) => {
        try {
          store.set(JSON.parse(evt.target!.result as string));
          Toast.success(t.msgVisualized);
        } catch {
          Toast.error(t.invalidJson);
        }
      };
      r.readAsText(file);
    }
    fileInput.value = ''; // Reset
  };

  document.getElementById('pasteBtn')!.onclick = () => pasteModal.showModal();

  document.getElementById('confirmPaste')!.onclick = () => {
    const txt = (document.getElementById('pasteArea') as HTMLTextAreaElement).value;
    try {
      store.set(JSON.parse(txt));
      pasteModal.close();
      Toast.success(t.msgVisualized);
    } catch {
      Toast.error(t.invalidJson);
    }
  };

  document.getElementById('cancelPaste')!.onclick = () => pasteModal.close();

  document.getElementById('downloadBtn')!.onclick = () => {
    const data = store.get();
    if (!data) return Toast.warning(t.noJsonData);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `json-viz-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.success(t.download);
  };

  const copyBtn = document.getElementById('copyBtn')!;
  copyBtn.onclick = () => {
    const data = store.get();
    if (!data) return Toast.warning(t.noJsonData);
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      .then(() => Toast.success(t.copied))
      .catch(() => Toast.error(t.failedToCopy));
  };

  document.getElementById('clearBtn')!.onclick = () => {
    if (store.get() && confirm(t.clearConfirm)) {
      store.set(null);
      Toast.info(t.msgCleared);
    }
  };

  document.getElementById('expandAllBtn')!.onclick = () => renderer.toggleAll(true);
  document.getElementById('collapseAllBtn')!.onclick = () => renderer.toggleAll(false);

  document.getElementById('langBtn')!.onclick = () => {
    currentLang = currentLang === 'en' ? 'zh' : 'en';
    localStorage.setItem('jsonviz-lang', currentLang);
    t = i18n[currentLang];
    renderer.updateLanguage();
    applyTranslations();
  };

  // 2. Context Menu Actions
  document.addEventListener('click', () => contextMenu.classList.remove('visible'));

  document.getElementById('ctxEditValue')!.onclick = (e) => {
    e.stopPropagation(); // keep menu? no, cloe it
    contextMenu.classList.remove('visible');
    openEditModal('value');
  };

  document.getElementById('ctxRename')!.onclick = () => {
    contextMenu.classList.remove('visible');
    openEditModal('key');
  };

  document.getElementById('ctxCopyKey')!.onclick = () => {
    if (!activeContextPath) return;
    const key = activeContextPath[activeContextPath.length - 1];
    navigator.clipboard.writeText(String(key))
      .then(() => Toast.success(t.copied))
      .catch(() => Toast.error(t.failedToCopy));
    contextMenu.classList.remove('visible');
  };

  document.getElementById('ctxCopyValue')!.onclick = () => {
    if (!activeContextPath) return;
    const val = store.getAt(activeContextPath);
    // If it's an object/array, we copy the JSON string. If primitive, we copy the string value.
    const textToCopy = (typeof val === 'object' && val !== null)
      ? JSON.stringify(val, null, 2)
      : String(val);

    navigator.clipboard.writeText(textToCopy)
      .then(() => Toast.success(t.copied))
      .catch(() => Toast.error(t.failedToCopy));
    contextMenu.classList.remove('visible');
  };

  document.getElementById('ctxDelete')!.onclick = () => {
    if (!activeContextPath) return;
    try {
      store.deleteNode(activeContextPath);
      Toast.success(t.msgDeleted);
    } catch (e) {
      Toast.error((e as Error).message);
    }
  };

  document.getElementById('ctxAddNode')!.onclick = () => openAddModal(null);
  document.getElementById('ctxAddObject')!.onclick = () => openAddModal('object');
  document.getElementById('ctxAddArray')!.onclick = () => openAddModal('array');

  // 3. Edit Modal
  const editInput = document.getElementById('editInput') as HTMLInputElement;

  document.getElementById('confirmEdit')!.onclick = () => {
    try {
      if (pendingEditType === 'key') {
        store.renameKey(pendingEditPath!, editInput.value);
      } else {
        store.updateValue(pendingEditPath!, editInput.value);
      }
      editModal.close();
      Toast.success(t.msgSaved);
    } catch (e) {
      Toast.error((e as Error).message);
    }
  };
  document.getElementById('cancelEdit')!.onclick = () => editModal.close();
  editInput.onkeyup = (e) => { if (e.key === 'Enter') document.getElementById('confirmEdit')!.click(); };

  // 4. Add Node Modal
  const addKey = document.getElementById('addNodeKey') as HTMLInputElement;
  const addVal = document.getElementById('addNodeValue') as HTMLInputElement;

  document.getElementById('confirmAddNode')!.onclick = () => {
    try {
      if (pendingContainerType) {
        // Adding a container (Object/Array) with a name
        const val = pendingContainerType === 'object' ? {} : [];
        store.addNode(activeContextPath!, addKey.value.trim(), val);
      } else {
        // Adding a primitive value
        // If parent is array, key is ignored in store logic if we passed correct path, but our store.addNode currently handles objects better.
        // Let's check store logic. 
        // Our store.addNode: if array -> push. if object -> use key.
        // Wait, if I am "Adding Node" to an object, I need Key + Value.
        // If I am "Adding Node" to an array, I need Value only.

        // store.addNode(path, key, value)

        store.addNode(activeContextPath!, addKey.value.trim(), addVal.value);
      }
      addNodeModal.close();
      Toast.success(t.msgAdded);
    } catch (e) {
      Toast.error((e as Error).message);
    }
  };
  document.getElementById('cancelAddNode')!.onclick = () => addNodeModal.close();
}

// --- Helpers ---
function showContextMenu(x: number, y: number, path: JsonPath) {
  // Logic to show/hide items based on type
  const data = store.get();
  let target: JsonValue = data!;
  for (const k of path) target = (target as any)[k];

  const isContainer = (typeof target === 'object' && target !== null);
  const isRoot = path.length === 0;

  // determine strict parent type for "Rename" validity
  let parentIsArray = false;
  if (!isRoot) {
    let parent = data!;
    for (let i = 0; i < path.length - 1; i++) parent = (parent as any)[path[i]];
    parentIsArray = Array.isArray(parent);
  }

  const show = (id: string, v: boolean) => {
    (document.getElementById(id) as HTMLElement).style.display = v ? 'flex' : 'none';
  };

  show('ctxEditValue', !isContainer);
  show('ctxAddNode', isContainer);
  show('ctxAddObject', isContainer);
  show('ctxAddArray', isContainer);
  show('ctxAddArray', isContainer);
  show('ctxRename', !isRoot && !parentIsArray);

  // Copy options
  show('ctxCopyKey', !isRoot && !parentIsArray); // Root has no key, array items have indices (maybe allowing copying index is weird?)
  // Actually copying index might be useful, but usually "Key" implies a name. Let's allow it for now or restrict?
  // User asked for "copy those contents". Copying Key is useful.

  show('ctxCopyValue', true); // Always allow copying value (even root)

  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.classList.add('visible');
}

function openEditModal(type: 'value' | 'key') {
  if (!activeContextPath) return;
  pendingEditPath = activeContextPath;
  pendingEditType = type;

  const h3 = editModal.querySelector('h3')!;
  const input = document.getElementById('editInput') as HTMLInputElement;

  if (type === 'key') {
    h3.textContent = t.renameKey;
    input.value = String(activeContextPath[activeContextPath.length - 1]);
  } else {
    h3.textContent = t.editValue;
    const val = store.getAt(activeContextPath);
    input.value = String(val);
  }

  editModal.showModal();
  input.focus();
  input.select();
}

function openAddModal(containerType: 'object' | 'array' | null) {
  pendingContainerType = containerType;

  // Title
  const title = document.getElementById('addNodeTitle')!;
  if (containerType === 'object') title.textContent = t.addGroupTitle;
  else if (containerType === 'array') title.textContent = t.addListTitle;
  else title.textContent = t.addNodeTitle;

  // Visibility of inputs
  const target = store.getAt(activeContextPath!);
  const isTargetArray = Array.isArray(target);

  const keyRow = document.getElementById('addNodeKeyRow')!;
  // Or just querying labels
  const allRows = addNodeModal.querySelectorAll('div > label');
  const valInputRow = allRows[1]?.parentElement;

  if (isTargetArray) {
    keyRow.style.display = 'none'; // Arrays don't need keys
  } else {
    keyRow.style.display = 'block';
  }

  // If adding container, we don't need value input
  if (containerType) {
    if (valInputRow) valInputRow.style.display = 'none';
  } else {
    if (valInputRow) valInputRow.style.display = 'block';
  }

  (document.getElementById('addNodeKey') as HTMLInputElement).value = '';
  (document.getElementById('addNodeValue') as HTMLInputElement).value = '';

  addNodeModal.showModal();
  if (!isTargetArray) document.getElementById('addNodeKey')!.focus();
  else document.getElementById('addNodeValue')!.focus();
}

// --- Pan & Zoom (Simplified for brevity, similar to original) ---
function setupPanZoom() {
  let panX = 0, panY = 0, scale = 1;
  let isDragging = false, startX = 0, startY = 0;

  let hasMoved = false;
  let mouseDownX = 0;
  let mouseDownY = 0;

  const update = () => {
    treeRoot.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  };

  canvas.addEventListener('mousedown', e => {
    const target = e.target as HTMLElement;
    // Allow dragging on nodes, but strictly block interactive controls
    if (target.closest('button') || target.closest('input') || target.closest('textarea')) return;

    isDragging = true;
    hasMoved = false;
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;

    startX = e.clientX - panX;
    startY = e.clientY - panY;
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    e.preventDefault();

    const dx = Math.abs(e.clientX - mouseDownX);
    const dy = Math.abs(e.clientY - mouseDownY);
    if (dx > 5 || dy > 5) hasMoved = true;

    panX = e.clientX - startX;
    panY = e.clientY - startY;
    requestAnimationFrame(update);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
  });

  // Capture click event to prevent node toggling if we dragged
  window.addEventListener('click', (e) => {
    if (hasMoved) {
      e.stopPropagation();
      hasMoved = false;
    }
  }, true);

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomSpeed = 0.1;
    const newScale = e.deltaY < 0 ? scale * (1 + zoomSpeed) : scale * (1 - zoomSpeed);
    scale = Math.max(0.1, Math.min(5, newScale));
    requestAnimationFrame(update);
  }, { passive: false });

  document.getElementById('zoomInBtn')!.onclick = () => { scale = Math.min(5, scale * 1.2); update(); };
  document.getElementById('zoomOutBtn')!.onclick = () => { scale = Math.max(0.1, scale * 0.8); update(); };
  document.getElementById('resetViewBtn')!.onclick = () => { panX = 0; panY = 0; scale = 1; update(); };
}

// Apply text translations to static UI
function applyTranslations() {
  // Top Buttons
  if (document.getElementById('uploadBtn')) document.getElementById('uploadBtn')!.lastChild!.textContent = ' ' + t.uploadJson;
  if (document.getElementById('pasteBtn')) document.getElementById('pasteBtn')!.lastChild!.textContent = ' ' + t.pasteText;
  if (document.getElementById('downloadBtn')) document.getElementById('downloadBtn')!.lastChild!.textContent = ' ' + t.download;
  if (document.getElementById('copyBtn')) document.getElementById('copyBtn')!.lastChild!.textContent = ' ' + t.copy;
  if (document.getElementById('clearBtn')) document.getElementById('clearBtn')!.lastChild!.textContent = ' ' + t.clear;

  if (document.getElementById('expandAllBtn')) document.getElementById('expandAllBtn')!.textContent = t.expandAll;
  if (document.getElementById('collapseAllBtn')) document.getElementById('collapseAllBtn')!.textContent = t.collapse;

  // Context Menu
  const ctxKey = document.getElementById('ctxCopyKey');
  if (ctxKey && ctxKey.lastChild) ctxKey.lastChild.textContent = ' ' + t.copyKey;

  const ctxVal = document.getElementById('ctxCopyValue');
  if (ctxVal && ctxVal.lastChild) ctxVal.lastChild.textContent = ' ' + t.copyValue;

  const ctxRename = document.getElementById('ctxRename');
  if (ctxRename && ctxRename.lastChild) ctxRename.lastChild.textContent = ' ' + t.rename;

  const ctxDelete = document.getElementById('ctxDelete');
  if (ctxDelete && ctxDelete.lastChild) ctxDelete.lastChild.textContent = ' ' + t.delete;

  const ctxAddNode = document.getElementById('ctxAddNode');
  if (ctxAddNode && ctxAddNode.lastChild) ctxAddNode.lastChild.textContent = ' ' + t.addNode;

  const ctxAddObj = document.getElementById('ctxAddObject');
  if (ctxAddObj && ctxAddObj.lastChild) ctxAddObj.lastChild.textContent = ' ' + t.addGroup;

  const ctxAddArr = document.getElementById('ctxAddArray');
  if (ctxAddArr && ctxAddArr.lastChild) ctxAddArr.lastChild.textContent = ' ' + t.addList;

  const ctxEdit = document.getElementById('ctxEditValue');
  if (ctxEdit && ctxEdit.lastChild) ctxEdit.lastChild.textContent = ' ' + t.editValue;

  document.getElementById('langText')!.textContent = currentLang === 'en' ? 'EN' : '中';
}

init();
