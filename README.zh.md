# dsh-drop-to-workspace（拖放文件夹创建工作区）

把文件资源管理器里的文件夹直接拖到侧边栏的**工作区**区域，即可创建并打开一个绑定该目录的
工作区——效果与用内置工作区选择器选文件夹完全一致，但全程不用离开窗口。

## 功能

- **拖动提示跟随可读取的信息切换。** 已识别的普通文件保持原生附件遮罩；已识别的文件夹
  显示顶部紧凑提示卡“检测到文件夹 · 名称”，不压暗背景。浏览器在悬停阶段通常不允许
  `webkitGetAsEntry()` 读取条目；类型未知且没有 MIME 类型时显示中性的“文件或文件夹”
  提示，避免把文件夹误显示为图片附件，也不会把没有扩展名的文件误判为文件夹。
- 把文件夹拖到工作区区域（分区标题 + 分组/平铺列表）上方时，提示卡会变成该区域上的虚线
  邀请框：“松开以创建新工作区”；类型尚未确定时显示“松开文件夹以创建新工作区”。
- 在此松开后解析每个文件夹的真实主机路径，逐个调用 `workspaces.create({ path })`，
  并立即打开第一个创建的工作区。拖入已存在的工作区文件夹只会重新打开它
  （宿主端 `resolveByPath` 幂等）。
- **在该区域之外松开不改变任何行为。** 拖到对话区、输入框或任何其他地方再松开的文件夹，
  仍由原生附件流程按原样处理；普通文件的松开处理也保持原样，类型未知的悬停使用中性提示。

## 为什么限定在区域内

插件只在工作区区域内消费文件夹拖放。监听器挂在 `document` 捕获阶段并调用
`stopImmediatePropagation`，因此拖到该区域的文件夹不会到达附件处理流程或输入框——
但这一拦截以“指针确实位于该区域之上”为前提。原生附件流程判断是否接受松开，依据的是它
自己安装监听器时捕获得来的静态 `canAcceptDrop`，而不是被本插件压制的悬停状态，所以在
其他位置松开仍然走原有路径。

## 仅桌面端

获取被拖入文件夹的绝对主机路径依赖 Electron 壳注入的桥
（`window.__DSH_HOST_PATHS__`）。桌面版会注入该桥，外部浏览器页面没有。因此在
桌面版之外，插件保持静默，文件夹拖放会回退到附件插件原有的“仅桌面端支持添加
文件夹”提示。

## 安装

通过 DSH CLI 安装（安装后需重启桌面端，profile 才能加载新 bundle）：

```powershell
dsh plugin --profile web add C:\path\to\dsh-drop-to-workspace
```

该命令会将 `dsh.profile.bundles` 与已安装插件核对，把 `dsh-drop-to-workspace`
追加到 bundle 栈；profile 启动时再合并插件自带的 `cordis.patch.yml`，插入
`drop-to-workspace` 加载行。

## 目录结构

| 文件 | 作用 |
| --- | --- |
| `lib/index.js` | 宿主半边——空 `apply()`，让插件出现在宿主 Loader 中 |
| `lib/client.js` | 浏览器半边——区域识别、拖放拦截、提示框 slot、字典注册 |
| `cordis.patch.yml` | bundle patch，插入加载行 |
| `package.json` | `dsh.bundle.patch` + `dsh.client`（web 平台、服务 inject 列表） |
| `test/smoke.mjs` | 区域识别与接线测试（node + 假 DOM） |

## 区域如何被识别

侧边栏工作区区域按结构识别，而非按坐标：

- **主锚点是 slot 出口**：壳给每个 slot 出口包一层 `data-slot="<槽位名>"`
  （`display: contents`），工作区区域就是 `[data-slot="sidebar.workspaces"]`。
  这个属性值是声明的槽位名，不随 CSS Module 哈希变化，展开列表和收起窄条两种状态下都在。
  出口本身没有盒子，邀请框的几何取自其内部区域自身的根元素（内置浏览器最外层那个 div）。
- **结构回退**（壳不经过出口渲染该区域时）：它的树是语义锚点——内置浏览器把
  工作区/会话列表渲染为 `role="tree"`，行元素带 `data-row-key`；它自身的 CSS Module
  容器（`_sectionHeader`、`_listArea`、`_treeBody`、`_searchTree`、`_groupSection`、
  `_flatList`）覆盖分区标题条与列表内边距。CSS Module 类名形如
  `<构建哈希>_<语义名>`，哈希每次构建都变，语义后缀稳定；候选元素还需满足“区域根节点自身
  拥有带键行”，因此应用内其他位置同名容器（包括同样画 `role="tree"` 但不带
  `data-row-key` 的面板）不会被误判。

识别失败时是静默降级：若未来构建改名了这些锚点，悬停高亮会失效，但拖放仍能通过结构回退
工作，应用其他部分不受任何影响。

## 主题

只使用公开的主题 token（`--dsw-alias-brand-primary`、`--dsw-alias-bg-overlay`、
`--dsw-alias-border-l2`、`--dsw-alias-label-primary`、`--dsw-alias-label-secondary`），
几何与字体使用普通 CSS，因此提示框能跟随明暗主题，且不依赖内部设计 token。

## 行为说明

- 一次拖入多个文件夹会创建多个工作区；第一个会被打开（主视图切换到它）。
- 在区域内拖入文件 + 文件夹混合内容时，文件夹会创建工作区，文件被跳过（该次拖放被完整消费）。
- 创建被拒绝（例如路径不可达）时显示本地化的失败 toast，该文件夹不会成为工作区。
