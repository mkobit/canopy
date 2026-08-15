declare module 'canopy:graph/content-rendering' {
  /**
   * Render a content node into static HTML. `properties-json` is the target
   * node's raw properties serialized as a JSON string (per the resolved
   * render-input decision); the guest returns the HTML envelope or an error
   * message string on malformed input.
   */
  export function render(propertiesJson: string): RenderOutput;
  /**
   * Rendered output envelope. Tier-1 carries a single static HTML string
   * produced under the render:raw-html capability; the host sanitizes it
   * before mounting. Future capabilities (e.g. render:declarative) extend
   * this record rather than changing the function signature.
   */
  export interface RenderOutput {
    html: string,
  }
}
