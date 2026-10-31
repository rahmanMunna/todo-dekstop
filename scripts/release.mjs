// Builds the installer and publishes it to GitHub Releases for auto-update.
// Usage: set GH_TOKEN, bump "version" in package.json, then `npm run release`.
//
// Why not just `electron-builder --publish always`? When the release doesn't
// exist yet, electron-builder's parallel uploads race to create it and one
// fails with 422 "already_exists", leaving a release without latest.yml.
// So: create the release as a draft first, upload into it, verify every
// file is there, and only then publish it.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const { owner, repo } = pkg.build.publish
const version = pkg.version
const tag = `v${version}`
const token = process.env.GH_TOKEN
const api = `https://api.github.com/repos/${owner}/${repo}`

const fail = (msg) => {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

if (!token) fail('GH_TOKEN is not set. Run:  $env:GH_TOKEN = "<your token>"')

async function gh(path, init = {}) {
  const res = await fetch(`${api}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...init.headers
    }
  })
  if (!res.ok) fail(`GitHub API ${init.method ?? 'GET'} ${path} → ${res.status}\n${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

function run(cmd) {
  console.log(`\n> ${cmd}`)
  const { status } = spawnSync(cmd, {
    stdio: 'inherit',
    shell: true,
    // Allow re-uploading into a release that was published a while ago (repair runs).
    env: { ...process.env, EP_GH_IGNORE_TIME: 'true' }
  })
  if (status !== 0) fail(`Command failed: ${cmd}`)
}

// Warn if the code being released isn't on GitHub yet (the tag would point elsewhere).
const git = (args) => spawnSync('git', args, { encoding: 'utf8' }).stdout.trim()
if (git(['status', '--porcelain'])) console.warn('⚠ You have uncommitted changes; they will be in the build but not on GitHub.')
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', `origin/${branch}`]))
  console.warn(`⚠ Your latest commit isn't pushed to origin/${branch}; the ${tag} tag will point at what's on GitHub.`)

// 1. Find or create the release (as a draft, so users don't see it half-uploaded).
const releases = await gh('/releases?per_page=100')
let release = releases.find((r) => r.tag_name === tag)
if (release) {
  console.log(`Found existing ${release.draft ? 'draft' : 'published'} release ${tag}; uploading into it.`)
} else {
  release = await gh('/releases', {
    method: 'POST',
    body: JSON.stringify({ tag_name: tag, target_commitish: branch, name: version, draft: true })
  })
  console.log(`Created draft release ${tag}.`)
}

// 2. Build and upload.
run('npx electron-vite build')
run('npx electron-builder --win --publish always')

// 3. Verify everything the auto-updater needs is attached.
const assets = (await gh(`/releases/${release.id}/assets?per_page=100`)).map((a) => a.name)
const needed = ['latest.yml', `Todo-Setup-${version}.exe`, `Todo-Setup-${version}.exe.blockmap`]
const missing = needed.filter((n) => !assets.includes(n))
if (missing.length) fail(`Release ${tag} is missing: ${missing.join(', ')}. Run npm run release again to retry.`)

// 4. Publish it (and mark as latest so installed apps see it).
if (release.draft) {
  await gh(`/releases/${release.id}`, { method: 'PATCH', body: JSON.stringify({ draft: false, make_latest: 'true' }) })
}
console.log(`\n✔ Released ${tag} with ${needed.join(', ')}`)
console.log(`  https://github.com/${owner}/${repo}/releases/tag/${tag}\n`)
