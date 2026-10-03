/// <reference types="vite/client" />

// Declares the VITE_* variables so a typo like VITE_API_ULR is a compile error.
interface ImportMetaEnv {
  /** Base URL of the Express API, e.g. https://api.example.com. Empty in development (Vite proxy). */
  readonly VITE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
