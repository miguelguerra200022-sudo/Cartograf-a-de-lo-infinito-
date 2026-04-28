// Procedural Engine — Cartografía de lo Infinito
// WASM entry point: exposes the deterministic sector generator to JavaScript.
//
// This is the "Capa 1" from the Tech Spec: the Universal Generator (WASM Client-Side).
// It receives integer coordinates and returns a massive JSON string of procedural properties.
// NO rarity, NO loot — those come from the backend Salt Wall (anti-cheat).

mod generator;
mod lsystem;
mod sector;

use wasm_bindgen::prelude::*;

/// Generate all procedural data for a sector at coordinates (x, y, z).
///
/// Returns a JSON string containing:
/// - Sector coordinates and deterministic hash
/// - Star system (type, temperature, luminosity, planets with biomes)
/// - Precursor ruins (L-System derivations)
/// - Terrain heightmap (32x32 OpenSimplex samples)
/// - Client-side sector classification
///
/// INVARIANT: Identical inputs ALWAYS produce identical outputs.
/// This is the mathematical contract of the shared universe.
#[wasm_bindgen]
pub fn get_sector_data(x: i64, y: i64, z: i64) -> String {
    generator::generate_sector(x, y, z)
}
