/**
 * ذخیره‌سازی تصاویر برش‌خورده سوالات در IndexedDB
 * برای جلوگیری از پر شدن ظرفیت ۵ مگابایتی localStorage و حذف ناگهانی تصاویر آزمون‌ها
 */

const DB_NAME = 'pasokhbarg_images_db';
const DB_VERSION = 1;
const STORE_NAME = 'question_images';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

function makeKey(examId: string, questionNumber: number): string {
  return `${examId}::q${questionNumber}`;
}

export async function saveExamImagesToIDB(
  examId: string,
  imagesByQuestion: Record<number, string>
): Promise<void> {
  const entries = Object.entries(imagesByQuestion).filter(([, url]) => Boolean(url));
  if (entries.length === 0) return;

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const [qNumStr, dataUrl] of entries) {
        const qNum = Number(qNumStr);
        if (qNum >= 1 && dataUrl) {
          store.put(dataUrl, makeKey(examId, qNum));
        }
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('Could not save images to IndexedDB:', err);
  }
}

export async function saveSingleQuestionImageToIDB(
  examId: string,
  questionNumber: number,
  dataUrl: string
): Promise<void> {
  if (!dataUrl) return;
  await saveExamImagesToIDB(examId, { [questionNumber]: dataUrl });
}

export async function loadExamImagesFromIDB(
  examId: string
): Promise<Record<number, string>> {
  const result: Record<number, string> = {};
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const prefix = `${examId}::q`;
      const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
      const req = store.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const key = String(cursor.key);
          const qNum = Number(key.slice(prefix.length));
          if (qNum >= 1 && typeof cursor.value === 'string') {
            result[qNum] = cursor.value;
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('Could not load images from IndexedDB:', err);
  }
  return result;
}

export async function deleteExamImagesFromIDB(examId: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const prefix = `${examId}::q`;
      const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
      store.delete(range);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('Could not delete exam images from IndexedDB:', err);
  }
}

export async function clearAllImagesFromIDB(): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (err) {
    console.warn('Could not clear IndexedDB:', err);
  }
}
