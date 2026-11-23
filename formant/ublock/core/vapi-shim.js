/** Minimal vAPI so uBO 1.76.0 compiler modules can load in an MV3 SW. */

if (typeof globalThis.vAPI !== "object" || globalThis.vAPI === null) {
  globalThis.vAPI = {};
}

const vAPI = globalThis.vAPI;

if (!vAPI.localStorage) {
  vAPI.localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {},
  };
}

vAPI.canWASM = false;
