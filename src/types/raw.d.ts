/**
 * Type declarations for Vite's raw asset queries (`?raw`) and the GLSL
 * shader files loaded as raw strings by the renderer.
 */
declare module "*.vert?raw" {
  const content: string;
  export default content;
}

declare module "*.frag?raw" {
  const content: string;
  export default content;
}

declare module "*.vert" {
  const content: string;
  export default content;
}

declare module "*.frag" {
  const content: string;
  export default content;
}
