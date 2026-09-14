const DB_NAME = "jingjian.notes-overflow.v1";
const STORE = "bodies";

type OverflowRow = { id: string; content: string };

function canUseIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putOverflow(id: string, content: string): Promise<void> {
  if (!canUseIdb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ id, content } satisfies OverflowRow);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Quota or private mode — keep the note in memory.
  }
}

export async function getOverflow(id: string): Promise<string | null> {
  if (!canUseIdb()) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(id);
      request.onsuccess = () => {
        const row = request.result as OverflowRow | undefined;
        resolve(row?.content ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function deleteOverflow(id: string): Promise<void> {
  if (!canUseIdb()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}
