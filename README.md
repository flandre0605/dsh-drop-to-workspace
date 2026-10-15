# dsh-drop-to-workspace

Drag a folder from your file manager onto the sidebar's **Workspaces** region
and a Workspace bound to that directory is created and opened — the same result
as picking the folder through the built-in Workspace picker, without leaving
the window.

## What it does

- **Hover feedback follows the available metadata.** Identifiable files keep
  the native attachment mask; identifiable folders show the compact
  "Folder detected · <name>" card without dimming. Browsers normally protect
  entries during hover, so `webkitGetAsEntry()` returns null. Unresolved items
  without a MIME type show a neutral "Files or folders" hint, covering both
  folders and files whose type is unknown without misclassifying either.
- Hovering the Workspaces region (section header + the grouped/flat list) with
  a folder turns that card into a dashed invitation drawn over the region
  itself: "Release to create a workspace", or the conditional
  "Release folders to create a workspace" when the type is still unknown.
- On drop there, each folder's real host path is resolved and
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

## Desktop only

Learning a dropped folder's absolute host path requires the Electron shell
bridge (`window.__DSH_HOST_PATHS__`), which the packaged desktop app injects
and an external browser page does not have. Outside the desktop app the plugin
stays inert and folder drops fall through to the stock "desktop-only" notice
from the attachment plugin.

## Install

From the DSH CLI (the desktop app must be restarted afterwards so the profile
reboots with the new bundle):

```powershell
dsh plugin --profile web add C:\path\to\dsh-drop-to-workspace
```

The command reconciles `dsh.profile.bundles` against installed packages and
appends `dsh-drop-to-workspace` to the bundle stack; the profile boot then
merges the plugin's `cordis.patch.yml`, inserting the `drop-to-workspace`
loader row.

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

- its tree is the semantic anchor — the shipped browser draws the
  workspace/session list as `role="tree"` with `data-row-key` rows;
- its own CSS-module containers (`_sectionHeader`, `_listArea`, `_treeBody`,
  `_searchTree`, `_groupSection`, `_flatList`) cover the header strip and the
  list padding. A CSS-module class is `<build hash>_<key>`, so the readable
  key suffix survives rebuilds while the hash does not;
- a candidate only counts when the region root also owns keyed rows, so a
  same-named container elsewhere in the app cannot match.

A miss degrades quietly: if a future build renames those keys, hover
highlighting stops but dropping still works through the tree anchor, and no
other part of the app is affected.

## Theming

Only the published theme tokens are used (`--dsw-alias-brand-primary`,
`--dsw-alias-bg-overlay`, `--dsw-alias-border-l2`, `--dsw-alias-label-primary`,
`--dsw-alias-label-secondary`); geometry and type are plain CSS, so the box
follows light/dark themes without depending on internal design tokens.

## Behavior notes

- Multiple folders in one drop create multiple Workspaces; the first one opens
  (the main view switches to it).
- A mixed file + folder drop inside the region creates Workspaces for the
  folders and skips the files (that drop is fully consumed).
- A refused create (e.g. an unreachable path) shows a localized failure toast;
  the folder simply does not become a Workspace.
