window.__ModuleLoader__.load({
	id: "dsh-drop-to-workspace",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const { jsx, Fragment } = require("react/jsx-runtime");
		const { createSnapshotStore } = require("@deepseek-ai/dsh-client-store");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client/dictionaries.js
		/** Dictionary namespace owned by this plugin. */
		const NS = "dropToWorkspace";
		const zh = {
			"zone.title": "松开以创建新工作区",
			"zone.pendingTitle": "松开文件夹以创建新工作区",
			"zone.webTitle": "松开文件夹后确认工作区路径",
			"hint.title": "检测到文件夹",
			"hint.how": "拖到左侧「工作区」列表即可创建新工作区",
			"hint.pendingTitle": "文件或文件夹",
			"hint.pendingHow": "文件夹可拖到左侧「工作区」列表创建新工作区",
			"hint.webHow": "文件夹可拖到左侧「工作区」列表，然后确认主机路径",
			"directory.title": "添加工作区",
			"directory.path": "Harness 所在机器上的文件夹路径",
			"directory.cancel": "取消",
			"directory.create": "创建并打开",
			"directory.busy": "正在打开…",
			"directory.openFailed": "工作区已添加，但打开失败：{message}",
			"toast.createFailed": "创建工作区失败：{message}",
			"toast.pathUnavailable": "无法获取文件夹路径，请直接从文件资源管理器拖入",
			"toast.createTimeout": "创建工作区超时，请重试"
		};
		const en = {
			"zone.title": "Release to create a workspace",
			"zone.pendingTitle": "Release folders to create a workspace",
			"zone.webTitle": "Release folders to confirm the workspace path",
			"hint.title": "Folder detected",
			"hint.how": "Drop it on the Workspaces list on the left to create a workspace",
			"hint.pendingTitle": "Files or folders",
			"hint.pendingHow": "Folders can be dropped on the Workspaces list to create a workspace",
			"hint.webHow": "Drop folders on the Workspaces list, then confirm their host path",
			"directory.title": "Add workspace",
			"directory.path": "Folder path on the machine running Harness",
			"directory.cancel": "Cancel",
			"directory.create": "Create and open",
			"directory.busy": "Opening…",
			"directory.openFailed": "Workspace added, but could not open it: {message}",
			"toast.createFailed": "Failed to create workspace: {message}",
			"toast.pathUnavailable": "Could not resolve the folder path — drop it straight from your file manager",
			"toast.createTimeout": "Workspace creation timed out, please try again"
		};
		//#endregion
		//#region lib/types/client/zone.css
		/** Only the published theme tokens are used; geometry stays plain CSS. */
		const css = ".dtw_zone{position:fixed;z-index:1001;pointer-events:none;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-width:168px;padding:16px;text-align:center;border:1px dashed var(--dsw-alias-brand-primary);border-radius:12px;background-color:var(--dsw-alias-bg-overlay);box-shadow:0 0 0 1px var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;animation:dtw_fade_in .16s ease-out}@keyframes dtw_fade_in{0%{opacity:0}to{opacity:1}}@media (prefers-reduced-motion:reduce){.dtw_zone,.dtw_hint{animation:none}}.dtw_icon{color:var(--dsw-alias-brand-primary);flex:none}.dtw_title{font-weight:500}.dtw_names{max-width:100%;overflow-wrap:anywhere;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary)}.dtw_hint{position:fixed;z-index:1002;pointer-events:none;box-sizing:border-box;top:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;max-width:min(620px,86vw);padding:10px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background-color:var(--dsw-alias-bg-overlay);box-shadow:0 8px 28px rgba(0,0,0,.28);color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;animation:dtw_fade_in .16s ease-out}.dtw_hintBody{display:flex;flex-direction:column;gap:2px;min-width:0}.dtw_hintTitle{font-weight:500}.dtw_hintHow{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary)}";
		const classes = {
			zone: "dtw_zone",
			icon: "dtw_icon",
			title: "dtw_title",
			names: "dtw_names",
			hint: "dtw_hint",
			hintBody: "dtw_hintBody",
			hintTitle: "dtw_hintTitle",
			hintHow: "dtw_hintHow"
		};
		const TAG_ID = "dsh-drop-to-workspace/zone.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG_ID) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-drop-to-workspace";
			tag.dataset.pluginCss = TAG_ID;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region lib/types/client/drop.js
		/** Whether the drag carries files (folders included) at all. */
		function isFileDrag(event) {
			const dataTransfer = event.dataTransfer;
			return dataTransfer !== null && dataTransfer.types.includes("Files");
		}
		/**
		* The Desktop shell-installed bridge. Only the Electron application injects
		* `window.__DSH_HOST_PATHS__`; a plain browser page has no way to learn a
		* dropped folder's absolute host path, so browsers require path confirmation.
		*/
		function hostPathBridge() {
			const bridge = globalThis.__DSH_HOST_PATHS__;
			return typeof bridge?.pathFor === "function" ? bridge : void 0;
		}
		/**
		* The slot outlet that hosts the sidebar's workspace browsing region.
		* The shell wraps every slot outlet in a `data-slot="<declared name>"`
		* div (`display: contents`), so this anchor is rebuild-proof: unlike
		* the region's CSS-module classes it never changes hash, and it wraps
		* the region in both the expanded list and the collapsed rail.
		*/
		const SLOT_ZONE = "[data-slot=\"sidebar.workspaces\"]";
		/**
		* Containers of the sidebar's workspace browsing region. A CSS-module class
		* is `<build hash>_<key>`, so the readable key suffix survives rebuilds
		* while the hash does not; these are the region's own keys. Only the
		* structural fallback consults them, when no slot outlet is present.
		*/
		const ZONE_CONTAINERS = "[class*=\"_sectionHeader\"],[class*=\"_listArea\"],[class*=\"_treeBody\"],[class*=\"_searchTree\"],[class*=\"_groupSection\"],[class*=\"_flatList\"]";
		/**
		* The workspace browsing region under a pointer target, or null when the
		* pointer is anywhere else.
		*
		* Primary anchor is the slot outlet: its `data-slot` value is the
		* declared slot name, so it survives CSS-module hash churn, and the
		* outlet is `display: contents` — the zone geometry must therefore come
		* from the region's own root element inside it (the shipped browser's
		* outermost div). The structural fallback keeps working on a shell that
		* renders the region without an outlet: the region's tree
		* (`role="tree"` — the shipped browser draws its rows as tree items
		* carrying a `data-row-key`) or one of the region's own containers,
		* confirmed by requiring the region root to own keyed rows, which keeps
		* a same-named container elsewhere in the app from matching.
		* @param target - the event target under the pointer.
		* @returns the region element, or null.
		*/
		function workspaceZoneOf(target) {
			if (!(target instanceof Element)) return null;
			const slotHost = target.closest(SLOT_ZONE);
			if (slotHost !== null) {
				const root = slotHost.querySelector("[class*=\"_root\"]");
				if (root !== null) return root;
			}
			const tree = target.closest("[role=\"tree\"]");
			const candidate = tree ?? target.closest(ZONE_CONTAINERS);
			if (candidate === null) return null;
			const region = candidate.closest("[class*=\"_root\"]") ?? candidate;
			return region.querySelector("[data-row-key]") === null ? null : region;
		}
		/** One-line identity of an event target, for the hover diagnostic. */
		function describeNode(node) {
			if (!(node instanceof Element)) return String(node);
			const raw = typeof node.className === "string" ? node.className.trim() : "";
			const cls = raw === "" ? "" : `.${raw.split(/\s+/).join(".")}`;
			return `<${String(node.tagName).toLowerCase()}${cls}>`;
		}
		/**
		* Hover metadata may hide entries until drop. An absent entry with no MIME
		* type is unresolved, not proof of a file or directory.
		*/
		function hoverDirectories(dataTransfer) {
			const names = [];
			let pending = (dataTransfer.items?.length ?? 0) === 0;
			for (const item of dataTransfer.items ?? []) {
				if (item.kind !== "file") continue;
				const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null;
				if (entry?.isDirectory === true) names.push(entry.name);
				else if (entry === null && !item.type) pending = true;
			}
			return { names, pending: pending && names.length === 0 };
		}
		/** Directory `File` members of a settled drop. */
		function droppedDirectories(dataTransfer, files) {
			const directories = [];
			let fileIndex = 0;
			for (const item of dataTransfer.items) {
				if (item.kind !== "file") continue;
				const file = files[fileIndex++];
				if (typeof item.webkitGetAsEntry !== "function") continue;
				if (item.webkitGetAsEntry()?.isDirectory !== true) continue;
				if (file !== void 0) directories.push(file);
			}
			return directories;
		}
		/** A human-readable failure line for any create/open rejection. */
		function errorMessage(error) {
			if (error instanceof Error) {
				const rpcError = error.rpcError;
				if (error.name === "WorkspaceCreateError" && rpcError?.message !== void 0) return String(rpcError.message);
				return error.message;
			}
			return String(error);
		}
		/** Names line for the captions, capped so a mass drop stays readable. */
		function namesLine(names) {
			const shown = names.slice(0, 3).join("、");
			return names.length > 3 ? `${shown}…` : shown;
		}
		/** Race a promise against a timeout so a hung RPC never blocks the drop flow. */
		function withTimeout(promise, ms, label) {
			return new Promise((resolve, reject) => {
				const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
				promise.then(
					(value) => { clearTimeout(timer); resolve(value); },
					(error) => { clearTimeout(timer); reject(error); }
				);
			});
		}
		/** Hover geometry of the region, rounded so an unchanged hover keeps one snapshot identity. */
		function zoneRect(zone) {
			const rect = zone.getBoundingClientRect();
			return {
				left: Math.round(rect.left),
				top: Math.round(rect.top),
				width: Math.round(rect.width),
				height: Math.round(rect.height)
			};
		}
		function sameRect(a, b) {
			if (a === b) return true;
			if (a === null || b === null) return false;
			return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
		}
		//#endregion
		//#region lib/types/client/DropZone.js
		/**
		* The two drag affordances this plugin owns, plus the failure toast for a
		* refused create. Rendered through `shell.overlay`; both surfaces are
		* decoration only (pointer-events: none) so drag targeting below stays
		* accurate.
		*
		* Known folders and unresolved drags replace the native attachment mask.
		* Protected entries get conditional text until their type is readable.
		* Over the Workspaces region the card becomes the region invitation.
		*
		* The card states only what this plugin guarantees. Whether the shipped
		* intake would accept the drop (its `canAcceptDrop` gate, false while the
		* Session is busy) is not readable from here, so the card never claims what
		* a release elsewhere would do.
		*/
		function DropZone({ useDrag, useDirectory, clearError, setPath, closeDirectory, createDirectoryWorkspace, t }) {
			const drag = useDrag((state) => state);
			const directory = useDirectory((state) => state);
			const web = hostPathBridge() === void 0;
			const children = [];
			if (drag.active && drag.rect !== null) {
				children.push(jsx("div", {
					className: classes.zone,
					role: "status",
					style: {
						left: `${String(drag.rect.left)}px`,
						top: `${String(drag.rect.top)}px`,
						width: `${String(drag.rect.width)}px`,
						height: `${String(drag.rect.height)}px`
					},
					children: [
						jsx(primitives.IconFolderOpenRegular, { size: 32, className: classes.icon }),
						jsx("div", { className: classes.title, children: t(web ? "zone.webTitle" : drag.pending ? "zone.pendingTitle" : "zone.title") }),
						drag.names !== "" && jsx("div", { className: classes.names, children: drag.names })
					]
				}));
			} else if (drag.folder || drag.pending) {
				children.push(jsx("div", {
					className: classes.hint,
					role: "status",
					children: [
						jsx(primitives.IconFolderOpenRegular, { size: 20, className: classes.icon }),
						jsx("div", {
							className: classes.hintBody,
							children: [
								jsx("div", {
									className: classes.hintTitle,
									children: drag.pending ? t("hint.pendingTitle") : drag.names === "" ? t("hint.title") : `${t("hint.title")} · ${drag.names}`
								}),
								jsx("div", {
									className: classes.hintHow,
									children: t(web ? "hint.webHow" : drag.pending ? "hint.pendingHow" : "hint.how")
								})
							]
						})
					]
				}));
			}
			if (drag.error !== null) {
				children.push(jsx(primitives.Toast, {
					text: drag.error,
					icon: jsx(primitives.IconWarningOutlineRegular, {}),
					holdMs: 6e3,
					onDone: clearError
				}, `drop-to-workspace-error-${String(drag.errorSeq)}`));
			}
			if (directory.open) {
				children.push(jsx(primitives.Modal, {
					open: true,
					title: t("directory.title"),
					closeLabel: t("directory.cancel"),
					onClose: closeDirectory,
					footer: jsx(Fragment, { children: [
						jsx(primitives.Button, { variant: "outline", disabled: directory.busy, onClick: closeDirectory, children: t("directory.cancel") }),
						jsx(primitives.Button, { variant: "primary", disabled: directory.busy || directory.path.trim() === "", onClick: createDirectoryWorkspace, children: t(directory.busy ? "directory.busy" : "directory.create") })
					] }),
					children: jsx("form", {
						onSubmit: (event) => { event.preventDefault(); void createDirectoryWorkspace(); },
						style: { display: "grid", gap: "12px", minWidth: 0 },
						children: [
							jsx("div", { className: classes.names, children: directory.names }),
							jsx("label", { style: { display: "grid", gap: "8px", minWidth: 0 }, children: [
								jsx("span", { children: t("directory.path") }),
								jsx(primitives.Input, { value: directory.path, "data-modal-autofocus": true, disabled: directory.busy, onChange: (event) => setPath(event.target.value) })
							] }),
							directory.error !== null && jsx("div", { role: "alert", style: { overflowWrap: "anywhere" }, children: directory.error })
						]
					})
				}));
			}
			return jsx(Fragment, { children });
		}
		//#endregion
		//#region lib/types/client/apply.js
		/** Required services (cordis fiber inject): the workspace create face, the workspace open face, the locale seat, and the slot system. */
		const inject = ["workspaces", "uiWorkspace", "locale", "slots"];
		/**
		* Install the folder-drop interception once the workspace services exist.
		*
		* Scope: the sidebar's workspace browsing region decides where a folder
		* becomes a Workspace; everywhere else is left to the shipped drop flow.
		* Hover feedback accounts for protected entries that are unreadable until drop.
		* @param ctx - Client root Context.
		*/
		function apply(ctx) {
			const workspaces = ctx.get("workspaces");
			const uiWorkspace = ctx.get("uiWorkspace");
			const t = ctx.locale.bind(NS);
			const IDLE = {
				active: false,
				folder: false,
				pending: false,
				names: "",
				rect: null,
				error: null
			};
			const dragStore = createSnapshotStore({
				...IDLE,
				error: null,
				errorSeq: 0
			});
			const directoryStore = createSnapshotStore({ open: false, busy: false, path: "", names: "", error: null });
			const setPath = (path) => directoryStore.update((draft) => { draft.path = path; draft.error = null; });
			const closeDirectory = () => {
				if (!directoryStore.getSnapshot().busy) directoryStore.update((draft) => { draft.open = false; });
			};
			async function createDirectoryWorkspace() {
				const directory = directoryStore.getSnapshot();
				const path = directory.path.trim();
				if (!directory.open || directory.busy || path === "") return;
				directoryStore.update((draft) => { draft.busy = true; draft.error = null; });
				let created = false;
				try {
					const workspace = await withTimeout(workspaces.create({ path }), 15e3, "workspaces.create");
					if (typeof workspace?.workspaceId !== "string" || workspace.workspaceId === "") throw new Error("no workspaceId in response");
					created = true;
					await withTimeout(uiWorkspace.openWorkspace(workspace.workspaceId), 10e3, "openWorkspace");
					directoryStore.update((draft) => { draft.open = false; });
				} catch (error) {
					directoryStore.update((draft) => { draft.error = t(created ? "directory.openFailed" : "toast.createFailed", { message: errorMessage(error) }); });
				} finally {
					directoryStore.update((draft) => { draft.busy = false; });
				}
			}
			const setDrag = (patch) => {
				const current = dragStore.getSnapshot();
				let changed = false;
				for (const key of Object.keys(patch)) {
					const differs = key === "rect" ? !sameRect(current.rect, patch.rect) : current[key] !== patch[key];
					if (differs) {
						changed = true;
						break;
					}
				}
				if (!changed) return;
				dragStore.update((draft) => {
					Object.assign(draft, patch);
				});
			};
			let dragClearTimer;
			const clearZone = () => {
				clearTimeout(dragClearTimer);
				dragClearTimer = void 0;
				setDrag(IDLE);
			};
			const dragClear = () => {
				setDrag({ error: null });
			};
			const pushError = (message) => {
				dragStore.update((draft) => {
					draft.error = message;
					draft.errorSeq += 1;
				});
			};
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "drop-to-workspace: dictionaries");
			ctx.slots.inject("shell.overlay", function* () {
				yield ctx.slots.register({
					name: "shell.overlay",
					id: "drop-to-workspace.drop-zone",
					locale: NS,
					inject: () => ({
						hooks: { drag: dragStore, directory: directoryStore },
						clearError: dragClear,
						setPath,
						closeDirectory,
						createDirectoryWorkspace
					})
				}, DropZone);
			});
			/**
			* Hover pass. The state follows the latest drag target rather than a
			* nesting counter: `dragover` repeats for as long as the drag is over the
			* page, so the next event corrects any drift.
			*
			* Identifiable files retain native hover. Folders and unresolved entries
			* stop hover events to replace the attachment mask, while drops outside
			* the Workspaces region still use the shipped flow.
			*/
			/**
			* Hover diagnostics: one line for the first file-drag hover of a session
			* (what is under the pointer, how many folders, which anchors match) and
			* one for the first hover that resolves the region. A missing first line
			* means the plugin never saw the drag; `pending: true` means entries were
			* protected; a first line with `slotAnchor: false` and no second
			* line means the region anchor never matched the pointer target.
			*/
			let dragTraced = false;
			let zoneTraced = false;
			const traceDrag = (event, names, pending) => {
				if (dragTraced) return;
				dragTraced = true;
				console.info("[drop-to-workspace] file drag:", {
					target: describeNode(event.target),
					folders: names.length,
					pending,
					slotAnchor: event.target.closest(SLOT_ZONE) !== null,
					treeAnchor: event.target.closest("[role=\"tree\"]") !== null
				});
			};
			const traceZone = (event) => {
				if (zoneTraced) return;
				zoneTraced = true;
				console.info("[drop-to-workspace] zone matched:", describeNode(event.target));
			};
			const onDragHover = (event) => {
				if (!isFileDrag(event)) return;
				// Clear any stale error from a previous drop so the affordance is not blocked.
				if (dragStore.getSnapshot().error !== null) {
					dragClear();
				}
				const { names, pending } = hoverDirectories(event.dataTransfer);
				traceDrag(event, names, pending);
				if (names.length === 0 && !pending) {
					clearZone();
					return;
				}
				// External drags may cancel without delivering dragend to this window.
				clearTimeout(dragClearTimer);
				dragClearTimer = setTimeout(onDragEnd, 1500);
				event.preventDefault();
				event.stopImmediatePropagation();
				event.dataTransfer.dropEffect = "copy";
				const zone = workspaceZoneOf(event.target);
				if (zone === null) {
					setDrag({
						active: false,
						folder: names.length > 0,
						pending,
						names: namesLine(names),
						rect: null
					});
					return;
				}
				traceZone(event);
				setDrag({
					active: true,
					folder: names.length > 0,
					pending,
					names: namesLine(names),
					rect: zoneRect(zone)
				});
			};
			const onDragLeave = (event) => {
				if (event.relatedTarget instanceof Element) return;
				const leftViewport = event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight;
				const leftDocument = event.relatedTarget === null && (event.target === document || event.target === document.documentElement || event.target === document.body);
				if (leftViewport || leftDocument) onDragEnd();
			};
			const onDragEnd = () => {
				dragTraced = false;
				zoneTraced = false;
				clearZone();
			};
			/**
			* The interception point. Only a folder drop landing inside the workspace
			* region is consumed (capture-phase `document` listener plus
			* `stopImmediatePropagation`, so the attachment intake never sees it):
			* Desktop resolves host paths; browsers ask for a confirmed host path.
			* Any other drop falls through untouched — including a folder
			* released elsewhere, which the shipped flow still adds as a file
			* reference (its intake reads `canAcceptDrop`, not the hover state this
			* plugin suppressed).
			*/
			const onDrop = (event) => {
				onDragEnd();
				const dataTransfer = event.dataTransfer;
				if (dataTransfer === null || !dataTransfer.types.includes("Files")) return;
				const files = [...dataTransfer.files];
				const directories = droppedDirectories(dataTransfer, files);
				if (directories.length === 0 || workspaceZoneOf(event.target) === null) return;
				const bridge = hostPathBridge();
				event.preventDefault();
				event.stopImmediatePropagation();
				if (bridge !== void 0) {
					void handleFolderDrop(directories, bridge);
				} else if (!directoryStore.getSnapshot().open) {
					// shortcut: browser drops confirm one host path; add a queue if batch binding is needed.
					directoryStore.update((draft) => { draft.open = true; draft.path = ""; draft.names = namesLine(directories.map((file) => file.name ?? "")); draft.error = null; });
				}
			};
			/** Create one Workspace per dropped directory, then open the first. */
			async function handleFolderDrop(files, bridge) {
				const paths = [];
				for (const file of files) {
					try {
						const path = bridge.pathFor(file);
						if (typeof path === "string" && path !== "") paths.push(path);
					} catch (error) {
						console.warn("drop-to-workspace: pathFor failed:", error);
					}
				}
				if (paths.length === 0) {
					pushError(t("toast.pathUnavailable"));
					return;
				}
				const failures = [];
				let opened = void 0;
				for (const path of paths) {
					try {
						const workspace = await withTimeout(workspaces.create({ path }), 15e3, "workspaces.create");
						const id = workspace?.workspaceId;
						if (typeof id === "string" && id !== "") {
							opened ??= id;
						} else {
							console.warn("drop-to-workspace: create returned no workspaceId:", workspace);
							failures.push(`${path}: ${errorMessage(new Error("no workspaceId in response"))}`);
						}
					} catch (error) {
						console.warn("drop-to-workspace: create failed:", error);
						const msg = error instanceof Error && error.message.includes("timed out")
							? t("toast.createTimeout")
							: errorMessage(error);
						failures.push(`${path}: ${msg}`);
					}
				}
				if (opened !== void 0) {
					try {
						await withTimeout(uiWorkspace.openWorkspace(opened), 10e3, "openWorkspace");
					} catch (error) {
						console.warn("drop-to-workspace: openWorkspace failed:", error);
					}
				}
				if (failures.length > 0) pushError(t("toast.createFailed", { message: failures.join("; ") }));
			}
			ctx.effect(() => {
				document.addEventListener("dragenter", onDragHover, true);
				document.addEventListener("dragover", onDragHover, true);
				document.addEventListener("dragleave", onDragLeave, true);
				document.addEventListener("drop", onDrop, true);
				window.addEventListener("dragend", onDragEnd, true);
				window.addEventListener("blur", onDragEnd);
				return () => {
					onDragEnd();
					document.removeEventListener("dragenter", onDragHover, true);
					document.removeEventListener("dragover", onDragHover, true);
					document.removeEventListener("dragleave", onDragLeave, true);
					document.removeEventListener("drop", onDrop, true);
					window.removeEventListener("dragend", onDragEnd, true);
					window.removeEventListener("blur", onDragEnd);
				};
			}, "drop-to-workspace: drop listeners");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
