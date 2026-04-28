// L-System (Lindenmayer System) engine for procedural ruin generation.
// Uses formal grammar rules to create deterministic fractal structures
// representing alien precursor ruins.

use rand::Rng;
use rand_chacha::ChaCha20Rng;

use crate::sector::{Ruin, RuinType};

/// A production rule in the L-System grammar.
struct Rule {
    predecessor: char,
    successor: &'static str,
}

/// Available ruin grammars — each produces distinct architectural morphology.
const MONOLITH_RULES: &[Rule] = &[
    Rule { predecessor: 'A', successor: "AB[+A]" },
    Rule { predecessor: 'B', successor: "BA[-B]" },
];

const HIVE_RULES: &[Rule] = &[
    Rule { predecessor: 'A', successor: "A[+B]A" },
    Rule { predecessor: 'B', successor: "B[-A]B[+A]" },
];

const CRYSTAL_RULES: &[Rule] = &[
    Rule { predecessor: 'A', successor: "[+A][-A]BA" },
    Rule { predecessor: 'B', successor: "BB" },
];

const GATEWAY_RULES: &[Rule] = &[
    Rule { predecessor: 'A', successor: "A+A--A+A" },
    Rule { predecessor: 'B', successor: "ABA" },
];

const RELAY_RULES: &[Rule] = &[
    Rule { predecessor: 'A', successor: "AB+A-B" },
    Rule { predecessor: 'B', successor: "A-BA+B" },
];

/// Apply L-System derivation for a given number of iterations.
fn derive(axiom: &str, rules: &[Rule], iterations: u32) -> String {
    let mut current = axiom.to_string();
    for _ in 0..iterations {
        let mut next = String::with_capacity(current.len() * 2);
        for ch in current.chars() {
            let replacement = rules
                .iter()
                .find(|r| r.predecessor == ch)
                .map(|r| r.successor)
                .unwrap_or_else(|| {
                    // Keep the character if no rule matches
                    ""
                });
            if replacement.is_empty() {
                next.push(ch);
            } else {
                next.push_str(replacement);
            }
        }
        current = next;
    }
    current
}

/// Generate ruins for a sector using the sector's local PRNG.
/// The number and type of ruins is determined stochastically but deterministically.
pub fn generate_ruins(rng: &mut ChaCha20Rng) -> Vec<Ruin> {
    let ruin_count: u32 = if rng.gen::<f64>() < 0.15 {
        // 15% chance of having ruins at all
        rng.gen_range(1..=3)
    } else {
        return Vec::new();
    };

    let mut ruins = Vec::with_capacity(ruin_count as usize);

    for _ in 0..ruin_count {
        let type_roll: f64 = rng.gen();
        let (ruin_type, rules) = if type_roll < 0.30 {
            (RuinType::PrecursorMonolith, MONOLITH_RULES)
        } else if type_roll < 0.55 {
            (RuinType::BiomechanicalHive, HIVE_RULES)
        } else if type_roll < 0.75 {
            (RuinType::CrystallineArchive, CRYSTAL_RULES)
        } else if type_roll < 0.90 {
            (RuinType::VoidGateway, GATEWAY_RULES)
        } else {
            (RuinType::QuantumRelay, RELAY_RULES)
        };

        // Complexity determines L-System iterations (2-5)
        let complexity = rng.gen_range(2..=5);
        let derivation = derive("A", rules, complexity);

        // Truncate derivation for serialization (full sequence can be enormous)
        let display_derivation = if derivation.len() > 128 {
            format!("{}...[{} symbols total]", &derivation[..128], derivation.len())
        } else {
            derivation
        };

        ruins.push(Ruin {
            ruin_type,
            complexity,
            age_megayears: rng.gen_range(10.0..4500.0),
            derivation_sequence: display_derivation,
        });
    }

    ruins
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_monolith_deterministic() {
        let result_a = derive("A", MONOLITH_RULES, 3);
        let result_b = derive("A", MONOLITH_RULES, 3);
        assert_eq!(result_a, result_b, "L-System derivation must be deterministic");
        assert!(!result_a.is_empty());
    }

    #[test]
    fn test_derive_produces_growth() {
        let iter_2 = derive("A", HIVE_RULES, 2);
        let iter_4 = derive("A", HIVE_RULES, 4);
        assert!(
            iter_4.len() > iter_2.len(),
            "Higher iterations must produce longer sequences"
        );
    }
}
