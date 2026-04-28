// Core procedural generation engine.
// Implements the deterministic Hash -> PRNG -> Noise -> Sector pipeline.
//
// CRITICAL INVARIANT: Given the same master seed and coordinates (X,Y,Z),
// this engine MUST produce byte-identical output across all platforms,
// all time zones, and all users. This is the mathematical foundation
// of the shared universe.

use noise::{NoiseFn, OpenSimplex};
use rand::Rng;
use rand::SeedableRng;
use rand_chacha::ChaCha20Rng;
use sha2::{Digest, Sha256};

use crate::lsystem;
use crate::sector::*;

/// The immutable master seed of the universe.
/// Combined with coordinates to produce sector-local PRNGs.
const MASTER_SEED: &str = "MIGUEL_2026";

/// Heightmap resolution (GRID_SIZE x GRID_SIZE samples per sector).
const GRID_SIZE: usize = 32;

/// Hash the master seed with sector coordinates to derive a deterministic 256-bit seed.
/// Returns a 32-byte array suitable for initializing ChaCha20Rng.
fn hash_sector_seed(x: i64, y: i64, z: i64) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(MASTER_SEED.as_bytes());
    hasher.update(b"+X:");
    hasher.update(x.to_le_bytes());
    hasher.update(b"+Y:");
    hasher.update(y.to_le_bytes());
    hasher.update(b"+Z:");
    hasher.update(z.to_le_bytes());
    let result = hasher.finalize();
    let mut seed = [0u8; 32];
    seed.copy_from_slice(&result);
    seed
}

/// Generate a terrain heightmap using layered OpenSimplex noise (fractal Brownian motion).
/// Uses 3 octaves with decreasing amplitude and increasing frequency.
fn generate_heightmap(noise_gen: &OpenSimplex, x_offset: f64, y_offset: f64) -> Vec<f64> {
    let mut heightmap = Vec::with_capacity(GRID_SIZE * GRID_SIZE);
    let scale = 0.05;

    for gy in 0..GRID_SIZE {
        for gx in 0..GRID_SIZE {
            let nx = (gx as f64 + x_offset * GRID_SIZE as f64) * scale;
            let ny = (gy as f64 + y_offset * GRID_SIZE as f64) * scale;

            // Fractal Brownian Motion — 3 octaves
            let mut value = 0.0;
            let mut amplitude = 1.0;
            let mut frequency = 1.0;
            for _ in 0..3 {
                value += noise_gen.get([nx * frequency, ny * frequency]) * amplitude;
                amplitude *= 0.5;
                frequency *= 2.0;
            }

            // Normalize to [0, 1]
            let normalized = (value + 1.5) / 3.0;
            heightmap.push(normalized.clamp(0.0, 1.0));
        }
    }

    heightmap
}

/// Select star type based on a probability roll from the sector PRNG.
fn pick_star_type(roll: f64) -> StarType {
    if roll < 0.40 {
        StarType::RedDwarf
    } else if roll < 0.65 {
        StarType::YellowMain
    } else if roll < 0.80 {
        StarType::BlueGiant
    } else if roll < 0.90 {
        StarType::WhiteDwarf
    } else if roll < 0.97 {
        StarType::Neutron
    } else {
        StarType::BlackHole
    }
}

/// Generate a planet with physically-plausible procedural properties.
fn generate_planet(rng: &mut ChaCha20Rng, index: usize, star_temp: u32) -> Planet {
    let orbital_radius: f64 = rng.gen_range(0.2..50.0);
    let mass: f64 = rng.gen_range(0.01..300.0);
    let radius = mass.powf(0.3) * rng.gen_range(0.8..1.2);
    let has_atmosphere = mass > 0.1 && rng.gen::<f64>() < 0.7;

    // Surface temperature based on star temperature and orbital distance
    let base_temp = star_temp as f64 / (orbital_radius.sqrt() * 10.0);
    let surface_temp = base_temp * rng.gen_range(0.7..1.5);

    let biome_roll: f64 = rng.gen();
    let biome = if surface_temp < 100.0 {
        Biome::Frozen
    } else if surface_temp > 800.0 {
        Biome::Volcanic
    } else if !has_atmosphere {
        Biome::Barren
    } else if biome_roll < 0.15 {
        Biome::Oceanic
    } else if biome_roll < 0.30 {
        Biome::Temperate
    } else if biome_roll < 0.45 {
        Biome::Jungle
    } else if biome_roll < 0.60 {
        Biome::Desert
    } else if biome_roll < 0.75 {
        Biome::Toxic
    } else if biome_roll < 0.90 {
        Biome::Crystalline
    } else {
        Biome::Biomechanical
    };

    Planet {
        name: format!("P-{:04X}-{}", rng.gen::<u16>(), index + 1),
        orbital_radius_au: (orbital_radius * 100.0).round() / 100.0,
        mass_earth: (mass * 100.0).round() / 100.0,
        radius_earth: (radius * 100.0).round() / 100.0,
        has_atmosphere,
        surface_temperature_k: (surface_temp * 10.0).round() / 10.0,
        biome,
        moons: rng.gen_range(0..=12),
    }
}

/// Classify the sector based on its contents (client-side classification only).
fn classify_sector(has_star: bool, planet_count: usize, ruin_count: usize) -> SectorClass {
    if !has_star {
        SectorClass::Void
    } else if planet_count == 0 && ruin_count == 0 {
        SectorClass::Sparse
    } else if ruin_count > 0 {
        SectorClass::Anomalous
    } else if planet_count > 4 {
        SectorClass::Dense
    } else {
        SectorClass::Standard
    }
}

/// MAIN ENTRY POINT: Generate all procedural data for a sector.
///
/// Given integer coordinates (x, y, z), this function:
/// 1. Hashes the master seed + coordinates to derive a sector-specific 256-bit seed
/// 2. Initializes a ChaCha20 PRNG with that seed
/// 3. Uses OpenSimplex noise for terrain generation
/// 4. Uses L-Systems for ruin generation
/// 5. Assembles and serializes a complete SectorData JSON
///
/// Returns a JSON string.
pub fn generate_sector(x: i64, y: i64, z: i64) -> String {
    // Step 1: Derive deterministic seed
    let seed_bytes = hash_sector_seed(x, y, z);
    let sector_hash = hex::encode_upper(&seed_bytes[..16]); // Display first 128 bits

    // Step 2: Initialize PRNG
    let mut rng = ChaCha20Rng::from_seed(seed_bytes);

    // Step 3: Determine if sector contains a star system (60% chance)
    let has_star = rng.gen::<f64>() < 0.60;

    let star_system = if has_star {
        let star_roll: f64 = rng.gen();
        let star_type = pick_star_type(star_roll);
        let temperature = match &star_type {
            StarType::RedDwarf => rng.gen_range(2500..=3900),
            StarType::YellowMain => rng.gen_range(5000..=6500),
            StarType::BlueGiant => rng.gen_range(10000..=40000),
            StarType::WhiteDwarf => rng.gen_range(8000..=40000),
            StarType::Neutron => rng.gen_range(100000..=1000000),
            StarType::BlackHole => 0,
        };
        let luminosity: f64 = rng.gen_range(0.001..100000.0);
        let planet_count = rng.gen_range(0..=8);

        let planets: Vec<Planet> = (0..planet_count)
            .map(|i| generate_planet(&mut rng, i, temperature))
            .collect();

        Some(StarSystem {
            star_type,
            luminosity: (luminosity * 1000.0).round() / 1000.0,
            temperature_kelvin: temperature,
            planets,
        })
    } else {
        None
    };

    // Step 4: Generate ruins via L-Systems
    let ruins = lsystem::generate_ruins(&mut rng);

    // Step 5: Generate terrain heightmap
    // Use first 8 bytes of seed as OpenSimplex seed
    let noise_seed = u32::from_le_bytes([seed_bytes[0], seed_bytes[1], seed_bytes[2], seed_bytes[3]]);
    let noise_gen = OpenSimplex::new(noise_seed);
    let heightmap = generate_heightmap(&noise_gen, x as f64, y as f64);

    // Step 6: Classify
    let planet_count = star_system.as_ref().map_or(0, |s| s.planets.len());
    let sector_class = classify_sector(has_star, planet_count, ruins.len());

    // Step 7: Assemble and serialize
    let sector = SectorData {
        coordinates: SectorCoordinates { x, y, z },
        sector_hash,
        star_system,
        ruins,
        terrain_heightmap: heightmap,
        sector_class,
    };

    serde_json::to_string_pretty(&sector).expect("Failed to serialize sector data")
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_determinism_same_coordinates_same_output() {
        let a = generate_sector(1500, -450, 0);
        let b = generate_sector(1500, -450, 0);
        assert_eq!(a, b, "CRITICAL: Same coordinates MUST produce identical output");
    }

    #[test]
    fn test_different_coordinates_different_output() {
        let a = generate_sector(0, 0, 0);
        let b = generate_sector(1, 0, 0);
        assert_ne!(a, b, "Different coordinates should produce different sectors");
    }

    #[test]
    fn test_output_is_valid_json() {
        let json_str = generate_sector(42, -100, 7);
        let parsed: serde_json::Value = serde_json::from_str(&json_str)
            .expect("Output must be valid JSON");
        assert!(parsed.is_object());
        assert!(parsed.get("coordinates").is_some());
        assert!(parsed.get("sector_hash").is_some());
        assert!(parsed.get("terrain_heightmap").is_some());
        assert!(parsed.get("sector_class").is_some());
    }

    #[test]
    fn test_heightmap_size() {
        let json_str = generate_sector(0, 0, 0);
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        let heightmap = parsed.get("terrain_heightmap").unwrap().as_array().unwrap();
        assert_eq!(heightmap.len(), GRID_SIZE * GRID_SIZE, "Heightmap must be {0}x{0}", GRID_SIZE);
    }

    #[test]
    fn test_heightmap_values_normalized() {
        let json_str = generate_sector(999, 888, 777);
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        let heightmap = parsed.get("terrain_heightmap").unwrap().as_array().unwrap();
        for val in heightmap {
            let v = val.as_f64().unwrap();
            assert!(v >= 0.0 && v <= 1.0, "Heightmap values must be in [0.0, 1.0], got {}", v);
        }
    }

    #[test]
    fn test_hash_determinism() {
        let a = hash_sector_seed(100, 200, 300);
        let b = hash_sector_seed(100, 200, 300);
        assert_eq!(a, b, "Hash function must be deterministic");
    }

    #[test]
    fn test_spec_example_coordinates() {
        // From the tech spec: X:1500, Y:-450
        let json_str = generate_sector(1500, -450, 0);
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        let coords = parsed.get("coordinates").unwrap();
        assert_eq!(coords.get("x").unwrap().as_i64().unwrap(), 1500);
        assert_eq!(coords.get("y").unwrap().as_i64().unwrap(), -450);
    }
}
