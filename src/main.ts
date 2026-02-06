
import './style.css';
import { i18n, detectLanguage, LangKey } from './i18n';
import { JsonStore, JsonValue, JsonPath } from './logic/store';
import { TreeRenderer } from './logic/render';
import { GraphRenderer } from './logic/graphRenderer';
import { Toast } from './utils/toast';

// --- Initialization ---
const store = new JsonStore();
const treeRoot = document.getElementById('treeRoot') as HTMLDivElement;

// --- DOM Elements ---
const canvas = document.getElementById('canvas') as HTMLDivElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;

// State

let activeNodeElement: HTMLElement | null = null;

// Modals
const pasteModal = document.getElementById('pasteModal') as HTMLDialogElement;



// Context Menu
const contextMenu = document.getElementById('nodeContextMenu') as HTMLDivElement;
let activeContextPath: JsonPath | null = null;



// i18n
let currentLang: LangKey = detectLanguage();
let t = i18n[currentLang];

// Init Renderer
const renderer = new TreeRenderer(treeRoot, {
  onNodeClick: () => {
    // Optional: selection logic
  },
  onContextMenu: (e, path, element) => {
    activeContextPath = path;
    activeNodeElement = element;
    showContextMenu(e.clientX, e.clientY, path);
  }
});

// Graph Renderer
const graphCanvas = document.getElementById('graphCanvas') as HTMLDivElement;
let graphRenderer: GraphRenderer | null = null;

// Helper function to create a wrapper element for graph nodes
// This allows the context menu system to work with SVG elements
function createGraphNodeWrapper(svgElement: SVGGElement, path: JsonPath): HTMLElement {
  // Create a temporary div that mimics the structure expected by the context menu
  const wrapper = document.createElement('div');
  wrapper.className = 'graph-node-wrapper';
  wrapper.setAttribute('data-path', JSON.stringify(path));

  // Add key and value spans to match tree node structure
  const keySpan = document.createElement('span');
  keySpan.className = 'key-text';
  const pathKey = path.length > 0 ? path[path.length - 1] : 'root';
  keySpan.textContent = String(pathKey);
  wrapper.appendChild(keySpan);

  const valueSpan = document.createElement('span');
  valueSpan.className = 'val-text';
  // Get value from store
  const value = store.getAt(path);
  if (typeof value !== 'object' || value === null) {
    valueSpan.textContent = String(value);
  }
  wrapper.appendChild(valueSpan);

  // Store reference to original SVG element for potential updates
  (wrapper as any)._svgElement = svgElement;
  (wrapper as any)._isGraphNode = true;

  return wrapper;
}

function init() {
  // Initialize Graph Renderer
  if (graphCanvas) {
    graphRenderer = new GraphRenderer(graphCanvas, {
      onNodeClick: (_path, _node) => {
        // Sync selection with tree view if needed
      },
      onNodeContextMenu: (e, path, _node, element) => {
        // Use the same context menu as tree view
        activeContextPath = path;
        // Create a wrapper element for the context menu to work with
        activeNodeElement = createGraphNodeWrapper(element, path);
        showContextMenu(e.clientX, e.clientY, path);
      }
    });
  }

  store.subscribe(() => {
    const data = store.get();
    renderer.render(data);
    graphRenderer?.render(data);
  });

  // Try to load saved data from localStorage
  const savedData = localStorage.getItem('jsonviz-saved-data');
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      store.set(parsed);
      // Don't show toast on initial load to avoid noise
    } catch (e) {
      // Invalid saved data, ignore
    }
  } else {
    // Initial render (empty)
    renderer.render(null);
    graphRenderer?.render(null);
  }

  applyTranslations();
  setupEventListeners();
  setupPanZoom();
  setupSplitDivider();
  setupGraphControls();

  // Force Traditional Mode Class
  treeRoot.classList.add('traditional-mode');
  canvas.classList.add('traditional-layout');
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

  // Save to localStorage
  document.getElementById('saveLocalBtn')!.onclick = () => {
    const data = store.get();
    if (!data) return Toast.warning(t.noJsonData);
    try {
      localStorage.setItem('jsonviz-saved-data', JSON.stringify(data));
      Toast.success(t.savedLocally);
    } catch (e) {
      Toast.error('Storage full or unavailable');
    }
  };

  document.getElementById('clearBtn')!.onclick = () => {
    if (store.get() && confirm(t.clearConfirm)) {
      store.set(null);
      Toast.info(t.msgCleared);
    }
  };

  document.getElementById('expandAllBtn')!.onclick = () => {
    renderer.toggleAll(true);
    graphRenderer?.toggleAll(true);
  };
  document.getElementById('collapseAllBtn')!.onclick = () => {
    renderer.toggleAll(false);
    graphRenderer?.toggleAll(false);
  };

  // View & Language Dropdowns
  setupDropdowns();

  // 2. Context Menu Actions
  document.addEventListener('click', (e) => {
    contextMenu.classList.remove('visible');

    // Close dropdowns if clicked outside
    if (!(e.target as Element).closest('.custom-dropdown')) {
      document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
    }
  });

  document.getElementById('ctxEditValue')!.onclick = (e) => {
    e.stopPropagation();
    contextMenu.classList.remove('visible');
    if (activeNodeElement && activeContextPath) {
      // Check if this is a graph node (use graph inline edit) or tree node (use tree inline edit)
      if ((activeNodeElement as any)._isGraphNode) {
        // Use inline editing on graph node
        graphRenderer?.enableInlineEditing(activeContextPath, 'value', (newVal) => {
          store.updateValue(activeContextPath!, newVal);
        });
      } else {
        renderer.enableInlineEditing(activeNodeElement, 'value', (newVal) => {
          store.updateValue(activeContextPath!, newVal);
        });
      }
    }
  };

  document.getElementById('ctxRename')!.onclick = () => {
    contextMenu.classList.remove('visible');
    if (activeNodeElement && activeContextPath) {
      // Check if this is a graph node (use graph inline edit) or tree node (use tree inline edit)
      if ((activeNodeElement as any)._isGraphNode) {
        // Use inline editing on graph node
        graphRenderer?.enableInlineEditing(activeContextPath, 'key', (newVal) => {
          store.renameKey(activeContextPath!, newVal);
        });
      } else {
        renderer.enableInlineEditing(activeNodeElement, 'key', (newVal) => {
          store.renameKey(activeContextPath!, newVal);
        });
      }
    }
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

  const handleAdd = (addType: 'node' | 'object' | 'array' | 'paste') => {
    if (!activeContextPath || !activeNodeElement) return;
    contextMenu.classList.remove('visible');

    // Identify parent container type
    const target = store.getAt(activeContextPath);
    const containerType = Array.isArray(target) ? 'array' : 'object';

    renderer.showInlineAdd(
      activeNodeElement,
      containerType,
      addType,
      (key, value) => {
        try {
          store.addNode(activeContextPath!, key, value);
          Toast.success(t.msgAdded);
        } catch (e) {
          Toast.error((e as Error).message);
        }
      }
    );
  };

  document.getElementById('ctxAddNode')!.onclick = () => handleAdd('node');
  document.getElementById('ctxAddObject')!.onclick = () => handleAdd('object');
  document.getElementById('ctxAddArray')!.onclick = () => handleAdd('array');
  document.getElementById('ctxPasteJSON')!.onclick = () => handleAdd('paste');


}

function setupDropdowns() {
  // --- Language Dropdown ---
  const langDropdown = document.getElementById('langDropdown')!;
  const langTrigger = document.getElementById('langTrigger')!;
  const langLabel = document.getElementById('langLabel')!;
  const langItems = document.querySelectorAll('#langMenu .dropdown-item');

  // Init Label
  const langMap: Record<string, string> = { 'en': 'English', 'zh': '简体中文', 'ja': '日本語' };
  if (langMap[currentLang]) langLabel.textContent = langMap[currentLang];

  // Highlight initial selection
  langItems.forEach(item => {
    if (item.getAttribute('data-value') === currentLang) item.classList.add('selected');
    else item.classList.remove('selected');
  });

  langTrigger.onclick = (e) => {
    e.stopPropagation();
    const isActive = langDropdown.classList.contains('active');
    closeAllDropdowns();
    if (!isActive) langDropdown.classList.add('active');
  };

  langItems.forEach(item => {
    (item as HTMLElement).onclick = (e) => {
      e.stopPropagation();
      const val = item.getAttribute('data-value') as LangKey;
      if (val === currentLang) {
        langDropdown.classList.remove('active');
        return;
      }

      // Logic
      currentLang = val;
      localStorage.setItem('jsonviz-lang', currentLang);
      t = i18n[currentLang];
      renderer.updateLanguage();
      applyTranslations(); // Updates static text
      renderer.render(store.get()); // Re-render to update empty state text or tree context menu text


      // UI Update
      langLabel.textContent = langMap[val];
      langItems.forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      langDropdown.classList.remove('active');
    };
  });




}

function closeAllDropdowns() {

  document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
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
  show('ctxPasteJSON', isContainer);
  show('ctxRename', !isRoot && !parentIsArray);

  // Copy options
  show('ctxCopyKey', !isRoot && !parentIsArray); // Root has no key, array items have indices (maybe allowing copying index is weird?)
  // Actually copying index might be useful, but usually "Key" implies a name. Let's allow it for now or restrict?
  // User asked for "copy those contents". Copying Key is useful.

  show('ctxCopyValue', true); // Always allow copying value (even root)

  contextMenu.style.left = x + 'px';
  contextMenu.style.top = y + 'px';
  contextMenu.classList.add('visible');

  // Adjust for viewport overflow
  const rect = contextMenu.getBoundingClientRect();
  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;

  if (rect.right > winWidth) {
    contextMenu.style.left = (winWidth - rect.width - 20) + 'px';
  }

  if (rect.bottom > winHeight) {
    // Open upwards if not enough space below
    contextMenu.style.top = (y - rect.height) + 'px';
  }
}





// --- Pan & Zoom ---
function setupPanZoom() {
  // Zoom State for Tree View
  let traditionalZoom = 1.0;

  const updateTraditionalZoom = (val: number) => {
    // Limit zoom between 0.2 (20%) and 3.0 (300%)
    traditionalZoom = Math.max(0.2, Math.min(3.0, val));
    treeRoot.style.zoom = String(traditionalZoom);
    const disp = document.getElementById('zoomDisplay');
    if (disp) disp.textContent = Math.round(traditionalZoom * 100) + '%';
  };

  // Zoom Buttons
  const btnIn = document.getElementById('zoomInBtn');
  const btnOut = document.getElementById('zoomOutBtn');
  if (btnIn) btnIn.onclick = () => updateTraditionalZoom(traditionalZoom + 0.1);
  if (btnOut) btnOut.onclick = () => updateTraditionalZoom(traditionalZoom - 0.1);

  // Expose panToElement for search integration
  (window as any).panToElement = (el: HTMLElement) => {
    if (!el) return;
    // Native scrolling for Tree View
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  // Force Traditional Mode State

  treeRoot.classList.add('traditional-mode');
  canvas.classList.add('traditional-layout');

  // Reset
  treeRoot.style.transform = 'none';
  treeRoot.style.zoom = '1';
  updateTraditionalZoom(1.0);
}

// Apply text translations to static UI
function applyTranslations() {
  // Top Buttons
  if (document.getElementById('uploadBtn')) document.getElementById('uploadBtn')!.lastChild!.textContent = ' ' + t.uploadJson;
  if (document.getElementById('pasteBtn')) document.getElementById('pasteBtn')!.lastChild!.textContent = ' ' + t.pasteText;
  if (document.getElementById('downloadBtn')) document.getElementById('downloadBtn')!.lastChild!.textContent = ' ' + t.download;
  if (document.getElementById('copyBtn')) document.getElementById('copyBtn')!.lastChild!.textContent = ' ' + t.copy;
  if (document.getElementById('saveLocalBtn')) document.getElementById('saveLocalBtn')!.lastChild!.textContent = ' ' + t.saveLocal;
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

  const ctxPaste = document.getElementById('ctxPasteJSON');
  if (ctxPaste && ctxPaste.lastChild) ctxPaste.lastChild.textContent = ' ' + (t as any).pasteJSON;

  const ctxEdit = document.getElementById('ctxEditValue');
  if (ctxEdit && ctxEdit.lastChild) ctxEdit.lastChild.textContent = ' ' + t.editValue;

  const langLabel = document.getElementById('langLabel');
  if (langLabel) {
    const langMap: Record<string, string> = { 'en': 'English', 'zh': '简体中文', 'ja': '日本語' };
    langLabel.textContent = langMap[currentLang] || 'English';
  }
}





// --- Search Integration ---
const searchInput = document.getElementById('searchInput') as HTMLInputElement;
const searchCount = document.getElementById('searchCount')!;
const searchNext = document.getElementById('searchNextBtn');
const searchPrev = document.getElementById('searchPrevBtn');

let lastTotal = 0;

const updateSearchUI = (idx: number, total: number) => {
  lastTotal = total;
  if (total === 0) {
    searchCount.textContent = searchInput.value ? '0' : '';
  } else {
    searchCount.textContent = `${idx} / ${total}`;
  }
};

const searchDropdown = document.getElementById('searchDropdown')!;
let selectedSuggestionIndex = -1;
let currentSuggestions: Array<{ element: HTMLElement }> = [];

const renderSearchDropdown = (query: string) => {
  if (!query.trim()) {
    searchDropdown.classList.remove('active');
    searchDropdown.innerHTML = '';
    currentSuggestions = [];
    selectedSuggestionIndex = -1;
    return;
  }

  const suggestions = renderer.getSearchSuggestions(query, 8);
  currentSuggestions = suggestions;
  selectedSuggestionIndex = -1;

  if (suggestions.length === 0) {
    searchDropdown.innerHTML = `<div class="search-no-results">No results found</div>`;
    searchDropdown.classList.add('active');
    return;
  }

  searchDropdown.innerHTML = suggestions.map((s, i) => {
    // Determine value type for styling
    let typeClass = '';
    let displayValue = s.value;
    if (s.value !== null) {
      if (s.value === 'true' || s.value === 'false') typeClass = 'type-boolean';
      else if (s.value === 'null') typeClass = 'type-null';
      else if (!isNaN(Number(s.value)) && s.value.trim() !== '') typeClass = 'type-number';
      else typeClass = 'type-string';

      // Truncate long values - allow more space, wrap if needed
      if (displayValue && displayValue.length > 60) {
        displayValue = displayValue.substring(0, 60) + '...';
      }
    }

    // Build title with key and value on separate lines if value exists
    let titleHtml = '';
    if (s.value !== null) {
      titleHtml = `
        <div class="search-suggestion-row">
          <span class="match-key">${escapeHtml(s.key)}</span>
          <span class="match-separator">:</span>
          <span class="match-value ${typeClass}">${escapeHtml(displayValue || '')}</span>
        </div>
      `;
    } else {
      titleHtml = `<div class="search-suggestion-row"><span class="match-key">${escapeHtml(s.key)}</span></div>`;
    }

    // Format path with styled segments
    const pathHtml = formatPathHtml(s.path);

    return `
      <div class="search-suggestion" data-index="${i}">
        <div class="search-suggestion-content">${titleHtml}</div>
        <div class="search-suggestion-path">${pathHtml}</div>
      </div>
    `;
  }).join('');

  searchDropdown.classList.add('active');

  // Add click handlers
  searchDropdown.querySelectorAll('.search-suggestion').forEach((el, i) => {
    el.addEventListener('click', () => {
      selectSuggestion(i);
    });
  });
};

const escapeHtml = (str: string) => {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

const formatPathHtml = (path: string) => {
  // path format: "$ > segment1 > segment2 > ..."
  const parts = path.split(' > ');
  return parts.map((part, i) => {
    if (i === 0) {
      // Root symbol
      return `<span class="path-root">${escapeHtml(part)}</span>`;
    }
    return `<span class="path-separator">›</span><span class="path-segment">${escapeHtml(part)}</span>`;
  }).join('');
};

const selectSuggestion = (index: number) => {
  if (index < 0 || index >= currentSuggestions.length) return;

  const suggestion = currentSuggestions[index];
  // searchDropdown.classList.remove('active'); // Keep open

  // Pan to element
  if (suggestion.element) {
    (window as any).panToElement(suggestion.element);
    suggestion.element.classList.add('search-match', 'active-match');

    // Remove highlight after a moment
    setTimeout(() => {
      suggestion.element.classList.remove('active-match');
    }, 2000);
  }
};

const updateSuggestionSelection = () => {
  const items = searchDropdown.querySelectorAll('.search-suggestion');
  items.forEach((el, i) => {
    if (i === selectedSuggestionIndex) {
      el.classList.add('selected');
      el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove('selected');
    }
  });
};

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value;
    const count = renderer.search(query);
    updateSearchUI(count > 0 ? 1 : 0, count);

    // Show dropdown suggestions
    renderSearchDropdown(query);

    // Pan to first match if exists
    if (count > 0) {
      const el = renderer.currentMatchElement;
      if (el) (window as any).panToElement(el);
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    // Handle dropdown navigation
    if (searchDropdown.classList.contains('active')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, currentSuggestions.length - 1);
        updateSuggestionSelection();
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        updateSuggestionSelection();
        return;
      } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
        e.preventDefault();
        selectSuggestion(selectedSuggestionIndex);
        return;
      }
    }

    if (e.key === 'Escape') {
      searchInput.value = '';
      renderer.search('');
      lastTotal = 0;
      updateSearchUI(0, 0);
      searchDropdown.classList.remove('active');
      searchInput.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // searchDropdown.classList.remove('active'); // Keep open
      if (e.shiftKey) {
        const idx = renderer.prevMatch();
        updateSearchUI(idx, lastTotal);
        const el = renderer.currentMatchElement;
        if (el) (window as any).panToElement(el);
      } else {
        const idx = renderer.nextMatch();
        updateSearchUI(idx, lastTotal);
        const el = renderer.currentMatchElement;
        if (el) (window as any).panToElement(el);
      }
    }
  });

  searchInput.addEventListener('blur', () => {
    // Delay to allow click on suggestion
    setTimeout(() => {
      searchDropdown.classList.remove('active');
    }, 200);
  });

  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) {
      renderSearchDropdown(searchInput.value);
    }
  });
}

if (searchNext) {
  searchNext.onclick = () => {
    const idx = renderer.nextMatch();
    updateSearchUI(idx, lastTotal);
    const el = renderer.currentMatchElement;
    if (el) (window as any).panToElement(el);
  };
}

if (searchPrev) {
  searchPrev.onclick = () => {
    const idx = renderer.prevMatch();
    updateSearchUI(idx, lastTotal);
    const el = renderer.currentMatchElement;
    if (el) (window as any).panToElement(el);
  };
}

// --- Keyboard Shortcuts ---
window.addEventListener('keydown', (e) => {
  // Don't trigger shortcuts when typing in inputs
  const target = e.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return;
  }

  // Ctrl+S / Cmd+S - Save locally
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    const data = store.get();
    if (!data) {
      Toast.warning(t.noJsonData);
      return;
    }
    try {
      localStorage.setItem('jsonviz-saved-data', JSON.stringify(data));
      Toast.success(t.savedLocally);
    } catch (err) {
      Toast.error('Storage full or unavailable');
    }
  }

  // Ctrl+Z / Cmd+Z - Undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (store.undo()) {
      Toast.info('Undo');
    }
  }
});

// --- Split Panel Divider ---
function setupSplitDivider() {
  const divider = document.getElementById('splitDivider');
  const leftPanel = document.getElementById('leftPanel');
  const rightPanel = document.getElementById('rightPanel');

  if (!divider || !leftPanel || !rightPanel) return;

  let isDragging = false;
  let startX = 0;
  let leftStartWidth = 0;
  let rightStartWidth = 0;

  divider.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    leftStartWidth = leftPanel.offsetWidth;
    rightStartWidth = rightPanel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - startX;
    const totalWidth = leftStartWidth + rightStartWidth;

    let newLeftWidth = leftStartWidth + deltaX;
    let newRightWidth = rightStartWidth - deltaX;

    // Minimum widths
    const minWidth = 300;
    if (newLeftWidth < minWidth) {
      newLeftWidth = minWidth;
      newRightWidth = totalWidth - minWidth;
    }
    if (newRightWidth < minWidth) {
      newRightWidth = minWidth;
      newLeftWidth = totalWidth - minWidth;
    }

    leftPanel.style.flex = 'none';
    rightPanel.style.flex = 'none';
    leftPanel.style.width = newLeftWidth + 'px';
    rightPanel.style.width = newRightWidth + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// --- Graph Controls ---
function setupGraphControls() {
  const zoomInBtn = document.getElementById('graphZoomIn');
  const zoomOutBtn = document.getElementById('graphZoomOut');
  const resetBtn = document.getElementById('graphReset');

  if (zoomInBtn) {
    zoomInBtn.onclick = () => graphRenderer?.zoomIn();
  }

  if (zoomOutBtn) {
    zoomOutBtn.onclick = () => graphRenderer?.zoomOut();
  }

  if (resetBtn) {
    resetBtn.onclick = () => graphRenderer?.resetView();
  }
}

init();

