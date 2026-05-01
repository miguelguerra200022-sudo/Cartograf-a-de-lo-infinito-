import fs from 'fs';
let content = fs.readFileSync('js/chunk_manager.js', 'utf8');

content = content.replace(
`    // Only rebuild if camera entered a new chunk
    if (camChunkX === lastCamChunkX && camChunkZ === lastCamChunkZ) return;
    lastCamChunkX = camChunkX;
    lastCamChunkZ = camChunkZ;`,
`    // Check if camera moved to a new chunk
    const moved = (camChunkX !== lastCamChunkX || camChunkZ !== lastCamChunkZ);
    if (moved) {
        lastCamChunkX = camChunkX;
        lastCamChunkZ = camChunkZ;
    }`
);

// We still need to process the needed set and build chunks every frame until all needed are built.
content = content.replace(
`    // 1. Mark chunks to keep
    const needed = new Set();`,
`    // Only recalculate needed and recycle if moved, but ALWAYS try to build missing chunks
    const needed = new Set();`
);

fs.writeFileSync('js/chunk_manager.js', content);
