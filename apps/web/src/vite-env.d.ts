/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CANOPY_DEMO_SEED?: string;
  readonly CANOPY_DEMO_SEED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
