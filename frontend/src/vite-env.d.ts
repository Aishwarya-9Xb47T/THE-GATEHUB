/// <reference types="vite/client" />

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module 'pptx-svg/wasm?url' {
  const src: string;
  export default src;
}
