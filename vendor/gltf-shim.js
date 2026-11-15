// Minimal shim: GLTFLoader only calls toTrianglesDrawMode for TRIANGLE_STRIP/FAN
// primitives. Epicbox's models are plain triangles, so this no-op is never hit
// in a way that matters; it returns the geometry unchanged.
export function toTrianglesDrawMode(geometry) { return geometry; }
