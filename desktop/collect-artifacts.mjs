import { readdir, mkdir, copyFile, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const root = resolve('src-tauri/target/release/bundle')
const output = resolve('desktop-release')
const version = JSON.parse(await readFile('package.json', 'utf8')).version
await mkdir(output, { recursive: true })
for (const [folder, ext, platform, arch] of [
  ['nsis', '.exe', 'Windows', 'x64'],
  ['deb', '.deb', 'Linux', 'amd64'],
  ['appimage', '.AppImage', 'Linux', 'x86_64'],
]) {
  const files = await readdir(join(root, folder)).catch(() => [])
  for (const file of files.filter((file) => file.endsWith(ext)))
    await copyFile(
      join(root, folder, file),
      join(output, `Painel-Ping-${version}-${platform}-${arch}${ext}`),
    )
}
