export interface CustomScene {
  id: string;
  name: string;
  image: string;
}

const DB_NAME = "vivian-custom-scenes";
const STORE_NAME = "scenes";

function openScenesDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openScenesDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}

export function loadCustomScenes(): Promise<CustomScene[]> {
  return withStore("readonly", (store) => store.getAll() as IDBRequest<CustomScene[]>);
}

export function saveCustomScene(scene: CustomScene): Promise<string> {
  return withStore("readwrite", (store) => store.put(scene) as IDBRequest<string>);
}

export function removeCustomScene(id: string): Promise<undefined> {
  return withStore("readwrite", (store) => store.delete(id) as IDBRequest<undefined>);
}
