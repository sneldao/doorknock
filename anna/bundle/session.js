// Host-call helpers for Doorknock. Dependency-free so node tests can
// import it directly. Pattern follows brume/anna/bundle/session.js.

export function unwrap(res) {
  // SDK calls resolve {ok:true,result} or {ok:false,error}; some harness
  // paths reject instead. Normalize both to throw-on-failure.
  if (res && typeof res === "object") {
    if (res.ok === false) {
      const err = res.error || {};
      const e = new Error(err.message || "host call failed");
      e.code = err.code;
      e.data = err.data;
      throw e;
    }
    if (res.ok === true && "result" in res) return res.result;
  }
  return res;
}

export function storageValue(res) {
  const r = unwrap(res);
  if (r == null) return null;
  if (typeof r === "object" && "value" in r) return r.value;
  return r;
}

export function withTimeout(promise, ms, label = "operation") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => {
      const e = new Error(`${label} timed out`);
      e.code = "TIMEOUT";
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

export async function storageGet(anna, key) {
  return storageValue(await anna.storage.get({ key }));
}

export async function storageSet(anna, key, value) {
  return unwrap(await anna.storage.set({ key, value }));
}

/** Keys under `prefix`, following next_cursor (bounded at 5 pages). The
 *  spec takes {prefix, cursor} and returns {items:[{key}], next_cursor} —
 *  no limit argument is sent, since unknown params are not ours to assume. */
export async function storageList(anna, prefix) {
  const keys = [];
  let cursor;
  for (let page = 0; page < 5; page += 1) {
    const r = unwrap(await anna.storage.list(cursor ? { prefix, cursor } : { prefix }));
    const items = r != null && typeof r === "object" && Array.isArray(r.items) ? r.items : [];
    for (const it of items) {
      if (it != null && typeof it === "object" && typeof it.key === "string") keys.push(it.key);
    }
    cursor = r != null && typeof r === "object" && typeof r.next_cursor === "string" && r.next_cursor
      ? r.next_cursor
      : null;
    if (!cursor) break;
  }
  return keys;
}
