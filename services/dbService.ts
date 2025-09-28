import { ProjectData } from '../types';
import { IDBPDatabase, openDB } from 'idb';

const DB_NAME = 'FontCreatorDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDb = (): Promise<IDBPDatabase> => {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, {
                        keyPath: 'projectId',
                        autoIncrement: true,
                    });
                    store.createIndex('scriptId', 'scriptId', { unique: false });
                    store.createIndex('savedAt', 'savedAt', { unique: false });
                }
            },
        });
    }
    return dbPromise;
};

export const addProject = async (projectData: Omit<ProjectData, 'projectId'>): Promise<number> => {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const id = await store.add(projectData);
    await tx.done;
    return id as number;
};

export const updateProject = async (projectId: number, projectData: ProjectData): Promise<void> => {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.store.put(projectData);
    await tx.done;
};

export const getProject = async (projectId: number): Promise<ProjectData | undefined> => {
    const db = await getDb();
    return db.get(STORE_NAME, projectId);
};

export const getRecentProjects = async (limit: number = 5): Promise<ProjectData[]> => {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.store.index('savedAt');
    const projects: ProjectData[] = [];
    let cursor = await index.openCursor(null, 'prev');
    while (cursor && projects.length < limit) {
        projects.push(cursor.value);
        cursor = await cursor.continue();
    }
    await tx.done;
    return projects;
};

export const deleteProject = async (projectId: number): Promise<void> => {
    const db = await getDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.store.delete(projectId);
    await tx.done;
};