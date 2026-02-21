import { cpSync, rmSync, existsSync } from 'fs'
import { join } from 'path'

const root = process.cwd()
const extensions = ['receipt-ocr', 'ai-categorization', 'ai-chat', 'push-notifications', 'enable-banking', 'example-logger']

for (const ext of extensions) {
  const src = join(root, 'extensions', ext)
  const dest = join(root, 'extensions', 'general', ext)

  if (!existsSync(src)) {
    console.log(`SKIP: ${src} does not exist`)
    continue
  }

  if (existsSync(dest)) {
    console.log(`CLEAN: ${dest} already exists, removing`)
    rmSync(dest, { recursive: true, force: true })
  }

  console.log(`COPY: ${src} -> ${dest}`)
  cpSync(src, dest, { recursive: true })
}

console.log('Done copying extensions to general/')

// Now remove the old directories
for (const ext of extensions) {
  const src = join(root, 'extensions', ext)
  if (existsSync(src)) {
    console.log(`REMOVE: ${src}`)
    rmSync(src, { recursive: true, force: true })
  }
}

console.log('Done removing old extension directories')
