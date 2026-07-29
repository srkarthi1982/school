/**
 * Dev-only Babel plugin: stamps source location + component name onto host
 * (lowercase) JSX elements so the in-app inspector overlay can map any DOM node
 * back to its original file and React component.
 *
 * Injects two attributes:
 *   data-inspect-loc="src/path/File.tsx:line:col"   (relative to project root)
 *   data-inspect-name="ComponentName"               (nearest enclosing component)
 *
 * Only added to the Babel pipeline in development (see vite.config.ts), so it
 * never reaches production builds.
 */
import path from 'node:path'

const ATTR_LOC = 'data-inspect-loc'
const ATTR_NAME = 'data-inspect-name'

/** Walk up to the nearest PascalCase function — that's the rendering component. */
function findComponentName(elementPath, t) {
  let fn = elementPath.getFunctionParent()
  while (fn) {
    // function Foo() {}
    if (fn.node.id && /^[A-Z]/.test(fn.node.id.name || '')) return fn.node.id.name
    // const Foo = () => {}  /  const Foo = function () {}
    const parent = fn.parentPath
    if (parent && t.isVariableDeclarator(parent.node) && t.isIdentifier(parent.node.id) && /^[A-Z]/.test(parent.node.id.name)) {
      return parent.node.id.name
    }
    fn = fn.getFunctionParent()
  }
  return ''
}

export default function inspectorBabelPlugin({ types: t }) {
  return {
    name: 'inspect-loc',
    visitor: {
      JSXOpeningElement(elementPath, state) {
        const node = elementPath.node
        if (!node.loc) return

        // Only host elements (lowercase tag) render real DOM nodes we can hover.
        const name = node.name
        if (!t.isJSXIdentifier(name) || !/^[a-z]/.test(name.name)) return

        // Idempotent: skip if already stamped.
        if (node.attributes.some((a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === ATTR_LOC)) return

        const root = state.opts && state.opts.root ? state.opts.root : process.cwd()
        const filename = (state.file.opts.filename || '').replace(/\\/g, '/')
        const rel = path.relative(root, filename).replace(/\\/g, '/')
        const loc = `${rel}:${node.loc.start.line}:${node.loc.start.column + 1}`

        node.attributes.push(t.jsxAttribute(t.jsxIdentifier(ATTR_LOC), t.stringLiteral(loc)))

        const cmp = findComponentName(elementPath, t)
        if (cmp) node.attributes.push(t.jsxAttribute(t.jsxIdentifier(ATTR_NAME), t.stringLiteral(cmp)))
      },
    },
  }
}
