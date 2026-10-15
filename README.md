# dsh-drop-to-workspace（拖放文件夹创建工作区）

**中文** | [English](README.en.md)

把文件资源管理器里的文件夹直接拖到侧边栏的**工作区**区域，即可创建并打开一个绑定该目录的
工作区——效果与用内置工作区选择器选文件夹完全一致，但全程不用离开窗口。
网页端在松开后需要确认 Harness 所在机器上的文件夹路径。

## 功能

- **拖动提示跟随可读取的信息切换。** 已识别的普通文件保持原生附件遮罩；已识别的文件夹
  显示顶部紧凑提示卡“检测到文件夹 · 名称”，不压暗背景。浏览器在悬停阶段通常不允许
  `webkitGetAsEntry()` 读取条目；类型未知且没有 MIME 类型时显示中性的“文件或文件夹”
  提示，避免把文件夹误显示为图片附件，也不会把没有扩展名的文件误判为文件夹。
- 桌面端把文件夹拖到工作区区域（分区标题 + 分组/平铺列表）上方时，提示卡会变成该区域上的虚线
  邀请框：“松开以创建新工作区”；类型尚未确定时显示“松开文件夹以创建新工作区”。
- 桌面端在此松开后解析每个文件夹的真实主机路径，逐个调用 `workspaces.create({ path })`，
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

## 网页端

获取被拖入文件夹的绝对主机路径依赖 Electron 壳注入的桥
（`window.__DSH_HOST_PATHS__`）。桌面版会注入该桥，外部浏览器页面没有。

网页端将文件夹拖到左侧**工作区**区域后，会打开路径确认框；输入 Harness 所在机器上
已有文件夹的绝对路径（例如 `C:\Projects\demo` 或 `/home/user/demo`），确认后创建并打开
工作区，取消则不创建。路径无效或打开失败时保留输入并显示错误，可修改后重试。

浏览器只能提供拖入文件夹的名称，不能自动获取其绝对路径。插件**不上传、复制或遍历文件夹
内容**，也不会根据名称猜测路径。如果 Harness 在远程机器上，路径必须指向远程机器已经
存在的目录，不能填写仅存在于浏览器本机的目录。网页端每次确认一个目录；一次拖入多个
文件夹也只打开一个路径确认框，不会自动批量创建。

工作区区域之外仍走原生附件流程，因此在对话区松开文件夹仍可能显示原生的桌面端限制提示。

## 安装

将插件安装到实际使用的 profile：桌面端用 **desktop**，独立网页服务用 **web**。

**方式一：插件面板**

设置 → 插件 → 添加插件，填入：

```
github:flandre0605/dsh-drop-to-workspace
```

完整地址 `https://github.com/flandre0605/dsh-drop-to-workspace` 同样识别。

**方式二：CLI**

```powershell
dsh plugin --profile desktop add github:flandre0605/dsh-drop-to-workspace
```

独立网页服务使用：

```powershell
dsh plugin --profile web add github:flandre0605/dsh-drop-to-workspace
```

安装或更新后需重启对应的桌面应用或网页服务；网页端还需刷新页面，才会加载新 bundle。

安装命令会将 `dsh.profile.bundles` 与已安装插件核对，把 `dsh-drop-to-workspace`
追加到 bundle 栈；profile 启动时再合并插件自带的 `cordis.patch.yml`，插入
`drop-to-workspace` 加载行。

> 从 Git 仓库安装得到的是**快照副本**，改代码不会自动生效。要边改边试，改用本地
> 路径安装：`dsh plugin --profile desktop add C:\path\to\dsh-drop-to-workspace`
> （`link:` 引用，重启后即加载当前文件）。

> 安装前插件管理器会先跑一次 `git ls-remote` 连通性检查。若它报“无法访问 GitHub”，
> 通常是本机 git 没有走代理（git 不读 Windows 系统代理）：
>
> ```powershell
> git config --global http.proxy  http://127.0.0.1:7897
> git config --global https.proxy http://127.0.0.1:7897
> ```
>
> 端口换成自己代理的实际端口。

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

- 桌面端一次拖入多个文件夹会创建多个工作区；第一个会被打开（主视图切换到它）。
- 在区域内拖入文件 + 文件夹混合内容时，仅处理文件夹，文件被跳过（该次拖放被完整消费）。
- 创建被拒绝（例如路径不可达）时显示本地化的失败提示，该文件夹不会成为工作区。
