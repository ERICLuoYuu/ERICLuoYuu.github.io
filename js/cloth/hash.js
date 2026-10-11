/*
 * Dense spatial hash for finding nearby cloth particles.
 *
 * Ported from "15 - Self-collision of cloth", Ten Minute Physics:
 * Copyright 2022 Matthias Müller - Ten Minute Physics,
 * https://www.youtube.com/c/TenMinutePhysics, https://matthias-research.github.io/pages/
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without
 * limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the
 * Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions
 * of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
 * TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 * Changes: an object instead of a class, an explicit particle count,
 * queryAll() takes an isActive(i) test so that only moving particles look
 * for neighbours (resting garments are obstacles and never ask), and
 * queryAll() skips repeats when two cells share a table slot.
 * The typed arrays are reused every frame on purpose: this runs per frame
 * over thousands of particles, so it mutates its own buffers instead of
 * allocating new ones.
 */

const distSquared = (pos, a, b) => {
  const dx = pos[3 * a] - pos[3 * b];
  const dy = pos[3 * a + 1] - pos[3 * b + 1];
  const dz = pos[3 * a + 2] - pos[3 * b + 2];
  return dx * dx + dy * dy + dz * dz;
};

export function createHash(spacing, maxNumObjects) {
  const tableSize = 5 * maxNumObjects;
  const cellStart = new Int32Array(tableSize + 1);
  const cellEntries = new Int32Array(maxNumObjects);
  const queryIds = new Int32Array(maxNumObjects);
  const firstAdjId = new Int32Array(maxNumObjects + 1);
  const seenBy = new Int32Array(maxNumObjects); // de-duplicates cells that share a table slot
  let adjIds = new Int32Array(10 * maxNumObjects);

  const hashCoords = (xi, yi, zi) => Math.abs((xi * 92837111) ^ (yi * 689287499) ^ (zi * 283923481)) % tableSize;
  const intCoord = (coord) => Math.floor(coord / spacing);
  const hashPos = (pos, nr) => hashCoords(intCoord(pos[3 * nr]), intCoord(pos[3 * nr + 1]), intCoord(pos[3 * nr + 2]));

  const hash = {
    queryIds,
    querySize: 0,
    firstAdjId,
    get adjIds() { return adjIds; },

    /** Sort the first `count` particles into cells. */
    create(pos, count) {
      cellStart.fill(0);
      cellEntries.fill(0);
      for (let i = 0; i < count; i += 1) cellStart[hashPos(pos, i)] += 1;
      let start = 0;
      for (let i = 0; i < tableSize; i += 1) {
        start += cellStart[i];
        cellStart[i] = start;
      }
      cellStart[tableSize] = start;
      for (let i = 0; i < count; i += 1) {
        const h = hashPos(pos, i);
        cellStart[h] -= 1;
        cellEntries[cellStart[h]] = i;
      }
    },

    /** Particles in the cells around particle `nr` (a superset of those within maxDist). */
    query(pos, nr, maxDist) {
      const [x0, y0, z0] = [0, 1, 2].map((k) => intCoord(pos[3 * nr + k] - maxDist));
      const [x1, y1, z1] = [0, 1, 2].map((k) => intCoord(pos[3 * nr + k] + maxDist));
      let size = 0;
      for (let xi = x0; xi <= x1; xi += 1) {
        for (let yi = y0; yi <= y1; yi += 1) {
          for (let zi = z0; zi <= z1; zi += 1) {
            const h = hashCoords(xi, yi, zi);
            for (let i = cellStart[h]; i < cellStart[h + 1]; i += 1) {
              queryIds[size] = cellEntries[i];
              size += 1;
            }
          }
        }
      }
      hash.querySize = size;
    },

    /**
     * Neighbour lists within maxDist: particle i's neighbours are
     * adjIds[firstAdjId[i] .. firstAdjId[i + 1]). Each close pair is listed
     * once, under an active particle.
     */
    queryAll(pos, count, maxDist, isActive) {
      const maxDist2 = maxDist * maxDist;
      let num = 0;
      seenBy.fill(0);
      for (let id0 = 0; id0 < count; id0 += 1) {
        firstAdjId[id0] = num;
        if (!isActive(id0)) continue;
        hash.query(pos, id0, maxDist);
        for (let j = 0; j < hash.querySize; j += 1) {
          const id1 = queryIds[j];
          const listedByOther = isActive(id1) && id1 >= id0;
          if (id1 === id0 || listedByOther || seenBy[id1] === id0 + 1) continue;
          seenBy[id1] = id0 + 1;
          if (distSquared(pos, id0, id1) > maxDist2) continue;
          if (num >= adjIds.length) {
            const grown = new Int32Array(2 * num);
            grown.set(adjIds);
            adjIds = grown;
          }
          adjIds[num] = id1;
          num += 1;
        }
      }
      firstAdjId[count] = num;
    },
  };
  return hash;
}
