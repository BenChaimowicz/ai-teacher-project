---
date: 2026-10-31
tickets: SEN-47, SEN-113
people: Ben
status: active
---

# The seeded media catalog's files are committed to the repo next to their manifest, and the seed uploads them

The SEN-47 catalog is a few dozen images (CDC PHIL and Commons Gram photomicrographs, Commons grip stills, public-domain Norse plates, a few product-owned SVG diagrams). The bytes live in the repo beside the one manifest that describes them, and `pnpm media:seed` copies them into the private bucket and upserts their descriptors. The seed needs no network beyond the bucket, every file's licence was checked by a person once when it was added, and nothing can drift or vanish later.

**What we turned down:** a manifest of Commons and PHIL URLs with pinned hashes, downloaded at seed time. It keeps binaries out of git, but the seed then depends on third-party pages staying put, a re-uploaded Commons file breaks it, and the licence check moves from a person to a script.

**What it costs:** a few megabytes of binaries in git history, which never shrink. Large plates are downscaled before they are committed, so no single file is bigger than about 1.5 MB.
