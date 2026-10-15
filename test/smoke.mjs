// Smoke test for the drop-to-workspace client factory.
//
// Simulates the client ModuleLoader + a minimal DOM, then drives the registered
// listeners with fake drag events. These properties matter here:
//   1. zone scoping — a folder drop inside the sidebar's workspace region is
//      consumed, and every drop outside it is left completely untouched;
//   2. hover feedback — protected entries show a neutral hint, never a false
//      folder claim, while identifiable files keep the native affordance.
//   3. browser drops require explicit host paths, with cancellation and retry.
import { readFileSync } from 'node:fs'
import { mock } from 'node:test'

const clientSrc = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

//#region fake DOM
/** Attribute selectors used by the plugin: [attr], [attr="v"], [class*="v"], comma lists. */
function matches(el, selector) {
  return selector.split(',').some((part) => matchOne(el, part.trim()))
}
function matchOne(el, sel) {
  const attr = /^\[([a-zA-Z-]+)(?:([*^$]?=)"([^"]*)")?\]$/.exec(sel)
  if (attr === null) throw new Error(`test DOM: unsupported selector ${sel}`)
  const [, name, op, value] = attr
  const raw = el.getAttribute(name)
  if (raw === null) return false
  if (op === undefined) return true
  if (op === '*=') return raw.includes(value)
  if (op === '=') return raw === value
  throw new Error(`test DOM: unsupported operator ${op}`)
}

class FakeElement {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase()
    this.attrs = attrs
    this.children = []
    this.parentElement = null
  }
  append(child) {
    child.parentElement = this
    this.children.push(child)
    return child
  }
  getAttribute(name) {
    if (name === 'class') return this.attrs.class ?? null
    return this.attrs[name] ?? null
  }
  closest(selector) {
    let node = this
    while (node !== null) {
      if (matches(node, selector)) return node
      node = node.parentElement
    }
    return null
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (matches(child, selector)) return child
      const nested = child.querySelector(selector)
      if (nested !== null) return nested
    }
    return null
  }
  getBoundingClientRect() {
    return this.rect ?? { left: 0, top: 0, width: 0, height: 0 }
  }
}
globalThis.Element = FakeElement

const el = (tag, attrs) => new FakeElement(tag, attrs)

const documentElement = el('html')
const body = el('body')
documentElement.append(body)

// The shell wraps every slot outlet in a `data-slot` div (display:contents),
// so the region's stable anchor is the outlet, not the hashed classes inside.
const slotOutlet = body.append(el('div', { 'data-slot': 'sidebar.workspaces' }))
// The sidebar's workspace browsing region: root > sectionHeader + listArea > tree > rows.
const region = slotOutlet.append(el('div', { class: '_9lTDKa_root' }))
region.rect = { left: 12, top: 240, width: 256, height: 600 }
const header = region.append(el('div', { class: '_9lTDKa_sectionHeader' }))
const listArea = region.append(el('div', { class: '_9lTDKa_listArea' }))
const tree = listArea.append(el('div', { role: 'tree' }))
const workspaceRow = tree.append(el('div', { 'data-row-key': 'workspace:w1' }))
const sessionRow = tree.append(el('div', { 'data-row-key': 'session:s1' }))

// The collapsed rail: the same slot outlet, an empty listArea, no keyed rows.
// The structural fallback cannot see it (no [data-row-key]); the slot anchor can.
const railSlot = body.append(el('div', { 'data-slot': 'sidebar.workspaces' }))
const rail = railSlot.append(el('div', { class: '_9lTDKa_root _9lTDKa_rail' }))
rail.rect = { left: 0, top: 240, width: 56, height: 600 }
const railHeader = rail.append(el('div', { class: '_9lTDKa_sectionHeader' }))
const railListArea = rail.append(el('div', { class: '_9lTDKa_listArea' }))
const railHeaderButton = railHeader.append(el('button', {}))

// The composer column — outside the region, and the thing the user does not want touched.
const main = body.append(el('div', { class: '_main_root' }))
const composer = main.append(el('div', { class: '_composer_root' }))
const textarea = composer.append(el('textarea', {}))

// A decoy header elsewhere: same container key, no keyed rows — must not match.
const settings = body.append(el('div', { class: '_settings_root' }))
const decoyHeader = settings.append(el('div', { class: '_sectionHeader' }))

// A sibling panel that draws role="tree" rows without keyed rows and without
// the workspace slot outlet (the shipped files panel shape) — must not match.
const filesPanel = body.append(el('div', { class: '_files_root' }))
const filesTree = filesPanel.append(el('div', { role: 'tree' }))
const filesRow = filesTree.append(el('div', { class: '_fileRow' }))
//#endregion

//#region fake runtime
let registration
const documentListeners = new Map()
const windowListeners = new Map()
const collect = (map) => (type, handler) => map.set(type, handler)
const remove = (map) => (type, handler) => {
  if (map.get(type) === handler) map.delete(type)
}
const effectCleanups = []

globalThis.window = {
  __ModuleLoader__: { load: (reg) => { registration = reg } },
  innerWidth: 1580,
  innerHeight: 1019,
  addEventListener: collect(windowListeners),
  removeEventListener: remove(windowListeners),
}
globalThis.document = {
  documentElement,
  body,
  createElement: () => ({ dataset: {}, textContent: '' }),
  head: { appendChild() {} },
  querySelector: () => null,
  addEventListener: collect(documentListeners),
  removeEventListener: remove(documentListeners),
}

new Function(clientSrc)()
if (registration === undefined) throw new Error('registration not captured')
if (registration.id !== 'dsh-drop-to-workspace') throw new Error(`bad id: ${registration.id}`)

const createCalls = []
let createError
let openError
let createWait
let openWait
const jsxStub = (type, props, key) => ({ type, props, key })
const fakeRequire = (spec) => {
  switch (spec) {
    case 'react/jsx-runtime':
      return { jsx: jsxStub, jsxs: jsxStub, Fragment: 'Fragment' }
    case '@deepseek-ai/dsh-client-store':
      return {
        createSnapshotStore(init) {
          const state = { ...init }
          return {
            getSnapshot: () => state,
            subscribe: () => () => {},
            set: (v) => Object.assign(state, v),
            update: (fn) => fn(state),
          }
        },
      }
    case '@deepseek-ai/dsh-client-ui-primitives':
      return { Toast: 'Toast', Modal: 'Modal', Input: 'Input', Button: 'Button', IconFolderOpenRegular: 'IconFolderOpenRegular', IconWarningOutlineRegular: 'IconWarningOutlineRegular' }
    default:
      throw new Error(`unexpected require: ${spec}`)
  }
}

const mod = registration.factory(fakeRequire)
if (mod.inject.join(',') !== 'workspaces,uiWorkspace,locale,slots') throw new Error('inject list changed')

const slotRegistrations = []
const dictionaries = {}
const ctx = {
  get(name) {
    if (name === 'workspaces') {
      return {
        async create({ path }) {
          createCalls.push(path)
          if (createError) throw createError
          if (createWait) await createWait
          return { workspaceId: `ws:${path}` }
        },
      }
    }
    if (name === 'uiWorkspace') return {
      async openWorkspace(id) {
        if (openError) throw openError
        if (openWait) await openWait
        ctx.opened = id
      },
    }
    throw new Error(`ctx.get(${name})`)
  },
  locale: {
    bind: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
    register: (ns, dict) => { dictionaries[ns] = dict },
  },
  slots: {
    inject: (name, generator) => slotRegistrations.push({ name, generator }),
    register: (options, component) => ({ options, component }),
  },
  effect: (setup) => {
    const cleanup = setup()
    if (typeof cleanup === 'function') effectCleanups.push(cleanup)
    return cleanup
  },
}
mod.apply(ctx)

if (!dictionaries.dropToWorkspace) throw new Error('locale dictionaries not registered')
if (slotRegistrations.length !== 1 || slotRegistrations[0].name !== 'shell.overlay') throw new Error('slot inject wrong')
const slotYield = slotRegistrations[0].generator().next().value
if (slotYield.options.id !== 'drop-to-workspace.drop-zone') throw new Error('slot id changed')
const injected = slotYield.options.inject()
const dragStore = injected.hooks.drag
const directoryStore = injected.hooks.directory
console.log('registration + slot wiring OK:', slotYield.options.id)

for (const type of ['dragenter', 'dragover', 'drop']) {
  if (!documentListeners.has(type)) throw new Error(`no capture listener for ${type}`)
}
if (!windowListeners.has('dragend')) throw new Error('no dragend listener')
//#endregion

//#region event fakes
const dirItem = (name) => ({ kind: 'file', webkitGetAsEntry: () => ({ isDirectory: true, name }) })
const fileItem = (name) => ({ kind: 'file', webkitGetAsEntry: () => ({ isDirectory: false, name }) })
const protectedItem = (type = '') => ({ kind: 'file', type, webkitGetAsEntry: () => null })

/** A dragover/drop event over `target` carrying `items`. */
const dragEvent = (target, items, extra = {}) => {
  const calls = { prevented: 0, stopped: 0 }
  return {
    target,
    dataTransfer: { types: ['Files'], items, files: items.map((item, i) => ({ name: item.webkitGetAsEntry?.()?.name, path: `C:\\proj\\${i}` })), dropEffect: '' },
    clientX: extra.clientX ?? 100,
    clientY: extra.clientY ?? 100,
    preventDefault: () => { calls.prevented += 1 },
    stopImmediatePropagation: () => { calls.stopped += 1 },
    calls,
  }
}

globalThis.__DSH_HOST_PATHS__ = { pathFor: (file) => file.path ?? '' }
const hover = documentListeners.get('dragover')
const enter = documentListeners.get('dragenter')
const drop = documentListeners.get('drop')
const snapshot = () => dragStore.getSnapshot()
/** Dispatch one event through a captured listener and hand back the event for assertions. */
const fire = (listener, event) => {
  listener(event)
  return event
}
let failures = 0
const check = (name, ok) => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
}
//#endregion

//#region file drags are never touched
let ev = fire(hover, dragEvent(textarea, [fileItem('a.txt')]))
check('file hover on the composer is untouched', ev.calls.prevented === 0 && ev.calls.stopped === 0)
check('file hover leaves no plugin state', snapshot().folder === false && snapshot().active === false)

ev = fire(hover, dragEvent(workspaceRow, [fileItem('a.txt')]))
check('file hover on the region is untouched', ev.calls.prevented === 0 && ev.calls.stopped === 0 && snapshot().folder === false)

ev = fire(hover, dragEvent(decoyHeader, [dirItem('proj')]))
check('a same-named container without keyed rows is not a zone', snapshot().active === false)
check('but the folder drag is still recognised as a folder', snapshot().folder === true)

ev = fire(hover, dragEvent(filesRow, [dirItem('proj')]))
check('a sibling tree panel without keyed rows is not a zone', snapshot().active === false)
check('a sibling tree panel still shows the folder card', snapshot().folder === true)

ev = fire(hover, dragEvent(railHeaderButton, [dirItem('proj')]))
check('the collapsed rail is a zone through the slot anchor', ev.calls.stopped === 1 && snapshot().active === true)
check('the rail zone uses the rail geometry', snapshot().rect.width === 56 && snapshot().rect.top === 240)

ev = fire(drop, dragEvent(railHeaderButton, [dirItem('proj')]))
check('a folder drop on the rail is consumed', ev.calls.prevented === 1 && ev.calls.stopped === 1)
await new Promise((r) => setTimeout(r, 20))
check('the rail drop created a workspace at the host path', createCalls.at(-1) === 'C:\\proj\\0')
createCalls.length = 0
//#endregion

//#region folder hover: card outside the region, box inside it
ev = fire(hover, dragEvent(textarea, [dirItem('proj')]))
check('folder hover replaces the shipped mask everywhere', ev.calls.prevented === 1 && ev.calls.stopped === 1)
check('outside the region the folder drag shows the card, not the box', snapshot().folder === true && snapshot().active === false && snapshot().rect === null)
check('the card carries the folder name', snapshot().names === 'proj')

ev = fire(enter, dragEvent(sessionRow, [dirItem('proj')]))
check('folder hover on a session row is consumed', ev.calls.stopped === 1)

ev = fire(hover, dragEvent(workspaceRow, [dirItem('proj')]))
check('folder hover on a workspace row is consumed', ev.calls.prevented === 1 && ev.calls.stopped === 1)
check('inside the region the box replaces the card', snapshot().active === true && snapshot().rect.width === 256 && snapshot().rect.top === 240)

ev = fire(hover, dragEvent(header, [dirItem('proj')]))
check('folder hover on the section header is consumed', ev.calls.stopped === 1 && snapshot().active === true)

ev = fire(hover, dragEvent(listArea, [dirItem('proj')]))
check('folder hover on the list padding is consumed', ev.calls.stopped === 1)

ev = fire(hover, dragEvent(textarea, [dirItem('proj')]))
check('leaving the region falls back to the card', snapshot().active === false && snapshot().rect === null && snapshot().folder === true)

ev = fire(hover, dragEvent(textarea, [fileItem('a.txt')]))
check('a later file-only hover clears the folder state', snapshot().folder === false && snapshot().active === false)

fire(hover, dragEvent(workspaceRow, [dirItem('a'), dirItem('b'), dirItem('c')]))
check('multi-folder caption caps at three names', snapshot().names === 'a、b、c')
//#endregion

//#region protected hover data (the real browser exposes entries only on drop)
const protectedHover = (target, items = [protectedItem()]) => {
  const event = dragEvent(target, items)
  event.dataTransfer.files = []
  return event
}
ev = fire(enter, protectedHover(textarea))
check('protected dragenter suppresses the native attachment mask', ev.calls.prevented === 1 && ev.calls.stopped === 1)
check('protected hover shows a neutral hint without claiming a folder', snapshot().pending === true && snapshot().folder === false && snapshot().names === '')

ev = fire(hover, protectedHover(workspaceRow))
check('protected hover switches to the workspace zone', snapshot().active === true && snapshot().pending === true && snapshot().rect.width === 256)
ev = fire(hover, protectedHover(textarea))
check('protected hover switches back to the neutral hint', snapshot().active === false && snapshot().pending === true && snapshot().rect === null)

ev = fire(hover, protectedHover(workspaceRow, [protectedItem('image/png')]))
check('protected files with a MIME type keep native hover', ev.calls.prevented === 0 && ev.calls.stopped === 0 && snapshot().pending === false)

ev = fire(enter, protectedHover(textarea, []))
check('an initially empty item list does not activate the native mask', ev.calls.stopped === 1 && snapshot().pending === true)
fire(documentListeners.get('dragleave'), dragEvent(body, [protectedItem()], { clientX: 0 }))
check('leaving the window clears the pending hint', snapshot().pending === false && snapshot().active === false)

fire(hover, protectedHover(workspaceRow))
fire(windowListeners.get('dragend'), {})
check('ending a drag clears the pending hint', snapshot().pending === false && snapshot().active === false)

fire(hover, protectedHover(workspaceRow))
ev = fire(drop, dragEvent(workspaceRow, [fileItem('no-extension')]))
check('an unresolved hover does not consume an ordinary file drop', ev.calls.prevented === 0 && ev.calls.stopped === 0 && createCalls.length === 0 && snapshot().pending === false)
//#endregion

//#region cancelled external drags
const dragIsIdle = () => !snapshot().pending && !snapshot().folder && !snapshot().active && snapshot().rect === null && snapshot().names === ''
const leave = documentListeners.get('dragleave')

fire(hover, protectedHover(workspaceRow))
const internalLeave = dragEvent(textarea, [])
internalLeave.relatedTarget = workspaceRow
fire(leave, internalLeave)
check('moving between page elements keeps the drag hint', snapshot().pending === true)

const cancelledLeave = dragEvent(workspaceRow, [], { clientX: 0 })
cancelledLeave.dataTransfer = null
fire(leave, cancelledLeave)
check('leaving from a child without file metadata clears the hint', dragIsIdle())

fire(hover, protectedHover(workspaceRow))
const rootLeave = dragEvent(body, [])
rootLeave.dataTransfer.types = []
rootLeave.relatedTarget = null
fire(leave, rootLeave)
check('leaving the document clears the hint even with in-bounds coordinates', dragIsIdle())

fire(hover, protectedHover(workspaceRow))
windowListeners.get('blur')?.({})
check('losing window focus clears the drag hint', dragIsIdle())

fire(hover, protectedHover(workspaceRow))
const emptyDrop = dragEvent(textarea, [])
emptyDrop.dataTransfer = null
fire(drop, emptyDrop)
check('a drop without readable metadata clears the hint without being consumed', dragIsIdle() && emptyDrop.calls.stopped === 0)

fire(windowListeners.get('dragend'), {})
mock.timers.enable({ apis: ['setTimeout'] })
try {
  fire(hover, protectedHover(workspaceRow))
  for (let i = 0; i < 10; i++) {
    mock.timers.tick(300)
    fire(hover, protectedHover(workspaceRow))
  }
  check('continued stationary dragover events keep the hint visible', snapshot().pending === true)
  mock.timers.tick(1499)
  check('a refreshed hint does not expire at an older hover deadline', snapshot().pending === true)
  mock.timers.tick(1)
  check('cancelling with no dragend or dragleave expires the stale hint', dragIsIdle())

  fire(hover, protectedHover(workspaceRow))
  fire(drop, dragEvent(textarea, [fileItem('a.txt')]))
  dragStore.update((draft) => { draft.error = 'keep this error' })
  mock.timers.tick(1500)
  check('dropping cancels the hover timer so it cannot clear a later error', snapshot().error === 'keep this error')
  fire(windowListeners.get('dragend'), {})
} finally {
  mock.timers.reset()
}
check('cancelling never creates a workspace', createCalls.length === 0)
//#endregion

//#region drop behavior
ev = fire(drop, dragEvent(textarea, [dirItem('proj')]))
check('folder drop on the composer falls through to the shipped flow', ev.calls.prevented === 0 && createCalls.length === 0)
check('a falling-through drop clears the drag state', snapshot().folder === false && snapshot().active === false)

fire(hover, protectedHover(workspaceRow))
ev = fire(drop, dragEvent(workspaceRow, [dirItem('proj')]))
check('folder drop on the workspace row is consumed', ev.calls.prevented === 1 && ev.calls.stopped === 1)

await new Promise((r) => setTimeout(r, 20))
check('one workspace created at the dropped host path', createCalls.length === 1 && createCalls[0] === 'C:\\proj\\0')
check('the created workspace was opened', ctx.opened === 'ws:C:\\proj\\0')

ev = fire(drop, dragEvent(workspaceRow, [fileItem('a.txt')]))
check('file drop on the region falls through to the attachment flow', ev.calls.prevented === 0 && createCalls.length === 1)

const savedBridge = globalThis.__DSH_HOST_PATHS__
delete globalThis.__DSH_HOST_PATHS__
ev = fire(drop, dragEvent(workspaceRow, [dirItem('proj')]))
check('browser folder drops are consumed without guessing a host path', ev.calls.prevented === 1 && ev.calls.stopped === 1 && createCalls.length === 1)
check('browser drops open a path dialog with the dropped name', directoryStore.getSnapshot().open && directoryStore.getSnapshot().names === 'proj' && directoryStore.getSnapshot().path === '')
fire(hover, dragEvent(workspaceRow, [dirItem('proj')]))
check('browser folder hover shows the workspace zone', snapshot().folder === true && snapshot().active === true)
fire(windowListeners.get('dragend'), {})

await injected.createDirectoryWorkspace()
check('empty browser paths never create a workspace', createCalls.length === 1)
injected.setPath('C:\\actual\\project')
injected.closeDirectory()
await injected.createDirectoryWorkspace()
check('cancelling a browser dialog never creates a workspace', !directoryStore.getSnapshot().open && createCalls.length === 1)

ev = fire(drop, dragEvent(textarea, [dirItem('proj')]))
check('browser folder drops outside Workspaces retain native behavior', ev.calls.stopped === 0 && !directoryStore.getSnapshot().open)
ev = fire(drop, dragEvent(workspaceRow, [fileItem('a.txt')]))
check('browser ordinary file drops retain native behavior', ev.calls.stopped === 0 && !directoryStore.getSnapshot().open)

fire(drop, dragEvent(railHeaderButton, [dirItem('proj'), dirItem('other')]))
injected.setPath('  /srv/project  ')
fire(drop, dragEvent(workspaceRow, [dirItem('third')]))
check('repeated drops preserve the pending path confirmation', directoryStore.getSnapshot().path === '  /srv/project  ')
const creating = injected.createDirectoryWorkspace()
check('browser creation is busy before the RPC settles', directoryStore.getSnapshot().busy)
injected.closeDirectory()
await injected.createDirectoryWorkspace()
check('busy browser creation cannot be closed or submitted twice', directoryStore.getSnapshot().open && createCalls.length === 2)
await creating
check('browser creates only the explicitly confirmed host path and opens it', createCalls.at(-1) === '/srv/project' && ctx.opened === 'ws:/srv/project' && !directoryStore.getSnapshot().open && !directoryStore.getSnapshot().busy)

fire(drop, dragEvent(workspaceRow, [dirItem('proj')]))
injected.setPath('/missing')
createError = new Error('directory does not exist')
await injected.createDirectoryWorkspace()
check('a rejected host path keeps the dialog open and shows the failure', directoryStore.getSnapshot().open && !directoryStore.getSnapshot().busy && directoryStore.getSnapshot().error.includes('directory does not exist'))
createError = undefined
injected.setPath('/srv/project')
check('editing a failed path clears the old error', directoryStore.getSnapshot().error === null)
openError = new Error('session unavailable')
await injected.createDirectoryWorkspace()
check('open failures are distinct from create failures', directoryStore.getSnapshot().open && directoryStore.getSnapshot().error.startsWith('directory.openFailed:'))
openError = undefined
await injected.createDirectoryWorkspace()
check('retrying a browser failure can finish successfully', !directoryStore.getSnapshot().open && !directoryStore.getSnapshot().busy)

mock.timers.enable({ apis: ['setTimeout'] })
try {
  fire(drop, dragEvent(workspaceRow, [dirItem('proj')]))
  injected.setPath('/srv/slow')
  createWait = new Promise(() => {})
  const timeout = injected.createDirectoryWorkspace()
  mock.timers.tick(15000)
  await timeout
  check('a hanging browser create times out and allows retry', directoryStore.getSnapshot().open && !directoryStore.getSnapshot().busy && directoryStore.getSnapshot().error.includes('timed out'))
  createWait = undefined
  openWait = new Promise(() => {})
  const opening = injected.createDirectoryWorkspace()
  for (let i = 0; i < 5; i++) await Promise.resolve()
  mock.timers.tick(10000)
  await opening
  check('a hanging browser open times out without claiming creation failed', directoryStore.getSnapshot().open && !directoryStore.getSnapshot().busy && directoryStore.getSnapshot().error.startsWith('directory.openFailed:'))
  injected.closeDirectory()
} finally {
  createWait = undefined
  openWait = undefined
  mock.timers.reset()
}
globalThis.__DSH_HOST_PATHS__ = savedBridge
//#endregion

//#region render
const component = slotYield.component
const render = (state) => component({
  useDrag: (selector) => selector({ ...snapshot(), ...state }),
  useDirectory: (selector) => selector(directoryStore.getSnapshot()),
  clearError: injected.clearError,
  setPath: injected.setPath,
  closeDirectory: injected.closeDirectory,
  createDirectoryWorkspace: injected.createDirectoryWorkspace,
  t: (key) => key,
})

let treeView = render({ active: false, folder: false, rect: null, names: '', error: null })
check('idle render is an empty fragment', treeView.props.children.length === 0)

treeView = render({ active: false, folder: true, rect: null, names: 'proj', error: null })
const card = treeView.props.children[0]
check('folder drag outside the region renders the card', card.type === 'div' && card.props.className === 'dtw_hint')
check('the card names the folder', card.props.children[1].props.children[0].props.children === 'hint.title · proj')
check('the card states only where a workspace comes from', card.props.children[1].props.children[1].props.children === 'hint.how')
check('the card is not the zone box', treeView.props.children.length === 1)

treeView = render({ active: true, folder: true, rect: { left: 12, top: 240, width: 256, height: 600 }, names: 'proj', error: null })
const box = treeView.props.children[0]
check('zone hover renders the box instead', box.props.className === 'dtw_zone' && box.props.role === 'status')
check('zone box carries the region geometry', box.props.style.left === '12px' && box.props.style.height === '600px')
check('zone box has three children (icon, title, names)', box.props.children.length === 3)
check('the card is not rendered alongside the box', treeView.props.children.length === 1)

treeView = render({ active: false, folder: false, pending: true, rect: null, names: '', error: null })
const pendingCard = treeView.props.children[0]
check('protected hover renders a neutral title', pendingCard?.props.children[1].props.children[0].props.children === 'hint.pendingTitle')
check('the neutral hint describes folders conditionally', pendingCard?.props.children[1].props.children[1].props.children === 'hint.pendingHow')

treeView = render({ active: true, folder: false, pending: true, rect: { left: 12, top: 240, width: 256, height: 600 }, names: '', error: null })
check('the pending zone does not promise to create a workspace for a file', treeView.props.children[0].props.children[1].props.children === 'zone.pendingTitle')

treeView = render({ active: false, folder: false, rect: null, names: '', error: 'boom', errorSeq: 2 })
check('error render draws a toast with a per-show key', treeView.props.children[0].key === 'drop-to-workspace-error-2')

delete globalThis.__DSH_HOST_PATHS__
treeView = render({ active: true, folder: true, rect: region.rect, error: null })
check('browser hover asks for path confirmation instead of promising automatic creation', treeView.props.children[0].props.children[1].props.children === 'zone.webTitle')
treeView = render({ active: false, folder: false, pending: true, rect: null, error: null })
check('browser protected hover explains host path confirmation', treeView.props.children[0].props.children[1].props.children[1].props.children === 'hint.webHow')
fire(drop, dragEvent(workspaceRow, [dirItem('proj')]))
treeView = render({ active: false, folder: false, pending: false, error: null })
const dialog = treeView.props.children[0]
check('browser path confirmation uses the existing modal primitive', dialog.type === 'Modal' && dialog.props.open)
check('an empty path disables the create action', dialog.props.footer.props.children[1].props.disabled)
const pathInput = dialog.props.children.props.children[1].props.children[1]
pathInput.props.onChange({ target: { value: '/srv/test' } })
check('the labeled path input updates the confirmation state', directoryStore.getSnapshot().path === '/srv/test')
dialog.props.onClose()
check('closing the modal cancels confirmation', !directoryStore.getSnapshot().open)
globalThis.__DSH_HOST_PATHS__ = savedBridge
//#endregion

//#region disposal
mock.timers.enable({ apis: ['setTimeout'] })
try {
  fire(hover, protectedHover(workspaceRow))
  for (const cleanup of effectCleanups.toReversed()) cleanup()
  check('disposing the plugin clears the hint and unregisters listeners', dragIsIdle() && documentListeners.size === 0 && windowListeners.size === 0)
  dragStore.update((draft) => { draft.error = 'disposed' })
  mock.timers.tick(1500)
  check('disposing the plugin cancels its pending hover timer', snapshot().error === 'disposed')
} finally {
  mock.timers.reset()
}
//#endregion

console.log(failures === 0 ? '\nSMOKE TEST PASSED' : `\nSMOKE TEST FAILED (${failures})`)
if (failures > 0) process.exitCode = 1
