// the opentype.js build three ships (used by GizLetters.ts to read only the glyphs the sign needs)
declare module 'three/examples/jsm/libs/opentype.module.js' {
  interface Glyph {
    advanceWidth?: number
    xMin?: number
    xMax?: number
    path: { commands: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[] }
  }
  interface OTFont {
    unitsPerEm: number
    names: { fontFamily?: { en?: string } }
    charToGlyph(ch: string): Glyph
  }
  const opentype: { parse(buf: ArrayBuffer): OTFont }
  export default opentype
}
