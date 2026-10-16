# dsh-drop-to-workspace

[中文](README.md) | **English**

Drag a folder from your file manager onto the sidebar's **Workspaces** region
and a Workspace bound to that directory is created and opened — the same result
as picking the folder through the built-in Workspace picker, without leaving
the window.
In a browser, dropping opens Harness's built-in directory picker. Select a directory without typing its path.

## What it does

- **Hover feedback follows the available metadata.** Identifiable files keep
  the native attachment mask; identifiable folders show the compact
  "Folder detected · <name>" card without dimming. Browsers normally protect
  entries during hover, so `webkitGetAsEntry()` returns null. Unresolved items
  without a MIME type show a neutral "Files or folders" hint, covering both
  folders and files whose type is unknown without misclassifying either.
- On desktop, hovering the Workspaces region (section header + the grouped/flat list) with
  a folder turns that card into a dashed invitation drawn over the region
  itself: "Release to create a workspace", or the conditional
  "Release folders to create a workspace" when the type is still unknown.
- On desktop, dropping there resolves each folder's real host path and
  `workspaces.create({ path })` runs per folder; the first created Workspace
  opens immediately. Dropping a folder that is already a Workspace just
  re-opens it (host-side `resolveByPath` is idempotent).
- **Releasing outside that region changes nothing.** A folder released on the
  chat, the composer, or anywhere else is handled by the shipped attachment
  intake exactly as before. Ordinary file drops are unchanged; unresolved
  hover events use the neutral hint.

## Why the drop is scoped

The plugin consumes a folder drop only inside the Workspaces region. Its
listeners are capture-phase on `document` and call `stopImmediatePropagation`,
so a folder dropped there never reaches the attachment intake or the composer
— but that interception is gated on the pointer actually being over the
region. The shipped intake decides whether it accepts a release from its own
static `canAcceptDrop` gate rather than from the hover state this plugin
suppresses, so a folder released elsewhere still takes the ordinary path.

## Browser support

Learning a dropped folder's absolute host path requires the Electron shell
bridge (`window.__DSH_HOST_PATHS__`), which the packaged desktop app injects
and an external browser page does not have.

In a browser, drop a folder on **Workspaces** to automatically open Harness's
built-in directory picker. Browse and select the directory, then confirm to
create and open the workspace. No manual absolute path is required.
Selection, cancellation, creation, and error recovery reuse the sidebar's
existing add-workspace flow. Repeated drops do not interrupt an active picker.

Browsers provide names, not absolute paths. The plugin **does not upload, copy,
or traverse folder contents**, and never guesses a path from a name. With a
remote Harness host, the directory must already exist on that remote machine;
a browser-local directory is not enough. The picker cannot automatically locate
the dropped folder: selecting it once is still required. Multiple dropped folders
open one picker, rather than automatically creating multiple workspaces.

If the current Harness version or plugin composition has no compatible picker
entry, a notice directs users to the add button beside Workspaces. The plugin
does not silently fall back to typing or guessing paths.

Drops outside Workspaces still use the native attachment flow, including its
desktop-only folder warning.

## Install

Install into the profile you actually use: **desktop** for the desktop app,
or **web** for a standalone web server.

**Through the plugin panel**

Settings → Plugins → Add plugin, and enter:

```
github:flandre0605/dsh-drop-to-workspace
```

The full address `https://github.com/flandre0605/dsh-drop-to-workspace` works too.

**Through the CLI**

```powershell
dsh plugin --profile desktop add github:flandre0605/dsh-drop-to-workspace
```

For a standalone web server:

```powershell
dsh plugin --profile web add github:flandre0605/dsh-drop-to-workspace
```

Restart the corresponding desktop app or web server after installing or updating.
Also refresh the browser page to load the new bundle.

The command reconciles `dsh.profile.bundles` against installed packages and
appends `dsh-drop-to-workspace` to the bundle stack; the profile boot then
merges the plugin's `cordis.patch.yml`, inserting the `drop-to-workspace`
loader row.

> A git install is a **snapshot copy**: edits to the source do not take effect.
> To iterate on the code, install the local path instead —
> `dsh plugin --profile desktop add C:\path\to\dsh-drop-to-workspace` — which
> records a `link:` reference and picks up the current files on restart.

> Before installing, the plugin manager runs a `git ls-remote` reachability
> check. If it reports "Cannot access GitHub", the usual cause is that git is
> not using your proxy (git does not read the Windows system proxy):
>
> ```powershell
> git config --global http.proxy  http://127.0.0.1:7897
> git config --global https.proxy http://127.0.0.1:7897
> ```
>
> Substitute your proxy's actual port.

## Structure

| File | Role |
| --- | --- |
| `lib/index.js` | Host half — empty `apply()` so the plugin appears in the host Loader |
| `lib/client.js` | Browser half — region detection, drop interception, zone slot, dictionary seat |
| `cordis.patch.yml` | Bundle patch inserting the loader row |
| `package.json` | `dsh.bundle.patch` + `dsh.client` (web platform, service inject list) |
| `test/smoke.mjs` | Zone-scoping and wiring test (node, fake DOM) |

## How the region is recognised

The sidebar's Workspaces region is matched structurally rather than by
geometry:

- **the primary anchor is the slot outlet**: the shell wraps every slot outlet
  in a `data-slot="<declared name>"` div (`display: contents`), and the region
  is `[data-slot="sidebar.workspaces"]`. That value is the declared slot name,
  so it survives CSS-module hash churn and is present both in the expanded list
  and in the collapsed rail. The outlet itself has no box, so the invitation's
  geometry comes from the region's own root element inside it (the shipped
  browser's outermost div);
- **the structural fallback** (for a shell that renders the region without an
  outlet) is the region's tree — the shipped browser draws the workspace/session
  list as `role="tree"` with `data-row-key` rows — plus its own CSS-module
  containers (`_sectionHeader`, `_listArea`, `_treeBody`, `_searchTree`,
  `_groupSection`, `_flatList`), which cover the header strip and the list
  padding. A CSS-module class is `<build hash>_<key>`, so the readable key
  suffix survives rebuilds while the hash does not; a candidate only counts when
  the region root also owns keyed rows, so a same-named container elsewhere in
  the app — including a panel that draws `role="tree"` rows without
  `data-row-key` — cannot match.

A miss degrades quietly: if a future build renames those anchors, hover
highlighting stops but dropping still works through the structural fallback,
and no other part of the app is affected.

## Theming

Only the published theme tokens are used (`--dsw-alias-brand-primary`,
`--dsw-alias-bg-overlay`, `--dsw-alias-border-l2`, `--dsw-alias-label-primary`,
`--dsw-alias-label-secondary`); geometry and type are plain CSS, so the box
follows light/dark themes without depending on internal design tokens.

## Behavior notes

- On desktop, multiple folders in one drop create multiple Workspaces; the first one opens
  (the main view switches to it).
- A mixed file + folder drop inside the region handles only the
  folders and skips the files (that drop is fully consumed).
- A refused create (e.g. an unreachable path) shows a localized failure message;
  the folder simply does not become a Workspace.
