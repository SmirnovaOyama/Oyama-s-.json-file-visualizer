# JSON Visualizer

A beautiful, high-performance, interactive JSON visualization tool that turns your raw JSON data into a vibrant, mindmap-style tree.


## Key Features
- **Visual Editing**: Edit keys and values directly in the graph.
- **Drag & Drop**: Upload JSON files or paste text directly.
- **Vibrant UI**: 7-color rainbow depth coding for easy readability.
- **Interactive**: Pan, zoom, drag, and toggle nodes.
- **Smart Type Detection**: Automatically handles Booleans, Numbers, Strings, and Nulls.
- **Internationalization**: Full English and Chinese (中文) support.

---

## User Guide 使用指南

### 1. Navigation 导航
- **Pan / 拖动**: Click and drag anywhere on the canvas (background or nodes) to move the view.
  - *Note*: Clicking and fast-dragging moves the view. Clicking and releasing without moving triggers a click (toggle).
- **Zoom / 缩放**: Use the mouse wheel or the top-right `+` / `-` buttons.
- **Expand/Collapse / 折叠**: Single-click a node to show/hide its children.

### 2. Context Menu 右键菜单
**Right-Click** (or Alt / option + Click) on any node to access powerful tools:

| Action (操作) | Description (说明) |
| :--- | :--- |
| **Edit Value** | Modify the value of a node. |
| **Rename** | Rename an object key. |
| **Add Node** | Add a new Key-Value pair to an object. |
| **Add Group/List** | nested Object `{}` or Array `[]`. |
| **Copy Key/Value** | Copy the key name or value to clipboard. |
| **Delete** | Remove the node. |

### 3. Editing & Data Types 编辑与类型
The editor tries to be smart about data types:

- **Booleans**: Type `true` or `false` → Saves as Boolean.
- **Numbers**: Type `123` or `1.5` → Saves as Number.
- **Null**: Type `null` → Saves as `null`.
- **Strings**: Anything else is saved as a String.
- **Force String**: If you *want* to save "123" as a string, enter it with quotes: `"123"`. The app will strip the quotes and force-save it as a string: `123`.

---

##  Running Locally

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Dev Server**:
   ```bash
   npm run dev
   ```

3. **Build for Production**:
   ```bash
   npm run build
   ```

## Tech Stack
- **Vite** (Build Tool)
- **TypeScript** (Logic)
- **Vanilla CSS** (Styling - No frameworks)
- **HTML5** (Canvas & DOM)

---

## Contributing 贡献指南

If you find a bug or want to add a new feature, feel free to open an issue or submit a pull request, or make a new version for your own use.


## License 许可协议

Distributed under the MIT License.


