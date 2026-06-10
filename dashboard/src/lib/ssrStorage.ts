import { createJSONStorage } from 'zustand/middleware'

// SSR-safe storage for Zustand persist: real localStorage in the browser, a
// no-op on the server so rehydration never touches localStorage during SSR.
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

export const ssrStorage = createJSONStorage(() =>
  typeof window !== 'undefined' ? window.localStorage : noopStorage,
)
