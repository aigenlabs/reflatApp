// clearAppCache.js
export const clearAppCache = async () => {
  try {
    // Clear localStorage
    localStorage.clear();

    // Clear sessionStorage
    sessionStorage.clear();

    // Clear all caches (Service Worker / PWA)
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }

    // Clear IndexedDB
    if (window.indexedDB && indexedDB.databases) {
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    }

    alert("Application cache cleared successfully!");
    window.location.reload(); // Optional: reload app fresh
  } catch (err) {
    console.error("Error clearing cache:", err);
    alert("Failed to clear cache. Check console for details.");
  }
};
