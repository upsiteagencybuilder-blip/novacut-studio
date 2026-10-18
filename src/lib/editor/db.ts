/**
 * IndexedDB persistence layer — 100% local, no server involved.
 * Stores:
 *  - assets   : { meta: MediaAsset, blob: Blob }        (key: meta.id)
 *  - projects : Project                                  (key: id)
 *  - meta     : key/value (lastProjectId, onboarded ...)
 *  - versions : VersionSnapshot                          (key: id)
 */
import type { MediaAsset, Project, VersionSnapshot } from './types'

const DB_NAME = 'novacut-db'
const DB_VERSION = 2
const STORE_ASSETS = 'assets'
const STORE_PROJECTS = 'projects'
const STORE_META = 'meta'
const STORE_VERSIONS = 'versions'

let dbPromise: Promise<IDBDatabase> | null = null

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_ASSETS)) db.createObjectStore(STORE_ASSETS, { keyPath: 'meta.id' })
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META)
      if (!db.objectStoreNames.contains(STORE_VERSIONS)) db.createObjectStore(STORE_VERSIONS, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDB().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const s = t.objectStore(store)
        let request: IDBRequest<T> | void
        try {
          request = fn(s)
        } catch (e) {
          reject(e)
          return
        }
        t.oncomplete = () => resolve(request ? (request as IDBRequest<T>).result : undefined)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      })
  )
}

/* ---------------- Assets ---------------- */

export async function putAsset(meta: MediaAsset, blob: Blob): Promise<void> {
  await tx(STORE_ASSETS, 'readwrite', (s) => s.put({ meta, blob }))
}

export async function getAsset(id: string): Promise<{ meta: MediaAsset; blob: Blob } | undefined> {
  return (await tx<{ meta: MediaAsset; blob: Blob }>(STORE_ASSETS, 'readonly', (s) => s.get(id))) ?? undefined
}

export async function listAssets(): Promise<{ meta: MediaAsset; blob: Blob }[]> {
  const all = await tx<{ meta: MediaAsset; blob: Blob }[]>(STORE_ASSETS, 'readonly', (s) => s.getAll())
  return all ?? []
}

export async function deleteAsset(id: string): Promise<void> {
  await tx(STORE_ASSETS, 'readwrite', (s) => s.delete(id))
}

/* ---------------- Projects ---------------- */

export async function saveProject(project: Project): Promise<void> {
  await tx(STORE_PROJECTS, 'readwrite', (s) => s.put(project))
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await tx<Project>(STORE_PROJECTS, 'readonly', (s) => s.get(id))) ?? undefined
}

export async function listProjects(): Promise<Project[]> {
  const all = await tx<Project[]>(STORE_PROJECTS, 'readonly', (s) => s.getAll())
  return all ?? []
}

export async function deleteProject(id: string): Promise<void> {
  await tx(STORE_PROJECTS, 'readwrite', (s) => s.delete(id))
}

/* ---------------- Version snapshots ---------------- */

export async function putVersion(snapshot: VersionSnapshot): Promise<void> {
  await tx(STORE_VERSIONS, 'readwrite', (s) => s.put(snapshot))
}

export async function listVersions(projectId: string): Promise<VersionSnapshot[]> {
  const all = (await tx<VersionSnapshot[]>(STORE_VERSIONS, 'readonly', (s) => s.getAll())) ?? []
  return all.filter((v) => v.projectId === projectId)
}

export async function deleteVersion(id: string): Promise<void> {
  await tx(STORE_VERSIONS, 'readwrite', (s) => s.delete(id))
}

/* ---------------- Meta KV ---------------- */

export async function setKV(key: string, value: unknown): Promise<void> {
  await tx(STORE_META, 'readwrite', (s) => s.put(value, key))
}

export async function getKV<T = unknown>(key: string): Promise<T | undefined> {
  return (await tx<T>(STORE_META, 'readonly', (s) => s.get(key))) ?? undefined
}
