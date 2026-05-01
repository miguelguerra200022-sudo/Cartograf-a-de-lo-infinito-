# Matemáticas del Universo Procedural

## 1. El Hash del Sector
La semilla de cada sector se genera a partir de sus coordenadas tridimensionales $(x, y, z)$ utilizando un algoritmo de mezcla bitwise:

$$Seed = (x \times 73856093) \oplus (y \times 19349663) \oplus (z \times 83492791)$$

## 2. Distribución Estelar
Utilizamos una función de densidad basada en ruido Simplex 3D para determinar la probabilidad de existencia de un sistema estelar en un punto dado.

## 3. Generación de Terreno (Planetas)
El relieve de los planetas se construye mediante la superposición de múltiples octavas de ruido Perlin/Simplex:

$$Height = \sum_{i=0}^{n} \frac{Noise(p \times 2^i \times frequency)}{2^i}$$
